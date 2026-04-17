-- ResuMatch GCP Schema Setup (Full Production Mirror)
-- This script replicates Supabase platform schemas and fixes application metadata.

-- 1. Extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- 2. Schemas
CREATE SCHEMA IF NOT EXISTS auth;
CREATE SCHEMA IF NOT EXISTS storage;

-- 3. auth.users Mirror
DROP TABLE IF EXISTS auth.users CASCADE;
CREATE TABLE auth.users (
    instance_id UUID,
    id UUID PRIMARY KEY,
    aud VARCHAR(255),
    role VARCHAR(255),
    email VARCHAR(255),
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
    created_at TIMESTAMP WITH TIME ZONE,
    updated_at TIMESTAMP WITH TIME ZONE,
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

-- 4. storage.objects Mirror
DROP TABLE IF EXISTS storage.objects CASCADE;
CREATE TABLE storage.objects (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    bucket_id TEXT,
    name TEXT,
    owner UUID,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    last_accessed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    metadata JSONB,
    path_tokens TEXT[],
    version TEXT,
    owner_id TEXT,
    user_metadata JSONB
);

-- 5. public.users (Application Profiles)
DROP TABLE IF EXISTS public.users CASCADE;
CREATE TABLE public.users (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email TEXT,
    full_name TEXT,
    avatar_url TEXT,
    plan TEXT DEFAULT 'free',
    credits_remaining INTEGER DEFAULT 5,
    credits_reset_at TIMESTAMP WITH TIME ZONE,
    onboarding_done BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 6. Job Postings (Full Metadata)
DROP TABLE IF EXISTS job_postings CASCADE;
CREATE TABLE job_postings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    title TEXT NOT NULL,
    company TEXT NOT NULL,
    location TEXT DEFAULT 'India',
    description TEXT,
    skills TEXT[], -- ARRAY type for matching
    salary_range TEXT,
    domain TEXT, -- Required for dashboard filtering
    source TEXT,
    work_mode TEXT,
    experience_level TEXT,
    education TEXT,
    apply_url TEXT,
    posted_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    embedding vector(2048),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 7. Resumes Table
DROP TABLE IF EXISTS resumes CASCADE;
CREATE TABLE resumes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL,
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
    file_hash TEXT,
    parsed_data JSONB,
    original_score INTEGER,
    resume_score INTEGER DEFAULT 0,
    ats_score INTEGER DEFAULT 0,
    score_breakdown JSONB,
    error_message TEXT,
    target_role TEXT,
    years_of_experience INTEGER DEFAULT 0,
    raw_text TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 8. Job Matches Table
DROP TABLE IF EXISTS job_matches CASCADE;
CREATE TABLE job_matches (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    resume_id UUID REFERENCES resumes(id) ON DELETE CASCADE,
    user_id UUID,
    job_title TEXT,
    company TEXT,
    location TEXT,
    match_score INTEGER,
    matching_skills JSONB,
    missing_skills JSONB,
    ai_reasoning TEXT,
    apply_links JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 9. Cover Letters Table
DROP TABLE IF EXISTS cover_letters CASCADE;
CREATE TABLE cover_letters (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID,
    resume_id UUID REFERENCES resumes(id) ON DELETE CASCADE,
    job_match_id UUID REFERENCES job_matches(id) ON DELETE SET NULL,
    job_title TEXT,
    company TEXT,
    content TEXT,
    tone TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 10. Resume Embeddings
DROP TABLE IF EXISTS resume_embeddings CASCADE;
CREATE TABLE resume_embeddings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    resume_id UUID REFERENCES resumes(id) ON DELETE CASCADE,
    embedding vector(2048),
    skill_keywords TEXT[],
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 11. Audit Logs
DROP TABLE IF EXISTS audit_logs CASCADE;
CREATE TABLE audit_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID,
    action TEXT,
    entity_type TEXT,
    entity_id UUID,
    details JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
