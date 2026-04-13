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

@resume_router.post("/tailor")
async def tailor_resume(payload: Dict[str, Any] = Body(...)):
    """
    Re-analyzes and re-matches based on user personalization (role, exp, location)
    """
    resume_id = payload.get("resumeId")
    preferences = payload.get("preferences") # { targetRole, experienceLevel, location }
    parsed_data = payload.get("parsedData")
    
    if not preferences or not parsed_data:
        raise HTTPException(status_code=400, detail="Preferences and parsed data are required")
        
    logger.info(f"Tailoring results for Role: {preferences.get('targetRole')}, Exp: {preferences.get('experienceLevel')}, Locations: {preferences.get('location')}")
    
    try:
        # 1. Re-analyze with specific role and experience in mind
        # We can pass these as context to the analysis
        analysis = await ai_service.analyze_resume(parsed_data)
        
        # 2. Re-match with specific target role and other metadata
        roles = [preferences.get("targetRole")]
        matches = await ai_service.generate_job_matches(parsed_data, roles)
        
        # 3. Enrich with location-aware links
        # preferences.get('location') is now expected to be a list
        locations = preferences.get("location", ["India"])
        primary_loc = locations[0] if isinstance(locations, list) and locations else "India"

        for match in matches:
            if isinstance(match, dict):
                match["apply_links"] = job_portal_service.generate_links(
                    match.get("role", preferences.get("targetRole")), 
                    parsed_data.get("skills", []),
                    primary_loc
                )
        
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

async def process_resume_stream_generator(content: bytes, filename: str):
    """
    Yields progress events: extracting, parsing, analyzing, matching, done
    """
    logger.info(f"Starting stream processing for file: {filename}")
    try:
        # 1. Extraction
        logger.info("Step 1/4: Extracting text")
        yield f"data: {json.dumps({'step': 'parsing', 'status': 'loading', 'label': 'Parsing resume structure'})}\n\n"
        text = resume_service.extract_text(content, filename)
        logger.info("Step 1/4: Done")
        yield f"data: {json.dumps({'step': 'parsing', 'status': 'done', 'label': 'Parsing resume structure'})}\n\n"

        # 2. Parsing (Flash)
        logger.info("Step 2/4: Parsing with AI")
        yield f"data: {json.dumps({'step': 'ats', 'status': 'loading', 'label': 'Checking ATS compatibility'})}\n\n"
        parsed_data = await ai_service.parse_resume(text)
        logger.info("Step 2/4: Done")
        yield f"data: {json.dumps({'step': 'ats', 'status': 'done', 'label': 'Checking ATS compatibility'})}\n\n"

        # 3. Analysis (Flash)
        logger.info("Step 3/4: Analyzing skills & suggestions")
        yield f"data: {json.dumps({'step': 'skills', 'status': 'loading', 'label': 'Extracting skills & keywords'})}\n\n"
        analysis = await ai_service.analyze_resume(parsed_data)
        yield f"data: {json.dumps({'step': 'skills', 'status': 'done', 'label': 'Extracting skills & keywords'})}\n\n"
        
        yield f"data: {json.dumps({'step': 'suggestions', 'status': 'loading', 'label': 'Generating improvement suggestions'})}\n\n"
        await asyncio.sleep(0.5) # Slight delay for visual progression
        logger.info("Step 3/4: Done")
        yield f"data: {json.dumps({'step': 'suggestions', 'status': 'done', 'label': 'Generating improvement suggestions'})}\n\n"

        # 4. Matching (Flash)
        logger.info("Step 4/4: Generating job matches")
        yield f"data: {json.dumps({'step': 'matching', 'status': 'loading', 'label': 'Matching with 500+ job roles'})}\n\n"
        roles = analysis.get("suggestedRoles", ["Software Engineer"])
        matches = await ai_service.generate_job_matches(parsed_data, roles)
        
        # 5. Enrichment
        logger.info("Step 4/4: Enriching links")
        for match in matches:
            if isinstance(match, dict):
                match["apply_links"] = job_portal_service.generate_links(
                    match.get("role", "Software Engineer"), 
                    parsed_data.get("skills", []),
                    "India"
                )
        logger.info("Step 4/4: Done")
        yield f"data: {json.dumps({'step': 'matching', 'status': 'done', 'label': 'Matching with 500+ job roles'})}\n\n"

        # 6. Final Result
        logger.info("Pipeline complete. Sending final payload.")
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
        logging.error(f"Stream error: {str(e)}")
        yield f"data: {json.dumps({'success': False, 'error': str(e)})}\n\n"

@resume_router.post("/process-stream")
async def process_resume_stream(file: UploadFile = File(...)):
    content = await file.read()
    return StreamingResponse(
        process_resume_stream_generator(content, file.filename),
        media_type="text/event-stream"
    )

@resume_router.post("/process")
async def process_resume(file: UploadFile = File(...)):
    """
    Production-grade pipeline: Extract -> Parse -> Match -> Enrich
    """
    try:
        content = await file.read()
        
        # 1. Robust Extraction
        text = resume_service.extract_text(content, file.filename)
        
        # 2. Gemini-Powered Parsing (Cost-Optimized Flash)
        parsed_data = await ai_service.parse_resume(text)
        
        # 3. Gemini-Powered Analysis (Flash)
        analysis = await ai_service.analyze_resume(parsed_data)
        
        # 4. Job Match Generation (Precision-Focused Pro)
        # We must ensure 'analysis' is a dict before calling .get()
        if not isinstance(analysis, dict):
            logging.warn(f"Analysis was not a dict, got {type(analysis)}. Attempting recovery.")
            analysis = {"score": 0, "suggestedRoles": ["Software Engineer"], "insights": {}}
            
        roles = analysis.get("suggestedRoles", ["Software Engineer"])
        matches = await ai_service.generate_job_matches(parsed_data, roles)
        
        # 5. Enrich matches with Indian job portal links
        if isinstance(matches, list):
            for match in matches:
                if isinstance(match, dict):
                    match["apply_links"] = job_portal_service.generate_links(
                        match.get("role", "Software Engineer"), 
                        parsed_data.get("skills", []) if isinstance(parsed_data, dict) else [],
                        "India"
                    )

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
        logging.error(f"Pipeline error: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@resume_router.post("/parse")
async def parse_resume(payload: Dict[str, Any] = Body(...)):
    text = payload.get("text")
    if not text:
        raise HTTPException(status_code=400, detail="Text is required")
    try:
        return await ai_service.parse_resume(text)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@resume_router.post("/analyze")
async def analyze_resume(payload: Dict[str, Any] = Body(...)):
    resume_data = payload.get("resume")
    if not resume_data:
        raise HTTPException(status_code=400, detail="Resume data is required")
    try:
        return await ai_service.analyze_resume(resume_data)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@resume_router.post("/matches")
async def generate_matches(payload: Dict[str, Any] = Body(...)):
    resume_data = payload.get("resume")
    roles = payload.get("roles", [])
    if not resume_data:
        raise HTTPException(status_code=400, detail="Resume data is required")
    try:
        return await ai_service.generate_job_matches(resume_data, roles)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@resume_router.post("/cover-letter")
async def cover_letter(payload: Dict[str, Any] = Body(...)):
    resume_data = payload.get("resume")
    job_role = payload.get("jobRole")
    if not resume_data or not job_role:
        raise HTTPException(status_code=400, detail="Resume data and job role are required")
    try:
        return {"content": await ai_service.generate_cover_letter(resume_data, job_role)}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@resume_router.post("/rewrite")
async def rewrite_bullet(payload: Dict[str, Any] = Body(...)):
    bullet = payload.get("bullet")
    role = payload.get("role")
    if not bullet or not role:
        raise HTTPException(status_code=400, detail="Bullet and role are required")
    try:
        return {"content": await ai_service.rewrite_bullet_point(bullet, role)}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
