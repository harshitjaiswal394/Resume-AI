"""
Resume Intelligence tools — parsing, storage, versioning, embeddings.

All DB operations are ADDITIVE ONLY — no destructive changes to existing tables.
"""

from __future__ import annotations

import hashlib
import json
import logging
import threading
import time
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Tuple

from sqlalchemy import text

from app.db import engine

logger = logging.getLogger("resumatch-ai.tools.resume")


# ── Schema bootstrap (additive) ─────────────────────────────────────────────

_versions_schema_checked = False
_versions_schema_lock = threading.Lock()

_RESUME_VERSIONS_CREATE = text("""
    CREATE TABLE IF NOT EXISTS resume_versions (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        resume_id TEXT NOT NULL,
        version_number SERIAL,
        parent_version_id TEXT,
        parsed_data JSONB NOT NULL,
        diff_json JSONB,
        jd_hash TEXT,
        jd_skills JSONB,
        change_reasons JSONB,
        created_at TIMESTAMPTZ DEFAULT NOW()
    )
""")

_RESUME_VERSIONS_ALTER = text("""
    ALTER TABLE resume_versions ADD COLUMN IF NOT EXISTS jd_skills JSONB
""")


def ensure_resume_versions_schema() -> None:
    """Create the resume_versions table and add any missing columns (additive).

    Runs once per process so every read path can rely on the full schema even
    before a version is ever stored.
    """
    global _versions_schema_checked
    if _versions_schema_checked:
        return
    with _versions_schema_lock:
        if _versions_schema_checked:
            return
        with engine.begin() as conn:
            conn.execute(_RESUME_VERSIONS_CREATE)
            conn.execute(_RESUME_VERSIONS_ALTER)
        _versions_schema_checked = True
        logger.info("RESUME_VERSIONS_SCHEMA_READY | jd_skills column ensured")



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
    jd_skills: Optional[List[str]] = None,
    change_reasons: Optional[List[str]] = None,
    diff_json: Optional[Dict[str, Any]] = None,
) -> str:
    """
    Store a new resume version (additive — inserts into resume_versions table).

    Returns the version ID.
    """
    version_id = hashlib.sha256(
        f"{user_id}:{resume_id}:{json.dumps(parsed_data, sort_keys=True)}:{time.time()}".encode()
    ).hexdigest()[:16]

    ensure_resume_versions_schema()

    with engine.begin() as conn:
        # Get next version number
        result = conn.execute(
            text("SELECT COALESCE(MAX(version_number), 0) + 1 FROM resume_versions WHERE resume_id = :rid"),
            {"rid": resume_id},
        )
        version_number = result.scalar()

        conn.execute(
            text("""
                INSERT INTO resume_versions (id, user_id, resume_id, version_number, parent_version_id, parsed_data, diff_json, jd_hash, jd_skills, change_reasons, created_at)
                VALUES (:id, :uid, :rid, :vn, :pvd, :pd, :dj, :jh, :js, :cr, NOW())
            """),
            {
                "id": version_id,
                "uid": user_id,
                "rid": resume_id,
                "vn": version_number,
                "pvd": diff_from_version,
                "pd": json.dumps(parsed_data),
                "dj": json.dumps(diff_json) if diff_json else None,
                "jh": jd_hash,
                "js": json.dumps(jd_skills) if jd_skills else None,
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

async def get_tailoring_cache(user_id: str, jd_hash: str, resume_id: Optional[str] = None) -> Optional[Dict[str, Any]]:
    """Check if we already tailored this resume for this JD (cache hit)."""
    ensure_resume_versions_schema()
    select = """
        SELECT id, resume_id, parsed_data, change_reasons, diff_json, jd_skills, created_at
        FROM resume_versions
        WHERE user_id = :uid AND jd_hash = :jh
    """
    params: Dict[str, Any] = {"uid": user_id, "jh": jd_hash}
    if resume_id:
        select += " AND resume_id = :rid"
        params["rid"] = resume_id
    select += " ORDER BY created_at DESC LIMIT 1"

    with engine.connect() as conn:
        row = conn.execute(text(select), params).fetchone()

    if row:
        return {
            "version_id": str(row.id),
            "resume_id": str(row.resume_id) if row.resume_id else None,
            "parsed_data": row.parsed_data,
            "change_reasons": row.change_reasons,
            "diff_json": row.diff_json,
            "jd_skills": row.jd_skills if hasattr(row, "jd_skills") else None,
            "cached_at": row.created_at.isoformat() if row.created_at else None,
        }
    return None


async def get_resume_version(version_id: str, user_id: str) -> Optional[Dict[str, Any]]:
    """Fetch a single tailored resume version."""
    ensure_resume_versions_schema()
    with engine.connect() as conn:
        row = conn.execute(
            text("""
                SELECT id, resume_id, version_number, parent_version_id, parsed_data,
                       diff_json, jd_hash, jd_skills, change_reasons, created_at
                FROM resume_versions
                WHERE id = :vid AND user_id = :uid
            """),
            {"vid": version_id, "uid": user_id},
        ).fetchone()

    if not row:
        return None
    return {
        "version_id": str(row.id),
        "resume_id": str(row.resume_id),
        "version_number": row.version_number,
        "parent_version_id": row.parent_version_id,
        "parsed_data": row.parsed_data,
        "diff_json": row.diff_json,
        "jd_hash": row.jd_hash,
        "jd_skills": row.jd_skills if hasattr(row, "jd_skills") else None,
        "change_reasons": row.change_reasons,
        "created_at": row.created_at.isoformat() if row.created_at else None,
    }


async def merge_source_sections_into_version(version: Dict[str, Any], user_id: str) -> Dict[str, Any]:
    """
    Deterministically re-merge non-tailored source sections (certifications,
    achievements, languages, projects, links, email, phone, targetRole) into a
    tailored version's parsed_data. Handles versions created before the
    preservation fix or where the model dropped a section.
    """
    from app.agents.resume_tailor import ResumeTailorAgent

    parsed = version.get("parsed_data")
    if not isinstance(parsed, dict):
        return version
    source = None
    try:
        with engine.connect() as conn:
            row = conn.execute(
                text("SELECT parsed_data FROM resumes WHERE id = :rid AND user_id = :uid"),
                {"rid": version["resume_id"], "uid": user_id},
            ).fetchone()
            if row and row.parsed_data:
                source = row.parsed_data if isinstance(row.parsed_data, dict) else json.loads(row.parsed_data)
            if not source:
                # Source resume may have been deleted. Fall back to the resume
                # that actually carries the source sections (richest profile),
                # not merely the newest one, so orphaned versions still get
                # email/phone/certifications etc. merged in.
                best = None
                best_score = -1
                rows = conn.execute(
                    text("""
                        SELECT parsed_data FROM resumes
                        WHERE user_id = :uid AND parsed_data IS NOT NULL
                        ORDER BY updated_at DESC
                    """),
                    {"uid": user_id},
                ).fetchall()
                for cand in rows:
                    pd = cand.parsed_data if isinstance(cand.parsed_data, dict) else json.loads(cand.parsed_data)
                    if not isinstance(pd, dict):
                        continue
                    score = sum(1 for k in ResumeTailorAgent._PASSTHROUGH_KEYS if pd.get(k))
                    if score > best_score:
                        best_score = score
                        best = pd
                source = best
    except Exception:
        return version
    if source:
        try:
            ResumeTailorAgent._preserve_source_sections(source, parsed)
        except Exception:
            return version
    return version


async def list_resume_versions(user_id: str, resume_id: str, fallback_all: bool = True) -> List[Dict[str, Any]]:
    """List tailoring history for a resume, newest first.

    If the resume itself has no versions but the user has other versions
    (e.g. the source resume was deleted), fall back to the user's latest
    versions so the Tailored toggle still resolves.
    """
    ensure_resume_versions_schema()

    def build(row) -> Dict[str, Any]:
        diff = row.diff_json or {}
        return {
            "version_id": str(row.id),
            "resume_id": str(row.resume_id) if row.resume_id else None,
            "version_number": row.version_number,
            "parent_version_id": row.parent_version_id,
            "jd_hash": row.jd_hash,
            "change_reasons": row.change_reasons or [],
            "diff_summary": _summarize_diff(diff),
            "created_at": row.created_at.isoformat() if row.created_at else None,
        }

    with engine.connect() as conn:
        rows = conn.execute(
            text("""
                SELECT id, resume_id, version_number, parent_version_id, diff_json, jd_hash,
                       change_reasons, created_at
                FROM resume_versions
                WHERE user_id = :uid AND resume_id = :rid
                ORDER BY created_at DESC
            """),
            {"uid": user_id, "rid": resume_id},
        ).fetchall()

    versions = [build(row) for row in rows]
    if not versions and fallback_all:
        with engine.connect() as conn:
            rows = conn.execute(
                text("""
                    SELECT id, resume_id, version_number, parent_version_id, diff_json, jd_hash,
                           change_reasons, created_at
                    FROM resume_versions
                    WHERE user_id = :uid
                    ORDER BY created_at DESC LIMIT 5
                """),
                {"uid": user_id},
            ).fetchall()
        versions = [build(row) for row in rows]
    return versions


async def delete_resume_version(version_id: str, user_id: str) -> bool:
    """Delete a single tailored resume version (scoped to the owning user)."""
    with engine.begin() as conn:
        result = conn.execute(
            text("DELETE FROM resume_versions WHERE id = :vid AND user_id = :uid"),
            {"vid": version_id, "uid": user_id},
        )
    return (result.rowcount or 0) > 0


def _summarize_diff(diff: Dict[str, Any]) -> Dict[str, Any]:
    """Extract a lightweight summary of a stored diff for list views."""
    if not diff:
        return {}
    bullets_changed = 0
    for entry in diff.get("experience", []) or []:
        bullets_changed += len(entry.get("bullet_changes", []) or [])
    return {
        "summary_changed": bool(diff.get("summary")),
        "summary": diff.get("summary"),
        "skills_added": len((diff.get("skills") or {}).get("added", []) or []),
        "skills_removed": len((diff.get("skills") or {}).get("removed", []) or []),
        "bullets_changed": bullets_changed,
    }
