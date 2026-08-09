# Website Security Hardening Guide for ResuMatch AI

This guide documents the security hardening steps for **jaiswal.shop / ResuMatch AI** running on **GKE + NGINX Gateway Fabric + Next.js + Supabase + Cloudflare**.

---

# Enterprise Security Architecture Overview

```text
                                              Internet
                                                  |
                                          DNS Resolution
                                                  |
                                            Cloudflare Edge
                                      (CDN, TLS, WAF, DDoS, Bot)
                                                  |
                                          HTTPS (TLS 1.3)
                                                  |
                                        NGINX Gateway Fabric (GKE)
                                    (Gateway, HTTPRoute, Policies)
                                                  |
                                      -------------------------
                                      |                       |
                                  Frontend Service       Backend Service
                                    (Next.js)             (FastAPI)
                                      |                       |
                                      |                   JWT Validation
                                      |                       |
                                      -------- Supabase --------
                                          Auth | DB | Storage
```

This architecture follows the enterprise security principle of **defense in depth**:

---

# Goals

* Enable HTTPS enforcement
* Add browser security headers
* Implement a production-compatible Content Security Policy (CSP)
* Protect against XSS, clickjacking, mixed content, and legacy plugin attacks
* Keep compatibility with:

  * Next.js hydration
  * Cloudflare Turnstile
  * Cloudflare Web Analytics
  * Supabase Auth and API
  * Google OAuth

---

# Cloudflare Security Configuration

## Enable HSTS

Cloudflare Dashboard:

SSL/TLS -> Edge Certificates -> HTTP Strict Transport Security (HSTS)

Recommended settings:

* Max Age: **31536000**
* Include Subdomains: **Enabled**
* Preload: **Optional**

Expected response header:

```text
Strict-Transport-Security: max-age=31536000; includeSubDomains
```

---

## WAF

Enable:

* Cloudflare Managed Rules
* Bot Fight Mode
* Rate Limiting for `/api/*`

Example:

* 60 requests / minute
* Action: Managed Challenge

---

# NGINX Gateway Fabric HTTPRoute

The CSP is managed at the **Gateway API layer**, not through Cloudflare Transform Rules.

## Frontend HTTPRoute

```yaml
apiVersion: gateway.networking.k8s.io/v1
kind: HTTPRoute
metadata:
  name: frontend-route
  namespace: resumatch-ai
spec:
  hostnames:
    - resumatches.com
    - www.resumatches.com
    - jaiswal.shop
    - www.jaiswal.shop

  parentRefs:
    - group: gateway.networking.k8s.io
      kind: Gateway
      name: resumatch-gateway
      sectionName: https

  rules:
    - matches:
        - path:
            type: PathPrefix
            value: /

      filters:
        - type: ResponseHeaderModifier
          responseHeaderModifier:
            set:
              - name: Content-Security-Policy
                value: "default-src 'self'; base-uri 'self'; object-src 'none'; frame-ancestors 'none'; upgrade-insecure-requests; script-src 'self' 'unsafe-inline' https://challenges.cloudflare.com https://static.cloudflareinsights.com; script-src-elem 'self' https://challenges.cloudflare.com https://static.cloudflareinsights.com; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; font-src 'self' https:; connect-src 'self' https://*.supabase.co https://*.googleapis.com https://www.jaiswal.shop wss: https:; frame-src https://challenges.cloudflare.com; form-action 'self' https://accounts.google.com;"

              - name: X-Content-Type-Options
                value: "nosniff"

              - name: Referrer-Policy
                value: "strict-origin-when-cross-origin"

              - name: Permissions-Policy
                value: "camera=(), microphone=(), geolocation=()"

              - name: X-Frame-Options
                value: "SAMEORIGIN"

      backendRefs:
        - group: ""
          kind: Service
          name: frontend-service
          port: 3000
          weight: 1
```

---

# Deploy

Apply the route:

```bash
kubectl apply -f frontend-route.yaml
```

Verify:

```bash
kubectl get httproute frontend-route -n resumatch-ai
kubectl describe httproute frontend-route -n resumatch-ai
```

Expected:

* Accepted=True
* ResolvedRefs=True

---

# Verify Response Headers

```bash
curl -I https://www.jaiswal.shop
```

Expected headers:

```text
Content-Security-Policy: ...
Strict-Transport-Security: max-age=31536000; includeSubDomains
X-Content-Type-Options: nosniff
Referrer-Policy: strict-origin-when-cross-origin
Permissions-Policy: camera=(), microphone=(), geolocation=()
X-Frame-Options: SAMEORIGIN
```

Check CSP specifically:

```bash
curl -I https://www.jaiswal.shop | grep -i content-security-policy
```

---

# Why This CSP Is Used

CSP acts as a **browser-enforced firewall**.

It restricts which resources are allowed to load and execute.

## What It Protects Against

* Cross-Site Scripting (XSS)
* Malicious third-party script injection
* Clickjacking
* Legacy plugin attacks
* Mixed content

## Important Directives

| Directive                 | Purpose                                             |
| ------------------------- | --------------------------------------------------- |
| default-src 'self'        | Only load resources from your own origin by default |
| script-src                | Controls executable JavaScript                      |
| script-src-elem           | Controls external script tags                       |
| connect-src               | Controls fetch/XHR/WebSocket connections            |
| object-src 'none'         | Blocks Flash, Java, and plugin content              |
| frame-ancestors 'none'    | Prevents embedding your site in iframes             |
| upgrade-insecure-requests | Forces HTTP resources to HTTPS           
| Content-Security-Policy   | XSS mitigation              |
| Strict-Transport-Security | HTTPS enforcement           |
| X-Content-Type-Options    | MIME sniff prevention       |
| Referrer-Policy           | Referrer privacy            |
| Permissions-Policy        | Browser feature restriction |
| X-Frame-Options           | Clickjacking protection     |

---

# Why unsafe-inline Is Allowed

Next.js injects inline scripts for hydration and initial page state.

Without nonces or hashes, these scripts are blocked.

Using:

```text
'unsafe-inline'
```

is a practical compatibility choice.

---

# Why unsafe-eval Is NOT Allowed

Do **not** add:

```text
'unsafe-eval'
```

unless your own application requires it.

In our environment:

* The website works
* Supabase authentication works
* Dashboard works

The remaining unsafe-eval warning came from:

```text
content.js
```

which is a **Chrome browser extension**, not the application.

---

# Browser Extension CSP Errors

Example:

```text
content.js:1 Evaluating a string as JavaScript violates the following Content Security Policy directive...
```

This is caused by:

* AI extensions
* Ad blockers
* Grammarly
* Password managers
* Other Chrome extensions

Verify:

1. Open Incognito
2. Disable extensions
3. Visit the site

If the error disappears, the CSP is functioning correctly.

---

# What Can Be Inferred From CSP

A CSP reveals some application architecture.

For example:

```text
connect-src https://*.supabase.co https://*.googleapis.com
```

indicates:

* Supabase is used
* Google OAuth is used

```text
frame-src https://challenges.cloudflare.com
```

indicates:

* Cloudflare Turnstile is used

This is normal and generally acceptable.

---

# Kubernetes Commands

## Export Route

```bash
kubectl get httproute frontend-route -n resumatch-ai -o yaml > frontend-route-backup.yaml
```

## Delete Route

```bash
kubectl delete httproute frontend-route -n resumatch-ai
```

## Recreate Route

```bash
kubectl apply -f frontend-route.yaml
```

## Edit Live Route

```bash
kubectl edit httproute frontend-route -n resumatch-ai
```

---

# Security Checklist

## Cloudflare

* HSTS enabled
* WAF enabled
* Bot Fight Mode enabled
* Rate limiting configured

## NGINX Gateway

* CSP configured
* X-Content-Type-Options
* Referrer-Policy
* Permissions-Policy
* X-Frame-Options

## Supabase

* RLS enabled on all user tables
* Service Role key not exposed to frontend
* OAuth redirect URLs restricted
* MFA enabled for admin accounts

## Application

* No unsafe-eval
* Minimal third-party scripts
* Dependencies regularly updated
* OWASP ZAP scan performed

---

# Final Production Baseline

The deployed configuration provides:

* HTTPS enforcement
* XSS mitigation
* Clickjacking protection
* Plugin blocking
* Secure browser defaults
* Cloudflare compatibility
* Supabase compatibility
* Next.js compatibility

This is a strong production-ready baseline for a **Next.js + Supabase + Kubernetes + Cloudflare** deployment.
