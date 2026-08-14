"""
Version Diff — computes a GitHub-style diff between a source resume and the
tailored output. Used to render a red/green "changes" preview in the UI.

Diff shape:
    {
      "summary": {"removed": str, "added": str} | None,
      "skills": {"removed": [...], "added": [...]},
      "experience": [
        {
          "title": str, "company": str,
          "bullet_changes": [
            {"removed": str|None, "added": str|None, "reason": str}
          ]
        }
      ]
    }
"""

from __future__ import annotations

import logging
from typing import Any, Dict, List, Optional

logger = logging.getLogger("resumatch-ai.tools.diff")


def _norm(value: Any) -> str:
    if value is None:
        return ""
    return " ".join(str(value).strip().split()).lower()


def _get_original_bullet(bullet: Any) -> str:
    """Original text of a tailored bullet (falls back to rewritten text)."""
    if isinstance(bullet, dict):
        return str(bullet.get("original_bullet") or bullet.get("text") or "").strip()
    return str(bullet or "").strip()


def _get_rewritten_bullet(bullet: Any) -> str:
    if isinstance(bullet, dict):
        return str(bullet.get("text") or bullet.get("original_bullet") or "").strip()
    return str(bullet or "").strip()


def _get_bullet_reason(bullet: Any) -> Optional[str]:
    if isinstance(bullet, dict):
        return bullet.get("change_reason")
    return None


def _diff_summary(source_summary: Any, tailored_summary: Any) -> Optional[Dict[str, str]]:
    old = str(source_summary or "").strip()
    new = str(tailored_summary or "").strip()
    if _norm(old) == _norm(new):
        return None
    if not old:
        return {"removed": "", "added": new}
    if not new:
        return {"removed": old, "added": ""}
    return {"removed": old, "added": new}


def _diff_skills(source_skills: Any, tailored_skills: Any) -> Dict[str, List[str]]:
    def _as_set(items: Any) -> set:
        if not items:
            return set()
        if isinstance(items, str):
            return {s.strip() for s in items.split(",") if s.strip()}
        return {str(s).strip() for s in items if str(s).strip()}

    old = _as_set(source_skills)
    new = _as_set(tailored_skills)
    return {
        "removed": sorted(old - new, key=str.lower),
        "added": sorted(new - old, key=str.lower),
    }


def _match_source_bullets(source_experience: Any) -> Dict[str, str]:
    """Flatten source experience into a lookup: company|title -> [bullets]."""
    lookup: Dict[str, List[str]] = {}
    for exp in source_experience or []:
        if not isinstance(exp, dict):
            continue
        key = _norm(exp.get("company")) or _norm(exp.get("title"))
        for b in exp.get("description") or exp.get("bullets") or []:
            text = _get_original_bullet(b) or str(b or "").strip()
            if text:
                lookup.setdefault(key, []).append(text)
    return lookup


def compute_diff(
    source_resume: Dict[str, Any],
    tailored_resume: Dict[str, Any],
) -> Dict[str, Any]:
    """
    Compute a GitHub-style diff from the source resume to the tailored resume.
    Pure function — no DB, no I/O.
    """
    diff: Dict[str, Any] = {"summary": None, "skills": {"removed": [], "added": []}, "experience": []}

    # Summary
    diff["summary"] = _diff_summary(
        source_resume.get("summary"), tailored_resume.get("summary")
    )

    # Skills
    diff["skills"] = _diff_skills(source_resume.get("skills"), tailored_resume.get("skills"))

    # Experience bullets — match tailored bullets back to the source by index
    source_lookup = _match_source_bullets(source_resume.get("experience"))
    source_flat: List[str] = []
    for key in sorted(source_lookup.keys()):
        source_flat.extend(source_lookup[key])

    source_cursor = 0
    for exp in tailored_resume.get("experience") or []:
        if not isinstance(exp, dict):
            continue
        entry: Dict[str, Any] = {
            "title": exp.get("title", ""),
            "company": exp.get("company", ""),
            "bullet_changes": [],
        }
        for bullet in exp.get("bullets") or []:
            old = _get_original_bullet(bullet)
            new = _get_rewritten_bullet(bullet)
            reason = _get_bullet_reason(bullet)

            # If no explicit original was tagged, fall back to the next unused
            # source bullet so the red/green view still lines up.
            if not old and source_cursor < len(source_flat):
                old = source_flat[source_cursor]
            source_cursor += 1

            if _norm(old) == _norm(new):
                continue  # unchanged bullet — skip noise
            entry["bullet_changes"].append(
                {"removed": old or None, "added": new or None, "reason": reason}
            )
        if entry["bullet_changes"]:
            diff["experience"].append(entry)

    return diff
