import os
import logging
from sqlalchemy import create_engine, text, event
from sqlalchemy.orm import sessionmaker
from dotenv import load_dotenv
from opentelemetry import trace
from opentelemetry.trace import Status, StatusCode

load_dotenv()

logger = logging.getLogger("resumatch-api.db")

DATABASE_URL = os.getenv("DATABASE_URL")

if not DATABASE_URL:
    if os.getenv("ENVIRONMENT", "development") == "production":
        logger.critical("DATABASE_URL not set in production — refusing to start")
        raise RuntimeError("DATABASE_URL is required in production")
    logger.warning("DATABASE_URL not found. Using SQLite test database (development only).")
    DATABASE_URL = "sqlite:///./test.db"

engine_kwargs = {}

if DATABASE_URL.startswith("sqlite"):
    engine_kwargs["connect_args"] = {
        "check_same_thread": False
    }
else:
    # Connection pool tuning for PostgreSQL
    engine_kwargs.update({
        "pool_size": int(os.getenv("DB_POOL_SIZE", "10")),
        "max_overflow": int(os.getenv("DB_MAX_OVERFLOW", "20")),
        "pool_timeout": int(os.getenv("DB_POOL_TIMEOUT", "30")),
        "pool_recycle": int(os.getenv("DB_POOL_RECYCLE", "1800")),
        "pool_pre_ping": True,
    })

engine = create_engine(
    DATABASE_URL,
    future=True,
    **engine_kwargs,
)

SessionLocal = sessionmaker(
    autocommit=False,
    autoflush=False,
    bind=engine,
)

try:
    from opentelemetry.instrumentation.sqlalchemy import SQLAlchemyInstrumentor
    SQLAlchemyInstrumentor().instrument(engine=engine)
except ImportError:
    pass

@event.listens_for(engine, "handle_error")
def mark_db_span_error(exception_context):
    span = trace.get_current_span()
    if span is None:
        return

    original_exception = exception_context.original_exception
    if original_exception is None:
        return

    span.record_exception(original_exception)
    span.set_status(Status(StatusCode.ERROR, str(original_exception)))
    span.set_attribute("error", True)
    span.set_attribute("error.type", original_exception.__class__.__name__)
    span.set_attribute("error.message", str(original_exception))
    if exception_context.statement:
        span.set_attribute("db.statement", exception_context.statement)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

def execute_vector_search(embedding: list[float], limit: int = 50, filters: dict = None, offset: int = 0, with_total: bool = False):
    """
    Perform a vector similarity search with industry-standard filtering.
    Filters available: domain, work_mode, location, experience_level, days_old, salary_min
    """
    filters = filters or {}

    with engine.connect() as conn:
        embedding_str = f"[{','.join(map(str, embedding))}]"

        # Base query parts
        select_columns = (
            "COUNT(*) OVER() AS total, "
            if with_total
            else ""
        ) + """id, title, company, location, location_country, description, skills, salary_range,
               domain, source, work_mode, experience_level, education, apply_url, posted_at,
               1 - (embedding <=> CAST(:embedding AS vector)) as similarity"""

        base_query = f"""
            SELECT {select_columns}
            FROM job_postings
            WHERE 1=1
        """

        params = {"embedding": embedding_str}

        # Dynamic SQL construction with support for Multi-Select (Lists)
        def add_filter(column, key, val):
            nonlocal base_query
            if not val: return
            if isinstance(val, list) and len(val) > 0:
                clauses = []
                for i, v in enumerate(val):
                    p_key = f"{key}_{i}"
                    if column in ("location", "location_country"):
                        clauses.append(f"(location ILIKE :{p_key} OR location_country ILIKE :{p_key})")
                        params[p_key] = f"%{v}%"
                    elif column == "domain":
                        clauses.append(f"domain ILIKE :{p_key}")
                        params[p_key] = f"%{v}%"
                    else:
                        clauses.append(f"{column} ILIKE :{p_key}")
                        params[p_key] = f"%{v}%"
                base_query += f" AND ({' OR '.join(clauses)}) "
            else:
                if column in ("location", "location_country"):
                    base_query += f" AND (location ILIKE :{key} OR location_country ILIKE :{key}) "
                    params[key] = f"%{val}%"
                elif column == "domain":
                    base_query += f" AND domain ILIKE :{key} "
                    params[key] = f"%{val}%"
                else:
                    base_query += f" AND {column} ILIKE :{key} "
                    params[key] = f"%{val}%"

        add_filter("domain", "domain", filters.get("domain"))
        add_filter("work_mode", "work_mode", filters.get("work_mode"))
        add_filter("experience_level", "exp", filters.get("experience_level"))
        add_filter("location", "loc", filters.get("location"))
        add_filter("location_country", "country", filters.get("country"))

        if filters.get("days_old"):
            base_query += " AND posted_at >= NOW() - INTERVAL '1 day' * :days "
            params["days"] = int(filters["days_old"])
        else:
            base_query += " AND posted_at >= NOW() - INTERVAL '25 days' "

        if filters.get("salary_min"):
            base_query += """
                AND salary_range IS NOT NULL AND salary_range != ''
                AND CAST((regexp_match(salary_range, '([0-9]+([.][0-9]+)?)'))[1] AS double precision) >= :salary_min
            """
            params["salary_min"] = float(filters["salary_min"])

        # Finalize ordering and limit
        final_query = base_query + " ORDER BY similarity DESC NULLS LAST LIMIT :limit"
        params["limit"] = int(limit)

        if offset:
            final_query += " OFFSET :offset"
            params["offset"] = int(offset)

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


def execute_keyword_search(filters: dict = None, limit: int = 20, offset: int = 0):
    """
    Keyword + structural filter search over job_postings without an embedding.
    Filters: q, domain, work_mode, location, experience_level, days_old, salary_min.
    Returns a tuple (jobs, total).
    """
    filters = filters or {}
    limit = max(1, min(int(limit), 200))
    offset = max(0, int(offset))

    base_query = """
        SELECT id, title, company, location, description, skills, salary_range,
               domain, source, work_mode, experience_level, education, apply_url,
               posted_at, location_country,
               COUNT(*) OVER() AS total
        FROM job_postings
        WHERE 1=1
    """
    params: dict = {}

    q = (filters.get("q") or "").strip()
    if q:
        base_query += """
            AND (title ILIKE :q OR company ILIKE :q OR description ILIKE :q
                 OR domain ILIKE :q OR skills::text ILIKE :q)
        """
        params["q"] = f"%{q}%"

    def add_filter(column, key, val, exact=False):
        nonlocal base_query
        if not val:
            return
        if column == "location":
            base_query += f" AND (location ILIKE :{key} OR location_country ILIKE :{key}) "
            params[key] = f"%{val}%"
        elif exact:
            base_query += f" AND {column} = :{key} "
            params[key] = val
        else:
            base_query += f" AND {column} ILIKE :{key} "
            params[key] = f"%{val}%"

    add_filter("domain", "domain", filters.get("domain"))
    if filters.get("work_mode"):
        base_query += " AND lower(work_mode) = lower(:work_mode) "
        params["work_mode"] = str(filters["work_mode"]).strip()
    add_filter("experience_level", "exp", filters.get("experience_level"))
    add_filter("location", "loc", filters.get("location"))
    add_filter("location_country", "country", filters.get("country"))

    if filters.get("days_old"):
        base_query += " AND posted_at >= NOW() - INTERVAL '1 day' * :days "
        params["days"] = int(filters["days_old"])

    if filters.get("salary_min"):
        base_query += """
            AND salary_range IS NOT NULL AND salary_range != ''
            AND CAST((regexp_match(salary_range, '([0-9]+([.][0-9]+)?)'))[1] AS double precision) >= :salary_min
        """
        params["salary_min"] = float(filters["salary_min"])

    final_query = base_query + " ORDER BY posted_at DESC NULLS LAST LIMIT :limit OFFSET :offset"
    params["limit"] = limit
    params["offset"] = offset

    with engine.connect() as conn:
        result = conn.execute(text(final_query), params)
        results = []
        total = 0
        for row in result:
            job_dict = {}
            for key, value in row._asdict().items():
                if key == "total":
                    total = value or 0
                    continue
                if hasattr(value, "hex"):
                    job_dict[key] = str(value)
                elif hasattr(value, "isoformat"):
                    job_dict[key] = value.isoformat()
                else:
                    job_dict[key] = value
            results.append(job_dict)
        return results, total


import json
def _strip_control_chars(value):
    """Recursively remove NUL (0x00) and other C0 control characters that
    PostgreSQL rejects inside text values (e.g. NUL from PDF extraction).
    """
    if isinstance(value, str):
        return "".join(ch for ch in value if ord(ch) >= 0x20 or ch in "\n\r\t")
    if isinstance(value, dict):
        return {k: _strip_control_chars(v) for k, v in value.items()}
    if isinstance(value, list):
        return [_strip_control_chars(v) for v in value]
    if isinstance(value, tuple):
        return tuple(_strip_control_chars(v) for v in value)
    return value

def persist_pipeline_results(user_id: str, resume_id: str, data: dict):
    """
    Saves the entire analysis outcome (Parsed Data, Analysis, Matches) to the DB.
    Replicates the functionality previously held in Next.js Server Actions.
    """
    data = _strip_control_chars(data)
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
        # 1. Update Resume Record (scoped to the owning user)
        result = conn.execute(
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

        # Ownership gate: only sync matches when the resume belongs to this user.
        # Prevents a caller from wiping/poisoning another user's job_matches rows
        # when they know a resume_id but are not its owner.
        if (result.rowcount or 0) == 0:
            logger.warning(
                "persist_pipeline_results skipped: resume %s not owned by user %s",
                resume_id, user_id,
            )
            return False

        # 2. Sync Job Matches (Delete old, Insert new) — scoped to the owner
        if matches:
            conn.execute(
                text("DELETE FROM job_matches WHERE resume_id = :id AND user_id = :uid"),
                {"id": resume_id, "uid": user_id}
            )

            for m in matches:
                conn.execute(
                    text("""
                        INSERT INTO job_matches (
                            resume_id, user_id, job_title, company, location,
                            match_score, matching_skills, missing_skills,
                            ai_reasoning, apply_links, apply_url, jd_text, created_at
                        ) VALUES (
                            :rid, :uid, :title, :company, :loc,
                            :score, :m_skills, :miss_skills,
                            :reason, :links, :apply_url, :jd_text, NOW()
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
                        "links": json.dumps(m.get("apply_links") or {}),
                        "apply_url": m.get("apply_url") or "",
                        "jd_text": (m.get("description") or "")[:10000]
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
