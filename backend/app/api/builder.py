from fastapi import APIRouter, HTTPException, Body, Depends
from typing import Dict, Any, Optional
from app.services.ai_service import ai_service
from app.services.scraper_service import scraper_service
from app.api.builder_models import OptimizeExperienceRequest
import logging
import json
import time

router = APIRouter()
logger = logging.getLogger("resumatch-api.builder")
from app.api.auth import get_current_user

@router.post("/parse-job-url")
async def parse_job_url(
    payload: Dict[str, str] = Body(...),
    user_id: str = Depends(get_current_user)
):
    """Scrapes a job URL and returns structured data using AI."""
    start_time = time.time()
    url = payload.get("url")
    logger.info(f"PARSE_JOB_URL_START - URL: {url}")
    if not url:
        raise HTTPException(status_code=400, detail="URL is required")
        
    raw_content = await scraper_service.fetch_job_content(url)
    if not raw_content:
        raise HTTPException(status_code=404, detail="Could not retrieve content from the provided URL. Please paste the job description manually.")
        
    parsed_jd = await ai_service.parse_job_url(raw_content)
    if not parsed_jd:
        logger.warning(f"PARSE_JOB_URL_FAIL - AI parsing failed - Latency: {time.time() - start_time:.2f}s")
        raise HTTPException(status_code=500, detail="Failed to parse job description using AI.")
        
    logger.info(f"PARSE_JOB_URL_SUCCESS - Latency: {time.time() - start_time:.2f}s")
    return {"success": True, "data": parsed_jd, "raw_content": raw_content}

@router.post("/optimize-experience")
@router.post("/optimize/experience")
@router.post("/optimize/-experience")
async def optimize_experience(
    request: OptimizeExperienceRequest,
    user_id: str = Depends(get_current_user)
):
    """Optimizes a work experience block for ATS & target role."""
    start_time = time.time()
    logger.info(f"OPTIMIZE_EXP_START - User: {user_id} - Role: {request.target_role}")
    try:
        # Log input size for debugging large payloads
        input_bullets_count = len(request.experience.description) if hasattr(request.experience, 'description') else 0
        logger.debug(f"OPTIMIZE_EXP_INPUT - User: {user_id} - Bullets: {input_bullets_count}")
        
        optimized = await ai_service.optimize_work_experience(
            request.experience.dict(), 
            request.target_role, 
            request.years_of_experience
        )
        
        latency = time.time() - start_time
        logger.info(f"OPTIMIZE_EXP_SUCCESS - User: {user_id} - Latency: {latency:.2f}s")
        return {"success": True, "optimized": optimized}
    except Exception as e:
        latency = time.time() - start_time
        logger.error(f"OPTIMIZE_EXP_FAIL - User: {user_id} - Latency: {latency:.2f}s - Error: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Optimization failed: {str(e)}")

@router.post("/generate-summary")
async def generate_summary(
    payload: Dict[str, Any] = Body(...),
    user_id: str = Depends(get_current_user)
):
    """Generates a professional summary based on profile data."""
    start_time = time.time()
    profile_data = payload.get("profileData")
    target_role = payload.get("targetRole", "Software Engineer")
    
    logger.info(f"GENERATE_SUMMARY_START - User: {user_id} - Role: {target_role}")
    
    if not profile_data:
        logger.warning(f"GENERATE_SUMMARY_INVALID - User: {user_id} - Missing profile data")
        raise HTTPException(status_code=400, detail="Profile data is required")
        
    try:
        summary = await ai_service.generate_smart_summary(profile_data, target_role)
        latency = time.time() - start_time
        logger.info(f"GENERATE_SUMMARY_SUCCESS - User: {user_id} - Latency: {latency:.2f}s")
        return {"success": True, "summary": summary}
    except Exception as e:
        latency = time.time() - start_time
        logger.error(f"GENERATE_SUMMARY_FAIL - User: {user_id} - Latency: {latency:.2f}s - Error: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

