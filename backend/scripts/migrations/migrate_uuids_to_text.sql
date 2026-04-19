-- Migration: Convert UUID columns to TEXT for Firebase UID support (FINAL REVISION)
-- This script drops ALL foreign key constraints in the database to ensure type conversion succeeds.

DO $$ 
DECLARE 
    r RECORD;
BEGIN
    -- 1. DROP ALL FOREIGN KEY CONSTRAINTS across the entire database
    -- This is necessary to change ID types that are referenced by other tables (like resume_embeddings)
    FOR r IN (
        SELECT conname, relname 
        FROM pg_constraint c 
        JOIN pg_class t ON c.conrelid = t.oid 
        WHERE contype = 'f'
    ) LOOP
        EXECUTE 'ALTER TABLE ' || quote_ident(r.relname) || ' DROP CONSTRAINT ' || quote_ident(r.conname);
    END LOOP;

    -- 2. ALTER COLUMNS TO TEXT
    -- Users & Authors
    ALTER TABLE IF EXISTS users ALTER COLUMN id TYPE TEXT USING id::text;
    
    -- Resumes & Content
    ALTER TABLE IF EXISTS resumes ALTER COLUMN id TYPE TEXT USING id::text;
    ALTER TABLE IF EXISTS resumes ALTER COLUMN user_id TYPE TEXT USING user_id::text;
    
    -- Embeddings (The previous blocker)
    ALTER TABLE IF EXISTS resume_embeddings ALTER COLUMN id TYPE TEXT USING id::text;
    ALTER TABLE IF EXISTS resume_embeddings ALTER COLUMN resume_id TYPE TEXT USING resume_id::text;

    -- Job Matches
    ALTER TABLE IF EXISTS job_matches ALTER COLUMN id TYPE TEXT USING id::text;
    ALTER TABLE IF EXISTS job_matches ALTER COLUMN user_id TYPE TEXT USING user_id::text;
    ALTER TABLE IF EXISTS job_matches ALTER COLUMN resume_id TYPE TEXT USING resume_id::text;

    -- Job Descriptions
    ALTER TABLE IF EXISTS job_descriptions ALTER COLUMN id TYPE TEXT USING id::text;
    ALTER TABLE IF EXISTS job_descriptions ALTER COLUMN user_id TYPE TEXT USING user_id::text;

    -- Cover Letters
    ALTER TABLE IF EXISTS cover_letters ALTER COLUMN id TYPE TEXT USING id::text;
    ALTER TABLE IF EXISTS cover_letters ALTER COLUMN user_id TYPE TEXT USING user_id::text;
    ALTER TABLE IF EXISTS cover_letters ALTER COLUMN resume_id TYPE TEXT USING resume_id::text;

    -- Logs
    ALTER TABLE IF EXISTS audit_logs ALTER COLUMN user_id TYPE TEXT USING user_id::text;

    -- 3. Defaults & Schema Corrections
    ALTER TABLE IF EXISTS job_matches DROP COLUMN IF EXISTS matching_skills;
    ALTER TABLE IF EXISTS job_matches DROP COLUMN IF EXISTS missing_skills;
    ALTER TABLE IF EXISTS job_matches ADD COLUMN IF NOT EXISTS matching_skills text[];
    ALTER TABLE IF EXISTS job_matches ADD COLUMN IF NOT EXISTS missing_skills text[];
    
    ALTER TABLE IF EXISTS resumes ALTER COLUMN title SET DEFAULT 'Untitled Resume';
    ALTER TABLE IF EXISTS resumes ALTER COLUMN status SET DEFAULT 'draft';

    RAISE NOTICE 'Universal UUID to TEXT migration completed successfully.';
END $$;
