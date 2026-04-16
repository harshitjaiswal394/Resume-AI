terraform {
  backend "gcs" {
    bucket = "resume-terraform-state-01"
    prefix = "dev-state"
  }
  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 5.0"
    }
  }
}

provider "google" {
  project = var.project_id
  region  = var.region
}

# 1. Enable APIs
resource "google_project_service" "services" {
  for_each = toset([
    "run.googleapis.com",
    "sqladmin.googleapis.com",
    "secretmanager.googleapis.com",
    "artifactregistry.googleapis.com",
    "dns.googleapis.com",
    "compute.googleapis.com",
    "vpcaccess.googleapis.com",
    "iam.googleapis.com",
    "iamcredentials.googleapis.com",
    "sts.googleapis.com",
    "cloudresourcemanager.googleapis.com"
  ])
  service = each.key
  disable_on_destroy = false
}

# 2. Networking (VPC for Load Balancer routing)
resource "google_compute_network" "vpc" {
  name = "resumatch-vpc"
  depends_on = [google_project_service.services]
}

# 2.2 Subnet for Serverless VPC Access
resource "google_compute_subnetwork" "serverless_subnet" {
  name          = "serverless-subnet"
  ip_cidr_range = "10.10.0.0/28"
  network       = google_compute_network.vpc.id
  region        = var.region
}

resource "google_vpc_access_connector" "connector" {
  name          = "vpc-con"
  region        = var.region
  subnet {
    name = google_compute_subnetwork.serverless_subnet.name
  }
}

# 2.3 Firewall Rules
resource "google_compute_firewall" "allow_lb" {
  name    = "allow-lb-traffic"
  network = google_compute_network.vpc.id

  allow {
    protocol = "tcp"
    ports    = ["80", "443", "8090", "3000"]
  }

  source_ranges = ["130.211.0.0/22", "35.191.0.0/16"]
  target_tags   = ["resumatch-app"]
}

# 4. Artifact Registry
resource "google_artifact_registry_repository" "repo" {
  location      = var.region
  repository_id = "resumatches-official"
  format        = "DOCKER"
  depends_on    = [google_project_service.services]
}

# 5. Cloud Run - Backend
resource "google_cloud_run_v2_service" "backend" {
  name     = "resumatch-backend"
  location = var.region

  template {
    containers {
      image = "${var.region}-docker.pkg.dev/${var.project_id}/resumatches-official/backend:${var.image_tag}"
      ports {
        container_port = 8090
      }
      resources {
        limits = {
          memory = "1Gi"
          cpu    = "1"
        }
      }
      env {
        name  = "DATABASE_URL"
        value = var.database_url
      }
      env {
        name  = "NVIDIA_API_KEY_REASONING"
        value = var.nvidia_api_key_reasoning
      }
      env {
        name  = "NVIDIA_API_KEY_PARSING"
        value = var.nvidia_api_key_parsing
      }
      env {
        name  = "NVIDIA_API_KEY_EMBEDDING"
        value = var.nvidia_api_key_embedding
      }
      env {
        name  = "NVIDIA_API_KEY_RERANKING"
        value = var.nvidia_api_key_reranking
      }
      env {
        name  = "SUPABASE_URL"
        value = var.supabase_url
      }
      env {
        name  = "SUPABASE_SERVICE_ROLE_KEY"
        value = var.supabase_service_role_key
      }
    }
    vpc_access {
      connector = google_vpc_access_connector.connector.id
      egress    = "PRIVATE_RANGES_ONLY"
    }
    timeout = "300s"
  }
}

# 6. Cloud Run - Frontend
resource "google_cloud_run_v2_service" "frontend" {
  name     = "resumatch-frontend"
  location = var.region

  template {
    containers {
      image = "${var.region}-docker.pkg.dev/${var.project_id}/resumatches-official/frontend:${var.image_tag}"
      ports {
        container_port = 3000
      }
      env {
        name  = "NEXT_PUBLIC_BACKEND_API_URL"
        value = "https://resumatches.com"
      }
      env {
        name  = "BACKEND_API_URL"
        value = "https://resumatches.com"
      }
    }
    vpc_access {
      connector = google_vpc_access_connector.connector.id
      egress    = "PRIVATE_RANGES_ONLY"
    }
    timeout = "300s"
  }
}

# 7. Global HTTP(S) Load Balancer Stack
resource "google_compute_global_address" "lb_ip" {
  name = "resumatch-lb-ip"
}

resource "google_compute_region_network_endpoint_group" "backend_neg" {
  name                  = "backend-neg"
  network_endpoint_type = "SERVERLESS"
  region                = var.region
  cloud_run {
    service = google_cloud_run_v2_service.backend.name
  }
}

resource "google_compute_region_network_endpoint_group" "frontend_neg" {
  name                  = "frontend-neg"
  network_endpoint_type = "SERVERLESS"
  region                = var.region
  cloud_run {
    service = google_cloud_run_v2_service.frontend.name
  }
}

resource "google_compute_backend_service" "backend_service" {
  name      = "backend-api-service"
  protocol  = "HTTP"
  port_name = "http"

  log_config {
    enable      = true
    sample_rate = 1.0
  }

  backend {
    group = google_compute_region_network_endpoint_group.backend_neg.id
  }
}

resource "google_compute_backend_service" "frontend_service" {
  name        = "frontend-app-service"
  protocol    = "HTTP"
  port_name   = "http"

  backend {
    group = google_compute_region_network_endpoint_group.frontend_neg.id
  }
}

resource "google_compute_url_map" "url_map" {
  name            = "resumatch-url-map"
  default_service = google_compute_backend_service.frontend_service.id

  host_rule {
    hosts        = ["resumatches.com"]
    path_matcher = "allpaths"
  }

  path_matcher {
    name            = "allpaths"
    default_service = google_compute_backend_service.frontend_service.id

    path_rule {
      paths   = ["/api", "/api/*"]
      service = google_compute_backend_service.backend_service.id
    }
  }
}

resource "google_compute_managed_ssl_certificate" "cert" {
  name = "resumatch-cert-v2"
  managed {
    domains = ["resumatches.com"]
  }

  lifecycle {
    create_before_destroy = true
  }
}

resource "google_compute_target_https_proxy" "https_proxy" {
  name             = "resumatch-https-proxy"
  url_map          = google_compute_url_map.url_map.id
  ssl_certificates = [google_compute_managed_ssl_certificate.cert.id]

  lifecycle {
    create_before_destroy = true
  }
}

resource "google_compute_global_forwarding_rule" "https_forwarding_rule" {
  name       = "resumatch-https-forwarding"
  target     = google_compute_target_https_proxy.https_proxy.id
  port_range = "443"
  ip_address = google_compute_global_address.lb_ip.address
}


# 8. DNS Configuration (Referencing existing Zone)
data "google_dns_managed_zone" "primary" {
  name = "resumatches-com"
}

resource "google_dns_record_set" "root" {
  name         = data.google_dns_managed_zone.primary.dns_name
  managed_zone = data.google_dns_managed_zone.primary.name
  type         = "A"
  ttl          = 300
  rrdatas      = [google_compute_global_address.lb_ip.address]
}

