terraform {
  backend "gcs" {
    bucket = "resume-terraform-state-01"
    prefix = "cloudflare-prod"
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
    "compute.googleapis.com",
    "vpcaccess.googleapis.com",
    "iam.googleapis.com",
    "iamcredentials.googleapis.com",
    "sts.googleapis.com",
    "cloudresourcemanager.googleapis.com",
  ])
  service            = each.key
  disable_on_destroy = false
}

# 2. New VPC for this stack
resource "google_compute_network" "vpc" {
  name                    = "resumatch-cf-vpc"
  auto_create_subnetworks = false
  depends_on              = [google_project_service.services]
}

resource "google_compute_subnetwork" "serverless_subnet" {
  name          = "resumatch-cf-serverless-subnet"
  ip_cidr_range = "10.20.0.0/28"
  network       = google_compute_network.vpc.id
  region        = var.region
}

resource "google_vpc_access_connector" "connector" {
  name   = "resumatch-cf-vpc-con"
  region = var.region
  subnet {
    name = google_compute_subnetwork.serverless_subnet.name
  }
}

# 2.3 Firewall: allow Google LB probes + Cloud Run health checks
resource "google_compute_firewall" "allow_lb" {
  name    = "resumatch-cf-allow-lb"
  network = google_compute_network.vpc.id

  allow {
    protocol = "tcp"
    ports    = ["80", "443", "8090", "3000"]
  }

  source_ranges = ["130.211.0.0/22", "35.191.0.0/16"]
  target_tags   = ["resumatch-cf-app"]
}

# 3. Cloud Run - Backend (FastAPI, listens on 8090)
resource "google_cloud_run_v2_service" "backend" {
  name     = "resumatch-cf-backend"
  location = var.region

  template {
    containers {
      image = "${var.region}-docker.pkg.dev/${var.project_id}/${var.repository}/backend:${var.image_tag}"
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
      env {
        name  = "GOOGLE_CLOUD_PROJECT"
        value = var.project_id
      }
      env {
        name  = "GOOGLE_CLOUD_LOCATION"
        value = var.region
      }
      env {
        name  = "ENVIRONMENT"
        value = "production"
      }
    }
    vpc_access {
      connector = google_vpc_access_connector.connector.id
      egress    = "PRIVATE_RANGES_ONLY"
    }
    timeout = "300s"
  }

  depends_on = [google_project_service.services]
}

resource "google_cloud_run_v2_service_iam_member" "backend_invoker" {
  location = google_cloud_run_v2_service.backend.location
  name     = google_cloud_run_v2_service.backend.name
  role     = "roles/run.invoker"
  member   = "allUsers"
}

# 4. Cloud Run - Frontend (Next.js, listens on 3000)
resource "google_cloud_run_v2_service" "frontend" {
  name     = "resumatch-cf-frontend"
  location = var.region

  template {
    containers {
      image = "${var.region}-docker.pkg.dev/${var.project_id}/${var.repository}/frontend:${var.image_tag}"
      ports {
        container_port = 3000
      }
      resources {
        limits = {
          memory = "1Gi"
          cpu    = "1"
        }
      }
      env {
        name  = "NEXT_PUBLIC_BACKEND_API_URL"
        value = "https://${var.domain_name}"
      }
      env {
        name  = "BACKEND_API_URL"
        value = "https://${var.domain_name}"
      }
    }
    vpc_access {
      connector = google_vpc_access_connector.connector.id
      egress    = "PRIVATE_RANGES_ONLY"
    }
    timeout = "300s"
  }

  depends_on = [google_project_service.services]
}

resource "google_cloud_run_v2_service_iam_member" "frontend_invoker" {
  location = google_cloud_run_v2_service.frontend.location
  name     = google_cloud_run_v2_service.frontend.name
  role     = "roles/run.invoker"
  member   = "allUsers"
}

# 5. Global HTTP(S) Load Balancer
resource "google_compute_global_address" "lb_ip" {
  name = "resumatch-cf-lb-ip"
}

resource "google_compute_region_network_endpoint_group" "backend_neg" {
  name                  = "resumatch-cf-backend-neg"
  network_endpoint_type = "SERVERLESS"
  region                = var.region
  cloud_run {
    service = google_cloud_run_v2_service.backend.name
  }
}

resource "google_compute_region_network_endpoint_group" "frontend_neg" {
  name                  = "resumatch-cf-frontend-neg"
  network_endpoint_type = "SERVERLESS"
  region                = var.region
  cloud_run {
    service = google_cloud_run_v2_service.frontend.name
  }
}

resource "google_compute_health_check" "backend_health" {
  name = "resumatch-cf-backend-health"

  http_health_check {
    port         = 8090
    request_path = "/health"
  }
}

resource "google_compute_health_check" "frontend_health" {
  name = "resumatch-cf-frontend-health"

  http_health_check {
    port         = 3000
    request_path = "/"
  }
}

resource "google_compute_backend_service" "backend_service" {
  name          = "resumatch-cf-backend-api-service"
  protocol      = "HTTP"
  port_name     = "http"
  health_checks = [google_compute_health_check.backend_health.id]

  log_config {
    enable      = true
    sample_rate = 1.0
  }

  backend {
    group = google_compute_region_network_endpoint_group.backend_neg.id
  }
}

resource "google_compute_backend_service" "frontend_service" {
  name          = "resumatch-cf-frontend-app-service"
  protocol      = "HTTP"
  port_name     = "http"
  health_checks = [google_compute_health_check.frontend_health.id]

  backend {
    group = google_compute_region_network_endpoint_group.frontend_neg.id
  }
}

resource "google_compute_url_map" "url_map" {
  name            = "resumatch-cf-url-map"
  default_service = google_compute_backend_service.frontend_service.id

  host_rule {
    hosts        = [var.domain_name, "www.${var.domain_name}"]
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
  name = "resumatch-cf-cert"
  managed {
    domains = [var.domain_name, "www.${var.domain_name}"]
  }

  lifecycle {
    create_before_destroy = true
  }
}

resource "google_compute_target_https_proxy" "https_proxy" {
  name             = "resumatch-cf-https-proxy"
  url_map          = google_compute_url_map.url_map.id
  ssl_certificates = [google_compute_managed_ssl_certificate.cert.id]

  lifecycle {
    create_before_destroy = true
  }
}

resource "google_compute_global_forwarding_rule" "https_forwarding_rule" {
  name       = "resumatch-cf-https-forwarding"
  target     = google_compute_target_https_proxy.https_proxy.id
  port_range = "443"
  ip_address = google_compute_global_address.lb_ip.address
}

# 6. HTTP -> HTTPS redirect
resource "google_compute_url_map" "https_redirect" {
  name = "resumatch-cf-https-redirect"
  default_url_redirect {
    https_redirect         = true
    redirect_response_code = "MOVED_PERMANENTLY_DEFAULT"
    strip_query            = false
  }
}

resource "google_compute_target_http_proxy" "http_proxy" {
  name    = "resumatch-cf-http-proxy"
  url_map = google_compute_url_map.https_redirect.id
}

resource "google_compute_global_forwarding_rule" "http_forwarding_rule" {
  name       = "resumatch-cf-http-forwarding"
  target     = google_compute_target_http_proxy.http_proxy.id
  port_range = "80"
  ip_address = google_compute_global_address.lb_ip.address
}
