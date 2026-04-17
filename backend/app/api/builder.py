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
async def optimize_experience(
    request: OptimizeExperienceRequest,
    user_id: str = Depends(get_current_user)
):
    """Optimizes a work experience block for ATS & target role."""
    start_time = time.time()
    logger.info(f"OPTIMIZE_EXP_START - Role: {request.target_role}")
    try:
        optimized = await ai_service.optimize_work_experience(
            request.experience.dict(), 
            request.target_role, 
            request.years_of_experience
        )
        logger.info(f"OPTIMIZE_EXP_SUCCESS - Latency: {time.time() - start_time:.2f}s")
        return {"success": True, "optimized": optimized}
    except Exception as e:
        logger.error(f"OPTIMIZE_EXP_FAIL - Latency: {time.time() - start_time:.2f}s - Error: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/generate-summary")
async def generate_summary(
    payload: Dict[str, Any] = Body(...),
    user_id: str = Depends(get_current_user)
):
    """Generates a professional summary based on profile data."""
    profile_data = payload.get("profileData")
    target_role = payload.get("targetRole", "Software Engineer")
    
    if not profile_data:
        raise HTTPException(status_code=400, detail="Profile data is required")
        
    summary = await ai_service.generate_smart_summary(profile_data, target_role)
    return {"success": True, "summary": summary}
