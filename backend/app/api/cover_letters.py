from fastapi import APIRouter, HTTPException, Body
from typing import Dict, Any, Optional
from app.services.ai_service import ai_service
from app.services.scraper_service import scraper_service
from app.db import engine
from sqlalchemy import text
import logging
import json
import uuid
import time

router = APIRouter()
logger = logging.getLogger("resumatch-api.cover_letters")

@router.post("/generate")
async def generate_smart_cover_letter(payload: Dict[str, Any] = Body(...)):
    """
    Highly targeted cover letter generation.
    Supports Resume Data + (JD Text OR JD URL).
    """
    start_time = time.time()
    user_id = payload.get("userId", "guest")
    resume_id = payload.get("resumeId")
    resume_data = payload.get("resumeData")
    jd_text = payload.get("jdText", "")
    jd_url = payload.get("jdUrl", "")
    
    logger.info(f"GEN_COVER_LETTER_START - User: {user_id} - Resume: {resume_id}")
    
    if not resume_data and not resume_id:
        raise HTTPException(status_code=400, detail="Resume data or ID is required")
        
    # 1. Fetch JD if URL provided
    target_jd = jd_text
    if jd_url and not jd_text:
        logger.info(f"Fetching JD from URL for cover letter: {jd_url}")
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
