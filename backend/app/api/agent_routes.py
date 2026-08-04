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

from fastapi import APIRouter, Depends, HTTPException, Request
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
    resume_id: str
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

async def _get_user_id(request: Request) -> str:
    """Extract user_id from the request (reuses existing auth middleware)."""
    user = getattr(request.state, "user", None)
    if not user or not user.get("id"):
        raise HTTPException(status_code=401, detail="Unauthorized")
    return user["id"]


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
    return result


# ── JD Intelligence ─────────────────────────────────────────────────────────

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

    resume_result = await resume_intel_agent.get_resume_context(user_id, req.resume_id)
    if resume_result["status"] == "error":
        raise HTTPException(status_code=404, detail="Resume not found")

    jd_data = None
    if req.jd_text:
        jd_result = await jd_intel_agent.ingest(req.jd_text, "text")
        if jd_result["status"] == "success":
            jd_data = jd_result.get("data")

    result = await ats_intel_agent.analyze(
        resume_data=resume_result.get("parsed_data", {}),
        jd_data=jd_data,
    )
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
