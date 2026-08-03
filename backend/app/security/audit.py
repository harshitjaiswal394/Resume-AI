"""
Audit Logging.

Structured, tamper-evident audit trail for every AI decision. Each entry
records the subject, the provider/model, tokens, cost, tools, agent, IP,
latency and the security verdict — without storing raw PII (configurable).

Backends:
- Structured application logs (always)
- Database table `audit_logs` (when AI_AUDIT_DB_BACKEND=true)

Reference: ISO 27001 A.12.4 (Logging & Monitoring), SOC2 CC7, NIST AI RMF
(Manage/Measure). GDPR Art. 30 (record of processing).
"""

from __future__ import annotations

import hashlib
import json
import logging
import time
import uuid
from typing import Any, Dict, Optional

from app.security.config import SecurityConfig, get_config
from app.security.models import EventType

logger = logging.getLogger("resumatch-api.security.audit")

_AUDIT_LOGGER = logging.getLogger("resumatch.audit")

# Optional DB import to avoid hard dependency during module load.
try:
    from app.db import engine  # type: ignore
    from sqlalchemy import text  # type: ignore

    _DB_AVAILABLE = True
except Exception:  # pragma: no cover
    engine = None
    text = None
    _DB_AVAILABLE = False


def _mask_for_audit(value: Optional[str], cfg: SecurityConfig) -> Optional[str]:
    """Never persist full prompt text unless explicitly enabled."""
    if not value:
        return None
    if cfg.audit_prompt_capture:
        return value[:2000]
    return hashlib.sha256(value.encode("utf-8")).hexdigest()[:32] if value else None


class AuditLogger:
    def __init__(self, enabled: bool | None = None, db_backend: bool | None = None) -> None:
        cfg = get_config()
        self._enabled = cfg.audit_enabled if enabled is None else enabled
        self._db_backend = (cfg.audit_db_backend if db_backend is None else db_backend) and _DB_AVAILABLE

    def set_enabled(self, enabled: bool) -> None:
        self._enabled = enabled

    def _emit_log(self, entry: Dict[str, Any]) -> None:
        _AUDIT_LOGGER.info(json.dumps(entry, ensure_ascii=False, default=str))

    def _emit_db(self, entry: Dict[str, Any]) -> None:
        if not self._db_backend or engine is None:
            return
        try:
            with engine.begin() as conn:
                conn.execute(
                    text(
                        """
                        INSERT INTO audit_logs (
                            user_id, organization_id, event_type, action, metadata,
                            ip_address, created_at, request_id, provider, model,
                            tokens_in, tokens_out, cost_usd, tool, agent, latency_ms,
                            prompt_hash, verdict
                        )
                        VALUES (
                            :uid, :org, :event_type, :action, :meta,
                            :ip, NOW(), :request_id, :provider, :model,
                            :tokens_in, :tokens_out, :cost_usd, :tool, :agent, :latency_ms,
                            :prompt_hash, :verdict
                        )
                        """
                    ),
                    {
                        "uid": entry.get("user_id"),
                        "org": entry.get("organization_id"),
                        "event_type": entry.get("event_type"),
                        "action": entry.get("action", "ai_decision"),
                        "meta": json.dumps(entry.get("extra", {}), ensure_ascii=False, default=str),
                        "ip": entry.get("ip_address"),
                        "request_id": entry.get("request_id"),
                        "provider": entry.get("provider"),
                        "model": entry.get("model"),
                        "tokens_in": entry.get("tokens_in"),
                        "tokens_out": entry.get("tokens_out"),
                        "cost_usd": entry.get("cost_usd"),
                        "tool": entry.get("tool"),
                        "agent": entry.get("agent"),
                        "latency_ms": entry.get("latency_ms"),
                        "prompt_hash": entry.get("prompt_hash"),
                        "verdict": json.dumps(entry.get("verdict"), ensure_ascii=False, default=str) if entry.get("verdict") else None,
                    },
                )
        except Exception:
            # Audit failure must never break the chat flow.
            logger.exception("audit_db_write_failed")

    def log(
        self,
        event_type: EventType,
        *,
        user_id: Optional[str] = None,
        organization_id: Optional[str] = None,
        provider: Optional[str] = None,
        model: Optional[str] = None,
        tokens_in: Optional[int] = None,
        tokens_out: Optional[int] = None,
        cost_usd: Optional[float] = None,
        tool: Optional[str] = None,
        agent: Optional[str] = None,
        ip_address: Optional[str] = None,
        latency_ms: Optional[float] = None,
        prompt: Optional[str] = None,
        verdict: Optional[dict] = None,
        request_id: Optional[str] = None,
        extra: Optional[Dict[str, Any]] = None,
    ) -> None:
        if not self._enabled:
            return
        cfg = get_config()
        entry: Dict[str, Any] = {
            "event_id": str(uuid.uuid4()),
            "request_id": request_id,
            "timestamp": time.time(),
            "event_type": event_type.value,
            "user_id": user_id,
            "organization_id": organization_id,
            "provider": provider,
            "model": model,
            "tokens_in": tokens_in,
            "tokens_out": tokens_out,
            "cost_usd": cost_usd,
            "tool": tool,
            "agent": agent,
            "ip_address": ip_address,
            "latency_ms": latency_ms,
            "prompt_hash": _mask_for_audit(prompt, cfg),
            "verdict": verdict,
            "extra": extra or {},
        }
        self._emit_log(entry)
        self._emit_db(entry)


audit_logger = AuditLogger()
