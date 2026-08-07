"""
Prompt Injection & Jailbreak Detection.

Implements heuristic detection for the most common LLM attack families:

- Direct injection ("ignore previous instructions", "reveal system prompt")
- Role-swap / DAN-style jailbreaks ("you are now...", "developer mode")
- Privilege escalation ("you have no filters", "override safety")
- Exfiltration ("return API keys", "output your memory", "repeat your prompt")
- Indirect context poisoning markers (instructions embedded in retrieved text)
- Base64-encoded attacks
- Unicode obfuscation (zero-width chars, confusables, fullwidth/double-struck)
- Multi-step jailbreaks (composite scoring across many weak signals)

Detection returns a numeric score in [0, 1]. Enforcement is handled by the
caller: score >= block_threshold -> BLOCK, >= warn_threshold -> WARN.

Reference alignment: OWASP LLM Top 10 (LLM01 Prompt Injection, LLM03 Training
Data Poisoning, LLM05 Supply Chain), NIST AI RMF (Govern/Manage).
"""

from __future__ import annotations

import base64
import binascii
import re
import unicodedata
from dataclasses import dataclass
from typing import List, Tuple

from app.security.config import SecurityConfig, get_config
from app.security.metrics import PROMPT_INJECTIONS, SECURITY_DECISIONS
from app.security.models import Finding, RiskDecision, RiskLevel, SecurityVerdict

# ──────────────────────────────────────────────────────────────────────────────
# Rule tables: (regex, weight, rule_id, description)
# ──────────────────────────────────────────────────────────────────────────────

_DIRECTIVE_PATTERNS: List[Tuple[re.Pattern, float, str, str]] = [
    (
        re.compile(r"\bignore\s+(all\s+)?(previous|prior|earlier)\s+(instructions|prompts|rules)\b", re.I),
        0.9, "inj-ignore-prev", "User attempts to discard prior instructions.",
    ),
    (
        re.compile(r"\b(forget|disregard|erase)\s+(all\s+)?(previous|prior|earlier)\s+(instructions|prompts|context)\b", re.I),
        0.9, "inj-forget-prev", "User attempts to erase conversation context.",
    ),
    (
        re.compile(r"\breveal|show|print|display|repeat\b.{0,20}\b(system\s+prompt|your\s+prompt|your\s+instructions|initial\s+prompt|developer\s+prompt)\b", re.I),
        0.95, "inj-reveal-prompt", "Attempt to extract the system prompt.",
    ),
    (
        re.compile(r"\b(output|return|dump|print|show)\b.{0,20}\b(your\s+system|system\s+message|hidden\s+prompt|your\s+rules)\b", re.I),
        0.9, "inj-reveal-hidden", "Attempt to extract hidden instructions.",
    ),
    (
        re.compile(r"\byou\s+(are|now\s+are|will\s+act)\s+as\b.{0,30}\b(no\s+filters|unfiltered|no\s+limits|do\s+anything|always\s+comply)\b", re.I),
        0.9, "jailbreak-role-no-filters", "DAN-style role swap removing constraints.",
    ),
    (
        re.compile(r"\bdeveloper\s+mode\b|\bDAN\s*mode\b|\bdo\s+anything\s+now\b|\bsuper\s+intelligence\s+mode\b|\bignore\s+all\s+ethics\b", re.I),
        0.85, "jailbreak-mode", "Known jailbreak mode triggers.",
    ),
    (
        re.compile(r"\b(override|bypass|disable|remove|turn\s+off|ignore)\b.{0,25}\b(safety|guardrails|filter|moderation|alignment|ethics|constraints|restrictions)\b", re.I),
        0.9, "jailbreak-disable-safety", "Attempt to disable safety controls.",
    ),
    (
        re.compile(r"\b(pretend|act)\b.{0,15}\b(you\s+have\s+no\s+(rules|limits|restrictions|boundaries))\b", re.I),
        0.85, "jailbreak-pretend-unrestricted", "Simulation-based jailbreak.",
    ),
    (
        re.compile(r"\b(return|give|output|reveal|show)\b.{0,25}\b(api\s+keys|passwords|secrets|tokens|credentials)\b", re.I),
        0.95, "exfil-secrets", "Attempt to exfiltrate secrets.",
    ),
    (
        re.compile(r"\b(output|return|dump|print|show)\b.{0,25}\b(your\s+memory|conversation\s+history|all\s+the\s+messages|other\s+users['']?s?\s*data)\b", re.I),
        0.9, "exfil-memory", "Attempt to dump memory / other users' data.",
    ),
    (
        re.compile(r"\bcall\s+(all|every|each)\s+(the\s+)?(tools|functions|actions)\b", re.I),
        0.7, "tool-ambush", "Attempt to trigger every available tool.",
    ),
    (
        re.compile(r"\bdelete\s+(all\s+)?(memory|my\s+data|this\s+conversation|my\s+resume)\b", re.I),
        0.7, "tool-destructive", "Attempt to invoke destructive actions via chat.",
    ),
    (
        re.compile(r"\bignore\s+(your|the)\s+(system|previous)\s+(prompt|instructions)\s+and\s+(do|answer|follow|obey)\b", re.I),
        0.95, "inj-direct-replace", "Direct instruction to replace system directives.",
    ),
]

_STRING_PATTERNS: List[Tuple[re.Pattern, float, str, str]] = [
    (
        re.compile(r"\bAPI[_ -]?KEY\s*[:=]\s*[A-Za-z0-9_\-]{12,}\b", re.I),
        0.9, "exfil-inline-secret", "Prompt contains an inline secret-like token.",
    ),
]

# Unicode obfuscation: zero-width characters used to break detectors.
_ZERO_WIDTH = re.compile(r"[\u200b\u200c\u200d\u2060\ufeff]")

# Homoglyph lookalike letters attackers substitute to dodge keyword filters.
_CONFUSABLE_MAP = {
    "і": "i",  # Cyrillic
    "е": "e",
    "а": "a",
    "о": "o",
    "с": "c",
    "х": "x",
    "у": "y",
    "ᴡ": "w",
    "р": "p",
    "ⅰ": "i",  # Roman numeral
    "ⅼ": "l",
    "А": "A",
    "В": "B",
    "Е": "E",
    "К": "K",
    "М": "M",
    "Н": "H",
    "О": "O",
    "Р": "P",
    "С": "C",
    "Т": "T",
    "Х": "X",
}

# Lightweight heuristic: presence of confusable letters adjacent to a known
# keyword is treated as obfuscation. We normalize and re-scan.
_KW = re.compile(
    r"\b(ignore|reveal|system|prompt|password|secret|apikey|jailbreak|instructions)\b",
    re.I,
)


def _normalize_unicode(text: str) -> str:
    """Collapse zero-width chars and substitute common confusables."""
    text = _ZERO_WIDTH.sub("", text)
    out = []
    for ch in text:
        if ch in _CONFUSABLE_MAP:
            out.append(_CONFUSABLE_MAP[ch])
        else:
            try:
                if unicodedata.category(ch).startswith("Z") or unicodedata.category(ch) == "Cf":
                    out.append(" ")
                else:
                    out.append(ch)
            except ValueError:
                out.append(ch)
    return "".join(out)


def _decode_base64(text: str) -> List[str]:
    """Return plausible base64 decodings from tokens in the text."""
    decoded: List[str] = []
    for token in re.split(r"[\s,;\n]+", text):
        token = token.strip()
        if len(token) < 12 or not re.fullmatch(r"[A-Za-z0-9+/=]+", token):
            continue
        if len(token) % 4 != 0:
            continue
        try:
            raw = base64.b64decode(token, validate=True)
            # Only keep ASCII-ish decodings likely to contain instructions.
            candidate = raw.decode("utf-8", errors="ignore")
            if any(c.isalpha() for c in candidate) and len(candidate) >= 8:
                decoded.append(candidate)
        except (binascii.Error, ValueError):
            continue
    return decoded


def _score_confusables(text: str) -> Tuple[float, str]:
    """Detect keyword obfuscation via confusable characters."""
    normalized = _normalize_unicode(text)
    hits = _KW.findall(normalized)
    if not hits:
        return 0.0, ""
    return min(0.6, 0.15 * len(hits)), "confusables-normalized"


def analyze_prompt(text: str, config: SecurityConfig | None = None) -> SecurityVerdict:
    """Score a user message for prompt injection / jailbreak attempts.

    Returns a SecurityVerdict with a normalized score. Enforcement is
    deliberately NOT applied here so the caller decides blocking policy.
    """
    cfg = config or get_config()
    if not text:
        return SecurityVerdict(decision=RiskDecision.ALLOW, risk_level=RiskLevel.LOW, score=0.0)

    findings: List[Finding] = []
    score = 0.0
    # Cap per-rule contribution so a single false positive can't max the score.
    MAX_RULE_CONTRIBUTION = 0.55

    for pattern, weight, rule_id, description in _DIRECTIVE_PATTERNS:
        m = pattern.search(text)
        if m:
            evidence = text[max(0, m.start() - 20): m.end() + 20].strip()
            findings.append(Finding(rule_id=rule_id, severity=RiskLevel.HIGH, description=description, evidence=evidence))
            score = min(1.0, score + min(weight, MAX_RULE_CONTRIBUTION))

    for pattern, weight, rule_id, description in _STRING_PATTERNS:
        m = pattern.search(text)
        if m:
            findings.append(Finding(rule_id=rule_id, severity=RiskLevel.HIGH, description=description, evidence=m.group(0)))
            score = min(1.0, score + min(weight, MAX_RULE_CONTRIBUTION))

    # Unicode obfuscation.
    if _ZERO_WIDTH.search(text):
        findings.append(Finding(
            rule_id="obf-zero-width",
            severity=RiskLevel.MEDIUM,
            description="Zero-width / invisible characters present (obfuscation).",
        ))
        score = min(1.0, score + 0.45)

    conf_score, conf_rule = _score_confusables(text)
    if conf_score > 0:
        findings.append(Finding(
            rule_id="obf-confusables",
            severity=RiskLevel.MEDIUM,
            description=f"Confusable-character obfuscation detected ({conf_rule}).",
        ))
        score = min(1.0, score + conf_score)

    # Base64-encoded attacks. A single decoded directive is a strong signal:
    # bump above the block threshold deterministically.
    for candidate in _decode_base64(text):
        for pattern, weight, rule_id, description in _DIRECTIVE_PATTERNS:
            if pattern.search(candidate):
                findings.append(Finding(
                    rule_id=f"{rule_id}-b64",
                    severity=RiskLevel.CRITICAL,
                    description=f"Base64-encoded {description.lower()}",
                ))
                score = min(1.0, score + 0.85)

    # Multi-step heuristic: many weak/medium signals together -> jailbreak.
    weak_signals = sum(1 for f in findings if f.severity == RiskLevel.MEDIUM)
    if weak_signals >= 3:
        findings.append(Finding(
            rule_id="jailbreak-multi-step",
            severity=RiskLevel.HIGH,
            description="Multiple weak obfuscation signals combined (multi-step jailbreak).",
        ))
        score = min(1.0, score + 0.3)

    score = round(min(1.0, score), 3)

    if score >= cfg.injection_block_threshold:
        decision = RiskDecision.BLOCK
        risk = RiskLevel.CRITICAL if score >= 0.9 else RiskLevel.HIGH
        blocked_reason = "Your request was blocked by our safety filters. Please rephrase."
    elif score >= cfg.injection_warn_threshold:
        decision = RiskDecision.WARN
        risk = RiskLevel.HIGH
        blocked_reason = None
    else:
        decision = RiskDecision.ALLOW
        risk = RiskLevel.LOW
        blocked_reason = None

    _emit_metrics(decision.value, risk.value, findings)
    return SecurityVerdict(
        decision=decision,
        risk_level=risk,
        score=score,
        findings=findings,
        blocked_reason=blocked_reason,
    )


def _emit_metrics(decision: str, risk: str, findings: List[Finding]) -> None:
    if findings:
        PROMPT_INJECTIONS.labels(risk=risk).inc(len(findings))
    SECURITY_DECISIONS.labels(engine="injection", decision=decision).inc()
