import json
import logging
import asyncio
import time
from sqlalchemy import text
from app.db import engine, execute_vector_search
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


def build_agent_tools(user_id: str):
    """
    Factory to inject user context into tool closures.
    Each tool is a typed async function exposed to Gemini's function-calling interface.
    """

    async def search_jobs(query: str, location: str = None, experience_level: str = None) -> str:
        """
        Searches the job database for positions matching the user's query.
        Args:
            query: Natural language description of the job (e.g. 'Software Engineer python').
            location: Optional location filter (e.g. 'Remote', 'London').
            experience_level: Optional experience level ('Entry Level', 'Mid Level', 'Senior').
        """
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

    async def fetch_user_resume() -> str:
        """
        Fetches the user's latest parsed resume data (skills, experience, education).
        Use this to personalize job recommendations or answer questions about their background.
        """
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

    return [search_jobs, fetch_user_resume]
