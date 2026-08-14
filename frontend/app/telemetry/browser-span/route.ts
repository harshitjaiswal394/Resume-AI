import { context, trace, SpanKind, SpanStatusCode } from "@opentelemetry/api";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

type BrowserSpanRequest = {
  traceId: string;
  spanId: string;
  method: string;
  url: string;
  statusCode: number;
  startTime: number;
  endTime: number;
  errorMessage?: string;
};

function isValidHex(value: string, expectedLength: number) {
  return new RegExp(`^[a-f0-9]{${expectedLength}}$`).test(value);
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as BrowserSpanRequest;

    if (!isValidHex(body.traceId, 32) || !isValidHex(body.spanId, 16)) {
      return NextResponse.json({ ok: false, error: "Invalid trace context" }, { status: 400 });
    }

    const tracer = trace.getTracer("frontend-browser");
    const parentContext = trace.setSpanContext(context.active(), {
      traceId: body.traceId,
      spanId: body.spanId,
      traceFlags: 1,
      isRemote: true,
    });

    const span = tracer.startSpan(
      `${body.method} ${new URL(body.url).pathname}`,
      {
        kind: SpanKind.CLIENT,
        startTime: body.startTime,
        attributes: {
          "service.name": "frontend",
          "span.origin": "browser-mirror",
          "http.request.method": body.method,
          "http.response.status_code": body.statusCode,
          "http.url": body.url,
          "url.full": body.url,
        },
      },
      parentContext
    );

    if (body.statusCode >= 400 || body.statusCode === 0) {
      span.setStatus({ code: SpanStatusCode.ERROR, message: body.errorMessage });
      span.setAttribute("error", true)
      span.setAttribute("error.message", body.errorMessage ?? "Frontend request failed")
      span.setAttribute("error.type", body.statusCode === 0 ? "network_error" : "http_error")
    }

    span.end(body.endTime);
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Failed to record browser span", error);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}

