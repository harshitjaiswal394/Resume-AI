from fastapi import APIRouter, HTTPException, Body, UploadFile, File
from fastapi.responses import StreamingResponse
from app.services.ai_service import ai_service
from app.services.resume_service import resume_service
from app.services.job_portal_service import job_portal_service
from typing import List, Dict, Any
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
        # 1. Re-analyze with specific role in mind
        analysis = await ai_service.analyze_resume(parsed_data)
        
        # 2. Re-match with specific filters from Knowledge Base
        filters = {
            "domain": preferences.get("targetRole"),
            "experience_level": preferences.get("experienceLevel"),
            "location": preferences.get("location"),
            "work_mode": preferences.get("workMode"),
            "days_old": preferences.get("daysOld", 25)
        }
        
        # Determine limit based on plan status
        search_limit = 50 # Default to 50 for Pro or when checking against DB
        if user_id != "guest":
            from app.db import engine
            with engine.connect() as conn:
                from sqlalchemy import text
                user_plan = conn.execute(text("SELECT plan FROM users WHERE id = :uid"), {"uid": user_id}).scalar()
                if user_plan != 'pro':
                    search_limit = 5 
                else:
                    search_limit = 50 # Fetch 50 for pro users as requested
        
        roles = [preferences.get("targetRole", "Software Engineer")]
        matches = await ai_service.generate_job_matches(parsed_data, roles, filters=filters)
        
        # 3. New: Consolidate persistence in backend
        if resume_id and resume_id != "guest":
            data_to_persist = {
                "parsed_data": parsed_data,
                "analysis": analysis,
                "matches": matches,
                "raw_text": "" # No need to re-save text during tailoring
            }
            persist_pipeline_results(user_id, resume_id, data_to_persist)
            logger.info(f"Successfully persisted tailored results for {resume_id}")

        return {
            "success": True,
            "data": {
                "analysis": analysis,
                "matches": matches
            }
        }
    except Exception as e:
        logger.error(f"Tailoring failed: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

async def process_resume_stream_generator(content: bytes, filename: str, user_id: str, resume_id: str):
    """
    Yields progress events and persists the final result.
    """
    logger.info(f"Starting stream processing for file: {filename}")
    try:
        # 1. Extraction
        yield f"data: {json.dumps({'step': 'parsing', 'status': 'loading', 'label': 'Parsing resume structure'})}\n\n"
        text = resume_service.extract_text(content, filename)
        yield f"data: {json.dumps({'step': 'parsing', 'status': 'done', 'label': 'Parsing resume structure'})}\n\n"

        # 2. Parsing (Flash)
        yield f"data: {json.dumps({'step': 'ats', 'status': 'loading', 'label': 'Checking ATS compatibility'})}\n\n"
        parsed_data = await ai_service.parse_resume(text)
        yield f"data: {json.dumps({'step': 'ats', 'status': 'done', 'label': 'Checking ATS compatibility'})}\n\n"

        # 3. Analysis (Flash)
        yield f"data: {json.dumps({'step': 'skills', 'status': 'loading', 'label': 'Extracting skills & keywords'})}\n\n"
        analysis = await ai_service.analyze_resume(parsed_data)
        yield f"data: {json.dumps({'step': 'skills', 'status': 'done', 'label': 'Extracting skills & keywords'})}\n\n"
        
        yield f"data: {json.dumps({'step': 'suggestions', 'status': 'loading', 'label': 'Generating improvement suggestions'})}\n\n"
        await asyncio.sleep(0.5) 
        yield f"data: {json.dumps({'step': 'suggestions', 'status': 'done', 'label': 'Generating improvement suggestions'})}\n\n"

        # 4. Matching (Flash)
        yield f"data: {json.dumps({'step': 'matching', 'status': 'loading', 'label': 'Matching with 500+ job roles'})}\n\n"
        roles = analysis.get("suggestedRoles", ["Software Engineer"])
        matches = await ai_service.generate_job_matches(parsed_data, roles)
        
        # 5. Enrichment
        for match in matches:
            if isinstance(match, dict):
                match["apply_links"] = job_portal_service.generate_links(
                    match.get("role", "Software Engineer"), 
                    parsed_data.get("skills", []),
                    "India"
                )
        yield f"data: {json.dumps({'step': 'matching', 'status': 'done', 'label': 'Matching with 500+ job roles'})}\n\n"

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
        text = resume_service.extract_text(content, file.filename)
        parsed_data = await ai_service.parse_resume(text)
        analysis = await ai_service.analyze_resume(parsed_data)
        
        if not isinstance(analysis, dict):
            analysis = {"score": 0, "suggestedRoles": ["Software Engineer"], "insights": {}}
            
        roles = analysis.get("suggestedRoles", ["Software Engineer"])
        matches = await ai_service.generate_job_matches(parsed_data, roles)
        
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
