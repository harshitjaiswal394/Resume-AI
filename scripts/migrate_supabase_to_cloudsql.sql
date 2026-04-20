-- ResuMatch Supabase to Cloud SQL Master Migration Script
-- Version: 1.0
-- This script prepares a standard PostgreSQL (Cloud SQL) instance to receive 
-- a migrated ResuMatch database from Supabase.

-- 1. Enable Required Extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";     -- For UUID generation
CREATE EXTENSION IF NOT EXISTS vector;          -- For Semantic Search (pgvector)
CREATE EXTENSION IF NOT EXISTS pgcrypto;        -- For password/hashing compatibility
CREATE EXTENSION IF NOT EXISTS pg_trgm;         -- For fuzzy text matching

-- 2. Create Supabase compatibility schemas
CREATE SCHEMA IF NOT EXISTS auth;
CREATE SCHEMA IF NOT EXISTS storage;

-- 3. Create Supabase compatibility roles (Optional but recommended for app consistency)
DO $$
BEGIN
    IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'authenticated') THEN
        CREATE ROLE authenticated;
    END IF;
    IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'anon') THEN
        CREATE ROLE anon;
    END IF;
    IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'service_role') THEN
        CREATE ROLE service_role;
    END IF;
END
$$;

-- 4. auth.users Table Mirror
CREATE TABLE IF NOT EXISTS auth.users (
    id UUID PRIMARY KEY,
    instance_id UUID,
    aud VARCHAR(255),
    role VARCHAR(255),
    email VARCHAR(255) UNIQUE,
    encrypted_password VARCHAR(255),
    email_confirmed_at TIMESTAMP WITH TIME ZONE,
    invited_at TIMESTAMP WITH TIME ZONE,
    confirmation_token VARCHAR(255),
    confirmation_sent_at TIMESTAMP WITH TIME ZONE,
    recovery_token VARCHAR(255),
    recovery_sent_at TIMESTAMP WITH TIME ZONE,
    email_change_token_new VARCHAR(255),
    email_change VARCHAR(255),
    email_change_sent_at TIMESTAMP WITH TIME ZONE,
    last_sign_in_at TIMESTAMP WITH TIME ZONE,
    raw_app_meta_data JSONB,
    raw_user_meta_data JSONB,
    is_super_admin BOOLEAN,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    phone TEXT,
    phone_confirmed_at TIMESTAMP WITH TIME ZONE,
    phone_change TEXT,
    phone_change_token VARCHAR(255),
    phone_change_sent_at TIMESTAMP WITH TIME ZONE,
    confirmed_at TIMESTAMP WITH TIME ZONE,
    email_change_token_current VARCHAR(255),
    email_change_confirm_status SMALLINT DEFAULT 0,
    banned_until TIMESTAMP WITH TIME ZONE,
    reauthentication_token VARCHAR(255),
    reauthentication_sent_at TIMESTAMP WITH TIME ZONE,
    is_sso_user BOOLEAN DEFAULT FALSE,
    deleted_at TIMESTAMP WITH TIME ZONE,
    is_anonymous BOOLEAN DEFAULT FALSE
);

-- 5. storage.objects Table Mirror
CREATE TABLE IF NOT EXISTS storage.objects (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    bucket_id TEXT,
    name TEXT,
    owner UUID REFERENCES auth.users(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    last_accessed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    metadata JSONB,
    path_tokens TEXT[],
    version TEXT,
    owner_id TEXT,
    user_metadata JSONB
);

-- 6. Application Tables (Public Schema)

-- Profiles
CREATE TABLE IF NOT EXISTS public.users (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email TEXT UNIQUE NOT NULL,
    full_name TEXT,
    avatar_url TEXT,
    plan TEXT DEFAULT 'free' NOT NULL,
    credits_remaining INTEGER DEFAULT 3 NOT NULL,
    credits_reset_at TIMESTAMPTZ,
    onboarding_done BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Resumes
CREATE TABLE IF NOT EXISTS resumes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    title TEXT,
    target_role TEXT,
    years_of_experience INTEGER DEFAULT 0,
    phone_number TEXT,
    summary TEXT,
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
    file_hash TEXT,
    raw_text TEXT,
    parsed_data JSONB,
    original_score NUMERIC DEFAULT 0.0,
    resume_score NUMERIC DEFAULT 0.0,
    score_breakdown JSONB,
    error_message TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Job Postings (Vectorized Search Store)
CREATE TABLE IF NOT EXISTS job_postings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    title TEXT NOT NULL,
    company TEXT NOT NULL,
    location TEXT,
    description TEXT,
    skills TEXT[],
    salary_range TEXT,
    domain TEXT,
    source TEXT,
    work_mode TEXT,
    experience_level TEXT,
    education TEXT,
    apply_url TEXT,
    posted_at TIMESTAMPTZ DEFAULT NOW(),
    embedding VECTOR(2048), -- Confirming 2048 for NVIDIA NIM llama-nemotron-embed
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Job Matches
CREATE TABLE IF NOT EXISTS job_matches (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    resume_id UUID NOT NULL REFERENCES resumes(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    job_title TEXT NOT NULL,
    company TEXT,
    location TEXT,
    match_score INTEGER NOT NULL,
    matching_skills JSONB,
    missing_skills JSONB,
    ai_reasoning TEXT,
    apply_links JSONB,
    is_saved BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Cover Letters
CREATE TABLE IF NOT EXISTS cover_letters (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    resume_id UUID REFERENCES resumes(id) ON DELETE CASCADE,
    job_match_id UUID REFERENCES job_matches(id) ON DELETE SET NULL,
    job_title TEXT,
    company TEXT,
    content TEXT NOT NULL,
    tone TEXT DEFAULT 'professional',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Audit Logs
CREATE TABLE IF NOT EXISTS audit_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    action TEXT NOT NULL,
    metadata JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 7. High-Performance Search Indices
-- HNSW index for sub-second vector search (Cosine Similarity)
CREATE INDEX IF NOT EXISTS job_postings_embedding_hnsw_idx ON job_postings 
USING hnsw (embedding vector_cosine_ops);

-- Trigram index for fuzzy text search on job titles/companies
CREATE INDEX IF NOT EXISTS job_postings_title_trgm_idx ON job_postings USING gin (title gin_trgm_ops);
CREATE INDEX IF NOT EXISTS job_postings_company_trgm_idx ON job_postings USING gin (company gin_trgm_ops);

-- GIN index for fast JSONB querying on resumes
CREATE INDEX IF NOT EXISTS resumes_skills_gin_idx ON resumes USING gin (skills);
CREATE INDEX IF NOT EXISTS resumes_experience_gin_idx ON resumes USING gin (experience);

-- Standard B-Tree indices for foreign keys
CREATE INDEX IF NOT EXISTS resumes_user_id_idx ON resumes (user_id);
CREATE INDEX IF NOT EXISTS job_matches_resume_id_idx ON job_matches (resume_id);
CREATE INDEX IF NOT EXISTS job_matches_user_id_idx ON job_matches (user_id);

-- 8. Final Grants
GRANT ALL ON SCHEMA public TO authenticated;
GRANT ALL ON SCHEMA auth TO authenticated;
GRANT ALL ON SCHEMA storage TO authenticated;
GRANT ALL ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT ALL ON ALL TABLES IN SCHEMA auth TO authenticated;
GRANT ALL ON ALL TABLES IN SCHEMA storage TO authenticated;
