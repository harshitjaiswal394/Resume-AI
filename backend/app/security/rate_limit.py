"""
Rate Limiting.

Sliding-window in-memory limiter with multiple scopes (IP, user, org, API
key) and per-resource buckets (chat, resume_upload, ai_request, tool_call,
embedding, file_upload).

In production behind a single backend replica this is a reasonable start;
for multi-replica deployments replace the in-memory store with Redis
(see `RedisRateLimiter` notes below) without changing the interface.

Reference: OWASP LLM Top 10 (LLM04 Model DoS), NIST AI RMF (Manage).
"""

from __future__ import annotations

import asyncio
import logging
import os
import threading
import time
from dataclasses import dataclass, field
from typing import Dict, Optional, Tuple

from app.security.metrics import RATE_LIMITED

logger = logging.getLogger("resumatch-api.security.ratelimit")

# Default budgets: (limit, window_seconds)
DEFAULT_LIMITS: Dict[str, Tuple[int, int]] = {
    "chat": (30, 60),             # 30 chat messages / minute / user
    "ai_request": (60, 60),       # 60 AI requests / minute / user
    "resume_upload": (20, 3600),  # 20 uploads / hour / user
    "file_upload": (50, 3600),    # 50 files / hour / user
    "tool_call": (100, 3600),     # 100 tool calls / hour / user
    "embedding": (300, 3600),     # 300 embedding generations / hour / user
    "auth": (10, 300),            # 10 auth actions / 5 min / user
}

# Per-IP, per-org and per-key multipliers are handled via scoped keys; the
# budgets below apply to IP-scoped limits (shared across users behind a NAT).
IP_LIMITS: Dict[str, Tuple[int, int]] = {
    "chat": (120, 60),
    "ai_request": (300, 60),
    "resume_upload": (60, 3600),
    "file_upload": (200, 3600),
    "tool_call": (400, 3600),
    "embedding": (1000, 3600),
    "auth": (30, 300),
}

_ORG_LIMITS: Dict[str, Tuple[int, int]] = {
    "ai_request": (1000, 3600),   # org-wide AI request budget / hour
    "chat": (2000, 3600),
    "tool_call": (5000, 3600),
    "embedding": (10000, 3600),
}


@dataclass
class RateLimitResult:
    allowed: bool
    retry_after_seconds: int = 0
    scope: str = "user"
    resource: str = "chat"
    limit: int = 0
    remaining: int = 0


class SlidingWindowLimiter:
    """Thread-safe sliding window counter with lazy expiry."""

    def __init__(self) -> None:
        self._buckets: Dict[str, list] = {}
        self._lock = threading.Lock()

    def _prune(self, key: str, window: int, now: float) -> None:
        bucket = self._buckets.get(key)
        if not bucket:
            return
        cutoff = now - window
        self._buckets[key] = [t for t in bucket if t > cutoff]

    def count_and_check(self, key: str, limit: int, window: int) -> Tuple[bool, int, int]:
        """Increment and evaluate. Returns (allowed, retry_after, remaining)."""
        now = time.time()
        with self._lock:
            self._prune(key, window, now)
            bucket = self._buckets.setdefault(key, [])
            if len(bucket) >= limit:
                oldest = bucket[0]
                retry = max(1, int(window - (now - oldest)))
                return False, retry, 0
            bucket.append(now)
            return True, 0, max(0, limit - len(bucket))

    def reset(self, key: str) -> None:
        with self._lock:
            self._buckets.pop(key, None)


class RateLimiter:
    """High-level limiter with multi-scope keys."""

    def __init__(
        self,
        store: Optional[SlidingWindowLimiter] = None,
        enabled: bool = True,
        limits: Optional[Dict[str, Tuple[int, int]]] = None,
    ) -> None:
        self._store = store or SlidingWindowLimiter()
        self._enabled = enabled
        self._limits = limits or DEFAULT_LIMITS
        self._org_limits = _ORG_LIMITS
        self._ip_limits = IP_LIMITS

    # -- test seams ----------------------------------------------------------
    def set_enabled(self, enabled: bool) -> None:
        self._enabled = enabled

    def _budget_for(self, resource: str, scope: str) -> Tuple[int, int]:
        if scope == "ip":
            return self._ip_limits.get(resource, (0, 0)) or (0, 0)
        if scope == "org":
            return self._org_limits.get(resource, (0, 0)) or (0, 0)
        return self._limits.get(resource, (0, 0)) or (0, 0)

    def check(
        self,
        resource: str,
        *,
        user_id: Optional[str] = None,
        ip: Optional[str] = None,
        organization_id: Optional[str] = None,
        api_key_id: Optional[str] = None,
        count: int = 1,
    ) -> RateLimitResult:
        """Evaluate a single event against all applicable scopes. The most
        restrictive scope wins."""
        if not self._enabled:
            return RateLimitResult(allowed=True, scope="disabled", resource=resource)

        results: list[RateLimitResult] = []
        if user_id:
            limit, window = self._budget_for(resource, "user")
            if limit > 0:
                allowed, retry, remaining = self._store.count_and_check(f"{resource}:user:{user_id}", limit, window)
                results.append(RateLimitResult(allowed, retry, "user", resource, limit, remaining))
        if ip:
            limit, window = self._budget_for(resource, "ip")
            if limit > 0:
                allowed, retry, remaining = self._store.count_and_check(f"{resource}:ip:{ip}", limit, window)
                results.append(RateLimitResult(allowed, retry, "ip", resource, limit, remaining))
        if organization_id:
            limit, window = self._budget_for(resource, "org")
            if limit > 0:
                allowed, retry, remaining = self._store.count_and_check(f"{resource}:org:{organization_id}", limit, window)
                results.append(RateLimitResult(allowed, retry, "org", resource, limit, remaining))
        if api_key_id:
            limit, window = self._budget_for(resource, "api_key")
            if limit > 0:
                allowed, retry, remaining = self._store.count_and_check(f"{resource}:key:{api_key_id}", limit, window)
                results.append(RateLimitResult(allowed, retry, "api_key", resource, limit, remaining))

        if not results:
            return RateLimitResult(allowed=True, scope="none", resource=resource)

        denied = [r for r in results if not r.allowed]
        if denied:
            worst = min(denied, key=lambda r: -r.retry_after_seconds)
            RATE_LIMITED.labels(scope=worst.scope).inc()
            logger.warning(
                "RATE_LIMITED | resource=%s scope=%s user=%s ip=%s org=%s retry_after=%ds",
                resource, worst.scope, user_id, ip, organization_id, worst.retry_after_seconds,
            )
            return worst
        return results[0]


# Singleton used across the app.
rate_limiter = RateLimiter(enabled=os.getenv("AI_RATE_LIMIT_ENABLED", "true").lower() in {"1", "true", "yes", "on"})
