from fastapi import APIRouter, HTTPException, Body, Depends, Request
from typing import Dict, Any, Optional
from app.services.ai_service import ai_service
from app.services.scraper_service import scraper_service
from app.api.deps import get_current_user_id, get_client_ip
from app.db import engine
from app.security import EventType, audit_logger, rate_limiter
from sqlalchemy import text
import logging
import json
import uuid
import time

router = APIRouter()
logger = logging.getLogger("resumatch-api.cover_letters")

FETCH_JD_FAILURE_DETAIL = (
    "Could not reliably extract the job description from this URL. "
    "This job board may block automated access, so please paste the JD manually."
)

async def _check_rate_limit(request: Request, user_id: str) -> None:
    ip = await get_client_ip(request)
    result = rate_limiter.check("ai_request", user_id=user_id, ip=ip)
    if not result.allowed:
        raise HTTPException(status_code=429, detail="Rate limit exceeded. Please try again shortly.")

@router.post("/fetch-jd")
async def fetch_job_description(payload: Dict[str, Any] = Body(...), request: Request = None, user_id: str = Depends(get_current_user_id)):
    jd_url = payload.get("jdUrl")
    if not jd_url:
        raise HTTPException(status_code=400, detail="Job URL is required")
    
    await _check_rate_limit(request, user_id)
    logger.info(f"Fetching JD for preview - User: {user_id}: {jd_url}")
    try:
        result = await scraper_service.fetch_job_content_diagnostics(jd_url)
        raw_text = result.get("content")
        if not raw_text or len(raw_text) < 150:
             raise HTTPException(status_code=422, detail=FETCH_JD_FAILURE_DETAIL)
             
        clean_jd = await ai_service.clean_job_description(raw_text)
        return {"success": True, "jdText": clean_jd}
    except ValueError as e:
        logger.warning(f"FETCH_JD_REJECTED - User: {user_id} - Reason: {e}")
        raise HTTPException(status_code=400, detail=str(e))
    except HTTPException as he:
        raise he
    except Exception as e:
        logger.error(f"Fetch JD failed - User: {user_id}: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=FETCH_JD_FAILURE_DETAIL)

@router.post("/fetch-jd-debug")
async def fetch_job_description_debug(payload: Dict[str, Any] = Body(...), request: Request = None, user_id: str = Depends(get_current_user_id)):
    jd_url = payload.get("jdUrl")
    if not jd_url:
        raise HTTPException(status_code=400, detail="Job URL is required")

    await _check_rate_limit(request, user_id)
    logger.info(f"Fetching JD debug diagnostics - User: {user_id}: {jd_url}")
    try:
        result = await scraper_service.fetch_job_content_diagnostics(jd_url)
    except ValueError as e:
        logger.warning(f"FETCH_JD_DEBUG_REJECTED - User: {user_id} - Reason: {e}")
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Fetch JD debug failed - User: {user_id}: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=FETCH_JD_FAILURE_DETAIL)

    content = result.get("content") or ""
    diagnostics = result.get("diagnostics") or {}

    return {
        "success": bool(content),
        "diagnostics": diagnostics,
        "contentPreview": content[:1500],
        "contentLength": len(content),
    }

@router.post("/generate")
async def generate_smart_cover_letter(payload: Dict[str, Any] = Body(...), request: Request = None, user_id: str = Depends(get_current_user_id)):
    start_time = time.time()
    resume_id = payload.get("resumeId")
    resume_data = payload.get("resumeData")
    jd_text = payload.get("jdText", "").strip()
    jd_url = payload.get("jdUrl", "").strip()
    
    logger.info(f"GEN_COVER_LETTER_START - User: {user_id} - Resume: {resume_id}")
    
    if not resume_data and not resume_id:
        raise HTTPException(status_code=400, detail="Resume data or ID is required")

    await _check_rate_limit(request, user_id)
    
    target_jd = jd_text
    if not target_jd and jd_url:
        logger.info(f"Fetching JD from URL (fallback) - User: {user_id}: {jd_url}")
        try:
            target_jd = await scraper_service.fetch_job_content(jd_url) or ""
        except ValueError as e:
            logger.warning(f"GEN_COVER_LETTER_JD_REJECTED - User: {user_id} - Reason: {e}")
            raise HTTPException(status_code=400, detail=str(e))
        
    if not target_jd:
        raise HTTPException(status_code=400, detail="Job description text or a valid URL is required")

    try:
        content = await ai_service.generate_smart_cover_letter(resume_data, target_jd)
        
        letter_id = str(uuid.uuid4())
        if user_id != "guest":
            with engine.begin() as conn:
                conn.execute(
                    text("""
                        INSERT INTO cover_letters (id, user_id, resume_id, content, created_at)
                        VALUES (:id, :uid, :rid, :content, NOW())
                    """),
                    {"id": letter_id, "uid": user_id, "rid": resume_id, "content": content}
                )
        
        logger.info(f"GEN_COVER_LETTER_SUCCESS - User: {user_id} - Latency: {time.time() - start_time:.2f}s")
        return {"success": True, "content": content, "id": letter_id}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"GEN_COVER_LETTER_FAIL - User: {user_id} - Latency: {time.time() - start_time:.2f}s - Error: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail="Cover letter generation failed. Please try again.")

async def generate_smart_cover_letter_service(resume_data: Dict[str, Any], jd_text: str) -> str:
    pass
