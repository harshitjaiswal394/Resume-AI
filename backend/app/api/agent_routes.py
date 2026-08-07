"""
Agent Routes — API endpoints for the 10-agent system.

All endpoints reuse existing auth middleware and JWT validation.
No second auth system.
"""

from __future__ import annotations

import json
import logging
import time
from typing import Any, Dict, Optional

from fastapi import APIRouter, Depends, HTTPException, Header
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

logger = logging.getLogger("resumatch-ai.api.agents")

router = APIRouter(tags=["agents"])


# ── Request/Response Models ──────────────────────────────────────────────────

class IntentRequest(BaseModel):
    message: str

class IntentResponse(BaseModel):
    intent: str
    confidence: float
    agent_name: str
    reasoning: str

class ResumeParseRequest(BaseModel):
    resume_id: str
    filename: str = ""

class ResumeTailorRequest(BaseModel):
    resume_id: str
    jd_text: str
    jd_url: Optional[str] = None

class JDIngestRequest(BaseModel):
    source: str
    source_type: str = "auto"

class ATSAnalysisRequest(BaseModel):
    resume_id: Optional[str] = None
    version_id: Optional[str] = None
    jd_text: Optional[str] = None

class InterviewStartRequest(BaseModel):
    resume_id: str
    jd_text: Optional[str] = None
    interview_type: str = "mixed"
    num_questions: int = 5

class InterviewAnswerRequest(BaseModel):
    session_id: str
    answer: str

class RoadmapRequest(BaseModel):
    resume_id: str
    jd_text: Optional[str] = None

class CoachRequest(BaseModel):
    resume_id: Optional[str] = None
    jd_text: Optional[str] = None


# ── Helper: get user from JWT ───────────────────────────────────────────────

async def _get_user_id(authorization: Optional[str] = Header(None)) -> str:
    """Extract user_id from the Authorization header (reuses existing auth)."""
    from app.services.auth_service import auth_service

    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Unauthorized")
    token = authorization.replace("Bearer ", "")
    result = await auth_service.get_user(token)
    if not result.get("success"):
        raise HTTPException(status_code=401, detail="Invalid token")
    return result["user"]["id"]


# ── Intent Classification ───────────────────────────────────────────────────

@router.post("/intent", response_model=IntentResponse)
async def classify_intent(req: IntentRequest, user_id: str = Depends(_get_user_id)):
    """Classify user intent and route to appropriate agent."""
    from app.agents.orchestrator import orchestrator
    if not orchestrator:
        raise HTTPException(status_code=503, detail="Agent orchestrator not initialized")

    result = await orchestrator.route(
        user_message=req.message,
        user_id=user_id,
        conversation_id="",
    )
    return IntentResponse(**result)


# ── Resume Intelligence ─────────────────────────────────────────────────────

@router.post("/resume/parse")
async def parse_resume(req: ResumeParseRequest, user_id: str = Depends(_get_user_id)):
    """Parse a resume PDF and return structured data."""
    from app.agents.resume_intel import resume_intel_agent
    if not resume_intel_agent:
        raise HTTPException(status_code=503, detail="Resume Intel agent not initialized")

    result = await resume_intel_agent.get_resume_context(user_id, req.resume_id)
    if result["status"] == "error":
        raise HTTPException(status_code=404, detail=result["message"])
    return result


@router.post("/resume/tailor")
async def tailor_resume(req: ResumeTailorRequest, user_id: str = Depends(_get_user_id)):
    """Tailor a resume against a specific JD."""
    from app.agents.resume_intel import resume_intel_agent
    from app.agents.resume_tailor import resume_tailor_agent
    from app.agents.jd_intel import jd_intel_agent
    import hashlib

    if not resume_tailor_agent or not jd_intel_agent:
        raise HTTPException(status_code=503, detail="Agents not initialized")

    # Get resume data
    resume_result = await resume_intel_agent.get_resume_context(user_id, req.resume_id)
    if resume_result["status"] == "error":
        raise HTTPException(status_code=404, detail="Resume not found")

    # Parse JD
    jd_result = await jd_intel_agent.ingest(req.jd_text, "text")
    if jd_result["status"] == "error":
        raise HTTPException(status_code=400, detail="Failed to parse JD")

    jd_hash = hashlib.sha256(req.jd_text.encode()).hexdigest()[:16]

    # Tailor
    result = await resume_tailor_agent.tailor(
        user_id=user_id,
        resume_id=req.resume_id,
        resume_data=resume_result.get("parsed_data", {}),
        jd_data=jd_result.get("data", {}),
        jd_hash=jd_hash,
    )

    if result["status"] == "error":
        raise HTTPException(status_code=400, detail=result["message"])
    # Surface the JD's required skills so the frontend can explain why they
    # appear in the tailored resume (skills section + experience bullets).
    result["jd_required_skills"] = (jd_result.get("data") or {}).get("skills", [])
    return result


# ── Tailored Resume Versions / DOCX Download ────────────────────────────────

@router.get("/resume/{resume_id}/versions")
async def resume_versions(resume_id: str, user_id: str = Depends(_get_user_id)):
    """List tailoring history for a resume (newest first)."""
    from app.agents.tools.resume_tools import list_resume_versions
    versions = await list_resume_versions(user_id, resume_id)
    return {"success": True, "resume_id": resume_id, "versions": versions}


@router.delete("/resume/version/{version_id}")
async def resume_version_delete(version_id: str, user_id: str = Depends(_get_user_id)):
    """Delete a single tailored version (history record), scoped to the user."""
    from app.agents.tools.resume_tools import delete_resume_version
    deleted = await delete_resume_version(version_id, user_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Version not found")
    return {"success": True}


@router.get("/resume/version/{version_id}/diff")
async def resume_version_diff(version_id: str, user_id: str = Depends(_get_user_id)):
    """Return the GitHub-style diff for a tailored version."""
    from app.agents.tools.resume_tools import get_resume_version
    version = await get_resume_version(version_id, user_id)
    if not version:
        raise HTTPException(status_code=404, detail="Version not found")
    return {
        "success": True,
        "version_id": version["version_id"],
        "version_number": version["version_number"],
        "created_at": version["created_at"],
        "diff": version["diff_json"] or {},
        "change_reasons": version["change_reasons"] or [],
        "jd_skills": version.get("jd_skills") or [],
    }


@router.get("/resume/version/{version_id}/data")
async def resume_version_data(version_id: str, user_id: str = Depends(_get_user_id)):
    """Return the full tailored version data (parsed_data, diff, metadata)."""
    from app.agents.tools.resume_tools import get_resume_version, merge_source_sections_into_version
    version = await get_resume_version(version_id, user_id)
    if not version:
        raise HTTPException(status_code=404, detail="Version not found")
    await merge_source_sections_into_version(version, user_id)
    return {
        "success": True,
        "version_id": version["version_id"],
        "resume_id": version["resume_id"],
        "version_number": version["version_number"],
        "parent_version_id": version["parent_version_id"],
        "created_at": version["created_at"],
        "parsed_data": version["parsed_data"],
        "diff": version["diff_json"] or {},
        "change_reasons": version["change_reasons"] or [],
        "jd_skills": version.get("jd_skills") or [],
    }


@router.get("/resume/version/{version_id}/download")
async def resume_version_download(version_id: str, user_id: str = Depends(_get_user_id)):
    """Download the tailored resume as an ATS-friendly DOCX."""
    from app.agents.tools.resume_tools import get_resume_version, merge_source_sections_into_version
    from app.agents.tools.docx_generator import build_tailored_docx, safe_filename

    version = await get_resume_version(version_id, user_id)
    if not version:
        raise HTTPException(status_code=404, detail="Version not found")

    await merge_source_sections_into_version(version, user_id)
    parsed = version["parsed_data"]
    if not parsed:
        raise HTTPException(status_code=404, detail="Version has no tailored data")

    try:
        docx_bytes = build_tailored_docx(parsed)
    except RuntimeError as e:
        raise HTTPException(status_code=500, detail=str(e))

    full_name = parsed.get("fullName") if isinstance(parsed, dict) else None
    filename = safe_filename(full_name, version.get("version_number") or 0)

    return StreamingResponse(
        iter([docx_bytes]),
        media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.post("/resume/version/{version_id}/to-builder")
async def resume_version_to_builder(version_id: str, user_id: str = Depends(_get_user_id)):
    """Feed a tailored version into the resume builder as a new resume."""
    from app.agents.tools.resume_tools import get_resume_version, merge_source_sections_into_version
    from app.api.builder_models import ResumeCreateRequest, ExperienceItem, EducationItem
    from app.api.resumes_crud import create_resume_record

    version = await get_resume_version(version_id, user_id)
    if not version:
        raise HTTPException(status_code=404, detail="Version not found")

    await merge_source_sections_into_version(version, user_id)
    parsed = version["parsed_data"]
    if not isinstance(parsed, dict):
        raise HTTPException(status_code=404, detail="Version has no tailored data")

    experience = []
    for exp in parsed.get("experience", []) or []:
        if not isinstance(exp, dict):
            continue
        experience.append(ExperienceItem(
            title=exp.get("title") or "",
            company=exp.get("company") or "",
            location=exp.get("location") or "",
            duration=exp.get("duration") or "",
            description=[b.get("text") or b.get("original_bullet") or str(b)
                         for b in (exp.get("bullets") or [])
                         if isinstance(b, dict)],
        ))

    education = []
    for edu in parsed.get("education", []) or []:
        if isinstance(edu, str):
            education.append(EducationItem(degree=edu, institution=""))
        elif isinstance(edu, dict):
            education.append(EducationItem(
                degree=edu.get("degree") or edu.get("title") or "",
                institution=edu.get("institution") or "",
                year=edu.get("year") or "",
            ))

    version_number = version.get("version_number") or 1
    payload = ResumeCreateRequest(
        title=f"Tailored Resume v{version_number}",
        target_role=parsed.get("target_role") or "Software Engineer",
        summary=parsed.get("summary") or "",
        skills=[str(s) for s in (parsed.get("skills") or [])],
        experience=experience,
        education=education,
        user_id=user_id,
        parsed_data=parsed,
    )

    created = await create_resume_record(payload, user_id=user_id)
    return {
        "success": True,
        "resume_id": created.get("resume_id"),
        "builder_url": f"/builder?id={created.get('resume_id')}",
    }

@router.post("/jd/ingest")
async def ingest_jd(req: JDIngestRequest, user_id: str = Depends(_get_user_id)):
    """Ingest a JD from URL, text, or PDF."""
    from app.agents.jd_intel import jd_intel_agent
    if not jd_intel_agent:
        raise HTTPException(status_code=503, detail="JD Intel agent not initialized")

    result = await jd_intel_agent.ingest(req.source, req.source_type, user_id)
    if result["status"] == "error":
        raise HTTPException(status_code=400, detail=result["message"])
    return result


@router.post("/jd/analyze")
async def analyze_jd_vs_resume(
    resume_id: str,
    jd_text: str,
    user_id: str = Depends(_get_user_id),
):
    """Compare resume against JD for skill gaps."""
    from app.agents.resume_intel import resume_intel_agent
    from app.agents.jd_intel import jd_intel_agent

    if not resume_intel_agent or not jd_intel_agent:
        raise HTTPException(status_code=503, detail="Agents not initialized")

    resume_result = await resume_intel_agent.get_resume_context(user_id, resume_id)
    if resume_result["status"] == "error":
        raise HTTPException(status_code=404, detail="Resume not found")

    jd_result = await jd_intel_agent.ingest(jd_text, "text")
    if jd_result["status"] == "error":
        raise HTTPException(status_code=400, detail="Failed to parse JD")

    comparison = await jd_intel_agent.compare_resume_jd(
        resume_result.get("parsed_data", {}),
        jd_result.get("data", {}),
    )
    return comparison


# ── ATS Intelligence ────────────────────────────────────────────────────────

@router.post("/ats/analyze")
async def analyze_ats(req: ATSAnalysisRequest, user_id: str = Depends(_get_user_id)):
    """Run ATS compatibility analysis on a resume."""
    from app.agents.resume_intel import resume_intel_agent
    from app.agents.ats_intel import ats_intel_agent
    from app.agents.jd_intel import jd_intel_agent

    if not resume_intel_agent or not ats_intel_agent:
        raise HTTPException(status_code=503, detail="Agents not initialized")

    resume_data = None
    resume_id = req.resume_id
    if req.version_id:
        # Analyze a specific tailored version (merged with source sections).
        from app.agents.tools.resume_tools import get_resume_version, merge_source_sections_into_version
        version = await get_resume_version(req.version_id, user_id)
        if not version:
            raise HTTPException(status_code=404, detail="Version not found")
        await merge_source_sections_into_version(version, user_id)
        resume_data = version.get("parsed_data", {})
        resume_id = version.get("resume_id") or req.resume_id

    if resume_data is None:
        if not req.resume_id:
            raise HTTPException(status_code=400, detail="resume_id or version_id required")
        resume_result = await resume_intel_agent.get_resume_context(user_id, req.resume_id)
        if resume_result["status"] == "error":
            raise HTTPException(status_code=404, detail="Resume not found")
        resume_data = resume_result.get("parsed_data", {})

    jd_data = None
    if req.jd_text:
        jd_result = await jd_intel_agent.ingest(req.jd_text, "text")
        if jd_result["status"] == "success":
            jd_data = jd_result.get("data")

    result = await ats_intel_agent.analyze(
        resume_data=resume_data,
        jd_data=jd_data,
    )
    result["resume_id"] = resume_id
    # Normalize to the dashboard score-breakdown shape the frontend consumes.
    result["score"] = round(result.get("ats_score", 0) or 0)
    result["atsScore"] = round(result.get("deterministic_score", 0) or 0)
    llm = result.get("llm_analysis") or {}
    result["keywordScore"] = round(min(100, result.get("score", 0)))
    result["readabilityScore"] = round(min(100, result.get("deterministic_score", 0) or 0))
    result["weaknesses"] = [
        r for r in (result.get("recommendations") or [])
        if r.startswith("[HIGH]") or r.startswith("[MEDIUM]") or r.startswith("Missing")
    ] or (["Missing standard section headers. Use 'Work Experience', 'Education', 'Skills'."] if result.get("score", 0) < 60 else [])
    result["recommendations"] = result.get("recommendations") or llm.get("missing_keywords", [])
    result["suggestedRoles"] = []
    return result


# ── Interview ───────────────────────────────────────────────────────────────

@router.post("/interview/start")
async def start_interview(req: InterviewStartRequest, user_id: str = Depends(_get_user_id)):
    """Start a mock interview session."""
    from app.agents.resume_intel import resume_intel_agent
    from app.agents.interview import interview_agent
    from app.agents.jd_intel import jd_intel_agent

    if not interview_agent:
        raise HTTPException(status_code=503, detail="Interview agent not initialized")

    resume_result = await resume_intel_agent.get_resume_context(user_id, req.resume_id)
    if resume_result["status"] == "error":
        raise HTTPException(status_code=404, detail="Resume not found")

    jd_data = None
    if req.jd_text:
        jd_result = await jd_intel_agent.ingest(req.jd_text, "text")
        if jd_result["status"] == "success":
            jd_data = jd_result.get("data")

    result = await interview_agent.start_interview(
        user_id=user_id,
        resume_data=resume_result.get("parsed_data", {}),
        jd_data=jd_data,
        interview_type=req.interview_type,
        num_questions=req.num_questions,
    )
    return result


@router.post("/interview/answer")
async def answer_interview(req: InterviewAnswerRequest, user_id: str = Depends(_get_user_id)):
    """Submit an answer to the current interview question."""
    from app.agents.interview import interview_agent
    if not interview_agent:
        raise HTTPException(status_code=503, detail="Interview agent not initialized")

    result = await interview_agent.answer(req.session_id, req.answer)
    if result["status"] == "error":
        raise HTTPException(status_code=400, detail=result["message"])
    return result


@router.get("/interview/{session_id}/status")
async def interview_status(session_id: str, user_id: str = Depends(_get_user_id)):
    """Get current interview status."""
    from app.agents.interview import interview_agent
    if not interview_agent:
        raise HTTPException(status_code=503, detail="Interview agent not initialized")

    result = await interview_agent.get_status(session_id)
    if result["status"] == "error":
        raise HTTPException(status_code=404, detail=result["message"])
    return result


# ── Learning Roadmap ────────────────────────────────────────────────────────

@router.post("/roadmap")
async def generate_roadmap(req: RoadmapRequest, user_id: str = Depends(_get_user_id)):
    """Generate a personalized learning roadmap."""
    from app.agents.resume_intel import resume_intel_agent
    from app.agents.learning_roadmap import learning_roadmap_agent
    from app.agents.jd_intel import jd_intel_agent
    from app.agents.memory import memory_agent

    if not learning_roadmap_agent:
        raise HTTPException(status_code=503, detail="Learning Roadmap agent not initialized")

    resume_result = await resume_intel_agent.get_resume_context(user_id, req.resume_id)
    if resume_result["status"] == "error":
        raise HTTPException(status_code=404, detail="Resume not found")

    jd_data = None
    if req.jd_text:
        jd_result = await jd_intel_agent.ingest(req.jd_text, "text")
        if jd_result["status"] == "success":
            jd_data = jd_result.get("data")

    career_goals = None
    if memory_agent:
        career_context = await memory_agent.get_career_context(user_id)
        career_goals = career_context.get("career_goals", [{}])[0] if career_context.get("career_goals") else None

    result = await learning_roadmap_agent.generate(
        user_id=user_id,
        resume_data=resume_result.get("parsed_data", {}),
        jd_data=jd_data,
        career_goals=career_goals,
    )
    return result


# ── Career Coach ────────────────────────────────────────────────────────────

@router.post("/coach")
async def career_coach(req: CoachRequest, user_id: str = Depends(_get_user_id)):
    """Get personalized career coaching advice."""
    from app.agents.resume_intel import resume_intel_agent
    from app.agents.career_coach import career_coach_agent
    from app.agents.jd_intel import jd_intel_agent
    from app.agents.memory import memory_agent

    if not career_coach_agent:
        raise HTTPException(status_code=503, detail="Career Coach agent not initialized")

    resume_data = {}
    if req.resume_id:
        resume_result = await resume_intel_agent.get_resume_context(user_id, req.resume_id)
        if resume_result["status"] == "success":
            resume_data = resume_result.get("parsed_data", {})

    jd_data = None
    if req.jd_text:
        jd_result = await jd_intel_agent.ingest(req.jd_text, "text")
        if jd_result["status"] == "success":
            jd_data = jd_result.get("data")

    career_context = None
    if memory_agent:
        career_context = await memory_agent.get_career_context(user_id)

    result = await career_coach_agent.advise(
        user_id=user_id,
        resume_data=resume_data,
        career_context=career_context,
        jd_data=jd_data,
    )
    return result
