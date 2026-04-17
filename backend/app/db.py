import os
import logging
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker
from dotenv import load_dotenv

load_dotenv()

logger = logging.getLogger("resumatch-api.db")
# Prioritize GCP Cloud SQL during migration
DATABASE_URL = os.getenv("GCP_DATABASE_URL") or os.getenv("DATABASE_URL")

if not DATABASE_URL:
    logger.error("No DATABASE_URL found in environment!")

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
        # 1. Calculate Metadata
        full_name = parsed_data.get("fullName") or parsed_data.get("full_name") or "Untitled"
        role = parsed_data.get("targetRole") or parsed_data.get("target_role") or "Resume"
        title = f"{full_name}'s {role}"
        
        # 2. Upsert Resume Record (Mirroring Production Schema)
        conn.execute(
            text("""
                INSERT INTO resumes (
                    id, user_id, status, parsed_data, target_role, phone_number,
                    summary, skills, experience, education, projects, 
                    certifications, languages, internships, achievements,
                    resume_score, score_breakdown, raw_text, original_score,
                    title, file_name, template_id, section_order,
                    updated_at, created_at
                ) VALUES (
                    :id, :user_id, 'complete', :parsed, :target_role, :phone,
                    :summary, :skills, :experience, :education, :projects,
                    :certifications, :languages, :internships, :achievements,
                    :score, :breakdown, :text, :score,
                    :title, :title, 'modern', '{summary,skills,experience,education,projects,certifications,languages,achievements,internships}',
                    NOW(), NOW()
                )
                ON CONFLICT (id) DO UPDATE SET
                    status = EXCLUDED.status,
                    parsed_data = EXCLUDED.parsed_data,
                    target_role = EXCLUDED.target_role,
                    phone_number = EXCLUDED.phone_number,
                    summary = EXCLUDED.summary,
                    skills = EXCLUDED.skills,
                    experience = EXCLUDED.experience,
                    education = EXCLUDED.education,
                    projects = EXCLUDED.projects,
                    certifications = EXCLUDED.certifications,
                    languages = EXCLUDED.languages,
                    internships = EXCLUDED.internships,
                    achievements = EXCLUDED.achievements,
                    resume_score = EXCLUDED.resume_score,
                    score_breakdown = EXCLUDED.score_breakdown,
                    raw_text = EXCLUDED.raw_text,
                    original_score = COALESCE(resumes.original_score, EXCLUDED.original_score),
                    title = COALESCE(resumes.title, EXCLUDED.title),
                    file_name = COALESCE(resumes.file_name, EXCLUDED.file_name),
                    updated_at = NOW()
            """),
            {
                "parsed": json.dumps(parsed_data),
                "target_role": role,
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
                "user_id": user_id,
                "title": title
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
                            :score, :m_skills, :miss_skills,
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
                        "m_skills": m.get("matching_skills") or m.get("matchingSkills") or [],
                        "miss_skills": m.get("missing_skills") or m.get("missingSkills") or [],
                        "reason": m.get("aiReasoning") or m.get("reasoning") or "Highly compatible matches.",
                        "links": json.dumps(m.get("apply_links") or {})
                    }
                )
        
        # 3. Create Audit Log (Mirroring Production 'metadata' column)
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


