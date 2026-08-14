# End-to-End Telemetry & Observability Requirements

This document outlines the complete telemetry architecture for the `resumatch-ai` ecosystem. It covers how traces propagate from the frontend user's browser, through the Next.js server, into the backend APIs, and down to the database. It also provides an onboarding guide for instrumenting new applications (Python, Next.js/React, and .NET) into the production environment.

## 1. Architecture Overview

The observability stack uses **OpenTelemetry (OTEL)** as the universal standard for generating and collecting traces.

1. **Frontend (Browser)**: Client-side trace spans are generated and sent to a local Next.js API route using `navigator.sendBeacon()`.
2. **Frontend (Next.js Server)**: Next.js is instrumented via `@opentelemetry/sdk-node`. It processes browser spans and automatically instruments server-side rendering and API routes.
3. **Backend APIs (Python, etc.)**: Backends are instrumented to extract incoming trace IDs from HTTP headers and continue the trace for DB operations.
4. **OTEL Collector**: All apps export their telemetry data (via OTLP/HTTP or OTLP/gRPC) to the centralized OpenTelemetry Collector running in the Kubernetes cluster.
5. **Jaeger**: The OTEL Collector forwards traces to Jaeger for visualization and debugging.

---

## 2. Onboarding New Applications

When creating a new application in this ecosystem, you must adhere to the telemetry requirements to ensure distributed tracing is unbroken.

### General Production Requirements
All new apps **must**:
1. Accept the `OTEL_EXPORTER_OTLP_ENDPOINT` environment variable via Kubernetes ConfigMaps.
   - Example in Prod: `http://otel-collector.resumatch-ai.svc.cluster.local:4318/v1/traces`
2. Automatically propagate trace context using W3C Trace Context headers (`traceparent`).
3. Handle graceful failures if the OTEL collector is unreachable (telemetry should never crash the app).

---

### A. Next.js / React (Node.js) Requirements

**Packages Needed:**
```bash
npm install @opentelemetry/sdk-node @opentelemetry/auto-instrumentations-node @opentelemetry/exporter-trace-otlp-http @opentelemetry/resources @opentelemetry/semantic-conventions
```

**1. Server-Side Instrumentation (`src/instrumentation.ts`)**
Create an instrumentation file that Next.js automatically calls on startup.

```typescript
// src/instrumentation.ts
export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { NodeSDK } = await import('@opentelemetry/sdk-node');
    const { OTLPTraceExporter } = await import('@opentelemetry/exporter-trace-otlp-http');
    const { Resource } = await import('@opentelemetry/resources');
    const { SEMRESATTRS_SERVICE_NAME } = await import('@opentelemetry/semantic-conventions');
    const { SimpleSpanProcessor } = await import('@opentelemetry/sdk-trace-node');
    const { getNodeAutoInstrumentations } = await import('@opentelemetry/auto-instrumentations-node');

    const sdk = new NodeSDK({
      resource: new Resource({
        [SEMRESATTRS_SERVICE_NAME]: 'new-nextjs-app',
      }),
      spanProcessor: new SimpleSpanProcessor(
        new OTLPTraceExporter({
          url: process.env.OTEL_EXPORTER_OTLP_ENDPOINT || 'http://localhost:4318/v1/traces',
        })
      ),
      instrumentations: [getNodeAutoInstrumentations({
        // Disable fs to prevent Next.js ENOENT noise in Jaeger
        '@opentelemetry/instrumentation-fs': { enabled: false },
      })],
    });
    sdk.start();
  }
}
```
*Note: In `next.config.ts`, you must enable `experimental: { instrumentationHook: true }` if on Next.js 13/14, or it runs by default in Next.js 15.*

**2. Client-Side Browser Tracing**
Browsers cannot send traces directly to the internal Kubernetes OTEL collector. You must patch `window.fetch` to generate a `traceparent` header, and send the span payload to an internal API route (e.g., `/telemetry/browser-span`).

```typescript
// Example Client-Side Fetch Wrapper
const traceId = generateHex(16);
const spanId = generateHex(8);
headers.set("traceparent", `00-${traceId}-${spanId}-01`);

const response = await originalFetch(request, { headers });

// Send span data in background
navigator.sendBeacon("/telemetry/browser-span", JSON.stringify({
  traceId, spanId, url, method: request.method, statusCode: response.status
}));
```

---

### B. Python (FastAPI / Flask) Requirements

**Packages Needed:**
```bash
pip install opentelemetry-api opentelemetry-sdk opentelemetry-instrumentation-fastapi opentelemetry-exporter-otlp-proto-http opentelemetry-instrumentation-requests
```

**1. Tracing Setup (`app/tracing.py`)**
Initialize the OTLP Exporter and attach it to the FastAPI app.

```python
import os
from opentelemetry import trace
from opentelemetry.sdk.trace import TracerProvider
from opentelemetry.sdk.trace.export import BatchSpanProcessor
from opentelemetry.exporter.otlp.proto.http.trace_exporter import OTLPSpanExporter
from opentelemetry.sdk.resources import Resource, SERVICE_NAME
from opentelemetry.instrumentation.fastapi import FastAPIInstrumentor

def instrument_app(app, service_name: str = "new-python-backend"):
    endpoint = os.environ.get("OTEL_EXPORTER_OTLP_ENDPOINT", "http://localhost:4318/v1/traces")
    
    resource = Resource.create(attributes={SERVICE_NAME: service_name})
    provider = TracerProvider(resource=resource)
    trace.set_tracer_provider(provider)
    
    exporter = OTLPSpanExporter(endpoint=endpoint)
    provider.add_span_processor(BatchSpanProcessor(exporter))
    
    # Auto-instrument FastAPI routes (automatically picks up traceparent headers from frontend)
    FastAPIInstrumentor.instrument_app(app)
```

**2. Main App (`app/main.py`)**
```python
from fastapi import FastAPI
from app.tracing import instrument_app

app = FastAPI()
instrument_app(app) # Must be called before defining routes!
```

---

### C. .NET (C# ASP.NET Core) Requirements

If migrating or adding a .NET service, use the standard OTEL NuGet packages.

**Packages Needed:**
```xml
<PackageReference Include="OpenTelemetry.Extensions.Hosting" Version="1.7.0" />
<PackageReference Include="OpenTelemetry.Instrumentation.AspNetCore" Version="1.7.0" />
<PackageReference Include="OpenTelemetry.Instrumentation.Http" Version="1.7.0" />
<PackageReference Include="OpenTelemetry.Exporter.OpenTelemetryProtocol" Version="1.7.0" />
```

**1. Application Setup (`Program.cs`)**
```csharp
using OpenTelemetry.Resources;
using OpenTelemetry.Trace;

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddOpenTelemetry()
    .WithTracing(tracerProviderBuilder =>
    {
        tracerProviderBuilder
            .AddSource("new-dotnet-service")
            .SetResourceBuilder(ResourceBuilder.CreateDefault().AddService("new-dotnet-service"))
            .AddAspNetCoreInstrumentation() // Auto-instruments incoming HTTP & headers
            .AddHttpClientInstrumentation() // Auto-instruments outgoing HTTP calls
            .AddOtlpExporter(opt =>
            {
                var endpoint = builder.Configuration["OTEL_EXPORTER_OTLP_ENDPOINT"];
                opt.Endpoint = new Uri(endpoint ?? "http://localhost:4318/v1/traces");
                opt.Protocol = OpenTelemetry.Exporter.OtlpExportProtocol.HttpProtobuf;
            });
    });

var app = builder.Build();
app.Run();
```

---

### D. Database Tracing Requirements

To achieve end-to-end tracing, the database queries must also be recorded as spans under the parent API request span.

**Python (SQLAlchemy or asyncpg):**
Use the auto-instrumentation libraries:
```bash
pip install opentelemetry-instrumentation-sqlalchemy
```
```python
from opentelemetry.instrumentation.sqlalchemy import SQLAlchemyInstrumentor
SQLAlchemyInstrumentor().instrument(engine=engine)
```

**Node.js (Drizzle / Prisma):**
When using `getNodeAutoInstrumentations()`, packages like `pg` (Postgres) are automatically instrumented. Ensure `@opentelemetry/instrumentation-pg` is active. Your SQL queries will automatically appear in Jaeger as child spans of the HTTP request.

---

## 3. Production Deployment Process

When deploying a new application to the Kubernetes cluster, you must provide the telemetry configurations in your Deployment manifests.

### Kubernetes Deployment Configuration (`deployment.yaml`)

Your containers must inherit the `OTEL_EXPORTER_OTLP_ENDPOINT` from the centralized ConfigMap (`resumatch-config`).

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: my-new-service
spec:
  template:
    spec:
      containers:
      - name: my-new-service
        image: my-registry/my-new-service:latest
        env:
        # 1. Map the OTEL collector endpoint
        - name: OTEL_EXPORTER_OTLP_ENDPOINT
          valueFrom:
            configMapKeyRef:
              name: resumatch-config
              key: OTEL_EXPORTER_OTLP_ENDPOINT
        
        # 2. Add node IP (optional, useful for daemonset collectors instead of cluster IPs)
        - name: NODE_IP
          valueFrom:
            fieldRef:
              fieldPath: status.hostIP
```

### Validation & Testing
After deploying the new app to production:
1. Make a request via the frontend UI.
2. Check the browser Network tab to ensure `traceparent` headers are sent.
3. If hitting Cloudflare, ensure your WAF rules exclude endpoints like `/telemetry/browser-span`.
4. Open the Jaeger UI (`http://jaeger-service.resumatch-ai.svc.cluster.local:16686` or your exposed ingress).
5. Search for a Trace ID. You should see a waterfall view showing:
   `Browser Span` -> `Next.js API Span` -> `Python Backend Span` -> `Database Query Span`.
