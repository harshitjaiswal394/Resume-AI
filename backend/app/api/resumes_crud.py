from fastapi import APIRouter, HTTPException, Depends, Body
from typing import List, Dict, Any, Optional
from app.db import engine, get_db
from app.api.auth import get_current_user
from sqlalchemy import text
from app.api.builder_models import ResumeCreateRequest, ResumeUpdateRequest
import uuid
import json
import logging

router = APIRouter()
logger = logging.getLogger("resumatch-api.resumes")

@router.get("/")
async def list_resumes(user_id: str = Depends(get_current_user)):
    """Lists all resumes for a specific user from GCP Database."""
    if not user_id or user_id == "guest":
        return {"success": True, "resumes": []}

    try:
        with engine.connect() as conn:
            results = conn.execute(
                text("SELECT * FROM resumes WHERE user_id = :uid ORDER BY created_at DESC"),
                {"uid": user_id}
            ).fetchall()
            
            resumes_list = []
            for row in results:
                res = dict(row._asdict())
                # Handle JSONB fields
                json_fields = [
                    'skills', 'experience', 'education', 'projects', 'certifications', 
                    'languages', 'internships', 'achievements', 'parsed_data', 'score_breakdown'
                ]
                for field in json_fields:
                    if res.get(field) and isinstance(res[field], str):
                        try:
                            res[field] = json.loads(res[field])
                        except:
                            pass
                resumes_list.append(res)
            
            return {"success": True, "resumes": resumes_list}
    except Exception as e:
        logger.error(f"DATABASE_ERROR in list_resumes: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Database error: {str(e)}")

@router.post("/")
async def create_resume(payload: ResumeCreateRequest, user_id: str = Depends(get_current_user)):
    """Creates a new modular resume."""
    resume_id = str(uuid.uuid4())
    
    # Force authenticated user_id from JWT
    db_user_id = user_id

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
        logger.error(f"DATABASE_ERROR in create_resume: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Database error: {str(e)}")
    
    return {"success": True, "resume_id": resume_id}

@router.get("/{resume_id}")
async def get_resume(resume_id: str, user_id: str = Depends(get_current_user)):
    """Fetches a modular resume by ID."""
    with engine.connect() as conn:
        result = conn.execute(
            text("SELECT * FROM resumes WHERE id = :id"),
            {"id": resume_id}
        ).fetchone()
        
        if not result:
            raise HTTPException(status_code=404, detail="Resume not found")
            
        res = dict(result._asdict())
        # Handle JSONB fields with comprehensive lookup
        json_fields = [
            'skills', 'experience', 'education', 'projects', 'certifications', 
            'languages', 'internships', 'achievements', 'parsed_data', 'score_breakdown'
        ]
        for field in json_fields:
            if res.get(field) and isinstance(res[field], str):
                res[field] = json.loads(res[field])
        
        return {"success": True, "resume": res}

@router.get("/{resume_id}/matches")
async def get_resume_matches(resume_id: str, user_id: str = Depends(get_current_user)):
    """Fetches job matches for a specific resume from GCP Database."""
    try:
        with engine.connect() as conn:
            results = conn.execute(
                text("SELECT * FROM job_matches WHERE resume_id = :rid ORDER BY match_score DESC"),
                {"rid": resume_id}
            ).fetchall()
            
            matches_list = []
            for row in results:
                match = dict(row._asdict())
                if match.get("apply_links") and isinstance(match["apply_links"], str):
                    try:
                        match["apply_links"] = json.loads(match["apply_links"])
                    except:
                        pass
                matches_list.append(match)
                
            return {"success": True, "matches": matches_list}
    except Exception as e:
        logger.error(f"DATABASE_ERROR in get_resume_matches: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Database error: {str(e)}")

@router.put("/{resume_id}/matches/{job_id}")
async def update_job_match(resume_id: str, job_id: str, payload: Dict[str, Any] = Body(...), user_id: str = Depends(get_current_user)):
    """Updates a job match (e.g., marks it as saved)."""
    try:
        with engine.begin() as conn:
            result = conn.execute(
                text("UPDATE job_matches SET is_saved = :saved WHERE id = :jid AND resume_id = :rid AND resume_id IN (SELECT id FROM resumes WHERE user_id = :uid)"),
                {"saved": payload.get("is_saved", False), "jid": job_id, "rid": resume_id, "uid": user_id}
            )
            if result.rowcount == 0:
                raise HTTPException(status_code=403, detail="Unauthorized to update this job match")
        return {"success": True}
    except Exception as e:
        logger.error(f"DATABASE_ERROR in update_job_match: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Database error: {str(e)}")

@router.put("/{resume_id}")
async def update_resume(resume_id: str, payload: ResumeUpdateRequest, user_id: str = Depends(get_current_user)):
    """Updates modular resume sections."""
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
            logger.info(f"[DB-FIX] Serializing {key} for database storage...")
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
            continue # Never allow manual override of user_id via update payload
        else:
            params[key] = value
        
        set_clauses.append(f"{key} = :{key}")
    
    query = f"UPDATE resumes SET {', '.join(set_clauses)}, updated_at = NOW() WHERE id = :id AND user_id = :uid"
    
    try:
        with engine.begin() as conn:
            result = conn.execute(text(query), params)
            if result.rowcount == 0:
                # If no rows were updated, check if it's because it doesn't exist or because of ownership
                check_query = text("SELECT id, user_id FROM resumes WHERE id = :id")
                rows = conn.execute(check_query, {"id": resume_id}).fetchall()
                if not rows:
                    raise HTTPException(status_code=404, detail="Resume not found")
                else:
                    raise HTTPException(status_code=403, detail="Unauthorized to update this resume")
            
            logger.info(f"[DB-FIX] Successfully updated resume {resume_id}")
    except Exception as e:
        logger.error(f"DATABASE_ERROR in update_resume: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Database error: {str(e)}")
        
    return {"success": True}

@router.delete("/")
async def delete_all_user_resumes(user_id: str = Depends(get_current_user)):
    """Deletes all resumes and matches for a user."""
    if not user_id or user_id == "guest":
        return {"success": True}
    try:
        with engine.begin() as conn:
            # 1. Delete all matches for all user's resumes
            conn.execute(
                text("DELETE FROM job_matches WHERE resume_id IN (SELECT id FROM resumes WHERE user_id = :uid)"),
                {"uid": user_id}
            )
            # 2. Delete all resumes
            conn.execute(text("DELETE FROM resumes WHERE user_id = :uid"), {"uid": user_id})
        return {"success": True}
    except Exception as e:
        import traceback
        error_msg = f"DATABASE_ERROR in delete_all_user_resumes: {str(e)}\n{traceback.format_exc()}"
        logger.error(error_msg)
        raise HTTPException(status_code=500, detail=f"Database error during cleanup: {str(e)}")

@router.delete("/{resume_id}")
async def delete_resume(resume_id: str, user_id: str = Depends(get_current_user)):
    """Deletes a resume and associated data."""
    try:
        with engine.begin() as conn:
            # 1. Delete associated job matches
            conn.execute(text("DELETE FROM job_matches WHERE resume_id = :id AND resume_id IN (SELECT id FROM resumes WHERE user_id = :uid)"), {"id": resume_id, "uid": user_id})
            # 2. Delete the resume itself
            conn.execute(text("DELETE FROM resumes WHERE id = :id AND user_id = :uid"), {"id": resume_id, "uid": user_id})
        return {"success": True}
    except Exception as e:
        logger.error(f"DATABASE_ERROR in delete_resume: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Database error: {str(e)}")

