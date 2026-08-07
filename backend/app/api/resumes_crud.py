from fastapi import APIRouter, HTTPException, Depends, Body, Header
from typing import List, Dict, Any, Optional
from app.db import engine, get_db
from sqlalchemy import text
from app.api.builder_models import ResumeCreateRequest, ResumeUpdateRequest
from app.api.deps import get_current_user_id
import uuid
import json
import logging

router = APIRouter()
logger = logging.getLogger("resumatch-api.resumes")

async def create_resume_record(payload: ResumeCreateRequest, user_id: str) -> dict:
    """Inserts a modular resume owned by `user_id`. Returns {success, resume_id}."""
    resume_id = str(uuid.uuid4())
    db_user_id = None if user_id in ["guest", "undefined", None] else user_id

    try:
        with engine.begin() as conn:
            conn.execute(
                text("""
                    INSERT INTO resumes (
                        id, user_id, title, phone_number, summary, skills, experience, 
                        education, projects, certifications, languages, internships, 
                        achievements, section_order, template_id, status, file_url, file_name, file_type, file_size_bytes, parsed_data, 
                        original_score, resume_score, target_role, years_of_experience, created_at, updated_at
                    ) VALUES (
                        :id, :uid, :title, :phone, :summary, :skills, :experience,
                        :education, :projects, :certs, :langs, :interns, :achieve, 
                        :order, :template, 'draft', '', :title, 'pdf', 0, :parsed, 
                        :orig_score, :r_score, :target_role, :years_exp, NOW(), NOW()
                    )
                """),
                {
                    "id": resume_id,
                    "uid": db_user_id,
                    "title": payload.title,
                    "phone": payload.phone_number,
                    "summary": payload.summary,
                    "skills": json.dumps(payload.skills),
                    "experience": json.dumps([e.dict() for e in payload.experience]),
                    "education": json.dumps([e.dict() for e in payload.education]),
                    "projects": json.dumps([p.dict() for p in payload.projects]),
                    "certs": json.dumps([c.dict() for c in payload.certifications]),
                    "langs": json.dumps([l.dict() for l in payload.languages]),
                    "interns": json.dumps([i.dict() for i in payload.internships]),
                    "achieve": json.dumps([a.dict() for a in payload.achievements]),
                    "order": "{" + ",".join([f'"{s}"' for s in payload.section_order]) + "}",
                    "template": payload.template_id,
                    "parsed": json.dumps(payload.parsed_data) if payload.parsed_data else None,
                    "orig_score": payload.original_score or 0,
                    "r_score": payload.resume_score or 0,
                    "target_role": payload.target_role,
                    "years_exp": payload.years_of_experience or 0
                }
            )
    except Exception as e:
        logger.error(f"DATABASE_ERROR in create_resume: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Database error: {str(e)}")

    logger.info(f"Created resume {resume_id} for user {db_user_id}")
    return {"success": True, "resume_id": resume_id}

@router.post("/")
async def create_resume(payload: ResumeCreateRequest, user_id: str = Depends(get_current_user_id)):
    """Creates a new modular resume for the authenticated user."""
    return await create_resume_record(payload, user_id)

@router.get("/{resume_id}")
async def get_resume(resume_id: str, user_id: str = Depends(get_current_user_id)):
    """Fetches a modular resume by ID (scoped to the authenticated user)."""
    try:
        with engine.connect() as conn:
            result = conn.execute(
                text("SELECT * FROM resumes WHERE id = :id AND user_id = :uid"),
                {"id": resume_id, "uid": user_id}
            ).fetchone()
    except Exception as e:
        logger.error(f"DATABASE_ERROR in get_resume: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail="Database error")

    if not result:
        logger.warning(f"Resume {resume_id} not found or not owned by user {user_id}")
        raise HTTPException(status_code=404, detail="Resume not found")

    res = dict(result._asdict())
    # Handle JSONB fields with comprehensive lookup
    json_fields = [
        'skills', 'experience', 'education', 'projects', 'certifications', 
        'languages', 'internships', 'achievements', 'parsed_data', 'score_breakdown'
    ]
    for field in json_fields:
        if res.get(field) and isinstance(res[field], str):
            try:
                res[field] = json.loads(res[field])
            except Exception:
                logger.warning(f"Failed to parse JSON field {field} on resume {resume_id}")

    return {"success": True, "resume": res}

@router.put("/{resume_id}")
async def update_resume(resume_id: str, payload: ResumeUpdateRequest, user_id: str = Depends(get_current_user_id)):
    """Updates modular resume sections (scoped to the authenticated user)."""
    update_data = payload.dict(exclude_unset=True)

    if not update_data:
        return {"success": True, "message": "No changes detected"}
        
    set_clauses = []
    params = {"id": resume_id, "uid": user_id}
    
    json_fields = {
        'experience', 'education', 'projects', 'skills', 
        'certifications', 'languages', 'internships', 'achievements', 'parsed_data'
    }
    
    for key, value in update_data.items():
        if key in json_fields:
            # Pydantic models need to be converted to dicts/lists before json.dumps
            if isinstance(value, list):
                serializable_value = [v.dict() if hasattr(v, 'dict') else v for v in value]
            elif hasattr(value, 'dict'):
                serializable_value = value.dict()
            else:
                serializable_value = value
            params[key] = json.dumps(serializable_value)
        elif key == 'section_order':
            params[key] = "{" + ",".join([f'"{s}"' for s in value]) + "}"
        elif key == 'user_id':
            continue
        else:
            params[key] = value
        
        set_clauses.append(f"{key} = :{key}")
    
    if not set_clauses:
        return {"success": True, "message": "No changes detected"}

    query = f"UPDATE resumes SET {', '.join(set_clauses)}, updated_at = NOW() WHERE id = :id AND user_id = :uid"
    
    try:
        with engine.begin() as conn:
            result = conn.execute(text(query), params)
            if result.rowcount == 0:
                logger.warning(f"Resume {resume_id} not found or not owned by user {user_id}")
                raise HTTPException(status_code=404, detail="Resume not found")
            logger.info(f"Updated resume {resume_id} for user {user_id}")
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"DATABASE_ERROR in update_resume: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Database error: {str(e)}")
        
    return {"success": True}

@router.delete("/{resume_id}")
async def delete_resume(resume_id: str, user_id: str = Depends(get_current_user_id)):
    """Deletes a resume and associated data (versions, embeddings, job matches), scoped to the user."""
    try:
        with engine.begin() as conn:
            # 1. Delete associated job matches (scoped to the owner)
            conn.execute(
                text("DELETE FROM job_matches WHERE resume_id = :id AND user_id = :uid"),
                {"id": resume_id, "uid": user_id},
            )
            # 2. Delete associated tailored versions
            conn.execute(
                text("DELETE FROM resume_versions WHERE resume_id = :id AND user_id = :uid"),
                {"id": resume_id, "uid": user_id},
            )
            # 3. Delete associated embeddings
            conn.execute(
                text("DELETE FROM resume_embeddings WHERE resume_id = :id AND user_id = :uid"),
                {"id": resume_id, "uid": user_id},
            )
            # 4. Delete the resume itself (scoped to user)
            result = conn.execute(
                text("DELETE FROM resumes WHERE id = :id AND user_id = :uid"),
                {"id": resume_id, "uid": user_id},
            )
            if result.rowcount == 0:
                logger.warning(f"Resume {resume_id} not found or not owned by user {user_id}")
                raise HTTPException(status_code=404, detail="Resume not found")
        logger.info(f"Deleted resume {resume_id} for user {user_id}")
        return {"success": True}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"DATABASE_ERROR in delete_resume: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Database error: {str(e)}")
