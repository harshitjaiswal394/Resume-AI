from fastapi import APIRouter, HTTPException, Depends, Body
from typing import List, Dict, Any, Optional
from app.db import engine, get_db
from sqlalchemy import text
from app.api.builder_models import ResumeCreateRequest, ResumeUpdateRequest
import uuid
import json
import logging

router = APIRouter()
logger = logging.getLogger("resumatch-api.resumes")

@router.post("/")
async def create_resume(payload: ResumeCreateRequest, user_id: Optional[str] = None):
    """Creates a new modular resume."""
    resume_id = str(uuid.uuid4())
    
    # Handle guest user_id precisely
    db_user_id = None if user_id in ["guest", "undefined", None] else user_id

    # If user_id is provided in the body (common for builder), use it
    body_user_id = getattr(payload, 'user_id', None)
    if body_user_id and not db_user_id:
        db_user_id = None if body_user_id in ["guest", "undefined"] else body_user_id

    with engine.begin() as conn:
        conn.execute(
            text("""
                INSERT INTO resumes (
                    id, user_id, title, phone_number, summary, skills, experience, 
                    education, projects, certifications, languages, internships, 
                    achievements, section_order, template_id, status, created_at, updated_at
                ) VALUES (
                    :id, :uid, :title, :phone, :summary, :skills, :experience,
                    :education, :projects, :certs, :langs, :interns, :achieve, 
                    :order, :template, 'draft', NOW(), NOW()
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
                "order": payload.section_order,
                "template": payload.template_id
            }
        )
    
    return {"success": True, "resume_id": resume_id}

@router.get("/{resume_id}")
async def get_resume(resume_id: str, user_id: str = "guest"):
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

@router.put("/{resume_id}")
async def update_resume(resume_id: str, payload: ResumeUpdateRequest, user_id: str = "guest"):
    """Updates modular resume sections."""
    update_data = payload.dict(exclude_unset=True)
    if not update_data:
        return {"success": True, "message": "No changes detected"}
        
    set_clauses = []
    params = {"id": resume_id}
    
    json_fields = [
        'experience', 'education', 'projects', 'skills', 
        'certifications', 'languages', 'internships', 'achievements'
    ]
    
    for key, value in update_data.items():
        if key in json_fields:
            params[key] = json.dumps(value if key == 'skills' else [i.dict() if hasattr(i, 'dict') else i for i in value])
        elif key == 'section_order':
            params[key] = value
        else:
            params[key] = value
        set_clauses.append(f"{key} = :{key}")
    
    query = f"UPDATE resumes SET {', '.join(set_clauses)}, updated_at = NOW() WHERE id = :id"
    
    with engine.begin() as conn:
        conn.execute(text(query), params)
        
    return {"success": True}

@router.delete("/{resume_id}")
async def delete_resume(resume_id: str, user_id: str = "guest"):
    """Deletes a resume."""
    with engine.begin() as conn:
        conn.execute(text("DELETE FROM resumes WHERE id = :id"), {"id": resume_id})
    return {"success": True}
