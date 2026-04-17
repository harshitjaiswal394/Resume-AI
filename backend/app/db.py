import os
import logging
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker
from dotenv import load_dotenv

load_dotenv()

logger = logging.getLogger("resumatch-api.db")
DATABASE_URL = os.getenv("DATABASE_URL")

engine = create_engine(DATABASE_URL)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

def execute_vector_search(embedding: list[float], limit: int = 50, filters: dict = None):
    """
    Perform a vector similarity search with industry-standard filtering.
    Filters available: domain, work_mode, location, experience_level, days_old
    """
    filters = filters or {}
    
    with engine.connect() as conn:
        embedding_str = f"[{','.join(map(str, embedding))}]"
        
        # Base query parts
        base_query = """
            SELECT id, title, company, location, description, skills, salary_range, 
                   domain, source, work_mode, experience_level, education, apply_url, posted_at,
                   1 - (embedding <=> CAST(:embedding AS vector)) as similarity
            FROM job_postings
            WHERE 1=1
        """
        
        params = {"embedding": embedding_str, "limit": limit}
        
        # Dynamic SQL construction with support for Multi-Select (Lists)
        def add_filter(column, key, val):
            nonlocal base_query
            if not val: return
            if isinstance(val, list) and len(val) > 0:
                clauses = []
                for i, v in enumerate(val):
                    p_key = f"{key}_{i}"
                    if column == "location":
                        clauses.append(f"{column} ILIKE :{p_key}")
                        params[p_key] = f"%{v}%"
                    else:
                        clauses.append(f"{column} = :{p_key}")
                        params[p_key] = v
                base_query += f" AND ({' OR '.join(clauses)}) "
            else:
                if column == "location":
                    base_query += f" AND {column} ILIKE :{key} "
                    params[key] = f"%{val}%"
                else:
                    base_query += f" AND {column} = :{key} "
                    params[key] = val

        add_filter("domain", "domain", filters.get("domain"))
        add_filter("work_mode", "work_mode", filters.get("work_mode"))
        add_filter("experience_level", "exp", filters.get("experience_level"))
        add_filter("location", "loc", filters.get("location"))
            
        if filters.get("days_old"):
            base_query += " AND posted_at >= NOW() - INTERVAL '1 day' * :days "
            params["days"] = int(filters["days_old"])
        else:
            base_query += " AND posted_at >= NOW() - INTERVAL '25 days' "

        # Finalize ordering and limit
        final_query = base_query + " ORDER BY similarity DESC LIMIT :limit"
        
        result = conn.execute(text(final_query), params)
        
        results = []
        for row in result:
            job_dict = {}
            for key, value in row._asdict().items():
                if hasattr(value, 'hex'): 
                    job_dict[key] = str(value)
                elif hasattr(value, 'isoformat'): # Handle datetimes
                    job_dict[key] = value.isoformat()
                else:
                    job_dict[key] = value
            results.append(job_dict)
            
        return results

import json
def persist_pipeline_results(user_id: str, resume_id: str, data: dict):
    """
    Saves the entire analysis outcome (Parsed Data, Analysis, Matches) to the DB.
    Replicates the functionality previously held in Next.js Server Actions.
    """
    parsed_data = data.get("parsed_data", {})
    analysis = data.get("analysis", {})
    matches = data.get("matches", [])
    raw_text = data.get("raw_text", "")
    
    # 0. Validate UUID status to prevent Postgres crash on "guest" string
    import uuid
    try:
        uuid.UUID(str(user_id))
        uuid.UUID(str(resume_id))
    except ValueError:
        logger.warning(f"Skipping persistence: invalid UUID structure for user({user_id}) or resume({resume_id})")
        return False

    with engine.begin() as conn:
        # 1. Update Resume Record
        conn.execute(
            text("""
                UPDATE resumes 
                SET status = 'complete',
                    parsed_data = :parsed,
                    target_role = :target_role,
                    phone_number = :phone,
                    summary = :summary,
                    skills = :skills,
                    experience = :experience,
                    education = :education,
                    projects = :projects,
                    certifications = :certifications,
                    languages = :languages,
                    internships = :internships,
                    achievements = :achievements,
                    resume_score = :score,
                    score_breakdown = :breakdown,
                    raw_text = :text,
                    original_score = COALESCE(original_score, :score),
                    updated_at = NOW()
                WHERE id = :id AND user_id = :user_id
            """),
            {
                "parsed": json.dumps(parsed_data),
                "target_role": parsed_data.get("targetRole") or parsed_data.get("target_role"),
                "phone": parsed_data.get("phone") or parsed_data.get("phone_number"),
                "summary": parsed_data.get("summary"),
                "skills": json.dumps(parsed_data.get("skills") or []),
                "experience": json.dumps(parsed_data.get("experience") or []),
                "education": json.dumps(parsed_data.get("education") or []),
                "projects": json.dumps(parsed_data.get("projects") or []),
                "certifications": json.dumps(parsed_data.get("certifications") or []),
                "languages": json.dumps(parsed_data.get("languages") or []),
                "internships": json.dumps(parsed_data.get("internships") or []),
                "achievements": json.dumps(parsed_data.get("achievements") or []),
                "score": analysis.get("score") or analysis.get("matchScore") or analysis.get("resume_score") or 0,
                "breakdown": json.dumps(analysis),
                "text": raw_text,
                "id": resume_id,
                "user_id": user_id
            }
        )
        
        # 2. Sync Job Matches (Delete old, Insert new)
        if matches:
            conn.execute(
                text("DELETE FROM job_matches WHERE resume_id = :id"),
                {"id": resume_id}
            )
            
            for m in matches:
                conn.execute(
                    text("""
                        INSERT INTO job_matches (
                            resume_id, user_id, job_title, company, location, 
                            match_score, matching_skills, missing_skills, 
                            ai_reasoning, apply_links, created_at
                        ) VALUES (
                            :rid, :uid, :title, :company, :loc,
                            :score, CAST(:m_skills AS jsonb), CAST(:miss_skills AS jsonb),
                            :reason, :links, NOW()
                        )
                    """),
                    {
                        "rid": resume_id,
                        "uid": user_id,
                        "title": m.get("title") or m.get("role") or "Career Match",
                        "company": m.get("company") or "Direct Opportunity",
                        "loc": m.get("location") or "Remote",
                        "score": m.get("matchScore") or m.get("match_score") or 0,
                        "m_skills": json.dumps(m.get("matching_skills") or m.get("matchingSkills") or []),
                        "miss_skills": json.dumps(m.get("missing_skills") or m.get("missingSkills") or []),
                        "reason": m.get("aiReasoning") or m.get("reasoning") or "Highly compatible matches.",
                        "links": json.dumps(m.get("apply_links") or {})
                    }
                )
        
        # 3. Create Audit Log
        conn.execute(
            text("""
                INSERT INTO audit_logs (user_id, action, metadata, created_at)
                VALUES (:uid, :action, :meta, NOW())
            """),
            {
                "uid": user_id,
                "action": "resume_analysis_full",
                "meta": json.dumps({"score": analysis.get("score")})
            }
        )
        
    return True


