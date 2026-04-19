terraform {
  backend "gcs" {
    bucket = "resume-terraform-stage-state"
    prefix = "stage"
  }
  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 5.0"
    }
  }
}

provider "google" {
  project = var.gcp_project_id
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
    "cloudresourcemanager.googleapis.com",
    "servicenetworking.googleapis.com"
  ])
  service = each.key
  disable_on_destroy = false
}

# 2. Networking
resource "google_compute_network" "vpc" {
  name = "resumatch-vpc-${var.environment}"
  depends_on = [google_project_service.services]
}

# 2.2 Subnet for Serverless VPC Access
resource "google_compute_subnetwork" "serverless_subnet" {
  name          = "serverless-subnet-${var.environment}"
  ip_cidr_range = var.environment == "prod" ? "10.10.0.0/28" : "10.11.0.0/28"
  network       = google_compute_network.vpc.id
  region        = var.region
}

resource "google_vpc_access_connector" "connector" {
  name          = "vpc-con-${var.environment}"
  region        = var.region
  subnet {
    name = google_compute_subnetwork.serverless_subnet.name
  }
}

# 2.3 Private Service Access (for Cloud SQL Private IP)
resource "google_compute_global_address" "private_ip_address" {
  name          = "private-ip-address-${var.environment}"
  purpose       = "VPC_PEERING"
  address_type  = "INTERNAL"
  prefix_length = 16
  network       = google_compute_network.vpc.id
}

resource "google_service_networking_connection" "private_vpc_connection" {
  network                 = google_compute_network.vpc.id
  service                 = "servicenetworking.googleapis.com"
  reserved_peering_ranges = [google_compute_global_address.private_ip_address.name]
}

# 3. Cloud SQL - Managed PostgreSQL
resource "google_sql_database_instance" "db_instance" {
  name             = "resumatch-db-${var.environment}"
  database_version = "POSTGRES_15"
  region           = var.region

  settings {
    tier = var.environment == "prod" ? "db-custom-1-3840" : "db-f1-micro"
    
    ip_configuration {
      ipv4_enabled    = true # Allow Cloud Run to connect, but we will use IAM auth or private VPC
      private_network = google_compute_network.vpc.id
      authorized_networks {
        name  = "local-access"
        value = "223.185.33.162"
      }
    }
  }
  
  deletion_protection = var.environment == "prod" ? true : false
  depends_on          = [google_project_service.services, google_service_networking_connection.private_vpc_connection]
}

resource "google_sql_database" "database" {
  name     = "resumatch_${var.environment}"
  instance = google_sql_database_instance.db_instance.name
}

resource "google_sql_user" "users" {
  name     = "resumatch_app"
  instance = google_sql_database_instance.db_instance.name
  password = "change-me-via-secret" # In real CI/CD we use external secrets
}

# 4. Artifact Registry (Shared for both envs often, but let's separate if needed)
resource "google_artifact_registry_repository" "repo" {
  location      = var.region
  repository_id = "resumatches-${var.environment}"
  format        = "DOCKER"
  depends_on    = [google_project_service.services]
}

# 5. Cloud Run - Backend
resource "google_cloud_run_v2_service" "backend" {
  name     = "resumatch-backend-${var.environment}"
  location = var.region

  template {
    containers {
      image = "${var.region}-docker.pkg.dev/${var.gcp_project_id}/resumatches-${var.environment}/backend:${var.image_tag}"
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
        value = "postgresql://resumatch_app:change-me-via-secret@${google_sql_database_instance.db_instance.private_ip_address}:5432/resumatch_${var.environment}"
      }
      env {
        name  = "GCP_DATABASE_URL"
        value = "postgresql://resumatch_app:change-me-via-secret@${google_sql_database_instance.db_instance.private_ip_address}:5432/resumatch_${var.environment}"
      }
      # Other envs...
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
        name  = "GCP_PROJECT_ID"
        value = var.gcp_project_id
      }
      env {
        name  = "FIREBASE_PROJECT_ID"
        value = var.firebase_project_id
      }
      env {
        name  = "GCP_STORAGE_BUCKET"
        value = "resumatches-resumes-${var.gcp_project_id}-${var.environment}"
      }
    }
    vpc_access {
      connector = google_vpc_access_connector.connector.id
      egress    = "PRIVATE_RANGES_ONLY"
    }
    timeout = "300s"
  }
}

resource "google_cloud_run_v2_service_iam_member" "backend_invoker" {
  name     = google_cloud_run_v2_service.backend.name
  location = google_cloud_run_v2_service.backend.location
  role     = "roles/run.invoker"
  member   = "allUsers"
}

# 6. Cloud Run - Frontend
resource "google_cloud_run_v2_service" "frontend" {
  name     = "resumatch-frontend-${var.environment}"
  location = var.region

  template {
    containers {
      image = "${var.region}-docker.pkg.dev/${var.gcp_project_id}/resumatches-${var.environment}/frontend:${var.image_tag}"
      ports {
        container_port = 3000
      }
      env {
        name  = "DATABASE_URL"
        value = "postgresql://resumatch_app:change-me-via-secret@${google_sql_database_instance.db_instance.private_ip_address}:5432/resumatch_${var.environment}"
      }
      env {
        name  = "GCP_PROJECT_ID"
        value = var.gcp_project_id
      }
      env {
        name  = "FIREBASE_PROJECT_ID"
        value = var.firebase_project_id
      }
      env {
        name  = "NEXT_PUBLIC_BACKEND_API_URL"
        value = var.environment == "prod" ? "https://resumatches.com" : "https://staging.resumatches.com"
      }
    }
    vpc_access {
      connector = google_vpc_access_connector.connector.id
      egress    = "PRIVATE_RANGES_ONLY"
    }
    timeout = "300s"
  }
}

resource "google_cloud_run_v2_service_iam_member" "frontend_invoker" {
  name     = google_cloud_run_v2_service.frontend.name
  location = google_cloud_run_v2_service.frontend.location
  role     = "roles/run.invoker"
  member   = "allUsers"
}

# 7. Global HTTP(S) Load Balancer Stack
resource "google_compute_global_address" "lb_ip" {
  name = "resumatch-lb-ip-${var.environment}"
}

resource "google_compute_region_network_endpoint_group" "backend_neg" {
  name                  = "backend-neg-${var.environment}"
  network_endpoint_type = "SERVERLESS"
  region                = var.region
  cloud_run {
    service = google_cloud_run_v2_service.backend.name
  }
}

resource "google_compute_region_network_endpoint_group" "frontend_neg" {
  name                  = "frontend-neg-${var.environment}"
  network_endpoint_type = "SERVERLESS"
  region                = var.region
  cloud_run {
    service = google_cloud_run_v2_service.frontend.name
  }
}

resource "google_compute_backend_service" "backend_service" {
  name      = "backend-api-${var.environment}"
  protocol  = "HTTP"
  port_name = "http"

  backend {
    group = google_compute_region_network_endpoint_group.backend_neg.id
  }
}

resource "google_compute_backend_service" "frontend_service" {
  name        = "frontend-app-${var.environment}"
  protocol    = "HTTP"
  port_name   = "http"

  backend {
    group = google_compute_region_network_endpoint_group.frontend_neg.id
  }
}

resource "google_compute_url_map" "url_map" {
  name            = "resumatch-url-map-${var.environment}"
  default_service = google_compute_backend_service.frontend_service.id

  host_rule {
    hosts        = [var.environment == "prod" ? "resumatches.com" : "staging.resumatches.com"]
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
  name = "resumatch-cert-${var.environment}"
  managed {
    domains = [var.environment == "prod" ? "resumatches.com" : "staging.resumatches.com"]
  }
}

resource "google_compute_target_https_proxy" "https_proxy" {
  name             = "resumatch-https-${var.environment}"
  url_map          = google_compute_url_map.url_map.id
  ssl_certificates = [google_compute_managed_ssl_certificate.cert.id]
}

resource "google_compute_global_forwarding_rule" "https_forwarding_rule" {
  name       = "resumatch-https-forward-${var.environment}"
  target     = google_compute_target_https_proxy.https_proxy.id
  port_range = "443"
  ip_address = google_compute_global_address.lb_ip.address
}



# 8. DNS Configuration (Referencing existing Zone)
data "google_dns_managed_zone" "primary" {
  name = "resumatches-com"
}

resource "google_dns_record_set" "root" {
  name         = var.environment == "prod" ? data.google_dns_managed_zone.primary.dns_name : "staging.${data.google_dns_managed_zone.primary.dns_name}"
  managed_zone = data.google_dns_managed_zone.primary.name
  type         = "A"
  ttl          = 300
  rrdatas      = [google_compute_global_address.lb_ip.address]
}

# 9. HTTP to HTTPS Redirect
resource "google_compute_url_map" "https_redirect" {
  name = "resumatch-https-redirect-${var.environment}"
  default_url_redirect {
    https_redirect         = true
    redirect_response_code = "MOVED_PERMANENTLY_DEFAULT"
    strip_query            = false
  }
}

resource "google_compute_target_http_proxy" "http_proxy" {
  name    = "resumatch-http-${var.environment}"
  url_map = google_compute_url_map.https_redirect.id
}

resource "google_compute_global_forwarding_rule" "http_forwarding_rule" {
  name       = "resumatch-http-forward-${var.environment}"
  target     = google_compute_target_http_proxy.http_proxy.id
  port_range = "80"
  ip_address = google_compute_global_address.lb_ip.address
}

# 10. GCP Storage for Resumes
resource "google_storage_bucket" "resumes_bucket" {
  name                        = "resumatches-resumes-${var.gcp_project_id}-${var.environment}"
  location                    = var.region
  uniform_bucket_level_access = true
  force_destroy               = true

  cors {
    origin          = ["*"]
    method          = ["GET", "HEAD", "PUT", "POST", "DELETE"]
    response_header = ["*"]
    max_age_seconds = 3600
  }
}

resource "google_storage_bucket_iam_member" "backend_storage_admin" {
  bucket = google_storage_bucket.resumes_bucket.name
  role   = "roles/storage.objectAdmin"
  member = "allAuthenticatedUsers"
}

resource "google_storage_bucket_iam_member" "public_read" {
  bucket = google_storage_bucket.resumes_bucket.name
  role   = "roles/storage.objectViewer"
  member = "allUsers"
}

