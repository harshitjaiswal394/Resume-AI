-- Migration: Convert UUID columns to TEXT for Firebase UID support
-- This script safely converts primary and foreign keys from UUID to TEXT

BEGIN;

-- 1. DROP CONSTRAINTS that might block the type change
-- We'll recreate them later if needed, but Firebase IDs don't strictly require UUID-style FKs in the DB if handled by the app

ALTER TABLE IF EXISTS resumes DROP CONSTRAINT IF EXISTS resumes_user_id_fkey;
ALTER TABLE IF EXISTS job_matches DROP CONSTRAINT IF EXISTS job_matches_user_id_fkey;
ALTER TABLE IF EXISTS job_matches DROP CONSTRAINT IF EXISTS job_matches_resume_id_fkey;
ALTER TABLE IF EXISTS cover_letters DROP CONSTRAINT IF EXISTS cover_letters_user_id_fkey;
ALTER TABLE IF EXISTS cover_letters DROP CONSTRAINT IF EXISTS cover_letters_resume_id_fkey;
ALTER TABLE IF EXISTS job_descriptions DROP CONSTRAINT IF EXISTS job_descriptions_user_id_fkey;
ALTER TABLE IF EXISTS audit_logs DROP CONSTRAINT IF EXISTS audit_logs_user_id_fkey;

-- 2. ALTER COLUMNS TO TEXT
-- Users
ALTER TABLE IF EXISTS users ALTER COLUMN id TYPE TEXT USING id::text;

-- Resumes
ALTER TABLE IF EXISTS resumes ALTER COLUMN id TYPE TEXT USING id::text;
ALTER TABLE IF EXISTS resumes ALTER COLUMN user_id TYPE TEXT USING user_id::text;

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

-- Audit Logs
ALTER TABLE IF EXISTS audit_logs ALTER COLUMN user_id TYPE TEXT USING user_id::text;

COMMIT;
