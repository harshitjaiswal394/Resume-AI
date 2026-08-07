"""
Security & AI metrics.

Exposes Prometheus counters for the security layer and the agent pipeline.
Degrades gracefully when `prometheus_client` is not installed so the app
always boots. Install `prometheus-client` in production and mount
``/metrics`` behind the ingress / service monitor.
"""

from __future__ import annotations

import logging

logger = logging.getLogger("resumatch-api.security.metrics")

try:
    from prometheus_client import Counter, Histogram, Gauge

    _ENABLED = True

    SECURITY_DECISIONS = Counter(
        "resumatch_ai_security_decisions_total",
        "Security decisions by engine and outcome",
        ["engine", "decision"],
    )
    PROMPT_INJECTIONS = Counter(
        "resumatch_ai_prompt_injections_total",
        "Prompt injection / jailbreak detections",
        ["risk"],
    )
    PII_DETECTIONS = Counter(
        "resumatch_ai_pii_detections_total",
        "PII findings by kind",
        ["kind"],
    )
    PII_MASKED = Counter(
        "resumatch_ai_pii_masked_total",
        "PII masked before provider call",
    )
    TOOL_CALLS = Counter(
        "resumatch_ai_tool_calls_total",
        "Tool execution attempts by tool and outcome",
        ["tool", "outcome"],
    )
    TOOL_DENIED = Counter(
        "resumatch_ai_tool_denied_total",
        "Tool denials by tool and reason",
        ["tool", "reason"],
    )
    RATE_LIMITED = Counter(
        "resumatch_ai_rate_limited_total",
        "Rate-limited requests by scope",
        ["scope"],
    )
    OUTPUT_REJECTED = Counter(
        "resumatch_ai_output_rejected_total",
        "AI output validation rejections by rule",
        ["rule"],
    )
    PROVIDER_FAILURES = Counter(
        "resumatch_ai_provider_failures_total",
        "Provider call failures and fallbacks",
        ["provider", "outcome"],
    )
    TOKEN_USAGE = Counter(
        "resumatch_ai_tokens_total",
        "Tokens consumed by provider",
        ["provider"],
    )
    LATENCY = Histogram(
        "resumatch_ai_chat_latency_seconds",
        "Chat / agent turn latency",
        buckets=[0.1, 0.5, 1.0, 2.0, 5.0, 10.0, 30.0, 60.0],
    )
except Exception:  # pragma: no cover - defensive
    _ENABLED = False

    class _NullChild:
        def inc(self, *args, **kwargs):
            pass

        def observe(self, *args, **kwargs):
            pass

        def set(self, *args, **kwargs):
            pass

        def labels(self, *args, **kwargs):
            return _NullChild()

    _null = _NullChild()

    SECURITY_DECISIONS = _null
    PROMPT_INJECTIONS = _null
    PII_DETECTIONS = _null
    PII_MASKED = _null
    TOOL_CALLS = _null
    TOOL_DENIED = _null
    RATE_LIMITED = _null
    OUTPUT_REJECTED = _null
    PROVIDER_FAILURES = _null
    TOKEN_USAGE = _null
    LATENCY = _null


def metrics_enabled() -> bool:
    return _ENABLED
