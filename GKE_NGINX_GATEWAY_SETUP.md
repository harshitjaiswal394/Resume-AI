# GKE Setup With NGINX Gateway Fabric and Gateway API

This guide documents the production-style Kubernetes setup for this repo on Google Kubernetes Engine using:

- Gateway API
- NGINX Gateway Fabric
- cert-manager
- the manifests in [`kubernetes/`](C:/Users/acer/Downloads/resumatch-ai-web/kubernetes)

It is written for the current domain setup:

- `jaiswal.shop`
- `www.jaiswal.shop`

## Prerequisites

Before starting, make sure you have:

- a GKE cluster running
- `kubectl`, `gcloud`, and `helm` installed
- access to your Google Cloud project
- DNS control for `jaiswal.shop`
- container images already pushed to Artifact Registry

Set your project first:

```bash
gcloud auth login
gcloud config set project project-fd5c6032-c8d6-497d-9c2
```

Fetch cluster credentials:

```bash
gcloud container clusters get-credentials resumatches-cluster-1 --region asia-east1
```

## 1. Install Gateway API CRDs

Pick one channel. In most cases, `standard-install.yaml` is enough.

Install the standard channel:

```bash
kubectl apply --server-side -f https://github.com/kubernetes-sigs/gateway-api/releases/download/v1.5.0/standard-install.yaml
```

If you explicitly need experimental Gateway API resources, use:

```bash
kubectl apply -f https://github.com/kubernetes-sigs/gateway-api/releases/download/v1.5.0/experimental-install.yaml
```

Do not install both unless you intentionally want the experimental channel on top of standard.

Verify:

```bash
kubectl get crd | grep gateway.networking.k8s.io
```

## 2. Install NGINX Gateway Fabric

Create `ngf-values.yml`:

```yaml
certGenerator:
  enable: true
  serverTLSSecretName: server-tls
  agentTLSSecretName: agent-tls
  overwrite: true
```

Install NGINX Gateway Fabric:

```bash
helm install ngf oci://ghcr.io/nginx/charts/nginx-gateway-fabric \
  --create-namespace \
  -n nginx-gateway \
  -f ngf-values.yml
```

Verify the controller:

```bash
kubectl get pods -n nginx-gateway
kubectl get gatewayclass
```

You should see a GatewayClass named `nginx`.

## 3. Install cert-manager

If cert-manager is not already installed:

```bash
kubectl apply -f https://github.com/cert-manager/cert-manager/releases/download/v1.18.2/cert-manager.yaml
```

Wait for it:

```bash
kubectl get pods -n cert-manager
```

## 4. Review Repo Manifests

This repo already includes the app manifests:

- [namespace.yaml](C:/Users/acer/Downloads/resumatch-ai-web/kubernetes/namespace.yaml)
- [configmap.yaml](C:/Users/acer/Downloads/resumatch-ai-web/kubernetes/configmap.yaml)
- [secrets.yaml](C:/Users/acer/Downloads/resumatch-ai-web/kubernetes/secrets.yaml)
- [issuer.yaml](C:/Users/acer/Downloads/resumatch-ai-web/kubernetes/issuer.yaml)
- [certificate.yaml](C:/Users/acer/Downloads/resumatch-ai-web/kubernetes/certificate.yaml)
- [gateway.yaml](C:/Users/acer/Downloads/resumatch-ai-web/kubernetes/gateway.yaml)
- [routes.yaml](C:/Users/acer/Downloads/resumatch-ai-web/kubernetes/routes.yaml)
- [backend.yaml](C:/Users/acer/Downloads/resumatch-ai-web/kubernetes/backend.yaml)
- [frontend.yaml](C:/Users/acer/Downloads/resumatch-ai-web/kubernetes/frontend.yaml)

Important current assumptions in the repo:

- public domain is `https://jaiswal.shop`
- `www.jaiswal.shop` is also routed
- backend service is exposed at `/api`
- frontend service is exposed at `/`

## 5. Create Namespace and App Config

Apply the namespace and config:

```bash
kubectl apply -f kubernetes/namespace.yaml
kubectl apply -f kubernetes/configmap.yaml
kubectl apply -f kubernetes/secrets.yaml
```

Verify:

```bash
kubectl get ns resumatch-ai
kubectl get configmap -n resumatch-ai
kubectl get secret -n resumatch-ai
```

## 6. Install Issuer and Certificate

Apply cert-manager resources:

```bash
kubectl apply -f kubernetes/issuer.yaml
kubectl apply -f kubernetes/certificate.yaml
```

Verify certificate status:

```bash
kubectl get certificate -n resumatch-ai
kubectl describe certificate resumatch-cert -n resumatch-ai
kubectl get secret resumatch-tls-secret -n resumatch-ai
```

If the certificate is not getting issued, confirm DNS is already pointing to the gateway load balancer IP.

## 7. Create Gateway and Routes

Apply the Gateway and HTTPRoutes:

```bash
kubectl apply -f kubernetes/gateway.yaml
kubectl apply -f kubernetes/routes.yaml
```

Verify:

```bash
kubectl get gateway -n resumatch-ai
kubectl get httproute -n resumatch-ai
kubectl describe gateway resumatch-gateway -n resumatch-ai
```

Get the external IP or address:

```bash
kubectl get gateway resumatch-gateway -n resumatch-ai -o jsonpath='{.status.addresses[0].value}'; echo
```

## 8. Point DNS

Create DNS records:

- `A` record for `jaiswal.shop`
- `A` or `CNAME` record for `www.jaiswal.shop`

Both should resolve to the gateway public address.

Check:

```bash
nslookup jaiswal.shop
nslookup www.jaiswal.shop
```

## 9. Deploy Backend and Frontend

Apply the workloads:

```bash
kubectl apply -f kubernetes/backend.yaml
kubectl apply -f kubernetes/frontend.yaml
```

Verify:

```bash
kubectl get pods -n resumatch-ai
kubectl get svc -n resumatch-ai
kubectl rollout status deployment/backend -n resumatch-ai
kubectl rollout status deployment/frontend -n resumatch-ai
```

## 10. Artifact Registry Permissions

If pods fail with `ImagePullBackOff` and a `403 Forbidden`, the GKE node service account cannot pull from Artifact Registry.

Check the VM service account from any node:

```bash
gcloud compute instances describe gke-resumatches-cluster-1-pool-1-1a25bb86-fwq4 \
  --zone asia-east1-a \
  --format="value(serviceAccounts.email)"
```

Grant read access:

```bash
gcloud projects add-iam-policy-binding project-fd5c6032-c8d6-497d-9c2 \
  --member="serviceAccount:SERVICE_ACCOUNT_EMAIL" \
  --role="roles/artifactregistry.reader"
```

Then restart workloads:

```bash
kubectl rollout restart deployment/backend -n resumatch-ai
kubectl rollout restart deployment/frontend -n resumatch-ai
```

## 11. Small-Cluster Resource Notes

This repo is currently tuned for a small GKE cluster. The manifests use lighter resource requests to avoid scheduling failures on small nodes.

If you still see `Insufficient cpu`:

```bash
kubectl describe pod -n resumatch-ai POD_NAME
kubectl describe node NODE_NAME
kubectl top nodes
```

## 12. Test With curl

Set the domain:

```bash
DOMAIN=jaiswal.shop
```

Check HTTP redirect:

```bash
curl -I http://$DOMAIN
curl -I http://www.$DOMAIN
```

Check HTTPS frontend:

```bash
curl -Ik https://$DOMAIN/
curl -Ik https://www.$DOMAIN/
curl -sk https://$DOMAIN/ | head -n 20
```

Check backend health through the cluster service:

```bash
kubectl run curl-test --rm -i --restart=Never --image=curlimages/curl -- \
  curl -sS http://backend-service.resumatch-ai.svc.cluster.local:8090/health
```

Check frontend service inside the cluster:

```bash
kubectl run curl-test --rm -i --restart=Never --image=curlimages/curl -- \
  curl -I http://frontend-service.resumatch-ai.svc.cluster.local:3000/
```

Check `/api` routing through the gateway:

```bash
curl -ik https://$DOMAIN/api/resume/analyze \
  -H 'Content-Type: application/json' \
  -d '{}'
```

The `/api` test does not need to succeed logically. A `400` or `422` from your backend is still useful because it proves the route is wired correctly.

## 13. Useful Debug Commands

Check app resources:

```bash
kubectl get all -n resumatch-ai
kubectl get gateway,httproute -n resumatch-ai
kubectl get certificate -n resumatch-ai
```

Check logs:

```bash
kubectl logs -n resumatch-ai deployment/backend --tail=100
kubectl logs -n resumatch-ai deployment/frontend --tail=100
kubectl logs -n nginx-gateway deployment/ngf-nginx-gateway-fabric --tail=100
```

Describe failures:

```bash
kubectl describe pod -n resumatch-ai POD_NAME
kubectl describe gateway resumatch-gateway -n resumatch-ai
kubectl describe httproute backend-route -n resumatch-ai
kubectl describe httproute frontend-route -n resumatch-ai
```

## 14. Common Issues

### `www.jaiswal.shop` returns NGINX 404

That usually means DNS exists but the Gateway, routes, or certificate do not include `www.jaiswal.shop`.

This repo is already updated so these resources should include both:

- `jaiswal.shop`
- `www.jaiswal.shop`

Re-apply:

```bash
kubectl apply -f kubernetes/certificate.yaml
kubectl apply -f kubernetes/gateway.yaml
kubectl apply -f kubernetes/routes.yaml
```

### `ImagePullBackOff`

Usually Artifact Registry IAM:

- wrong node service account
- missing `roles/artifactregistry.reader`

### `Insufficient cpu`

Usually the cluster is too small for the requested pod resources. Check `kubectl describe node` and compare allocatable CPU versus requested CPU.

### TLS not issuing

Usually one of:

- DNS not pointed yet
- cert-manager not installed
- HTTP challenge path not reachable through the Gateway

## 15. Recommended Apply Order

For a clean cluster bootstrap, use this order:

```bash
kubectl apply -f kubernetes/namespace.yaml
kubectl apply -f kubernetes/configmap.yaml
kubectl apply -f kubernetes/secrets.yaml
kubectl apply -f kubernetes/issuer.yaml
kubectl apply -f kubernetes/certificate.yaml
kubectl apply -f kubernetes/gateway.yaml
kubectl apply -f kubernetes/routes.yaml
kubectl apply -f kubernetes/backend.yaml
kubectl apply -f kubernetes/frontend.yaml
```

That is the safest order for this repo.
