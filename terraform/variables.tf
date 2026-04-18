variable "environment" {
  description = "Deployment environment (e.g., prod, staging)"
  type        = string
  default     = "staging"
}

variable "firebase_project_id" {
  description = "The Firebase Project ID (e.g., resumatch-ai-c5938)"
  type        = string
}

variable "database_url" {
  description = "The database connection URL"
  type        = string
  sensitive   = true
}

variable "region" {
  description = "The GCP region to deploy to"
  type        = string
  default     = "us-east1"
}

variable "domain_name" {
  description = "The custom domain name (e.g. example.com)"
  type        = string
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


variable "image_tag" {
  description = "The tag of the docker image to deploy"
  type        = string
  default     = "latest"
}
