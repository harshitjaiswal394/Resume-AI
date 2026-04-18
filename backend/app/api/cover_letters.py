from fastapi import APIRouter, HTTPException, Body, Depends
from typing import Dict, Any, Optional
from app.services.ai_service import ai_service
from app.services.scraper_service import scraper_service
from app.db import engine
from sqlalchemy import text
import logging
import json
import uuid
import time

router = APIRouter(redirect_slashes=False)
logger = logging.getLogger("resumatch-api.cover_letters")
from app.api.auth import get_current_user

@router.post("/fetch-jd")
async def fetch_job_description(
    payload: Dict[str, Any] = Body(...),
    user_id: str = Depends(get_current_user)
):
    """
    Stand-alone JD fetching endpoint for the frontend.
    Returns clean text from a URL.
    """
    jd_url = payload.get("jdUrl")
    if not jd_url:
        raise HTTPException(status_code=400, detail="Job URL is required")
    
    logger.info(f"Fetching JD for preview: {jd_url}")
    try:
        raw_text = await scraper_service.fetch_job_content(jd_url)
        if not raw_text or len(raw_text) < 150:
             raise HTTPException(status_code=422, detail="Scraping failed or content too short")
             
        # AI Cleanup: Filter out noise (headers, ads, etc.)
        clean_jd = await ai_service.clean_job_description(raw_text)
        return {"success": True, "jdText": clean_jd}
    except HTTPException as he:
        raise he
    except Exception as e:
        logger.error(f"Fetch JD failed: {str(e)}")
        raise HTTPException(status_code=500, detail="Could not retrieve job description from this URL")

@router.post("/generate")
async def generate_smart_cover_letter(
    payload: Dict[str, Any] = Body(...),
    user_id: str = Depends(get_current_user)
):
    """
    Highly targeted cover letter generation.
    Supports Resume Data + (JD Text OR JD URL).
    """
    start_time = time.time()
    resume_id = payload.get("resumeId")
    resume_data = payload.get("resumeData")
    jd_text = payload.get("jdText", "").strip()
    jd_url = payload.get("jdUrl", "").strip()
    
    logger.info(f"GEN_COVER_LETTER_START - User: {user_id} - Resume: {resume_id}")
    
    if not resume_data and not resume_id:
        raise HTTPException(status_code=400, detail="Resume data or ID is required")
    
    # Prioritize jd_text (explicit manual paste or already fetched) over jd_url
    target_jd = jd_text
    if not target_jd and jd_url:
        logger.info(f"Fetching JD from URL (fallback): {jd_url}")
        target_jd = await scraper_service.fetch_job_content(jd_url) or ""
        
    if not target_jd:
        raise HTTPException(status_code=400, detail="Job description text or a valid URL is required")

    # 2. Match & Generate using Llama 3.1 70B (Pro logic)
    try:
        content = await ai_service.generate_smart_cover_letter(resume_data, target_jd)
        
        # 3. Persistence if user is not guest
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
        
        logger.info(f"GEN_COVER_LETTER_SUCCESS - Latency: {time.time() - start_time:.2f}s")
        return {"success": True, "content": content, "id": letter_id}
    except Exception as e:
        logger.error(f"GEN_COVER_LETTER_FAIL - Latency: {time.time() - start_time:.2f}s - Error: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

async def generate_smart_cover_letter_service(resume_data: Dict[str, Any], jd_text: str) -> str:
    """Internal service logic for the generative pipeline."""
    # We'll add this to AIService
    pass

