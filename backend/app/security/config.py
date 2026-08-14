"""
Security configuration.

All security behaviors are env-configurable so the platform can be tuned
per environment (dev vs prod) and can be feature-flagged for safe rollout.
"""

from __future__ import annotations

import os


def _bool(name: str, default: bool) -> bool:
    raw = os.getenv(name)
    if raw is None:
        return default
    return raw.strip().lower() in {"1", "true", "yes", "on"}


def _float(name: str, default: float) -> float:
    try:
        return float(os.getenv(name, str(default)))
    except ValueError:
        return default


def _int(name: str, default: int) -> int:
    try:
        return int(os.getenv(name, str(default)))
    except ValueError:
        return default


class SecurityConfig:
    """Central config object for the AI security layer.

    Reads env vars at construction. Optional keyword overrides allow tests and
    embedded configurations to tune behavior without touching the environment.
    """

    def __init__(self, **overrides) -> None:
        # Master kill-switch for the whole security layer.
        self.enabled = _bool("AI_SECURITY_ENABLED", True)

        # Prompt injection / jailbreak detection.
        self.injection_enabled = _bool("AI_INJECTION_ENABLED", True)
        self.injection_block_threshold = _float("AI_INJECTION_BLOCK_THRESHOLD", 0.75)
        self.injection_warn_threshold = _float("AI_INJECTION_WARN_THRESHOLD", 0.40)

        # PII detection & masking.
        self.pii_enabled = _bool("AI_PII_ENABLED", True)
        self.pii_mask_before_provider = _bool("AI_PII_MASK_BEFORE_PROVIDER", True)
        # When set, the chat is refused instead of masking (block high-risk).
        self.pii_block_mode = _bool("AI_PII_BLOCK_MODE", False)

        # Tool authorization.
        self.tool_permissions_enabled = _bool("AI_TOOL_PERMISSIONS_ENABLED", True)

        # Rate limiting.
        self.rate_limit_enabled = _bool("AI_RATE_LIMIT_ENABLED", True)

        # Audit logging.
        self.audit_enabled = _bool("AI_AUDIT_ENABLED", True)
        self.audit_prompt_capture = _bool("AI_AUDIT_PROMPT_CAPTURE", False)  # PII: default off
        self.audit_db_backend = _bool("AI_AUDIT_DB_BACKEND", True)

        # Prompt versioning.
        self.prompt_versioning_enabled = _bool("AI_PROMPT_VERSIONING_ENABLED", True)

        # Output validation.
        self.output_validation_enabled = _bool("AI_OUTPUT_VALIDATION_ENABLED", True)
        self.output_max_length = _int("AI_OUTPUT_MAX_LENGTH", 20000)

        # Max characters the sanitizer keeps on a single message.
        self.message_max_length = _int("AI_MESSAGE_MAX_LENGTH", 8000)

        # Apply explicit overrides (tests / embedded configs).
        for key, value in overrides.items():
            setattr(self, key, value)


_config: SecurityConfig | None = None


def get_config() -> SecurityConfig:
    """Process-wide singleton so env is read once per process."""
    global _config
    if _config is None:
        _config = SecurityConfig()
    return _config
