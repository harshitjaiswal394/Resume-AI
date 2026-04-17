-- GCP Cloud SQL Schema Setup (Standardized PostgreSQL)
-- This file initializes the database without Supabase-specific dependencies.

-- 1. Prerequisites
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS vector;

-- 2. Resumes Table
CREATE TABLE IF NOT EXISTS resumes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL, -- Reference to Supabase User ID (unconstrained)
    title TEXT,
    summary TEXT,
    phone_number TEXT,
    skills JSONB DEFAULT '[]'::jsonb,
    experience JSONB DEFAULT '[]'::jsonb,
    education JSONB DEFAULT '[]'::jsonb,
    projects JSONB DEFAULT '[]'::jsonb,
    certifications JSONB DEFAULT '[]'::jsonb,
    languages JSONB DEFAULT '[]'::jsonb,
    achievements JSONB DEFAULT '[]'::jsonb,
    internships JSONB DEFAULT '[]'::jsonb,
    section_order TEXT[] DEFAULT '{ "summary", "skills", "experience", "education", "projects", "certifications", "languages", "achievements", "internships" }',
    template_id TEXT DEFAULT 'modern',
    status TEXT DEFAULT 'draft',
    file_url TEXT,
    file_name TEXT,
    file_type TEXT,
    file_size_bytes BIGINT,
    parsed_data JSONB,
    original_score INTEGER,
    resume_score INTEGER DEFAULT 0,
    score_breakdown JSONB,
    target_role TEXT,
    years_of_experience INTEGER DEFAULT 0,
    raw_text TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 3. Job Descriptions Table
CREATE TABLE IF NOT EXISTS job_descriptions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID,
    source_url TEXT,
    raw_text TEXT,
    parsed_json JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 4. Job Matches Table
CREATE TABLE IF NOT EXISTS job_matches (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    resume_id UUID REFERENCES resumes(id) ON DELETE CASCADE,
    user_id UUID,
    job_title TEXT,
    company TEXT,
    location TEXT,
    match_score INTEGER,
    matching_skills TEXT[],
    missing_skills TEXT[],
    ai_reasoning TEXT,
    apply_links JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 5. Job Postings (Vector Storage)
CREATE TABLE IF NOT EXISTS job_postings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    title TEXT NOT NULL,
    company TEXT NOT NULL,
    location TEXT DEFAULT 'India',
    description TEXT,
    skills TEXT[],
    salary_range TEXT,
    domain TEXT,
    work_mode TEXT,
    experience_level TEXT,
    education TEXT,
    apply_url TEXT,
    embedding vector(2048),
    posted_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS job_postings_embedding_idx ON job_postings 
USING ivfflat (embedding vector_cosine_ops) WITH (lists = 10);

-- 6. Audit Logs
CREATE TABLE IF NOT EXISTS audit_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID,
    action TEXT,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_resumes_user_id ON resumes(user_id);
CREATE INDEX IF NOT EXISTS idx_job_matches_resume_id ON job_matches(resume_id);
CREATE INDEX IF NOT EXISTS idx_job_postings_domain ON job_postings(domain);
