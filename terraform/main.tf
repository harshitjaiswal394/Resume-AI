terraform {
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
    "vpcaccess.googleapis.com"
  ])
  service = each.key
  disable_on_destroy = false
}

# 2. Networking (VPC for Cloud SQL connectivity)
resource "google_compute_network" "vpc" {
  name = "resumatch-vpc"
  depends_on = [google_project_service.services]
}

resource "google_compute_global_address" "private_ip_address" {
  name          = "google-managed-services-resumatch"
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

# 3. Cloud SQL (PostgreSQL)
resource "google_sql_database_instance" "postgres" {
  name             = "resumatch-db"
  database_version = "POSTGRES_15"
  region           = var.region
  depends_on      = [google_service_networking_connection.private_vpc_connection]

  settings {
    tier = "db-f1-micro" # Switch to larger tier for production
    ip_configuration {
      ipv4_enabled    = true # Enabled for easy management, can be private-only
      private_network = google_compute_network.vpc.id
    }
    database_flags {
      name  = "cloudsql.iam_authentication"
      value = "on"
    }
  }
  deletion_protection = false # Set to true for production
}

resource "google_sql_database" "database" {
  name     = "resumatch"
  instance = google_sql_database_instance.postgres.name
}

resource "google_sql_user" "users" {
  name     = "resumatch_admin"
  instance = google_sql_database_instance.postgres.name
  password = var.db_password
}

# 4. Artifact Registry
resource "google_artifact_registry_repository" "repo" {
  location      = var.region
  repository_id = "resumatch-repo"
  format        = "DOCKER"
  depends_on    = [google_project_service.services]
}

# 5. Cloud Run - Backend
resource "google_cloud_run_v2_service" "backend" {
  name     = "resumatch-backend"
  location = var.region

  template {
    containers {
      image = "${var.region}-docker.pkg.dev/${var.project_id}/${google_artifact_registry_repository.repo.repository_id}/backend:latest"
      
      env {
        name  = "DATABASE_URL"
        value = "postgresql://${google_sql_user.users.name}:${var.db_password}@${google_sql_database_instance.postgres.private_ip_address}/${google_sql_database.database.name}"
      }
      env {
        name  = "NVIDIA_API_KEY_REASONING"
        value = var.nvidia_api_key
      }
      env {
        name  = "NVIDIA_API_KEY_PARSING"
        value = var.nvidia_api_key
      }
      env {
        name  = "NVIDIA_API_KEY_EMBEDDING"
        value = var.nvidia_api_key
      }
    }
  }
}

# 6. Cloud Run - Frontend
resource "google_cloud_run_v2_service" "frontend" {
  name     = "resumatch-frontend"
  location = var.region

  template {
    containers {
      image = "${var.region}-docker.pkg.dev/${var.project_id}/${google_artifact_registry_repository.repo.repository_id}/frontend:latest"
      
      env {
        name  = "NEXT_PUBLIC_BACKEND_API_URL"
        value = google_cloud_run_v2_service.backend.uri
      }
    }
  }
}

# 7. DNS & Custom Domain (Simplified for now)
resource "google_dns_managed_zone" "zone" {
  name        = "resumatch-zone"
  dns_name    = "${var.domain_name}."
  description = "Managed zone for ResuMatch AI"
}
