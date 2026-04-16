# Production Debugging Guide: End-to-End Traffic Flow (GCP)

This guide provides a comprehensive list of commands for troubleshooting traffic flow in a GCP environment using Cloud Run, Global Load Balancing, and Cloud DNS.

---

## ðŸ›°ï¸ Stage 1: DNS & SSL (Entry Point)
Traffic must resolve to your Load Balancer and establish an HTTPS handshake.

### Check Nameserver Propagation
Verify which nameservers are currently authoritative for your domain.
```powershell
nslookup -type=ns resumatches.com
```

### Check A-Record Resolution
Ensure your domain points to the Load Balancer IP (`34.8.47.137`).
```powershell
nslookup resumatches.com
```

### Check SSL Certificate Status
Verify if Google has issued the managed certificate. It must be `ACTIVE`.
```powershell
powershell -ExecutionPolicy Bypass -Command "gcloud compute ssl-certificates describe resumatch-cert --global"
```

---

## ðŸš¦ Stage 2: Load Balancer & Routing
The URL-Map must correctly route `/api` traffic to the backend.

### List URL Map Rules
Verify path-based routing configuration.
```powershell
powershell -ExecutionPolicy Bypass -Command "gcloud compute url-maps describe resumatch-url-map"
```

### Check Backend Service Health
Verify that the Serverless NEG is healthy.
```powershell
powershell -ExecutionPolicy Bypass -Command "gcloud compute backend-services get-health backend-api-service --global"
```

---

## ðŸ“¦ Stage 3: Cloud Run Inspection
Validate service configuration, environment variables, and IAM roles.

### Check Environment Variables
Ensure `BACKEND_API_URL` and `NEXT_PUBLIC_` vars are correctly set.
```powershell
powershell -ExecutionPolicy Bypass -Command "gcloud run services describe resumatch-frontend --region us-east1 --format='yaml(spec.template.spec.containers[0].env)'"
```

### Check IAM Permissions
Ensure `allUsers` has the `roles/run.invoker` role for public access.
```powershell
powershell -ExecutionPolicy Bypass -Command "gcloud run services get-iam-policy resumatch-backend --region us-east1"
```

### Check Service Status
Confirm services are deployed and reachable.
```powershell
powershell -ExecutionPolicy Bypass -Command "gcloud run services list --region us-east1"
```

---

## ðŸ§ª Stage 4: Live Traffic Testing
Use `curl` to simulate requests and identify where they fail.

### Test Backend Directly
Check if the backend is alive using its internal Cloud Run URL.
```powershell
curl -I https://resumatch-backend-59700466304.us-east1.run.app/health
```

### Test Production API
Check if the Load Balancer is correctly routing to the backend.
```powershell
curl -I https://resumatches.com/api/health
```

### Test CORS Preflight
Verify that the backend handles `OPTIONS` requests from your domain.
```powershell
curl -v -X OPTIONS https://resumatches.com/api/resume/process `
  -H "Origin: https://resumatches.com" `
  -H "Access-Control-Request-Method: POST"
```

---

## ðŸ“ Stage 5: Logs & Observability
When everything looks correct but the results are wrong, check the runtime logs.

### Stream Live Logs
Watch errors in real-time.
```powershell
powershell -ExecutionPolicy Bypass -Command "gcloud alpha logging tail 'resource.type=cloud_run_revision AND resource.labels.service_name=resumatch-backend'"
```

### Search for Recent Errors
Find specific failures in the last hour.
```powershell
powershell -ExecutionPolicy Bypass -Command "gcloud logging read 'resource.type=cloud_run_revision AND severity>=ERROR' --limit 10"
```

---

## ðŸ’¡ Troubleshooting Tips
- **DNS Cache**: If `nslookup` shows old results, try `ipconfig /flushdns`.
- **Cert Delays**: Managed SSL certificates take 30-60 minutes to go `ACTIVE` after DNS is corrected.
- **Trace IDs**: Look for `x-cloud-trace-context` in headers to track a single request across services.
