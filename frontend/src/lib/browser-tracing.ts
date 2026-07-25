const TRACE_HEADER = "traceparent";
const TRACE_VERSION = "00";
const SAMPLED_FLAG = "01";

type BrowserTracePayload = {
  traceId: string;
  spanId: string;
  method: string;
  url: string;
  statusCode: number;
  startTime: number;
  endTime: number;
  errorMessage?: string;
};

declare global {
  interface Window {
    __resumeAiFetchPatched__?: boolean;
  }
}

function randomHex(bytes: number) {
  const array = new Uint8Array(bytes);
  crypto.getRandomValues(array);
  return Array.from(array, (value) => value.toString(16).padStart(2, "0")).join("");
}

function buildTraceparent(traceId: string, spanId: string) {
  return `${TRACE_VERSION}-${traceId}-${spanId}-${SAMPLED_FLAG}`;
}

function isTraceableRequest(url: URL) {
  if (url.pathname === "/telemetry/browser-span") {
    return false;
  }

  return url.pathname.startsWith("/api/") || url.pathname.includes("/api/");
}

async function reportBrowserSpan(payload: BrowserTracePayload) {
  const body = JSON.stringify(payload);

  if (navigator.sendBeacon) {
    const blob = new Blob([body], { type: "application/json" });
    navigator.sendBeacon("/telemetry/browser-span", blob);
    return;
  }

  await fetch("/telemetry/browser-span", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
    keepalive: true,
  });
}

export function installBrowserTracing() {
  if (typeof window === "undefined" || window.__resumeAiFetchPatched__) {
    return;
  }

  const originalFetch = window.fetch.bind(window);
  window.__resumeAiFetchPatched__ = true;

  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const request = input instanceof Request ? input : new Request(input, init);
    const requestUrl = new URL(request.url, window.location.origin);

    if (!isTraceableRequest(requestUrl)) {
      return originalFetch(input, init);
    }

    const traceId = randomHex(16);
    const spanId = randomHex(8);
    const traceparent = buildTraceparent(traceId, spanId);
    const headers = new Headers(request.headers);
    headers.set(TRACE_HEADER, traceparent);

    const tracedRequest = new Request(request, { headers });
    const startTime = Date.now();

    try {
      const response = await originalFetch(tracedRequest);
      const endTime = Date.now();

      void reportBrowserSpan({
        traceId,
        spanId,
        method: tracedRequest.method,
        url: requestUrl.toString(),
        statusCode: response.status,
        startTime,
        endTime,
        errorMessage: response.ok ? undefined : `${response.status} ${response.statusText}`.trim(),
      });

      return response;
    } catch (error) {
      const endTime = Date.now();
      const message = error instanceof Error ? error.message : "Network request failed";

      void reportBrowserSpan({
        traceId,
        spanId,
        method: tracedRequest.method,
        url: requestUrl.toString(),
        statusCode: 0,
        startTime,
        endTime,
        errorMessage: message,
      });

      throw error;
    }
  };
}
