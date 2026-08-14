from fastapi import APIRouter, HTTPException, Body, Depends, Request
from typing import Dict, Any, Optional
from app.services.ai_service import ai_service
from app.services.scraper_service import scraper_service
from app.api.builder_models import OptimizeExperienceRequest
from app.api.deps import get_current_user_id, get_client_ip
from app.security import EventType, audit_logger, rate_limiter
import logging
import json
import time

router = APIRouter()
logger = logging.getLogger("resumatch-api.builder")

async def _check_ai_rate_limit(request: Request, user_id: str) -> None:
    """Enforce per-user + per-IP budget for AI-heavy builder endpoints."""
    ip = await get_client_ip(request)
    result = rate_limiter.check("ai_request", user_id=user_id, ip=ip)
    if not result.allowed:
        audit_logger.log(
            EventType.RATE_LIMITED,
            user_id=user_id,
            ip_address=ip,
            extra={"resource": "ai_request", "retry_after_seconds": result.retry_after_seconds},
        )
        raise HTTPException(status_code=429, detail="Rate limit exceeded. Please try again shortly.")

@router.post("/parse-job-url")
async def parse_job_url(payload: Dict[str, str] = Body(...), request: Request = None, user_id: str = Depends(get_current_user_id)):
    """Scrapes a job URL and returns structured data using AI."""
    start_time = time.time()
    url = payload.get("url")
    logger.info(f"PARSE_JOB_URL_START - User: {user_id} - URL: {url}")
    if not url:
        raise HTTPException(status_code=400, detail="URL is required")

    await _check_ai_rate_limit(request, user_id)

    try:
        raw_content = await scraper_service.fetch_job_content(url)
    except ValueError as e:
        logger.warning(f"PARSE_JOB_URL_REJECTED - User: {user_id} - Reason: {e}")
        raise HTTPException(status_code=400, detail=str(e))
    if not raw_content:
        logger.warning(f"PARSE_JOB_URL_NO_CONTENT - User: {user_id}")
        raise HTTPException(status_code=404, detail="Could not retrieve content from the provided URL. Please paste the job description manually.")

    try:
        parsed_jd = await ai_service.parse_job_url(raw_content)
    except Exception as e:
        logger.error(f"PARSE_JOB_URL_AI_FAIL - User: {user_id} - Error: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail="Failed to parse job description using AI.")

    audit_logger.log(
        EventType.CHAT_REQUEST,
        user_id=user_id,
        ip_address=await get_client_ip(request) if request else None,
        extra={"action": "parse_job_url", "latency_ms": (time.time() - start_time) * 1000},
    )
    logger.info(f"PARSE_JOB_URL_SUCCESS - User: {user_id} - Latency: {time.time() - start_time:.2f}s")
    return {"success": True, "data": parsed_jd, "raw_content": raw_content}

@router.post("/optimize-experience")
async def optimize_experience(request: OptimizeExperienceRequest, req: Request = None, user_id: str = Depends(get_current_user_id)):
    """Optimizes a work experience block for ATS & target role."""
    start_time = time.time()
    logger.info(f"OPTIMIZE_EXP_START - User: {user_id} - Role: {request.target_role}")
    await _check_ai_rate_limit(req, user_id)
    try:
        optimized = await ai_service.optimize_work_experience(
            request.experience.dict(), 
            request.target_role, 
            request.years_of_experience
        )
        logger.info(f"OPTIMIZE_EXP_SUCCESS - User: {user_id} - Latency: {time.time() - start_time:.2f}s")
        return {"success": True, "optimized": optimized}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"OPTIMIZE_EXP_FAIL - User: {user_id} - Latency: {time.time() - start_time:.2f}s - Error: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail="Failed to optimize experience. Please try again.")

@router.post("/generate-summary")
async def generate_summary(payload: Dict[str, Any] = Body(...), req: Request = None, user_id: str = Depends(get_current_user_id)):
    """Generates a professional summary based on profile data."""
    start_time = time.time()
    profile_data = payload.get("profileData")
    target_role = payload.get("targetRole", "Software Engineer")
    
    if not profile_data:
        raise HTTPException(status_code=400, detail="Profile data is required")

    await _check_ai_rate_limit(req, user_id)

    try:
        summary = await ai_service.generate_smart_summary(profile_data, target_role)
    except Exception as e:
        logger.error(f"GEN_SUMMARY_FAIL - User: {user_id} - Error: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail="Failed to generate summary. Please try again.")
    logger.info(f"GEN_SUMMARY_SUCCESS - User: {user_id} - Latency: {time.time() - start_time:.2f}s")
    return {"success": True, "summary": summary}
