"""
Resume Intelligence Agent — parsing, storage, versioning, embeddings.

This agent handles resume processing and is called by other agents
(tailoring, ATS, career coach) to get structured resume data.
"""

from __future__ import annotations

import json
import logging
import time
from typing import Any, Dict, List, Optional

from app.services.ai_gateway import AgentTool, GatewayRequest, GatewayRouter
from app.agents.model_router import model_router
from app.agents.tools.resume_tools import (
    parse_resume_pdf,
    store_resume_version,
    get_resume_embeddings,
    generate_resume_embedding,
    store_resume_embeddings,
)

logger = logging.getLogger("resumatch-ai.agents.resume_intel")


class ResumeIntelAgent:
    """Handles resume parsing, storage, versioning, and embedding generation."""

    def __init__(self, router: GatewayRouter):
        self._router = router

    async def parse_and_store(
        self,
        user_id: str,
        resume_id: str,
        pdf_bytes: bytes,
        filename: str = "",
    ) -> Dict[str, Any]:
        """
        Parse a PDF resume, store structured data, generate embeddings.
        Returns the parsed resume data.
        """
        start = time.monotonic()

        # Step 1: Parse PDF (rule-based, no LLM)
        parsed = await parse_resume_pdf(pdf_bytes, filename)
        if parsed["status"] == "error":
            return parsed

        # Step 2: Store version in Supabase
        version_id = await store_resume_version(
            user_id=user_id,
            resume_id=resume_id,
            parsed_data=parsed["parsed_data"],
        )

        # Step 3: Generate embeddings for semantic search
        raw_text = parsed.get("raw_text", "")
        if raw_text:
            chunks = _chunk_resume(raw_text, parsed["parsed_data"])
            stored = await store_resume_embeddings(user_id, resume_id, chunks)
            logger.info("RESUME_EMBEDDINGS_STORED | user=%s resume=%s chunks=%d", user_id, resume_id, stored)

        latency = (time.monotonic() - start) * 1000
        logger.info("RESUME_PARSED_AND_STORED | user=%s resume=%s version=%s latency_ms=%.1f", user_id, resume_id, version_id, latency)

        return {
            "status": "success",
            "version_id": version_id,
            "parsed_data": parsed["parsed_data"],
            "raw_text_length": len(raw_text),
        }

    async def get_resume_context(
        self,
        user_id: str,
        resume_id: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        Get resume context for other agents to use.
        Returns structured resume data + optional semantic matches.
        """
        from app.db import engine
        from sqlalchemy import text

        with engine.connect() as conn:
            query = """
                SELECT id, title, status, parsed_data, raw_text, updated_at
                FROM resumes
                WHERE user_id = :uid
            """
            params: Dict[str, Any] = {"uid": user_id}
            if resume_id:
                query += " AND id = :rid"
                params["rid"] = resume_id

            query += " ORDER BY updated_at DESC LIMIT 1"
            row = conn.execute(text(query), params).fetchone()

        if not row:
            return {"status": "error", "message": "No resume found"}

        data = None
        if row.parsed_data:
            data = row.parsed_data if isinstance(row.parsed_data, dict) else json.loads(row.parsed_data)

        return {
            "status": "success",
            "resume_id": str(row.id),
            "title": row.title,
            "parsed_data": data,
            "raw_text": (row.raw_text or "")[:5000],
            "updated_at": row.updated_at.isoformat() if row.updated_at else None,
        }

    async def create_tailored_version(
        self,
        user_id: str,
        resume_id: str,
        tailored_data: Dict[str, Any],
        jd_hash: str,
        change_reasons: List[str],
        parent_version_id: Optional[str] = None,
    ) -> str:
        """Store a tailored resume version with JD hash for cache lookup."""
        return await store_resume_version(
            user_id=user_id,
            resume_id=resume_id,
            parsed_data=tailored_data,
            diff_from_version=parent_version_id,
            jd_hash=jd_hash,
            change_reasons=change_reasons,
        )


def _chunk_resume(raw_text: str, parsed_data: Dict[str, Any]) -> List[Dict[str, Any]]:
    """Chunk resume into semantic sections for embedding."""
    chunks = []

    # Summary chunk
    summary = parsed_data.get("summary", "")
    if summary:
        chunks.append({"text": summary, "section": "summary"})

    # Skills chunk
    skills = parsed_data.get("skills", [])
    if skills:
        chunks.append({"text": "Skills: " + ", ".join(skills[:20]), "section": "skills"})

    # Experience chunks
    for i, exp in enumerate(parsed_data.get("experience", [])[:5]):
        desc = " ".join(exp.get("description", [])[:3])
        text = f"{exp.get('title', '')} at {exp.get('company', '')}: {desc}"
        if text.strip():
            chunks.append({"text": text, "section": f"experience_{i}"})

    # Education chunks
    for edu in parsed_data.get("education", [])[:3]:
        if isinstance(edu, str):
            chunks.append({"text": edu, "section": "education"})
        elif isinstance(edu, dict):
            chunks.append({"text": json.dumps(edu), "section": "education"})

    # Fallback: chunk raw text if no structured data
    if not chunks and raw_text:
        for i in range(0, len(raw_text), 500):
            chunk = raw_text[i:i + 500]
            if chunk.strip():
                chunks.append({"text": chunk, "section": f"raw_{i // 500}"})

    return chunks


# Process-wide singleton
resume_intel_agent: Optional[ResumeIntelAgent] = None
