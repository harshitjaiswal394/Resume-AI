"""
Enterprise AI Security Core.

Re-exports the public API of the security layer. Importing this package must
be side-effect free enough to not break the app when any provider is missing
(DB is optional; Prometheus is optional).
"""

from app.security.config import SecurityConfig, get_config
from app.security.models import (
    EventType,
    Finding,
    PIIFinding,
    PIIKind,
    OutputValidationResult,
    RiskDecision,
    RiskLevel,
    SecurityVerdict,
    Subject,
    ToolPolicy,
)
from app.security.prompt_injection import analyze_prompt
from app.security.pii import detect_pii, has_sensitive_pii, mask_pii
from app.security.permissions import PermissionEngine, permission_engine
from app.security.rate_limit import RateLimiter, rate_limiter
from app.security.audit import AuditLogger, audit_logger
from app.security.output_validation import OutputValidator, output_validator
from app.security.prompt_versioning import PromptVersion, PromptVersionStore, checksum, prompt_version_store
from app.security.sanitizer import sanitize_prompt

__all__ = [
    "SecurityConfig",
    "get_config",
    "EventType",
    "Finding",
    "PIIFinding",
    "PIIKind",
    "OutputValidationResult",
    "RiskDecision",
    "RiskLevel",
    "SecurityVerdict",
    "Subject",
    "ToolPolicy",
    "analyze_prompt",
    "detect_pii",
    "has_sensitive_pii",
    "mask_pii",
    "PermissionEngine",
    "permission_engine",
    "RateLimiter",
    "rate_limiter",
    "AuditLogger",
    "audit_logger",
    "OutputValidator",
    "output_validator",
    "PromptVersion",
    "PromptVersionStore",
    "checksum",
    "prompt_version_store",
    "sanitize_prompt",
]
