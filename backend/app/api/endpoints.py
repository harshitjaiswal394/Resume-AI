from fastapi import APIRouter, HTTPException, Body, UploadFile, File, Request, Header
from pydantic import BaseModel, Field
from fastapi.responses import StreamingResponse
from app.services.ai_service import ai_service
from app.services.resume_service import resume_service
from app.services.job_portal_service import job_portal_service
from app.api.deps import get_client_ip
from app.security import rate_limiter
from typing import List, Dict, Any, Optional
import logging
import json
import asyncio
import os
import re
from pathlib import Path

resume_router = APIRouter()
logger = logging.getLogger("resumatch-api.endpoints")

from app.db import persist_pipeline_results, execute_vector_search, execute_keyword_search

# ── Upload / payload validation limits ───────────────────────────────────────
MAX_UPLOAD_MB = int(os.getenv("MAX_UPLOAD_MB", "10"))
MAX_UPLOAD_BYTES = MAX_UPLOAD_MB * 1024 * 1024
ALLOWED_UPLOAD_EXTENSIONS = {".pdf", ".docx", ".doc", ".txt"}
ALLOWED_UPLOAD_MIME = {
    "application/pdf",
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "text/plain",
    "application/octet-stream",  # browsers often send this for docx/pdf
    "application/x-pdf",
    "text/markdown",
}
MAX_AI_PAYLOAD_BYTES = int(os.getenv("MAX_AI_PAYLOAD_BYTES", str(2 * 1024 * 1024)))  # 2 MB
MAX_QUERY_LEN = 100


def _validate_upload(file: UploadFile) -> bytes:
    """Reject unsupported/oversized/empty uploads before any processing."""
    if not file.filename:
        raise HTTPException(status_code=400, detail="Missing filename")
    ext = Path(file.filename).suffix.lower()
    if ext not in ALLOWED_UPLOAD_EXTENSIONS:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported file type '{ext or 'unknown'}'. Allowed: {', '.join(sorted(ALLOWED_UPLOAD_EXTENSIONS))}",
        )
    if file.content_type and file.content_type not in ALLOWED_UPLOAD_MIME:
        raise HTTPException(
            status_code=400,
            detail=f"Unexpected content type '{file.content_type}'",
        )
    content = file.file.read(MAX_UPLOAD_BYTES + 1)
    if len(content) > MAX_UPLOAD_BYTES:
        raise HTTPException(
            status_code=413,
            detail=f"File too large. Maximum allowed size is {MAX_UPLOAD_MB} MB",
        )
    if not content.strip():
        raise HTTPException(status_code=400, detail="Uploaded file is empty")
    return content


def _validate_payload_bytes(payload: Dict[str, Any]) -> None:
    """Reject oversized AI request bodies (parsedData / prompts)."""
    size = len(json.dumps(payload, default=str))
    if size > MAX_AI_PAYLOAD_BYTES:
        raise HTTPException(
            status_code=413,
            detail=f"Request body too large ({size} bytes). Maximum allowed is {MAX_AI_PAYLOAD_BYTES} bytes",
        )


def _clean_query(q: str) -> str:
    """Normalize autocomplete queries to prevent abuse / query bloat."""
    cleaned = (q or "").strip()[:MAX_QUERY_LEN]
    if not re.fullmatch(r"[A-Za-z0-9 ._\-/+,&()]*", cleaned):
        raise HTTPException(status_code=400, detail="Invalid query characters")
    return cleaned


async def _optional_user_id(authorization: Optional[str]) -> Optional[str]:
    """Resolve user id from a Bearer token if present and valid, else None.

    Lets authenticated callers be identified (and their body-supplied user_id
    overridden) without breaking the guest landing-page flow, which sends no
    token at all.
    """
    if not authorization or not authorization.startswith("Bearer "):
        return None
    from app.services.auth_service import auth_service
    result = await auth_service.get_user(authorization.replace("Bearer ", ""))
    if result.get("success"):
        return result["user"]["id"]
    return None


async def _enforce_rate_limit(request: Request, user_id: Optional[str]) -> None:
    ip = await get_client_ip(request)
    # Guests share a tighter per-IP bucket so anonymous AI usage cannot be
    # abused for DoS / model-cost burning without an account.
    is_guest = user_id in (None, "guest", "")
    resource = "ai_request"
    if is_guest:
        resource = "ai_request_guest"
    result = rate_limiter.check(
        resource,
        user_id=None if is_guest else user_id,
        ip=ip,
    )
    if not result.allowed:
        logger.warning(
            "RATE_LIMITED | endpoint=%s user=%s ip=%s",
            request.url.path, user_id, ip,
        )
        raise HTTPException(status_code=429, detail="Rate limit exceeded. Please try again shortly.")

@resume_router.post("/tailor")
async def tailor_resume(payload: Dict[str, Any] = Body(...), request: Request = None, authorization: Optional[str] = Header(None)):
    """
    Re-analyzes and re-matches based on user personalization (role, exp, location)
    """
    resume_id = payload.get("resumeId")
    authed_user_id = await _optional_user_id(authorization)
    user_id = payload.get("userId") or "guest"
    if authed_user_id:
        user_id = authed_user_id
    preferences = payload.get("preferences", {})
    parsed_data = payload.get("parsedData")
    # Optional: the analysis already produced for this resume (e.g. the guest run).
    # When present we skip the expensive re-analysis and only refresh matches.
    existing_analysis = payload.get("existingAnalysis")
    existing_raw_text = payload.get("existingRawText") or ""

    _validate_payload_bytes(payload)

    if not preferences or not parsed_data:
        raise HTTPException(status_code=400, detail="Preferences and parsed data are required")

    await _enforce_rate_limit(request, user_id)

    target_role = preferences.get("target_role") or preferences.get("targetRole") or "Software Engineer"
    logger.info(f"Tailoring results for Resume: {resume_id}, Role: {target_role}")
    
    try:
        # Define roles for matching
        roles = [target_role]

        filters = {
            "domain": target_role,
            "experience_level": preferences.get("experience_level") or preferences.get("experienceLevel"),
            "location": preferences.get("location"),
            "work_mode": preferences.get("work_mode") or preferences.get("workMode"),
            "days_old": preferences.get("days_old") or preferences.get("daysOld") or 25
        }

        matches_task = asyncio.ensure_future(ai_service.generate_job_matches(parsed_data, roles, filters=filters))

        if existing_analysis and isinstance(existing_analysis, dict):
            logger.info(f"Reusing existing analysis (skipping expensive re-analysis) for Resume: {resume_id}")
            analysis = existing_analysis
            matches = await matches_task
        else:
            logger.info(f"Triggering parallel AI pipeline for Resume: {resume_id}")
            analysis_task = asyncio.ensure_future(ai_service.analyze_resume(parsed_data))
            # Await both simultaneously
            analysis, matches = await asyncio.gather(analysis_task, matches_task)
        
        # Determine plan-based limit
        match_limit = 15
        if user_id != "guest":
            try:
                from app.db import engine
                with engine.connect() as conn:
                    from sqlalchemy import text
                    user_plan = conn.execute(text("SELECT plan FROM users WHERE id = :uid"), {"uid": user_id}).scalar()
                    match_limit = 50 if user_plan == 'pro' else 15
            except:
                pass # Fallback to 15
        
        # 3. Consolidate persistence
        if resume_id and resume_id != "guest":
            persist_pipeline_results(user_id, resume_id, {
                "parsed_data": parsed_data,
                "analysis": analysis,
                "matches": matches,
                "raw_text": existing_raw_text
            })

        return {
            "success": True,
            "data": {
                "analysis": analysis,
                "matches": matches[:match_limit]
            }
        }
    except Exception as e:
        logger.error(f"Tailoring failed: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@resume_router.post("/cover-letter")
async def generate_cover_letter(payload: Dict[str, Any] = Body(...), request: Request = None, authorization: Optional[str] = Header(None)):
    """Generate a tailored cover letter using AI."""
    resume_data = payload.get("resume") or payload.get("resumeData")
    job_role = payload.get("jobRole") or payload.get("job_role", "Software Engineer")
    authed_user_id = await _optional_user_id(authorization)
    
    _validate_payload_bytes(payload)

    if not resume_data:
        raise HTTPException(status_code=400, detail="Resume data is required")

    await _enforce_rate_limit(request, authed_user_id)
    
    try:
        content = await ai_service.generate_cover_letter(resume_data, job_role)
        return {"success": True, "content": content}
    except Exception as e:
        logger.error(f"Cover letter generation failed: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@resume_router.post("/referral")
async def generate_referral_message(payload: Dict[str, Any] = Body(...), request: Request = None, authorization: Optional[str] = Header(None)):
    """Generate a personalized referral request message (LinkedIn DM / email)."""
    resume_data = payload.get("resume") or payload.get("resumeData") or {}
    referral_details = payload.get("referralDetails") or {}
    authed_user_id = await _optional_user_id(authorization)

    _validate_payload_bytes(payload)

    if not referral_details.get("targetRole") and not referral_details.get("targetCompany"):
        raise HTTPException(status_code=400, detail="Target role or company is required")

    await _enforce_rate_limit(request, authed_user_id)

    try:
        content = await ai_service.generate_referral_message(resume_data, referral_details)
        return {"success": True, "content": content}
    except Exception as e:
        logger.error(f"Referral generation failed: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))

@resume_router.get("/domains")
async def get_domains(q: str = ""):
    """Returns distinct domains from the job_postings table for autocomplete."""
    from app.db import engine
    from sqlalchemy import text
    q = _clean_query(q)
    try:
        with engine.connect() as conn:
            if q:
                result = conn.execute(
                    text("SELECT DISTINCT domain FROM job_postings WHERE domain ILIKE :q ORDER BY domain LIMIT 20"),
                    {"q": f"%{q}%"}
                )
            else:
                result = conn.execute(
                    text("SELECT DISTINCT domain FROM job_postings ORDER BY domain LIMIT 50")
                )
            return {"domains": [row[0] for row in result if row[0]]}
    except Exception as e:
        logger.error(f"Failed to fetch domains: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail="Failed to fetch domains")

@resume_router.get("/locations")
async def get_locations(q: str = ""):
    """Returns distinct locations from the job_postings table for autocomplete."""
    from app.db import engine
    from sqlalchemy import text
    q = _clean_query(q)
    try:
        with engine.connect() as conn:
            if q:
                result = conn.execute(
                    text("SELECT DISTINCT location FROM job_postings WHERE location ILIKE :q ORDER BY location LIMIT 20"),
                    {"q": f"%{q}%"}
                )
            else:
                result = conn.execute(
                    text("SELECT DISTINCT location FROM job_postings ORDER BY location LIMIT 50")
                )
            return {"locations": [row[0] for row in result if row[0]]}
    except Exception as e:
        logger.error(f"Failed to fetch locations: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail="Failed to fetch locations")

@resume_router.get("/search-jobs")
async def search_jobs(
    q: str = "",
    location: str = "",
    work_mode: str = "",
    experience_level: str = "",
    days_old: int = 30,
    salary_min: float = 0,
    limit: int = 20,
    offset: int = 0,
):
    """
    Search and filter live job postings with pagination.
    When a query text is provided the results are ranked by embedding similarity
    (falling back to keyword matching if the embedding service is unavailable).
    """
    from app.db import engine
    q = (q or "").strip()[:MAX_QUERY_LEN]
    limit = max(1, min(int(limit), 50))
    offset = max(0, int(offset))
    # 0 = "any time"; avoid the 25-day default by using a far window.
    days = max(1, min(int(days_old), 3650)) if days_old else 3650

    filters = {
        "q": q,
        "location": (location or "").strip() or None,
        "work_mode": (work_mode or "").strip() or None,
        "experience_level": (experience_level or "").strip() or None,
        "days_old": days,
        "salary_min": float(salary_min) if salary_min else None,
    }

    jobs = []
    total = 0
    used_ai = False

    if q:
        try:
            from app.services.nvidia_service import nvidia_service
            # Only Vertex embeddings match the stored job vectors (gemini-2048).
            # NVIDIA/nemotron vectors are a different space and would rank
            # garbage; when Vertex isn't ready we go straight to keyword search.
            if nvidia_service.vertex_embedding_ready():
                embedding = await nvidia_service.generate_embedding(q)
                if (
                    embedding and any(v != 0.0 for v in embedding)
                    and nvidia_service.last_embedding_provider == "vertex"
                ):
                    results = execute_vector_search(embedding, limit=limit, filters=filters, offset=offset, with_total=True)
                    if results:
                        total = results[0].get("total", 0)
                        for j in results:
                            j.pop("total", None)
                            try:
                                j["similarity"] = float(j.get("similarity", 0))
                            except (TypeError, ValueError):
                                j["similarity"] = 0.0
                        jobs = results
                        used_ai = True
                else:
                    logger.info("Search skipped vector ranking: provider=%s (Vertex ready but embedding unavailable)",
                                nvidia_service.last_embedding_provider)
            else:
                logger.info("Search skipped vector ranking: Vertex not ready")
        except Exception as e:
            logger.warning(f"Vector search failed, falling back to keyword search: {str(e)}")

    if not jobs:
        jobs, total = execute_keyword_search(filters, limit=limit, offset=offset)

    # Enrich postings without a direct apply URL with portal search links.
    for job in jobs:
        if isinstance(job, dict) and not job.get("apply_url"):
            job["apply_links"] = job_portal_service.generate_links(
                job.get("title") or job.get("domain") or "Software Engineer",
                job.get("skills") or [],
                job.get("location") or "India",
            )

    return {
        "success": True,
        "data": {
            "jobs": jobs,
            "total": total,
            "limit": limit,
            "offset": offset,
            "ai_ranked": used_ai,
        },
    }

async def process_resume_stream_generator(content: bytes, filename: str, user_id: str, resume_id: str):
    """
    Yields progress events and persists the final result.
    Heartbeats ('ping') are emitted during long AI calls so the stream stays
    alive through the nginx gateway's proxy_read_timeout (60s default).
    """
    logger.info(f"Starting stream processing for file: {filename}")
    try:
        # 1. Extraction
        yield f"data: {json.dumps({'step': 'parsing', 'status': 'loading', 'label': 'Parsing resume structure'})}\n\n"
        text = await resume_service.extract_text(content, filename)
        yield f"data: {json.dumps({'step': 'parsing', 'status': 'done', 'label': 'Parsing resume structure'})}\n\n"

        # 2. Parsing (Flash) - LLM can take 60s+; keep stream alive with pings
        yield f"data: {json.dumps({'step': 'ats', 'status': 'loading', 'label': 'Checking ATS compatibility'})}\n\n"
        parse_task = asyncio.ensure_future(ai_service.parse_resume(text))
        try:
            while True:
                done, _ = await asyncio.wait({parse_task}, timeout=20.0)
                if done:
                    parsed_data = parse_task.result()
                    break
                yield f"data: {json.dumps({'type': 'ping'})}\n\n"
        except asyncio.CancelledError:
            parse_task.cancel()
            raise
        yield f"data: {json.dumps({'step': 'ats', 'status': 'done', 'label': 'Checking ATS compatibility'})}\n\n"

        # 3. Analysis & Matching (PARALLEL) - heartbeats while tasks are still running
        yield f"data: {json.dumps({'step': 'skills', 'status': 'loading', 'label': 'Extracted keywords & finding matches'})}\n\n"
        
        # Standardize roles
        roles = ["Software Engineer"]
        if hasattr(parsed_data, 'get'):
            roles = [parsed_data.get('target_role') or parsed_data.get('targetRole') or 'Software Engineer']
            
        analysis_task = asyncio.ensure_future(ai_service.analyze_resume(parsed_data))
        matches_task = asyncio.ensure_future(ai_service.generate_job_matches(parsed_data, roles, filters={"days_old": 25}))
        
        # Wait for both tasks securely, pinging while anything is still pending
        analysis = None
        matches = None
        try:
            pending = {analysis_task, matches_task}
            while pending:
                done, pending = await asyncio.wait(pending, timeout=20.0)
                for task in done:
                    if task is analysis_task:
                        analysis = task.result()
                    else:
                        matches = task.result()
                if pending:
                    yield f"data: {json.dumps({'type': 'ping'})}\n\n"
        except Exception as e:
            logger.error(f"AI Pipeline error: {str(e)}")
            analysis = analysis or {"score": 75, "resume_score": 75}
            matches = matches or []

        yield f"data: {json.dumps({'step': 'skills', 'status': 'done', 'label': 'Analysis complete'})}\n\n"
        yield f"data: {json.dumps({'step': 'suggestions', 'status': 'done', 'label': 'Suggestions generated'})}\n\n"
        
        # 4. Enrichment
        for match in (matches or []):
            if isinstance(match, dict):
                match["apply_links"] = job_portal_service.generate_links(
                    match.get("role", "Software Engineer"), 
                    parsed_data.get("skills", []) if hasattr(parsed_data, 'get') else [],
                    "India"
                )
        yield f"data: {json.dumps({'step': 'matching', 'status': 'done', 'label': 'Matches found'})}\n\n"

        # 6. Persistence (Only for registered users)
        if user_id and user_id != "guest" and resume_id and resume_id != "guest":
            try:
                final_data_struct = {
                    "parsed_data": parsed_data,
                    "analysis": analysis,
                    "matches": matches,
                    "raw_text": text
                }
                persist_pipeline_results(user_id, resume_id, final_data_struct)
                logger.info(f"Persisted stream results for {resume_id}")
            except Exception as pe:
                logger.error(f"Persistence failed (non-critical): {str(pe)}")

        # 7. Final Result
        final_data = {
            "step": "final",
            "success": True,
            "data": {
                "parsed_data": parsed_data,
                "analysis": analysis,
                "matches": matches,
                "raw_text": text
            }
        }
        yield f"data: {json.dumps(final_data)}\n\n"

    except Exception as e:
        logger.error(f"Stream error: {str(e)}")
        yield f"data: {json.dumps({'success': False, 'error': str(e)})}\n\n"

@resume_router.post("/save-analysis")
async def save_analysis(payload: Dict[str, Any] = Body(...), request: Request = None, authorization: Optional[str] = Header(None)):
    """
    Persists pre-existing analysis data to the database.
    Used for migrating guest analysis results to a user account.
    """
    user_id = payload.get("userId")
    resume_id = payload.get("resumeId")
    data = payload.get("data")

    if not user_id or not resume_id or not data:
        raise HTTPException(status_code=400, detail="Missing userId, resumeId, or data")

    _validate_payload_bytes(payload)

    authed_user_id = await _optional_user_id(authorization)
    if authed_user_id:
        user_id = authed_user_id

    await _enforce_rate_limit(request, user_id)

    # IDOR guard: when authenticated, only allow writing to resumes owned by the
    # calling user. (Guest flow is trusted for the landing-page migration.)
    if authed_user_id:
        try:
            from app.db import engine
            from sqlalchemy import text as _text
            with engine.connect() as conn:
                owner = conn.execute(
                    _text("SELECT user_id FROM resumes WHERE id = :rid"),
                    {"rid": resume_id},
                ).scalar()
            if owner and owner != user_id:
                logger.warning("IDOR_BLOCKED | user=%s tried to save analysis for resume=%s (owner=%s)", user_id, resume_id, owner)
                raise HTTPException(status_code=403, detail="Forbidden: resume does not belong to this user")
        except HTTPException:
            raise
        except Exception as e:
            logger.warning(f"Ownership check failed (continuing as best-effort): {str(e)}")

    try:
        success = persist_pipeline_results(user_id, resume_id, data)
        if not success:
            raise HTTPException(status_code=500, detail="Persistence failed")
        return {"success": True}
    except Exception as e:
        logger.error(f"Save analysis failed: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))

class RewriteBulletRequest(BaseModel):
    bullet: str
    target_role: Optional[str] = Field("Software Engineer", alias="targetRole")

@resume_router.post("/rewrite-bullet")
async def rewrite_bullet(request: RewriteBulletRequest, req: Request = None, authorization: Optional[str] = Header(None)):
    """Rewrites a single resume bullet point for higher impact."""
    if not request.bullet.strip():
        raise HTTPException(status_code=400, detail="Bullet text cannot be empty")

    authed_user_id = await _optional_user_id(authorization)
    await _enforce_rate_limit(req, authed_user_id)
        
    try:
        optimized = await ai_service.rewrite_bullet_point(request.bullet, request.target_role)
        logger.info(f"AI Rewriting: '{request.bullet[:50]}...' -> '{optimized[:50]}...'")
        return {"success": True, "optimized": optimized}
    except Exception as e:
        logger.error(f"Bullet rewrite failed: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))

@resume_router.post("/process-stream")
async def process_resume_stream(
    file: UploadFile = File(...),
    user_id: str = "guest",
    resume_id: str = "guest",
    request: Request = None,
    authorization: Optional[str] = Header(None),
):
    authed_user_id = await _optional_user_id(authorization)
    if authed_user_id:
        user_id = authed_user_id
    await _enforce_rate_limit(request, user_id)
    content = _validate_upload(file)
    return StreamingResponse(
        process_resume_stream_generator(content, file.filename, user_id, resume_id),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
            "Connection": "keep-alive",
        }
    )

@resume_router.post("/process")
async def process_resume(
    file: UploadFile = File(...),
    user_id: str = "guest",
    resume_id: str = "guest",
    request: Request = None,
    authorization: Optional[str] = Header(None),
):
    """
    Production-grade pipeline: Extract -> Parse -> Match -> Save
    """
    authed_user_id = await _optional_user_id(authorization)
    if authed_user_id:
        user_id = authed_user_id
    await _enforce_rate_limit(request, user_id)
    try:
        content = _validate_upload(file)
        text = await resume_service.extract_text(content, file.filename)
        parsed_data = await ai_service.parse_resume(text)
        analysis = await ai_service.analyze_resume(parsed_data)
        
        if not isinstance(analysis, dict):
            analysis = {"score": 0, "suggestedRoles": ["Software Engineer"], "insights": {}}
            
        roles = analysis.get("suggestedRoles", ["Software Engineer"])
        
        # Build basic filters from parsed resume data for relevance
        initial_filters = {
            "domain": roles[0] if roles else "Software Engineer",
            "days_old": 25
        }
        matches = await ai_service.generate_job_matches(parsed_data, roles, filters=initial_filters)
        
        for match in matches:
            if isinstance(match, dict):
                match["apply_links"] = job_portal_service.generate_links(
                    match.get("role", "Software Engineer"), 
                    parsed_data.get("skills", []) if isinstance(parsed_data, dict) else [],
                    "India"
                )

        # Persistence
        if resume_id and resume_id != "guest":
            persist_pipeline_results(user_id, resume_id, {
                "parsed_data": parsed_data,
                "analysis": analysis,
                "matches": matches,
                "raw_text": text
            })

        return {
            "success": True,
            "filename": file.filename,
            "data": {
                "parsed_data": parsed_data,
                "analysis": analysis,
                "matches": matches,
                "raw_text": text
            }
        }
    except Exception as e:
        logger.error(f"Pipeline error: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))
