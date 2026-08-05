import os
import logging

logger = logging.getLogger("resumatch-api.tracing")

def instrument_app(app):
    """
    Safely initialize and register OpenTelemetry instrumentation.
    Only enabled when OTEL_EXPORTER_OTLP_ENDPOINT is configured (production),
    so local runs skip tracing entirely instead of spamming exporter errors
    against the in-cluster Jaeger/collector endpoint.
    If OpenTelemetry packages are missing or fail to load, logs a warning
    and allows the application to start normally without breaking features.
    """
    endpoint = os.getenv("OTEL_EXPORTER_OTLP_ENDPOINT")
    if not endpoint:
        logger.info("OpenTelemetry tracing disabled: OTEL_EXPORTER_OTLP_ENDPOINT not configured.")
        return
    try:
        from opentelemetry import trace
        from opentelemetry.sdk.trace import TracerProvider
        from opentelemetry.sdk.trace.export import BatchSpanProcessor
        from opentelemetry.sdk.resources import Resource, SERVICE_NAME
        from opentelemetry.exporter.otlp.proto.http.trace_exporter import OTLPSpanExporter
        from opentelemetry.instrumentation.fastapi import FastAPIInstrumentor

        service_name = os.getenv("OTEL_SERVICE_NAME", "backend")
        excluded_urls = os.getenv("OTEL_PYTHON_EXCLUDED_URLS", "/health")

        logger.info(f"Initializing OpenTelemetry Tracer for service '{service_name}' sending to '{endpoint}'")

        resource = Resource(attributes={
            SERVICE_NAME: service_name
        })

        provider = TracerProvider(resource=resource)
        processor = BatchSpanProcessor(OTLPSpanExporter(endpoint=endpoint))
        provider.add_span_processor(processor)
        trace.set_tracer_provider(provider)

        # Instrument FastAPI Application
        FastAPIInstrumentor.instrument_app(app, excluded_urls=excluded_urls)
        logger.info("OpenTelemetry FastAPI instrumentation applied successfully.")

        # Instrument Outgoing HTTP Clients
        try:
            from opentelemetry.instrumentation.httpx import HTTPXClientInstrumentor
            HTTPXClientInstrumentor().instrument()
            logger.info("OpenTelemetry HTTPX client instrumentation applied.")
        except Exception as e:
            logger.warning(f"Could not instrument HTTPX client: {e}")

        try:
            from opentelemetry.instrumentation.requests import RequestsInstrumentor
            RequestsInstrumentor().instrument()
            logger.info("OpenTelemetry Requests client instrumentation applied.")
        except Exception as e:
            logger.warning(f"Could not instrument Requests client: {e}")

        try:
            from opentelemetry.instrumentation.urllib3 import URLLib3Instrumentor
            URLLib3Instrumentor().instrument()
            logger.info("OpenTelemetry URLLib3 client instrumentation applied.")
        except Exception as e:
            logger.warning(f"Could not instrument URLLib3 client: {e}")

    except Exception as e:
        logger.error(f"OpenTelemetry initialization failed: {e}. Running app WITHOUT distributed tracing.")
