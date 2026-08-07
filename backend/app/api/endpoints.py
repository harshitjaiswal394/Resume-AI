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

resume_router = APIRouter()
logger = logging.getLogger("resumatch-api.endpoints")

from app.db import persist_pipeline_results


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
    result = rate_limiter.check(
        "ai_request",
        user_id=None if user_id in (None, "guest") else user_id,
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
    
    if not preferences or not parsed_data:
        raise HTTPException(status_code=400, detail="Preferences and parsed data are required")

    await _enforce_rate_limit(request, user_id)

    target_role = preferences.get("target_role") or preferences.get("targetRole") or "Software Engineer"
    logger.info(f"Tailoring results for Resume: {resume_id}, Role: {target_role}")
    
    try:
        # Define roles for matching
        roles = [target_role]
        
        # 1 & 2. Run Analysis and Matching IN PARALLEL for max speed
        filters = {
            "domain": target_role,
            "experience_level": preferences.get("experience_level") or preferences.get("experienceLevel"),
            "location": preferences.get("location"),
            "work_mode": preferences.get("work_mode") or preferences.get("workMode"),
            "days_old": preferences.get("days_old") or preferences.get("daysOld") or 25
        }
        
        logger.info(f"Triggering parallel AI pipeline for Resume: {resume_id}")
        analysis_task = ai_service.analyze_resume(parsed_data)
        matches_task = ai_service.generate_job_matches(parsed_data, roles, filters=filters)
        
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
                "raw_text": ""
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
    
    if not resume_data:
        raise HTTPException(status_code=400, detail="Resume data is required")

    await _enforce_rate_limit(request, authed_user_id)
    
    try:
        content = await ai_service.generate_cover_letter(resume_data, job_role)
        return {"success": True, "content": content}
    except Exception as e:
        logger.error(f"Cover letter generation failed: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))

@resume_router.get("/domains")
async def get_domains(q: str = ""):
    """Returns distinct domains from the job_postings table for autocomplete."""
    from app.db import engine
    from sqlalchemy import text
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

    authed_user_id = await _optional_user_id(authorization)
    if authed_user_id:
        user_id = authed_user_id

    await _enforce_rate_limit(request, user_id)

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
    content = await file.read()
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
        content = await file.read()
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
