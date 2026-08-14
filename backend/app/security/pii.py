"""
PII Detection & Masking.

Detects the most sensitive PII categories for a recruiting platform and
masks them before the payload leaves the server for an external LLM provider.

Categories (Indian + international):
- Email addresses
- Phone numbers
- Aadhaar (12-digit Indian national ID, Verhoeff checksum)
- PAN (Indian tax ID: 5 letters + 4 digits + 1 letter)
- Passport numbers
- Credit card numbers (Luhn checksum)
- Bank account numbers
- US SSNs
- Street addresses (heuristic)
- Usernames/handles (@handle)

Policy: mask_by_default. When `AI_PII_BLOCK_MODE` is on, presence of
high-sensitivity PII (Aadhaar, PAN, passport, credit card, bank account,
SSN) blocks the request instead of masking.

Reference: NIST AI RMF Govern/Manage privacy; GDPR Art. 4(1), Art. 32.
"""

from __future__ import annotations

import re
from typing import List, Tuple

from app.security.config import SecurityConfig, get_config
from app.security.metrics import PII_DETECTIONS, PII_MASKED
from app.security.models import PIIFinding, PIIKind

_EMAIL_RE = re.compile(r"\b[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}\b")

# E.164-ish phone: optional +, country code, digits, separators.
_PHONE_RE = re.compile(r"(?<!\d)(\+?\d[\d\s.\-]{7,17}\d)(?!\d)")

# Aadhaar: 12 digits, may be grouped 4-4-4 or 4-4-4-4.
_AADHAAR_GROUPED_RE = re.compile(r"\b[2-9]\d{3}[\s\-]?\d{4}[\s\-]?\d{4}\b")

# PAN: 5 letters + 4 digits + 1 letter.
_PAN_RE = re.compile(r"\b[A-Z]{5}[0-9]{4}[A-Z]\b")

# Indian passport: starts with a letter, 8 chars.
_PASSPORT_RE = re.compile(r"\b[A-Z][1-9]\d{6}\b")

# Credit cards: 13-19 digits with separators, validated by Luhn.
_CC_RE = re.compile(r"\b(?:\d[ -]*?){13,19}\b")

# Bank account: 9-18 digits (loose; checked heuristically).
_BANK_RE = re.compile(r"(?<!\d)\d{9,18}(?!\d)")

# US SSN: XXX-XX-XXXX, area not 000/666.
_SSN_RE = re.compile(r"\b(?!000|666|9\d{2})\d{3}-(?!00)\d{2}-(?!0000)\d{4}\b")

# Address heuristic: number + street words near a city/postcode.
_ADDRESS_RE = re.compile(
    r"\b\d{1,5}\s+[A-Z][A-Za-z]+(?:\s+[A-Z][A-Za-z]+){1,4}\s+(?:Street|St|Road|Rd|Avenue|Ave|Lane|Ln|"
    r"Boulevard|Blvd|Drive|Dr|Park|Court|Ct|Nag ar|Nagar|Colony|Colony|Cross|Main|Road|Marg)\b",
    re.I,
)

_USERNAME_RE = re.compile(r"(?<![@\w])@[A-Za-z0-9_]{3,20}\b")

# PAN verification: the 4th character must be a valid holder-type letter.
_PAN_HOLDER = set("ABCFGHLJPTK")

SENSITIVE_KINDS = {
    PIIKind.AADHAAR,
    PIIKind.PAN,
    PIIKind.PASSPORT,
    PIIKind.CREDIT_CARD,
    PIIKind.BANK_ACCOUNT,
    PIIKind.SSN,
}

_MASK_LABELS = {
    PIIKind.EMAIL: "[EMAIL]",
    PIIKind.PHONE: "[PHONE]",
    PIIKind.AADHAAR: "[AADHAAR]",
    PIIKind.PAN: "[PAN]",
    PIIKind.PASSPORT: "[PASSPORT]",
    PIIKind.CREDIT_CARD: "[CARD]",
    PIIKind.BANK_ACCOUNT: "[BANK_ACCOUNT]",
    PIIKind.SSN: "[SSN]",
    PIIKind.ADDRESS: "[ADDRESS]",
    PIIKind.USERNAME: "[HANDLE]",
}


def _luhn_ok(digits: str) -> bool:
    digits = re.sub(r"\D", "", digits)
    if len(digits) < 13:
        return False
    total = 0
    for i, ch in enumerate(reversed(digits)):
        d = int(ch)
        if i % 2 == 1:
            d *= 2
            if d > 9:
                d -= 9
        total += d
    return total % 10 == 0


def _aadhaar_ok(digits: str) -> bool:
    digits = re.sub(r"\D", "", digits)
    if len(digits) != 12 or digits[0] in "01":
        return False
    # Verhoeff check.
    _d = [
        [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
        [1, 2, 3, 4, 0, 6, 7, 8, 9, 5],
        [2, 3, 4, 0, 1, 7, 8, 9, 5, 6],
        [3, 4, 0, 1, 2, 8, 9, 5, 6, 7],
        [4, 0, 1, 2, 3, 9, 5, 6, 7, 8],
        [5, 9, 8, 7, 6, 0, 4, 3, 2, 1],
        [6, 5, 9, 8, 7, 1, 0, 4, 3, 2],
        [7, 6, 5, 9, 8, 2, 1, 0, 4, 3],
        [8, 7, 6, 5, 9, 3, 2, 1, 0, 4],
        [9, 8, 7, 6, 5, 4, 3, 2, 1, 0],
    ]
    _p = [
        [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
        [1, 5, 7, 6, 2, 8, 3, 0, 9, 4],
        [5, 8, 0, 3, 7, 9, 6, 1, 4, 2],
        [8, 9, 1, 6, 0, 4, 3, 5, 2, 7],
        [9, 4, 5, 3, 1, 2, 6, 8, 7, 0],
        [4, 2, 8, 6, 5, 7, 3, 9, 0, 1],
        [2, 7, 9, 3, 8, 0, 6, 4, 1, 5],
        [7, 0, 4, 6, 9, 1, 3, 2, 5, 8],
    ]
    inv = [0, 4, 3, 2, 1, 5, 6, 7, 8, 9]
    c = 0
    for i, ch in enumerate(reversed(digits)):
        c = _d[c][_p[i % 8][int(ch)]]
    return inv[c] == 0


def _pan_ok(pan: str) -> bool:
    return pan[3] in _PAN_HOLDER and pan[5:9].isdigit()


def detect_pii(text: str, config: SecurityConfig | None = None) -> List[PIIFinding]:
    """Return sorted, non-overlapping PII findings (masked value included)."""
    findings: List[PIIFinding] = []

    def add(kind: PIIKind, start: int, end: int, confidence: float = 1.0) -> None:
        findings.append(
            PIIFinding(kind=kind, start=start, end=end, masked_value=_MASK_LABELS[kind], confidence=confidence)
        )

    for m in _EMAIL_RE.finditer(text):
        add(PIIKind.EMAIL, m.start(), m.end())

    for m in _PHONE_RE.finditer(text):
        add(PIIKind.PHONE, m.start(), m.end(), confidence=0.8)

    for m in _AADHAAR_GROUPED_RE.finditer(text):
        digits = re.sub(r"\D", "", m.group(0))
        if _aadhaar_ok(digits):
            add(PIIKind.AADHAAR, m.start(), m.end())

    for m in _PAN_RE.finditer(text):
        if _pan_ok(m.group(0)):
            add(PIIKind.PAN, m.start(), m.end())

    for m in _PASSPORT_RE.finditer(text):
        add(PIIKind.PASSPORT, m.start(), m.end(), confidence=0.7)

    for m in _SSN_RE.finditer(text):
        add(PIIKind.SSN, m.start(), m.end())

    for m in _CC_RE.finditer(text):
        if _luhn_ok(m.group(0)):
            add(PIIKind.CREDIT_CARD, m.start(), m.end())

    # Bank account: only flag long digit runs that are NOT a valid Aadhaar,
    # PAN, or phone already captured above (avoid double-flagging).
    bank_skip = {f.start for f in findings}
    for m in _BANK_RE.finditer(text):
        if any(m.start() < e and m.end() > s for s, e in [(f.start, f.end) for f in findings]):
            continue
        if _luhn_ok(m.group(0)) and len(m.group(0)) >= 15:
            continue  # looks like a card, not an account
        if m.start() in bank_skip:
            continue
        add(PIIKind.BANK_ACCOUNT, m.start(), m.end(), confidence=0.6)

    for m in _ADDRESS_RE.finditer(text):
        add(PIIKind.ADDRESS, m.start(), m.end(), confidence=0.6)

    for m in _USERNAME_RE.finditer(text):
        add(PIIKind.USERNAME, m.start(), m.end(), confidence=0.7)

    # De-overlap: keep the highest-priority finding for overlapping spans.
    # Priority favors more specific / sensitive kinds (Aadhaar > card > phone).
    _PRIORITY = {
        PIIKind.AADHAAR: 0,
        PIIKind.CREDIT_CARD: 1,
        PIIKind.SSN: 2,
        PIIKind.PAN: 3,
        PIIKind.PASSPORT: 4,
        PIIKind.BANK_ACCOUNT: 5,
        PIIKind.EMAIL: 6,
        PIIKind.PHONE: 7,
        PIIKind.ADDRESS: 8,
        PIIKind.USERNAME: 9,
    }
    findings.sort(key=lambda f: (f.start, _PRIORITY.get(f.kind, 10)))
    merged: List[PIIFinding] = []
    for f in findings:
        if merged and f.start < merged[-1].end:
            continue
        merged.append(f)

    for f in merged:
        PII_DETECTIONS.labels(kind=f.kind.value).inc()
    return merged


def mask_pii(text: str, config: SecurityConfig | None = None) -> Tuple[str, List[PIIFinding]]:
    """Replace detected PII with placeholders. Returns (masked_text, findings)."""
    findings = detect_pii(text, config)
    if not findings:
        return text, findings
    out = list(text)
    for f in reversed(findings):
        out[f.start:f.end] = f.masked_value
    PII_MASKED.inc(len(findings))
    return "".join(out), findings


def has_sensitive_pii(findings: List[PIIFinding]) -> bool:
    """Whether any finding belongs to the high-sensitivity set."""
    return any(f.kind in SENSITIVE_KINDS for f in findings)
