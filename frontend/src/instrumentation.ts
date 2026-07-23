export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    try {
      const { NodeSDK } = await import('@opentelemetry/sdk-node');
      const { OTLPTraceExporter } = await import('@opentelemetry/exporter-trace-otlp-http');
      const { Resource } = await import('@opentelemetry/resources');
      const { SEMRESATTRS_SERVICE_NAME } = await import('@opentelemetry/semantic-conventions');
      const { SimpleSpanProcessor } = await import('@opentelemetry/sdk-trace-node');
      const { getNodeAutoInstrumentations } = await import('@opentelemetry/auto-instrumentations-node');

      const sdk = new NodeSDK({
        resource: new Resource({
          [SEMRESATTRS_SERVICE_NAME]: 'frontend',
        }),
        spanProcessor: new SimpleSpanProcessor(
          new OTLPTraceExporter({
            url: process.env.OTEL_EXPORTER_OTLP_ENDPOINT || 'http://jaeger-service.resumatch-ai.svc.cluster.local:4318/v1/traces',
          })
        ),
        instrumentations: [getNodeAutoInstrumentations()],
      });
      sdk.start();
      console.log('OpenTelemetry tracing initialized successfully for Next.js frontend');
    } catch (error) {
      console.error('OpenTelemetry initialization failed for Next.js frontend:', error);
    }
  }
}
