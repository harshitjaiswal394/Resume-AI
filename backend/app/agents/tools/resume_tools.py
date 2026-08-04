"""
Resume Intelligence tools — parsing, storage, versioning, embeddings.

All DB operations are ADDITIVE ONLY — no destructive changes to existing tables.
"""

from __future__ import annotations

import hashlib
import json
import logging
import time
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Tuple

from sqlalchemy import text

from app.db import engine

logger = logging.getLogger("resumatch-ai.tools.resume")


# ── Resume Parsing ───────────────────────────────────────────────────────────

async def parse_resume_pdf(pdf_bytes: bytes, filename: str = "") -> Dict[str, Any]:
    """
    Parse a PDF resume using PyMuPDF. Returns structured data.

    This is rule-based — no LLM call. Fallback OCR path is gated separately.
    """
    try:
        import pymupdf  # PyMuPDF
    except ImportError:
        raise RuntimeError("pymupdf is required for PDF parsing. Install with: pip install pymupdf")

    doc = pymupdf.open(stream=pdf_bytes, filetype="pdf")
    full_text = ""
    for page in doc:
        full_text += page.get_text()

    doc.close()

    if not full_text.strip():
        return {
            "status": "error",
            "message": "No text extracted from PDF. May need OCR.",
            "raw_text": "",
            "parsed_data": None,
        }

    # Basic structured extraction (rule-based, no LLM)
    parsed = _extract_sections(full_text)
    parsed["rawText"] = full_text[:10000]  # Cap for token efficiency

    return {
        "status": "success",
        "raw_text": full_text,
        "parsed_data": parsed,
        "filename": filename,
    }


def _extract_sections(text: str) -> Dict[str, Any]:
    """Extract resume sections using heuristics (no LLM)."""
    lines = text.split("\n")
    sections: Dict[str, List[str]] = {}
    current_section = "header"
    sections[current_section] = []

    section_keywords = {
        "experience": ["experience", "work history", "employment", "professional experience"],
        "education": ["education", "academic", "university", "college", "degree"],
        "skills": ["skills", "technical skills", "competencies", "proficiencies"],
        "projects": ["projects", "portfolio", "personal projects"],
        "certifications": ["certifications", "certificates", "licenses"],
        "summary": ["summary", "objective", "profile", "about"],
    }

    for line in lines:
        stripped = line.strip()
        if not stripped:
            continue

        lower = stripped.lower()
        matched = False
        for section_name, keywords in section_keywords.items():
            if any(kw in lower for kw in keywords) and len(stripped) < 50:
                current_section = section_name
                sections.setdefault(current_section, [])
                matched = True
                break

        if not matched:
            sections.setdefault(current_section, []).append(stripped)

    # Extract skills (simple keyword matching)
    skills = []
    if "skills" in sections:
        for line in sections["skills"]:
            # Split by common delimiters
            for skill in line.replace("•", ",").replace("|", ",").split(","):
                skill = skill.strip()
                if skill and len(skill) > 1 and len(skill) < 60:
                    skills.append(skill)

    # Extract experience entries
    experience = []
    if "experience" in sections:
        current_exp: Dict[str, Any] = {}
        for line in sections["experience"]:
            if any(title in line.lower() for title in ["engineer", "developer", "manager", "analyst", "intern", "lead", "architect", "consultant", "specialist"]):
                if current_exp:
                    experience.append(current_exp)
                current_exp = {"title": line.strip(), "company": "", "description": []}
            elif current_exp and not current_exp["company"]:
                current_exp["company"] = line.strip()
            elif current_exp:
                current_exp["description"].append(line.strip())
        if current_exp:
            experience.append(current_exp)

    return {
        "fullName": sections.get("header", [""])[0] if sections.get("header") else "",
        "skills": skills[:30],
        "experience": experience[:5],
        "education": sections.get("education", [])[:3],
        "summary": " ".join(sections.get("summary", [])[:3]),
    }


# ── Resume Versioning ───────────────────────────────────────────────────────

async def store_resume_version(
    user_id: str,
    resume_id: str,
    parsed_data: Dict[str, Any],
    diff_from_version: Optional[str] = None,
    jd_hash: Optional[str] = None,
    change_reasons: Optional[List[str]] = None,
) -> str:
    """
    Store a new resume version (additive — inserts into resume_versions table).

    Returns the version ID.
    """
    version_id = hashlib.sha256(
        f"{user_id}:{resume_id}:{json.dumps(parsed_data, sort_keys=True)}:{time.time()}".encode()
    ).hexdigest()[:16]

    with engine.begin() as conn:
        # Ensure the resume_versions table exists (additive migration)
        conn.execute(text("""
            CREATE TABLE IF NOT EXISTS resume_versions (
                id TEXT PRIMARY KEY,
                user_id TEXT NOT NULL,
                resume_id TEXT NOT NULL,
                version_number SERIAL,
                parent_version_id TEXT,
                parsed_data JSONB NOT NULL,
                diff_json JSONB,
                jd_hash TEXT,
                change_reasons JSONB,
                created_at TIMESTAMPTZ DEFAULT NOW()
            )
        """))

        # Get next version number
        result = conn.execute(
            text("SELECT COALESCE(MAX(version_number), 0) + 1 FROM resume_versions WHERE resume_id = :rid"),
            {"rid": resume_id},
        )
        version_number = result.scalar()

        conn.execute(
            text("""
                INSERT INTO resume_versions (id, user_id, resume_id, version_number, parent_version_id, parsed_data, jd_hash, change_reasons, created_at)
                VALUES (:id, :uid, :rid, :vn, :pvd, :pd, :jh, :cr, NOW())
            """),
            {
                "id": version_id,
                "uid": user_id,
                "rid": resume_id,
                "vn": version_number,
                "pvd": diff_from_version,
                "pd": json.dumps(parsed_data),
                "jh": jd_hash,
                "cr": json.dumps(change_reasons) if change_reasons else None,
            },
        )

    logger.info("RESUME_VERSION_STORED | user=%s resume=%s version=%d", user_id, resume_id, version_number)
    return version_id


# ── Resume Embeddings ───────────────────────────────────────────────────────

async def generate_resume_embedding(text_content: str) -> List[float]:
    """Generate an embedding vector for resume content using NVIDIA."""
    from app.services.nvidia_service import nvidia_service
    return await nvidia_service.generate_embedding(text_content[:2000])


async def get_resume_embeddings(user_id: str, resume_id: str) -> List[Dict[str, Any]]:
    """Retrieve stored resume embeddings for semantic search."""
    with engine.connect() as conn:
        rows = conn.execute(
            text("""
                SELECT id, chunk_text, embedding, section_type, created_at
                FROM resume_embeddings
                WHERE user_id = :uid AND resume_id = :rid
                ORDER BY created_at DESC
            """),
            {"uid": user_id, "rid": resume_id},
        ).fetchall()

    return [
        {
            "id": str(row.id),
            "chunk_text": row.chunk_text,
            "section_type": row.section_type,
            "created_at": row.created_at.isoformat() if row.created_at else None,
        }
        for row in rows
    ]


async def store_resume_embeddings(
    user_id: str,
    resume_id: str,
    chunks: List[Dict[str, Any]],
) -> int:
    """
    Store resume embedding chunks (additive — inserts into resume_embeddings).

    Returns count of stored chunks.
    """
    from app.services.nvidia_service import nvidia_service

    stored = 0
    with engine.begin() as conn:
        for chunk in chunks:
            text_content = chunk.get("text", "")
            section_type = chunk.get("section", "unknown")

            if not text_content:
                continue

            try:
                embedding = await nvidia_service.generate_embedding(text_content[:2000])
                conn.execute(
                    text("""
                        INSERT INTO resume_embeddings (user_id, resume_id, chunk_text, embedding, section_type, created_at)
                        VALUES (:uid, :rid, :ct, :emb, :st, NOW())
                    """),
                    {
                        "uid": user_id,
                        "rid": resume_id,
                        "ct": text_content,
                        "emb": json.dumps(embedding),
                        "st": section_type,
                    },
                )
                stored += 1
            except Exception as e:
                logger.warning("EMBEDDING_STORE_FAILED | resume=%s chunk=%s error=%s", resume_id, section_type, e)

    logger.info("RESUME_EMBEDDINGS_STORED | user=%s resume=%s count=%d", user_id, resume_id, stored)
    return stored


# ── Resume Cache Check ──────────────────────────────────────────────────────

async def get_tailoring_cache(user_id: str, jd_hash: str) -> Optional[Dict[str, Any]]:
    """Check if we already tailored this resume for this JD (cache hit)."""
    with engine.connect() as conn:
        row = conn.execute(
            text("""
                SELECT id, parsed_data, change_reasons, created_at
                FROM resume_versions
                WHERE user_id = :uid AND jd_hash = :jh
                ORDER BY created_at DESC LIMIT 1
            """),
            {"uid": user_id, "jh": jd_hash},
        ).fetchone()

    if row:
        return {
            "version_id": str(row.id),
            "parsed_data": row.parsed_data,
            "change_reasons": row.change_reasons,
            "cached_at": row.created_at.isoformat() if row.created_at else None,
        }
    return None
