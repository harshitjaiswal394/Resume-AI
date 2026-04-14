variable "project_id" {
  description = "The GCP Project ID"
  type        = string
}

variable "region" {
  description = "GCP region"
  type        = string
  default     = "us-central1"
}

variable "domain_name" {
  description = "The custom domain name (e.g. example.com)"
  type        = string
}

variable "db_password" {
  description = "Password for the database user"
  type        = string
  sensitive   = true
}

variable "nvidia_api_key" {
  description = "NVIDIA NIM API Key"
  type        = string
  sensitive   = true
}
