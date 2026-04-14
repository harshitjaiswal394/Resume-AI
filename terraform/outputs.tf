output "backend_url" {
  value = google_cloud_run_v2_service.backend.uri
}

output "frontend_url" {
  value = google_cloud_run_v2_service.frontend.uri
}

output "db_instance_address" {
  value = google_sql_database_instance.postgres.private_ip_address
}

output "name_servers" {
  value = google_dns_managed_zone.zone.name_servers
  description = "Name servers to configure in your domain registrar"
}
