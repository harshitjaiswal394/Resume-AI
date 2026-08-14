variable "project_id" {
  description = "The GCP Project ID"
  type        = string
}

variable "region" {
  description = "GCP region for Cloud Run + backends"
  type        = string
  default     = "us-east1"
}

variable "repository" {
  description = "Artifact Registry repository holding the docker images"
  type        = string
  default     = "resumatches-official"
}

variable "domain_name" {
  description = "The custom domain served by the load balancer (DNS lives in Cloudflare)"
  type        = string
  default     = "jaiswal.shop"
}

variable "database_url" {
  description = "Connection string for the PostgreSQL database"
  type        = string
  sensitive   = true
}

variable "nvidia_api_key_reasoning" {
  description = "NVIDIA Reasoning API Key"
  type        = string
  sensitive   = true
}

variable "nvidia_api_key_parsing" {
  description = "NVIDIA Parsing API Key"
  type        = string
  sensitive   = true
}

variable "nvidia_api_key_embedding" {
  description = "NVIDIA Embedding API Key"
  type        = string
  sensitive   = true
}

variable "nvidia_api_key_reranking" {
  description = "NVIDIA Reranking API Key"
  type        = string
  sensitive   = true
}

variable "supabase_url" {
  description = "Supabase project URL"
  type        = string
  sensitive   = true
}

variable "supabase_service_role_key" {
  description = "Supabase service role key (server-side only)"
  type        = string
  sensitive   = true
}

variable "image_tag" {
  description = "The tag of the docker image to deploy"
  type        = string
  default     = "latest"
}
