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
async def create_resume(payload: ResumeCreateRequest, user_id: str = "guest"):
    """Creates a new modular resume."""
    resume_id = str(uuid.uuid4())
    
    with engine.begin() as conn:
        conn.execute(
            text("""
                INSERT INTO resumes (
                    id, user_id, title, summary, skills, experience, 
                    education, projects, template_id, status, created_at, updated_at
                ) VALUES (
                    :id, :uid, :title, :summary, :skills, :experience,
                    :education, :projects, :template, 'draft', NOW(), NOW()
                )
            """),
            {
                "id": resume_id,
                "uid": user_id,
                "title": payload.title,
                "summary": payload.summary,
                "skills": json.dumps(payload.skills),
                "experience": json.dumps([e.dict() for e in payload.experience]),
                "education": json.dumps([e.dict() for e in payload.education]),
                "projects": json.dumps([p.dict() for p in payload.projects]),
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
        # Handle JSONB fields
        for field in ['skills', 'experience', 'education', 'projects', 'parsed_data', 'score_breakdown']:
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
    
    for key, value in update_data.items():
        if key in ['experience', 'education', 'projects', 'skills']:
            params[key] = json.dumps(value if key == 'skills' else [i.dict() if hasattr(i, 'dict') else i for i in value])
        else:
            params[key] = value
        set_clauses.append(f"{key} = :{key}")
    
    params["update_time"] = "NOW()"
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
