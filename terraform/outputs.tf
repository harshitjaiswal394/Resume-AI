output "backend_url" {
  value = google_cloud_run_v2_service.backend.uri
}

output "frontend_url" {
  value = google_cloud_run_v2_service.frontend.uri
}

output "load_balancer_ip" {
  value = google_compute_global_address.lb_ip.address
  description = "The IP address of the Global Load Balancer. Point resumatches.com to this IP."
}

output "dns_nameservers" {
  value = google_dns_managed_zone.primary.name_servers
  description = "The nameservers for the managed DNS zone. Update your registrar to use these."
}
