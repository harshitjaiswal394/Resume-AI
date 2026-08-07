"""
Security Core models.

Shared data structures for the enterprise AI security layer.
These are pure dataclasses (no I/O) so they can be imported anywhere
without triggering database or provider side effects.
"""

from __future__ import annotations

import enum
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional


class RiskLevel(str, enum.Enum):
    """Security risk severity assigned by detection engines."""

    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"
    CRITICAL = "critical"


class RiskDecision(str, enum.Enum):
    """What the enforcement layer decided to do with a request."""

    ALLOW = "allow"
    WARN = "warn"
    BLOCK = "block"


class PIIKind(str, enum.Enum):
    """Types of personally identifiable information the PII engine can detect."""

    EMAIL = "email"
    PHONE = "phone"
    AADHAAR = "aadhaar"
    PAN = "pan"
    PASSPORT = "passport"
    CREDIT_CARD = "credit_card"
    BANK_ACCOUNT = "bank_account"
    SSN = "ssn"
    ADDRESS = "address"
    USERNAME = "username"


class EventType(str, enum.Enum):
    """Canonical audit event types emitted by the security layer."""

    CHAT_REQUEST = "chat_request"
    CHAT_RESPONSE = "chat_response"
    PROMPT_INJECTION = "prompt_injection"
    JAILBREAK = "jailbreak"
    PII_DETECTED = "pii_detected"
    PII_MASKED = "pii_masked"
    TOOL_CALL = "tool_call"
    TOOL_DENIED = "tool_denied"
    RATE_LIMITED = "rate_limited"
    OUTPUT_REJECTED = "output_rejected"
    PROMPT_VERSIONED = "prompt_versioned"
    PROVIDER_FALLBACK = "provider_fallback"
    PROVIDER_FAILURE = "provider_failure"


@dataclass(frozen=True)
class Finding:
    """A single detection finding produced by a security engine."""

    rule_id: str
    severity: RiskLevel
    description: str
    evidence: str = ""
    metadata: Dict[str, Any] = field(default_factory=dict)


@dataclass(frozen=True)
class PIIFinding:
    """A single PII occurrence with span offsets and masking info."""

    kind: PIIKind
    start: int
    end: int
    masked_value: str
    confidence: float = 1.0


@dataclass(frozen=True)
class SecurityVerdict:
    """Result of analyzing a single user-supplied message / payload."""

    decision: RiskDecision
    risk_level: RiskLevel
    score: float = 0.0
    findings: List[Finding] = field(default_factory=list)
    blocked_reason: Optional[str] = None
    sanitized_text: Optional[str] = None

    @property
    def is_blocked(self) -> bool:
        return self.decision == RiskDecision.BLOCK


@dataclass(frozen=True)
class ToolPolicy:
    """Authorization + validation policy for a single tool."""

    name: str
    required_permissions: List[str] = field(default_factory=list)
    allowed_roles: List[str] = field(default_factory=list)
    rate_limit: Optional[str] = None  # e.g. "50/day"
    max_payload_bytes: int = 8192
    sensitive: bool = False


@dataclass(frozen=True)
class Subject:
    """Authenticated principal the permission engine evaluates against."""

    user_id: str
    organization_id: Optional[str] = None
    role: str = "user"
    api_key_id: Optional[str] = None


@dataclass(frozen=True)
class OutputValidationResult:
    """Result of validating an AI-generated response."""

    valid: bool
    reason: Optional[str] = None
    findings: List[Finding] = field(default_factory=list)
    truncated: Optional[str] = None
