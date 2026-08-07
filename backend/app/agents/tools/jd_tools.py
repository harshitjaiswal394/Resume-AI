"""
JD Intelligence tools — URL fetch, structured extraction, caching.

All DB operations are ADDITIVE ONLY.
"""

from __future__ import annotations

import hashlib
import json
import logging
import time
from datetime import datetime, timezone, timedelta
from typing import Any, Dict, List, Optional

import httpx
from sqlalchemy import text

from app.db import engine

logger = logging.getLogger("resumatch-ai.tools.jd")


# ── JD URL Fetching ──────────────────────────────────────────────────────────

async def fetch_jd_from_url(url: str) -> Dict[str, Any]:
    """
    Fetch and clean HTML from a JD URL.
    Returns cleaned text content.
    """
    # Check cache first (URL hash, 24h TTL)
    url_hash = hashlib.sha256(url.encode()).hexdigest()[:16]
    cached = await get_cached_jd(url_hash)
    if cached:
        logger.info("JD_CACHE_HIT | url=%s", url)
        return cached

    try:
        async with httpx.AsyncClient(timeout=30.0, follow_redirects=True) as client:
            response = await client.get(
                url,
                headers={
                    "User-Agent": "Mozilla/5.0 (compatible; ResuMatchBot/1.0)",
                    "Accept": "text/html,application/xhtml+xml",
                },
            )
            response.raise_for_status()

        html = response.text
        cleaned = _clean_html(html)

        result = {
            "status": "success",
            "url": url,
            "url_hash": url_hash,
            "raw_html": html[:50000],  # Cap for storage
            "cleaned_text": cleaned[:10000],
            "content_type": response.headers.get("content-type", ""),
        }

        # Cache for 24h
        await cache_jd_extraction(url_hash, result)
        return result

    except httpx.HTTPStatusError as e:
        logger.error("JD_FETCH_FAILED | url=%s status=%d", url, e.response.status_code)
        return {"status": "error", "message": f"HTTP {e.response.status_code}", "url": url}
    except Exception as e:
        logger.error("JD_FETCH_FAILED | url=%s error=%s", url, str(e))
        return {"status": "error", "message": str(e), "url": url}


def _clean_html(html: str) -> str:
    """Extract text from HTML, removing scripts, styles, and noise."""
    try:
        from bs4 import BeautifulSoup
        soup = BeautifulSoup(html, "html.parser")

        # Remove noise elements
        for tag in soup(["script", "style", "nav", "footer", "header", "aside", "iframe"]):
            tag.decompose()

        # Get text
        text = soup.get_text(separator="\n", strip=True)
        # Clean up whitespace
        lines = [line.strip() for line in text.splitlines() if line.strip()]
        return "\n".join(lines)
    except ImportError:
        # Fallback: stdlib HTML parser (avoid regex-based HTML filtering)
        from html.parser import HTMLParser

        class _TextExtractor(HTMLParser):
            def __init__(self) -> None:
                super().__init__()
                self._skip_tags = {"script", "style", "nav", "footer", "header", "aside", "iframe"}
                self._skip_depth = 0
                self._parts: List[str] = []

            def handle_starttag(self, tag: str, attrs: Any) -> None:
                if tag.lower() in self._skip_tags:
                    self._skip_depth += 1

            def handle_endtag(self, tag: str) -> None:
                if tag.lower() in self._skip_tags and self._skip_depth > 0:
                    self._skip_depth -= 1

            def handle_data(self, data: str) -> None:
                if self._skip_depth == 0 and data:
                    self._parts.append(data)

        parser = _TextExtractor()
        parser.feed(html)
        parser.close()
        text = "\n".join(parser._parts)
        lines = [line.strip() for line in text.splitlines() if line.strip()]
        return "\n".join(lines)


# ── JD Caching ──────────────────────────────────────────────────────────────

async def cache_jd_extraction(url_hash: str, data: Dict[str, Any]) -> None:
    """Cache JD extraction result (24h TTL)."""
    with engine.begin() as conn:
        # Ensure table exists (additive)
        conn.execute(text("""
            CREATE TABLE IF NOT EXISTS jd_extractions (
                url_hash TEXT PRIMARY KEY,
                data JSONB NOT NULL,
                created_at TIMESTAMPTZ DEFAULT NOW(),
                expires_at TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '24 hours')
            )
        """))

        conn.execute(
            text("""
                INSERT INTO jd_extractions (url_hash, data, created_at, expires_at)
                VALUES (:uh, :data, NOW(), NOW() + INTERVAL '24 hours')
                ON CONFLICT (url_hash) DO UPDATE SET data = :data, created_at = NOW(), expires_at = NOW() + INTERVAL '24 hours'
            """),
            {"uh": url_hash, "data": json.dumps(data)},
        )


async def get_cached_jd(url_hash: str) -> Optional[Dict[str, Any]]:
    """Retrieve cached JD extraction if still valid."""
    with engine.connect() as conn:
        row = conn.execute(
            text("""
                SELECT data, expires_at FROM jd_extractions
                WHERE url_hash = :uh AND expires_at > NOW()
            """),
            {"uh": url_hash},
        ).fetchone()

    if row:
        return row.data
    return None


# ── JD Structured Extraction ────────────────────────────────────────────────

async def extract_jd_structured(
    jd_text: str,
    jd_url: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Extract structured data from JD text using Gemini Flash.
    Returns skills, stack, responsibilities, experience level, salary, location.
    """
    from app.agents.model_router import model_router
    from app.services.ai_gateway import GatewayRequest, GatewayRouter
    from app.services.provider_adapters import build_default_provider_router

    route = model_router.route("jd_intel")

    # Build system prompt for structured extraction
    system_prompt = """You are a JD (Job Description) extraction engine.
Extract structured data from the job description text.

Respond with ONLY a JSON object with these fields:
{
  "title": "job title",
  "company": "company name",
  "skills": ["required skill 1", "required skill 2", ...],
  "nice_to_have_skills": ["nice to have skill 1", ...],
  "tech_stack": ["technology 1", "technology 2", ...],
  "responsibilities": ["responsibility 1", "responsibility 2", ...],
  "experience_level": "Entry Level|Mid Level|Senior|Lead|Executive",
  "experience_years": "2-4 years" or null,
  "salary_range": "$X-$Y" or null,
  "location": "city, state" or "Remote" or "Hybrid",
  "employment_type": "Full-time|Part-time|Contract",
  "description_summary": "2-3 sentence summary of the role"
}

Be precise. Only extract information explicitly stated in the JD. If a field is not mentioned, use null."""

    request = GatewayRequest(
        messages=[{"role": "user", "content": f"Extract structured data from this job description:\n\n{jd_text[:8000]}"}],
        system_instruction=system_prompt,
        temperature=route.temperature,
        max_tokens=route.max_tokens,
        json_mode=True,
    )

    providers = build_default_provider_router()
    router = GatewayRouter(providers)

    try:
        response = await router.execute(request)
        # Parse JSON from response (repairs truncation/markdown fences)
        from app.services.json_utils import parse_json_response

        data = parse_json_response(response.content)
        if data is None or not isinstance(data, dict):
            logger.error("JD_EXTRACTION_PARSE_FAILED | unusable content")
            return {"status": "error", "message": "Failed to parse extraction"}
        data["url"] = jd_url
        data["jd_hash"] = hashlib.sha256(jd_text.encode()).hexdigest()[:16]

        logger.info("JD_EXTRACTED | title=%s company=%s skills=%d", data.get("title"), data.get("company"), len(data.get("skills", [])))
        return {"status": "success", "data": data}

    except json.JSONDecodeError as e:
        logger.error("JD_EXTRACTION_PARSE_FAILED | error=%s", str(e))
        return {"status": "error", "message": f"Failed to parse extraction: {e}"}
    except Exception as e:
        logger.error("JD_EXTRACTION_FAILED | error=%s", str(e))
        return {"status": "error", "message": str(e)}
