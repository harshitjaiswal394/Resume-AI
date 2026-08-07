"""
AI Output Validation.

Validates every provider response before it is persisted or streamed to the
client. Checks:

- Maximum length (token bloat / runaway generation)
- Forbidden content (leaked secrets, internal markers, credential dumps)
- Prompt-exfiltration indicators (the model echoing its own instructions)
- Optional JSON schema validation for structured outputs

The response is allowed to pass through for LOW findings; HIGH-severity
issues cause the output to be replaced with a safe placeholder.

Reference: OWASP LLM Top 10 (LLM02 Insecure Output Handling, LLM06
Sensitive Information Disclosure), NIST AI RMF (Measure).
"""

from __future__ import annotations

import json
import re
from typing import Any, Dict, List, Optional

from app.security.config import SecurityConfig, get_config
from app.security.metrics import OUTPUT_REJECTED
from app.security.models import Finding, OutputValidationResult, RiskLevel

# Patterns that indicate the model leaked sensitive material or internal state.
_FORBIDDEN_PATTERNS: List[tuple] = [
    (
        re.compile(r"(?:AIza|sk-|sk-[A-Za-z0-9]|ghp_|xox[bap]-|BEGIN (?:RSA|OPENSSH|EC) PRIVATE KEY)"),
        "secret-leak",
        "Output contains a credential-like token.",
    ),
    (
        re.compile(r"\b(system\s*prompt|developer\s*prompt|initial\s*instructions|hidden\s*prompt)\s*[:=]", re.I),
        "prompt-leak",
        "Output appears to echo internal prompt text.",
    ),
    (
        re.compile(r"KUBERNETES_SERVICE_HOST|DATABASE_URL\s*[:=]|SUPABASE_SERVICE_ROLE_KEY\s*[:=]", re.I),
        "env-leak",
        "Output contains internal environment variable names.",
    ),
    (
        re.compile(r"(BEGIN SQL DUMP|-- *Dump completed|INSERT INTO.*--+)", re.I),
        "sql-dump",
        "Output contains a SQL dump signature.",
    ),
]

_MAX_LENGTH_DEFAULT = 20000

_SAFE_PLACEHOLDER = (
    "I couldn't generate a safe response for this request. "
    "Please try rephrasing your question."
)


class OutputValidator:
    def __init__(self, config: Optional[SecurityConfig] = None) -> None:
        self._config = config or get_config()

    def set_config(self, config: SecurityConfig) -> None:
        self._config = config

    def validate(
        self,
        text: str,
        *,
        max_length: Optional[int] = None,
        schema: Optional[Dict[str, Any]] = None,
    ) -> OutputValidationResult:
        if not self._config.output_validation_enabled:
            return OutputValidationResult(valid=True)

        findings: List[Finding] = []
        limit = max_length or self._config.output_max_length or _MAX_LENGTH_DEFAULT

        # Length check.
        if len(text) > limit:
            OUTPUT_REJECTED.labels(rule="max_length").inc()
            findings.append(Finding(
                rule_id="out-max-length",
                severity=RiskLevel.MEDIUM,
                description=f"Output exceeded max length ({len(text)} > {limit}).",
            ))

        # Forbidden content.
        for pattern, rule_id, description in _FORBIDDEN_PATTERNS:
            m = pattern.search(text)
            if m:
                OUTPUT_REJECTED.labels(rule=rule_id).inc()
                findings.append(Finding(
                    rule_id=f"out-{rule_id}",
                    severity=RiskLevel.HIGH,
                    description=description,
                    evidence=text[max(0, m.start() - 20): m.end() + 20],
                ))

        # JSON schema validation for structured outputs.
        if schema is not None:
            try:
                parsed = json.loads(text)
                # Only check top-level required keys (keep dependency-free).
                required = schema.get("required", [])
                missing = [k for k in required if k not in parsed]
                if missing:
                    OUTPUT_REJECTED.labels(rule="schema").inc()
                    findings.append(Finding(
                        rule_id="out-schema",
                        severity=RiskLevel.MEDIUM,
                        description=f"Output missing required fields: {missing}.",
                    ))
            except (json.JSONDecodeError, TypeError):
                OUTPUT_REJECTED.labels(rule="schema_parse").inc()
                findings.append(Finding(
                    rule_id="out-schema-parse",
                    severity=RiskLevel.MEDIUM,
                    description="Output was expected to be JSON but was not parseable.",
                ))

        if not findings:
            return OutputValidationResult(valid=True)

        high_risk = any(f.severity == RiskLevel.HIGH for f in findings)
        reason = findings[0].description
        if high_risk:
            return OutputValidationResult(valid=False, reason=reason, findings=findings, truncated=_SAFE_PLACEHOLDER)
        if len(text) > limit:
            return OutputValidationResult(valid=False, reason=reason, findings=findings, truncated=text[:limit])
        return OutputValidationResult(valid=True, findings=findings)


output_validator = OutputValidator()
