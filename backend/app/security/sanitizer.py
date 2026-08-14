"""
Input sanitization.

Lightweight normalization applied before detection so that trivial
obfuscations (stray formatting, unicode spacing, control characters) do not
defeat the rule engines, without altering legitimate content.

This is NOT the enforcement layer — that is `prompt_injection.analyze_prompt`
+ `pii.mask_pii`.
"""

from __future__ import annotations

import re

_CONTROL_RE = re.compile(r"[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]")


def sanitize_prompt(text: str, max_length: int = 8000) -> str:
    """Strip control chars, collapse repeated whitespace, enforce length cap."""
    if not text:
        return ""
    text = _CONTROL_RE.sub("", text)
    text = text[:max_length]
    text = re.sub(r"[ \t]+", " ", text)
    return text


def strip_markdown_escapes(text: str) -> str:
    """Remove markdown escape sequences that obfuscate keywords."""
    return re.sub(r"\\([\\`*_{}\[\]()#+\-.!>])", r"\1", text)
