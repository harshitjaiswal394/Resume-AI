"""Robust JSON parsing helpers for LLM output."""

from __future__ import annotations

import json
import logging
import re
from typing import Any, Optional

logger = logging.getLogger("resumatch-ai.json_utils")

_NULL_PLACEHOLDERS = {"null", "none", "n/a", "undefined"}


def normalize_placeholders(value: Any) -> Any:
    """Recursively convert LLM placeholder strings into clean empty values.

    Models sometimes echo the literal string "null" (or "None", "N/A",
    "undefined") into text fields instead of emitting real JSON null.
    Convert those to real empty values so they never render into exported
    DOCX/PDF files or leak into parsed_data.
    """
    if isinstance(value, str):
        stripped = value.strip()
        if not stripped or stripped.lower() in _NULL_PLACEHOLDERS:
            return ""
        return value
    if isinstance(value, list):
        return [normalize_placeholders(item) for item in value]
    if isinstance(value, dict):
        return {k: normalize_placeholders(v) for k, v in value.items()}
    return value


def strip_code_fence(text: str) -> str:
    """Extract raw JSON from a markdown code block if present."""
    if not isinstance(text, str):
        return text
    if "```json" in text:
        return text.split("```json")[1].split("```")[0]
    if "```" in text:
        parts = text.split("```")
        for part in parts:
            stripped = part.strip()
            if stripped.startswith("{") or stripped.startswith("["):
                return stripped
    return text


def parse_json_response(text: Any) -> Optional[Any]:
    """
    Parse JSON from an LLM response, repairing common truncation/markdown issues.

    Returns the parsed object, or None if it cannot be recovered.
    """
    if not isinstance(text, str):
        return text if not isinstance(text, Exception) else None
    original = text
    text = strip_code_fence(text).strip()

    # Find JSON object boundaries if surrounded by prose
    if not text.startswith("{"):
        start = text.find("{")
        if start != -1:
            text = text[start:]
        else:
            return None

    try:
        return normalize_placeholders(json.loads(text))
    except json.JSONDecodeError:
        pass

    # Fix trailing commas (common LLM mistake)
    text = re.sub(r",\s*}", "}", text)
    text = re.sub(r",\s*]", "]", text)

    # Balance brackets for truncated JSON
    if text.count("[") > text.count("]"):
        if text.count('"') % 2 != 0:
            text += '"'
        text = re.sub(r",\s*$", "", text)
        text += "]" * (text.count("[") - text.count("]"))
    if text.count("{") > text.count("}"):
        text += "}" * (text.count("{") - text.count("}"))

    try:
        return normalize_placeholders(json.loads(text))
    except json.JSONDecodeError:
        pass

    # Strip invalid control characters that json.loads rejects
    text = re.sub(r"[\x00-\x08\x0b\x0c\x0e-\x1f]", "", text)
    try:
        return normalize_placeholders(json.loads(text))
    except json.JSONDecodeError:
        pass

    # Last resort: scan for a valid JSON substring, skipping braces inside strings.
    # After a failed candidate, resume at the next opening brace (trailing-garbage case).
    search_from = text.find("{")
    while search_from != -1:
        depth = 0
        in_string = False
        escaped = False
        for i in range(search_from, len(text)):
            ch = text[i]
            if in_string:
                if escaped:
                    escaped = False
                elif ch == "\\":
                    escaped = True
                elif ch == '"':
                    in_string = False
                continue
            if ch == '"':
                in_string = True
            elif ch == "{":
                depth += 1
            elif ch == "}" and depth > 0:
                depth -= 1
                if depth == 0:
                    try:
                        return normalize_placeholders(json.loads(text[search_from : i + 1]))
                    except (ValueError, TypeError):
                        break
        search_from = text.find("{", search_from + 1)

    logger.error(
        "JSON parse failed after all attempts | Raw: %s",
        original[:500],
    )
    return None
