import json
import logging
import asyncio
import time
from typing import Dict, List, Optional

from sqlalchemy import text

from app.db import engine, execute_vector_search
from app.services.ai_gateway import AgentTool
from app.services.nvidia_service import nvidia_service

logger = logging.getLogger("resumatch-api.chat_tools")

# ── OpenTelemetry (graceful degradation if not installed) ─────────────────────
try:
    from opentelemetry import trace
    from opentelemetry.trace import Status, StatusCode
    _tracer = trace.get_tracer("resumatch.chat_tools")
    _OTEL_ENABLED = True
except Exception:
    _OTEL_ENABLED = False
    _tracer = None  # type: ignore


class _NullSpan:
    """No-op span when OTel is not available."""
    def set_attribute(self, *a): pass
    def record_exception(self, *a): pass
    def set_status(self, *a): pass
    def __enter__(self): return self
    def __exit__(self, *_): pass


def _span(name: str):
    """Returns a real span context manager or a no-op."""
    if _OTEL_ENABLED and _tracer:
        return _tracer.start_as_current_span(name)
    return _NullSpan()


SEARCH_JOBS_PARAMETERS = {
    "type": "object",
    "properties": {
        "query": {
            "type": "string",
            "description": "Natural language description of the job (e.g. 'Software Engineer python').",
        },
        "location": {
            "type": "string",
            "description": "Optional location filter (e.g. 'Remote', 'London', 'Bangalore').",
        },
        "experience_level": {
            "type": "string",
            "enum": ["Entry Level", "Mid Level", "Senior"],
            "description": "Optional experience level filter.",
        },
    },
    "required": ["query"],
}


def _build_search_jobs(user_id: str):
    async def search_jobs(query: str, location: str = None, experience_level: str = None) -> str:
        """Searches the job database for positions matching the user's query."""
        start = time.monotonic()
        logger.info(
            "TOOL_CALL_START | tool=search_jobs user=%s query=%r location=%s exp=%s",
            user_id, query, location, experience_level
        )
        with _span("chat_tool.search_jobs") as span:
            span.set_attribute("tool.name", "search_jobs")
            span.set_attribute("tool.user_id", user_id)
            span.set_attribute("tool.query", query or "")
            if location: span.set_attribute("tool.location", location)
            if experience_level: span.set_attribute("tool.experience_level", experience_level)
            try:
                embedding = await nvidia_service.generate_embedding(query)
                filters = {}
                if location: filters["location"] = location
                if experience_level: filters["experience_level"] = experience_level

                # execute_vector_search is synchronous — run in thread pool
                loop = asyncio.get_event_loop()
                candidates = await loop.run_in_executor(
                    None, execute_vector_search, embedding, 5, filters
                )

                latency = (time.monotonic() - start) * 1000
                logger.info(
                    "TOOL_CALL_SUCCESS | tool=search_jobs user=%s results=%d latency_ms=%.1f",
                    user_id, len(candidates), latency
                )
                span.set_attribute("tool.result_count", len(candidates))

                if not candidates:
                    return json.dumps({"status": "no_results", "message": "No jobs found matching those criteria."})

                results = [
                    {
                        "title": c.get("title"),
                        "company": c.get("company"),
                        "location": c.get("location"),
                        "salary_range": c.get("salary_range"),
                        "apply_url": c.get("apply_url"),
                    }
                    for c in candidates
                ]
                return json.dumps({"status": "success", "count": len(results), "jobs": results})

            except Exception as e:
                latency = (time.monotonic() - start) * 1000
                logger.error(
                    "TOOL_CALL_ERROR | tool=search_jobs user=%s latency_ms=%.1f error=%s",
                    user_id, latency, str(e), exc_info=True
                )
                span.record_exception(e)
                if _OTEL_ENABLED:
                    span.set_status(Status(StatusCode.ERROR, str(e)))
                return json.dumps({"status": "error", "message": str(e)})

    return search_jobs


def _build_fetch_user_resume(user_id: str):
    async def fetch_user_resume() -> str:
        """Fetches the user's latest parsed resume data (skills, experience, education)."""
        start = time.monotonic()
        logger.info("TOOL_CALL_START | tool=fetch_user_resume user=%s", user_id)
        with _span("chat_tool.fetch_user_resume") as span:
            span.set_attribute("tool.name", "fetch_user_resume")
            span.set_attribute("tool.user_id", user_id)
            try:
                def _fetch():
                    with engine.connect() as conn:
                        return conn.execute(
                            text(
                                "SELECT id, title, status, parsed_data, raw_text, updated_at FROM resumes "
                                "WHERE user_id = :uid "
                                "ORDER BY updated_at DESC LIMIT 1"
                            ),
                            {"uid": user_id}
                        ).fetchone()

                loop = asyncio.get_event_loop()
                row = await loop.run_in_executor(None, _fetch)

                latency = (time.monotonic() - start) * 1000
                if not row:
                    logger.warning(
                        "TOOL_CALL_NO_RESUME | tool=fetch_user_resume user=%s latency_ms=%.1f",
                        user_id, latency
                    )
                    return json.dumps({
                        "status": "error",
                        "message": "No resume found for this user."
                    })

                data = None
                if row.parsed_data:
                    data = row.parsed_data if isinstance(row.parsed_data, dict) else json.loads(row.parsed_data)

                if not data:
                    return json.dumps({
                        "status": "partial",
                        "message": "Found the latest resume, but parsing is not complete yet.",
                        "data": {
                            "resumeId": str(row.id),
                            "title": row.title,
                            "status": row.status,
                            "rawText": (row.raw_text or "")[:5000]
                        }
                    })
                logger.info(
                    "TOOL_CALL_SUCCESS | tool=fetch_user_resume user=%s skills=%d latency_ms=%.1f",
                    user_id, len(data.get("skills", [])), latency
                )
                span.set_attribute("tool.skills_count", len(data.get("skills", [])))

                # Return pruned version to keep token count low
                pruned = {
                    "fullName": data.get("fullName") or data.get("full_name"),
                    "targetRole": data.get("targetRole") or data.get("target_role"),
                    "summary": data.get("summary"),
                    "skills": data.get("skills", [])[:20],
                    "experience": [
                        {
                            "title": e.get("title"), "company": e.get("company"),
                            "description": (e.get("description") or [])[:3]
                        }
                        for e in data.get("experience", [])[:3]
                    ],
                    "education": data.get("education", [])[:2],
                }
                return json.dumps({
                    "status": "success",
                    "data": pruned,
                    "meta": {
                        "resumeId": str(row.id),
                        "title": row.title,
                        "status": row.status,
                        "updatedAt": row.updated_at.isoformat() if row.updated_at else None,
                    }
                })

            except Exception as e:
                latency = (time.monotonic() - start) * 1000
                logger.error(
                    "TOOL_CALL_ERROR | tool=fetch_user_resume user=%s latency_ms=%.1f error=%s",
                    user_id, latency, str(e), exc_info=True
                )
                span.record_exception(e)
                if _OTEL_ENABLED:
                    span.set_status(Status(StatusCode.ERROR, str(e)))
                return json.dumps({"status": "error", "message": str(e)})

    return fetch_user_resume


# ── New Agent Tool Builders ──────────────────────────────────────────────────

def _build_analyze_jd(user_id: str):
    async def analyze_jd(jd_text: str) -> str:
        """Analyzes a job description and extracts structured data."""
        start = time.monotonic()
        logger.info("TOOL_CALL_START | tool=analyze_jd user=%s", user_id)
        with _span("chat_tool.analyze_jd") as span:
            span.set_attribute("tool.name", "analyze_jd")
            span.set_attribute("tool.user_id", user_id)
            try:
                from app.agents.jd_intel import jd_intel_agent
                if not jd_intel_agent:
                    return json.dumps({"status": "error", "message": "JD Intel agent not available"})

                result = await jd_intel_agent.ingest(jd_text, "text", user_id)
                latency = (time.monotonic() - start) * 1000
                logger.info("TOOL_CALL_SUCCESS | tool=analyze_jd user=%s latency_ms=%.1f", user_id, latency)
                return json.dumps(result)
            except Exception as e:
                latency = (time.monotonic() - start) * 1000
                logger.error("TOOL_CALL_ERROR | tool=analyze_jd user=%s latency_ms=%.1f error=%s", user_id, latency, str(e))
                span.record_exception(e)
                return json.dumps({"status": "error", "message": str(e)})
    return analyze_jd


def _build_compare_resume_jd(user_id: str):
    async def compare_resume_jd(jd_text: str) -> str:
        """Compares resume against JD for skill gaps."""
        start = time.monotonic()
        logger.info("TOOL_CALL_START | tool=compare_resume_jd user=%s", user_id)
        with _span("chat_tool.compare_resume_jd") as span:
            span.set_attribute("tool.name", "compare_resume_jd")
            span.set_attribute("tool.user_id", user_id)
            try:
                from app.agents.jd_intel import jd_intel_agent
                from app.db import engine
                from sqlalchemy import text

                # Get resume data
                with engine.connect() as conn:
                    row = conn.execute(
                        text("SELECT parsed_data FROM resumes WHERE user_id = :uid ORDER BY updated_at DESC LIMIT 1"),
                        {"uid": user_id},
                    ).fetchone()

                if not row or not row.parsed_data:
                    return json.dumps({"status": "error", "message": "No resume found"})

                resume_data = row.parsed_data if isinstance(row.parsed_data, dict) else json.loads(row.parsed_data)

                # Parse JD
                if not jd_intel_agent:
                    return json.dumps({"status": "error", "message": "JD Intel agent not available"})

                jd_result = await jd_intel_agent.ingest(jd_text, "text", user_id)
                if jd_result["status"] == "error":
                    return json.dumps(jd_result)

                # Compare
                comparison = await jd_intel_agent.compare_resume_jd(resume_data, jd_result.get("data", {}))
                latency = (time.monotonic() - start) * 1000
                logger.info("TOOL_CALL_SUCCESS | tool=compare_resume_jd user=%s match=%.1f latency_ms=%.1f", user_id, comparison.get("match_score", 0), latency)
                return json.dumps({"status": "success", **comparison})
            except Exception as e:
                latency = (time.monotonic() - start) * 1000
                logger.error("TOOL_CALL_ERROR | tool=compare_resume_jd user=%s latency_ms=%.1f error=%s", user_id, latency, str(e))
                span.record_exception(e)
                return json.dumps({"status": "error", "message": str(e)})
    return compare_resume_jd


def _build_tailor_resume(user_id: str, selected_resume_id: Optional[str] = None):
    async def tailor_resume(jd_text: str) -> str:
        """Tailors resume against a specific JD."""
        start = time.monotonic()
        logger.info("TOOL_CALL_START | tool=tailor_resume user=%s", user_id)
        with _span("chat_tool.tailor_resume") as span:
            span.set_attribute("tool.name", "tailor_resume")
            span.set_attribute("tool.user_id", user_id)
            try:
                import hashlib
                from app.agents.resume_intel import resume_intel_agent
                from app.agents.resume_tailor import resume_tailor_agent
                from app.agents.jd_intel import jd_intel_agent

                if not resume_tailor_agent or not jd_intel_agent:
                    return json.dumps({"status": "error", "message": "Agents not available"})

                # Get resume (respect the resume the user selected in the UI)
                resume_result = await resume_intel_agent.get_resume_context(user_id, selected_resume_id)
                if resume_result["status"] == "error":
                    # Fall back to the latest resume if the selected one no longer exists.
                    resume_result = await resume_intel_agent.get_resume_context(user_id)
                if resume_result["status"] == "error":
                    return json.dumps(resume_result)

                # Parse JD
                jd_result = await jd_intel_agent.ingest(jd_text, "text", user_id)
                if jd_result["status"] == "error":
                    return json.dumps(jd_result)

                jd_hash = hashlib.sha256(jd_text.encode()).hexdigest()[:16]

                # Tailor
                result = await resume_tailor_agent.tailor(
                    user_id=user_id,
                    resume_id=resume_result.get("resume_id", ""),
                    resume_data=resume_result.get("parsed_data", {}),
                    jd_data=jd_result.get("data", {}),
                    jd_hash=jd_hash,
                )

                latency = (time.monotonic() - start) * 1000
                logger.info("TOOL_CALL_SUCCESS | tool=tailor_resume user=%s cached=%s latency_ms=%.1f", user_id, result.get("cached", False), latency)
                return json.dumps(result)
            except Exception as e:
                latency = (time.monotonic() - start) * 1000
                logger.error("TOOL_CALL_ERROR | tool=tailor_resume user=%s latency_ms=%.1f error=%s", user_id, latency, str(e))
                span.record_exception(e)
                return json.dumps({"status": "error", "message": str(e)})
    return tailor_resume


def _build_analyze_ats(user_id: str):
    async def analyze_ats(jd_text: str = None) -> str:
        """Runs ATS compatibility analysis."""
        start = time.monotonic()
        logger.info("TOOL_CALL_START | tool=analyze_ats user=%s", user_id)
        with _span("chat_tool.analyze_ats") as span:
            span.set_attribute("tool.name", "analyze_ats")
            span.set_attribute("tool.user_id", user_id)
            try:
                from app.agents.resume_intel import resume_intel_agent
                from app.agents.ats_intel import ats_intel_agent
                from app.agents.jd_intel import jd_intel_agent

                if not resume_intel_agent or not ats_intel_agent:
                    return json.dumps({"status": "error", "message": "Agents not available"})

                resume_result = await resume_intel_agent.get_resume_context(user_id)
                if resume_result["status"] == "error":
                    return json.dumps(resume_result)

                jd_data = None
                if jd_text and jd_intel_agent:
                    jd_result = await jd_intel_agent.ingest(jd_text, "text")
                    if jd_result["status"] == "success":
                        jd_data = jd_result.get("data")

                result = await ats_intel_agent.analyze(
                    resume_data=resume_result.get("parsed_data", {}),
                    jd_data=jd_data,
                )

                latency = (time.monotonic() - start) * 1000
                logger.info("TOOL_CALL_SUCCESS | tool=analyze_ats user=%s score=%.1f latency_ms=%.1f", user_id, result.get("ats_score", 0), latency)
                return json.dumps(result)
            except Exception as e:
                latency = (time.monotonic() - start) * 1000
                logger.error("TOOL_CALL_ERROR | tool=analyze_ats user=%s latency_ms=%.1f error=%s", user_id, latency, str(e))
                span.record_exception(e)
                return json.dumps({"status": "error", "message": str(e)})
    return analyze_ats


def _build_start_interview(user_id: str):
    async def start_interview(interview_type: str = "mixed", num_questions: int = 5) -> str:
        """Starts a mock interview session."""
        start = time.monotonic()
        logger.info("TOOL_CALL_START | tool=start_interview user=%s type=%s", user_id, interview_type)
        with _span("chat_tool.start_interview") as span:
            span.set_attribute("tool.name", "start_interview")
            span.set_attribute("tool.user_id", user_id)
            try:
                from app.agents.resume_intel import resume_intel_agent
                from app.agents.interview import interview_agent

                if not interview_agent:
                    return json.dumps({"status": "error", "message": "Interview agent not available"})

                resume_result = await resume_intel_agent.get_resume_context(user_id)
                if resume_result["status"] == "error":
                    return json.dumps(resume_result)

                result = await interview_agent.start_interview(
                    user_id=user_id,
                    resume_data=resume_result.get("parsed_data", {}),
                    interview_type=interview_type,
                    num_questions=num_questions,
                )

                latency = (time.monotonic() - start) * 1000
                logger.info("TOOL_CALL_SUCCESS | tool=start_interview user=%s session=%s latency_ms=%.1f", user_id, result.get("session_id"), latency)
                return json.dumps(result)
            except Exception as e:
                latency = (time.monotonic() - start) * 1000
                logger.error("TOOL_CALL_ERROR | tool=start_interview user=%s latency_ms=%.1f error=%s", user_id, latency, str(e))
                span.record_exception(e)
                return json.dumps({"status": "error", "message": str(e)})
    return start_interview


def _build_answer_interview(user_id: str):
    async def answer_interview(session_id: str, answer: str) -> str:
        """Submits an answer to the current interview question."""
        start = time.monotonic()
        logger.info("TOOL_CALL_START | tool=answer_interview user=%s session=%s", user_id, session_id)
        with _span("chat_tool.answer_interview") as span:
            span.set_attribute("tool.name", "answer_interview")
            span.set_attribute("tool.user_id", user_id)
            try:
                from app.agents.interview import interview_agent

                if not interview_agent:
                    return json.dumps({"status": "error", "message": "Interview agent not available"})

                result = await interview_agent.answer(session_id, answer)
                latency = (time.monotonic() - start) * 1000
                logger.info("TOOL_CALL_SUCCESS | tool=answer_interview user=%s completed=%s latency_ms=%.1f", user_id, result.get("completed", False), latency)
                return json.dumps(result)
            except Exception as e:
                latency = (time.monotonic() - start) * 1000
                logger.error("TOOL_CALL_ERROR | tool=answer_interview user=%s latency_ms=%.1f error=%s", user_id, latency, str(e))
                span.record_exception(e)
                return json.dumps({"status": "error", "message": str(e)})
    return answer_interview


def _build_generate_roadmap(user_id: str):
    async def generate_roadmap(target_role: str = None) -> str:
        """Generates a personalized learning roadmap."""
        start = time.monotonic()
        logger.info("TOOL_CALL_START | tool=generate_roadmap user=%s", user_id)
        with _span("chat_tool.generate_roadmap") as span:
            span.set_attribute("tool.name", "generate_roadmap")
            span.set_attribute("tool.user_id", user_id)
            try:
                from app.agents.resume_intel import resume_intel_agent
                from app.agents.learning_roadmap import learning_roadmap_agent

                if not learning_roadmap_agent:
                    return json.dumps({"status": "error", "message": "Learning Roadmap agent not available"})

                resume_result = await resume_intel_agent.get_resume_context(user_id)
                if resume_result["status"] == "error":
                    return json.dumps(resume_result)

                result = await learning_roadmap_agent.generate(
                    user_id=user_id,
                    resume_data=resume_result.get("parsed_data", {}),
                )

                latency = (time.monotonic() - start) * 1000
                logger.info("TOOL_CALL_SUCCESS | tool=generate_roadmap user=%s latency_ms=%.1f", user_id, latency)
                return json.dumps(result)
            except Exception as e:
                latency = (time.monotonic() - start) * 1000
                logger.error("TOOL_CALL_ERROR | tool=generate_roadmap user=%s latency_ms=%.1f error=%s", user_id, latency, str(e))
                span.record_exception(e)
                return json.dumps({"status": "error", "message": str(e)})
    return generate_roadmap


def _build_get_career_advice(user_id: str):
    async def get_career_advice(focus_area: str = None) -> str:
        """Gets personalized career coaching advice."""
        start = time.monotonic()
        logger.info("TOOL_CALL_START | tool=get_career_advice user=%s", user_id)
        with _span("chat_tool.get_career_advice") as span:
            span.set_attribute("tool.name", "get_career_advice")
            span.set_attribute("tool.user_id", user_id)
            try:
                from app.agents.resume_intel import resume_intel_agent
                from app.agents.career_coach import career_coach_agent
                from app.agents.memory import memory_agent

                if not career_coach_agent:
                    return json.dumps({"status": "error", "message": "Career Coach agent not available"})

                resume_result = await resume_intel_agent.get_resume_context(user_id)
                resume_data = resume_result.get("parsed_data", {}) if resume_result["status"] == "success" else {}

                career_context = None
                if memory_agent:
                    career_context = await memory_agent.get_career_context(user_id)

                result = await career_coach_agent.advise(
                    user_id=user_id,
                    resume_data=resume_data,
                    career_context=career_context,
                )

                latency = (time.monotonic() - start) * 1000
                logger.info("TOOL_CALL_SUCCESS | tool=get_career_advice user=%s latency_ms=%.1f", user_id, latency)
                return json.dumps(result)
            except Exception as e:
                latency = (time.monotonic() - start) * 1000
                logger.error("TOOL_CALL_ERROR | tool=get_career_advice user=%s latency_ms=%.1f error=%s", user_id, latency, str(e))
                span.record_exception(e)
                return json.dumps({"status": "error", "message": str(e)})
    return get_career_advice


def build_agent_tools(user_id: str, allowed_tool_names: Optional[List[str]] = None, selected_resume_id: Optional[str] = None) -> List[AgentTool]:
    """
    Factory that injects user context into typed tool closures.

    The returned tools are filterable by the agent's `tool_names` so each agent
    only exposes the capabilities it is allowed to invoke.
    """
    tools: Dict[str, AgentTool] = {
        "search_jobs": AgentTool(
            name="search_jobs",
            description=(
                "Searches the job database for positions matching the user's query, "
                "optionally filtered by location and experience level."
            ),
            parameters=SEARCH_JOBS_PARAMETERS,
            function=_build_search_jobs(user_id),
        ),
        "fetch_user_resume": AgentTool(
            name="fetch_user_resume",
            description=(
                "Fetches the user's latest parsed resume data (skills, experience, education). "
                "Use this to personalize job recommendations or answer questions about their background."
            ),
            parameters={"type": "object", "properties": {}},
            function=_build_fetch_user_resume(user_id),
        ),
        # ── New Agent Tools ──────────────────────────────────────────────────
        "analyze_jd": AgentTool(
            name="analyze_jd",
            description=(
                "Analyzes a job description and extracts structured data: skills, stack, "
                "responsibilities, experience level, salary, location."
            ),
            parameters={
                "type": "object",
                "properties": {
                    "jd_text": {
                        "type": "string",
                        "description": "The job description text to analyze.",
                    },
                },
                "required": ["jd_text"],
            },
            function=_build_analyze_jd(user_id),
        ),
        "compare_resume_jd": AgentTool(
            name="compare_resume_jd",
            description=(
                "Compares the user's resume against a job description to identify "
                "skill gaps, matched skills, and alignment score."
            ),
            parameters={
                "type": "object",
                "properties": {
                    "jd_text": {
                        "type": "string",
                        "description": "The job description text to compare against.",
                    },
                },
                "required": ["jd_text"],
            },
            function=_build_compare_resume_jd(user_id),
        ),
        "tailor_resume": AgentTool(
            name="tailor_resume",
            description=(
                "Tailors the user's resume to better match a specific job description. "
                "Generates a new downloadable tailored version (DOCX) with change reasons "
                "for each modification. Pass the full job description text as jd_text."
            ),
            parameters={
                "type": "object",
                "properties": {
                    "jd_text": {
                        "type": "string",
                        "description": "The job description to tailor the resume for.",
                    },
                },
                "required": ["jd_text"],
            },
            function=_build_tailor_resume(user_id, selected_resume_id),
        ),
        "analyze_ats": AgentTool(
            name="analyze_ats",
            description=(
                "Runs ATS (Applicant Tracking System) compatibility analysis on the user's resume. "
                "Returns score, issues, and recommendations."
            ),
            parameters={
                "type": "object",
                "properties": {
                    "jd_text": {
                        "type": "string",
                        "description": "Optional job description for keyword analysis.",
                    },
                },
            },
            function=_build_analyze_ats(user_id),
        ),
        "start_interview": AgentTool(
            name="start_interview",
            description=(
                "Starts a mock interview session. Returns the first question."
            ),
            parameters={
                "type": "object",
                "properties": {
                    "interview_type": {
                        "type": "string",
                        "enum": ["technical", "behavioral", "mixed"],
                        "description": "Type of interview to conduct.",
                    },
                    "num_questions": {
                        "type": "integer",
                        "description": "Number of questions to ask (default: 5).",
                    },
                },
            },
            function=_build_start_interview(user_id),
        ),
        "answer_interview": AgentTool(
            name="answer_interview",
            description=(
                "Submits an answer to the current interview question."
            ),
            parameters={
                "type": "object",
                "properties": {
                    "session_id": {
                        "type": "string",
                        "description": "The interview session ID.",
                    },
                    "answer": {
                        "type": "string",
                        "description": "The answer to the current question.",
                    },
                },
                "required": ["session_id", "answer"],
            },
            function=_build_answer_interview(user_id),
        ),
        "generate_roadmap": AgentTool(
            name="generate_roadmap",
            description=(
                "Generates a personalized learning roadmap based on skill gaps "
                "and target role requirements."
            ),
            parameters={
                "type": "object",
                "properties": {
                    "target_role": {
                        "type": "string",
                        "description": "The target role for the learning roadmap.",
                    },
                },
            },
            function=_build_generate_roadmap(user_id),
        ),
        "get_career_advice": AgentTool(
            name="get_career_advice",
            description=(
                "Gets personalized career coaching advice based on resume, "
                "career goals, and market conditions."
            ),
            parameters={
                "type": "object",
                "properties": {
                    "focus_area": {
                        "type": "string",
                        "description": "Specific area to focus on (e.g., 'interview prep', 'skill gaps', 'career transition').",
                    },
                },
            },
            function=_build_get_career_advice(user_id),
        ),
    }

    if allowed_tool_names:
        return [tools[name] for name in allowed_tool_names if name in tools]
    return list(tools.values())
