output "load_balancer_ip" {
  value       = google_compute_global_address.lb_ip.address
  description = "Point jaiswal.shop and www.jaiswal.shop (A records, in Cloudflare) at this IP. Keep proxy OFF until the managed cert is ACTIVE."
}

output "backend_url" {
  value       = google_cloud_run_v2_service.backend.uri
  description = "Direct Cloud Run URL for the backend (for testing, bypasses the LB)"
}

output "frontend_url" {
  value       = google_cloud_run_v2_service.frontend.uri
  description = "Direct Cloud Run URL for the frontend (for testing, bypasses the LB)"
}

output "managed_cert_expiry" {
  value       = google_compute_managed_ssl_certificate.cert.expire_time
  description = "Expiry of the Google-managed TLS cert (null until ACTIVE). Check with: gcloud compute ssl-certificates describe resumatch-cf-cert --global"
}
