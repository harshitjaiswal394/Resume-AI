"""
JD Intelligence Agent — URL fetch, PDF/DOCX parsing, structured extraction.

Handles job description ingestion and structured data extraction.
"""

from __future__ import annotations

import hashlib
import json
import logging
import time
from typing import Any, Dict, List, Optional

from app.services.ai_gateway import GatewayRequest, GatewayRouter
from app.agents.model_router import model_router
from app.agents.tools.jd_tools import (
    fetch_jd_from_url,
    extract_jd_structured,
    get_cached_jd,
)

logger = logging.getLogger("resumatch-ai.agents.jd_intel")


class JDIntelAgent:
    """Handles JD ingestion, parsing, and structured extraction."""

    def __init__(self, router: GatewayRouter):
        self._router = router

    async def ingest(
        self,
        source: str,
        source_type: str = "auto",
        user_id: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        Ingest a JD from various sources.

        source_type: "url", "text", "pdf", "auto" (detect from source)
        Returns structured JD data.
        """
        start = time.monotonic()

        # Auto-detect source type
        if source_type == "auto":
            if source.startswith("http://") or source.startswith("https://"):
                source_type = "url"
            elif len(source) > 200:
                source_type = "text"
            else:
                source_type = "text"

        jd_text = ""

        if source_type == "url":
            # Fetch from URL (with caching)
            fetch_result = await fetch_jd_from_url(source)
            if fetch_result["status"] == "error":
                return fetch_result
            jd_text = fetch_result.get("cleaned_text", "")
            url_hash = fetch_result.get("url_hash", hashlib.sha256(source.encode()).hexdigest()[:16])

        elif source_type == "text":
            jd_text = source
            url_hash = hashlib.sha256(source.encode()).hexdigest()[:16]

        elif source_type == "pdf":
            # PDF parsing (reuse resume parser logic)
            try:
                import pymupdf
                doc = pymupdf.open(stream=source.encode() if isinstance(source, str) else source, filetype="pdf")
                jd_text = "\n".join(page.get_text() for page in doc)
                doc.close()
            except Exception as e:
                return {"status": "error", "message": f"PDF parsing failed: {e}"}
            url_hash = hashlib.sha256(jd_text.encode()).hexdigest()[:16]

        else:
            return {"status": "error", "message": f"Unknown source type: {source_type}"}

        if not jd_text.strip():
            return {"status": "error", "message": "No text extracted from JD"}

        # Extract structured data via LLM
        extraction = await extract_jd_structured(jd_text, source if source_type == "url" else None)
        if extraction["status"] == "error":
            return extraction

        latency = (time.monotonic() - start) * 1000
        data = extraction["data"]
        logger.info(
            "JD_INGESTED | type=%s title=%s company=%s skills=%d latency_ms=%.1f",
            source_type, data.get("title"), data.get("company"), len(data.get("skills", [])), latency,
        )

        return {
            "status": "success",
            "source_type": source_type,
            "url_hash": url_hash,
            "data": data,
            "raw_text_length": len(jd_text),
        }

    async def compare_resume_jd(
        self,
        resume_data: Dict[str, Any],
        jd_data: Dict[str, Any],
    ) -> Dict[str, Any]:
        """
        Compare resume against JD for skill gaps and alignment.
        Returns gap analysis without LLM (deterministic).
        """
        resume_skills = set(s.lower() for s in resume_data.get("skills", []))
        jd_skills = set(s.lower() for s in jd_data.get("skills", []))
        nice_to_have = set(s.lower() for s in jd_data.get("nice_to_have_skills", []))

        matched = resume_skills & jd_skills
        missing_required = jd_skills - resume_skills
        missing_nice = nice_to_have - resume_skills

        # Calculate match score
        if jd_skills:
            match_score = len(matched) / len(jd_skills) * 100
        else:
            match_score = 0

        return {
            "match_score": round(match_score, 1),
            "matched_skills": list(matched),
            "missing_required": list(missing_required),
            "missing_nice_to_have": list(missing_nice),
            "resume_skill_count": len(resume_skills),
            "jd_skill_count": len(jd_skills),
        }


# Process-wide singleton
jd_intel_agent: Optional[JDIntelAgent] = None
