from fastapi import APIRouter, HTTPException, Body, UploadFile, File
from pydantic import BaseModel
from fastapi.responses import StreamingResponse
from app.services.ai_service import ai_service
from app.services.resume_service import resume_service
from app.services.job_portal_service import job_portal_service
from typing import List, Dict, Any, Optional
import logging
import json
import asyncio

resume_router = APIRouter()
logger = logging.getLogger("resumatch-api.endpoints")

from app.db import persist_pipeline_results

@resume_router.post("/tailor")
async def tailor_resume(payload: Dict[str, Any] = Body(...)):
    """
    Re-analyzes and re-matches based on user personalization (role, exp, location)
    """
    resume_id = payload.get("resumeId")
    user_id = payload.get("userId") or "guest"
    preferences = payload.get("preferences", {})
    parsed_data = payload.get("parsedData")
    
    if not preferences or not parsed_data:
        raise HTTPException(status_code=400, detail="Preferences and parsed data are required")
        
    logger.info(f"Tailoring results for Resume: {resume_id}, Role: {preferences.get('targetRole')}")
    
    try:
        # Define roles for matching
        target_role = preferences.get("targetRole", "Software Engineer")
        roles = [target_role]
        
        # 1 & 2. Run Analysis and Matching IN PARALLEL for max speed
        filters = {
            "domain": target_role,
            "experience_level": preferences.get("experienceLevel"),
            "location": preferences.get("location"),
            "work_mode": preferences.get("workMode"),
            "days_old": preferences.get("daysOld", 25)
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
async def generate_cover_letter(payload: Dict[str, Any] = Body(...)):
    """Generate a tailored cover letter using AI."""
    resume_data = payload.get("resume") or payload.get("resumeData")
    job_role = payload.get("jobRole") or payload.get("job_role", "Software Engineer")
    
    if not resume_data:
        raise HTTPException(status_code=400, detail="Resume data is required")
    
    try:
        content = await ai_service.generate_cover_letter(resume_data, job_role)
        return {"success": True, "content": content}
    except Exception as e:
        logger.error(f"Cover letter generation failed: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@resume_router.get("/domains")
async def get_domains(q: str = ""):
    """Returns distinct domains from the job_postings table for autocomplete."""
    from app.db import engine
    from sqlalchemy import text
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

@resume_router.get("/locations")
async def get_locations(q: str = ""):
    """Returns distinct locations from the job_postings table for autocomplete."""
    from app.db import engine
    from sqlalchemy import text
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

async def process_resume_stream_generator(content: bytes, filename: str, user_id: str, resume_id: str):
    """
    Yields progress events and persists the final result.
    """
    logger.info(f"Starting stream processing for file: {filename}")
    try:
        # 1. Extraction
        yield f"data: {json.dumps({'step': 'parsing', 'status': 'loading', 'label': 'Parsing resume structure'})}\n\n"
        text = await resume_service.extract_text(content, filename)
        yield f"data: {json.dumps({'step': 'parsing', 'status': 'done', 'label': 'Parsing resume structure'})}\n\n"

        # 2. Parsing (Flash)
        yield f"data: {json.dumps({'step': 'ats', 'status': 'loading', 'label': 'Checking ATS compatibility'})}\n\n"
        parsed_data = await ai_service.parse_resume(text)
        yield f"data: {json.dumps({'step': 'ats', 'status': 'done', 'label': 'Checking ATS compatibility'})}\n\n"

        # 3. Analysis & Matching (PARALLEL)
        yield f"data: {json.dumps({'step': 'skills', 'status': 'loading', 'label': 'Extracted keywords & finding matches'})}\n\n"
        
        # Run everything in parallel
        roles = ["Software Engineer"] # Default
        if hasattr(parsed_data, 'get'): 
            roles = [parsed_data.get('targetRole') or 'Software Engineer']
            
        analysis_task = ai_service.analyze_resume(parsed_data)
        matches_task = ai_service.generate_job_matches(parsed_data, roles, filters={"days_old": 25})
        
        # Start both, but yield heartbeats while waiting (Every 5 seconds)
        yield f"data: {json.dumps({'type': 'ping'})}\n\n"
        
        # Wait for tasks with a simplified heartbeat loop
        pending = {asyncio.create_task(analysis_task), asyncio.create_task(matches_task)}
        analysis, matches = None, None
        
        while pending:
            done, pending = await asyncio.wait(pending, timeout=5.0)
            if not done: # Timeout reached, send ping to keep connection alive
                yield f"data: {json.dumps({'type': 'ping'})}\n\n"
                continue
                
            for task in done:
                res = task.result()
                if isinstance(res, dict) and "score" in res:
                    analysis = res
                else:
                    matches = res

        yield f"data: {json.dumps({'step': 'skills', 'status': 'done', 'label': 'Analysis complete'})}\n\n"
        yield f"data: {json.dumps({'step': 'suggestions', 'status': 'done', 'label': 'Suggestions generated'})}\n\n"
        
        # 4. Enrichment
        for match in matches:
            if isinstance(match, dict):
                match["apply_links"] = job_portal_service.generate_links(
                    match.get("role", "Software Engineer"), 
                    parsed_data.get("skills", []),
                    "India"
                )
        yield f"data: {json.dumps({'step': 'matching', 'status': 'done', 'label': 'Matches found'})}\n\n"

        # 6. New: Persistence
        if resume_id and resume_id != "guest":
            final_data_struct = {
                "parsed_data": parsed_data,
                "analysis": analysis,
                "matches": matches,
                "raw_text": text
            }
            persist_pipeline_results(user_id, resume_id, final_data_struct)
            logger.info(f"Persisted stream results for {resume_id}")

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
async def save_analysis(payload: Dict[str, Any] = Body(...)):
    """
    Persists pre-existing analysis data to the database.
    Used for migrating guest analysis results to a user account.
    """
    user_id = payload.get("userId")
    resume_id = payload.get("resumeId")
    data = payload.get("data")

    if not user_id or not resume_id or not data:
        raise HTTPException(status_code=400, detail="Missing userId, resumeId, or data")

    try:
        success = persist_pipeline_results(user_id, resume_id, data)
        if not success:
            raise HTTPException(status_code=500, detail="Persistence failed")
        return {"success": True}
    except Exception as e:
        logger.error(f"Save analysis failed: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

class RewriteBulletRequest(BaseModel):
    bullet: str
    targetRole: Optional[str] = "Software Engineer"

@resume_router.post("/rewrite-bullet")
async def rewrite_bullet(request: RewriteBulletRequest):
    """Rewrites a single resume bullet point for higher impact."""
    if not request.bullet.strip():
        raise HTTPException(status_code=400, detail="Bullet text cannot be empty")
        
    try:
        optimized = await ai_service.rewrite_bullet_point(request.bullet, request.targetRole)
        logger.info(f"AI Rewriting: '{request.bullet[:50]}...' -> '{optimized[:50]}...'")
        return {"success": True, "optimized": optimized}
    except Exception as e:
        logger.error(f"Bullet rewrite failed: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@resume_router.post("/process-stream")
async def process_resume_stream(
    file: UploadFile = File(...),
    user_id: str = "guest",
    resume_id: str = "guest"
):
    content = await file.read()
    return StreamingResponse(
        process_resume_stream_generator(content, file.filename, user_id, resume_id),
        media_type="text/event-stream"
    )

@resume_router.post("/process")
async def process_resume(
    file: UploadFile = File(...),
    user_id: str = "guest",
    resume_id: str = "guest"
):
    """
    Production-grade pipeline: Extract -> Parse -> Match -> Save
    """
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
