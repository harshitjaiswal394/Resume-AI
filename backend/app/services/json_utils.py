"""Robust JSON parsing helpers for LLM output."""

from __future__ import annotations

import json
import logging
import re
from typing import Any, Optional

logger = logging.getLogger("resumatch-ai.json_utils")


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
        return json.loads(text)
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
        return json.loads(text)
    except json.JSONDecodeError:
        pass

    # Last resort: largest valid JSON substring
    start = text.find("{")
    if start == -1:
        return None
    depth = 0
    for i in range(start, len(text)):
        if text[i] == "{":
            depth += 1
        elif text[i] == "}":
            depth -= 1
            if depth == 0:
                try:
                    return json.loads(text[start : i + 1])
                except (ValueError, TypeError):
                    break

    logger.error("JSON parse failed after all attempts | Raw: %s", original[:300])
    return None
