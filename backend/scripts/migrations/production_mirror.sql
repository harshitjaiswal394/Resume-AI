-- MIRROR PRODUCTION SCHEMA (Supabase) to GCP STAGING
-- Run this on GCP Cloud SQL (resumatch_staging)

-- 1. Correct job_matches schema (Back to ARRAY / text[])
ALTER TABLE job_matches 
ALTER COLUMN matching_skills TYPE text[] USING matching_skills::text[],
ALTER COLUMN missing_skills TYPE text[] USING missing_skills::text[];

-- 2. Correct audit_logs schema (Rename details back to metadata)
ALTER TABLE audit_logs RENAME COLUMN details TO metadata;

-- 3. Ensure resumes table has necessary columns for title tracking
-- (Assuming they exist based on setup script, but double checking/ensuring defaults)
ALTER TABLE resumes ALTER COLUMN title SET DEFAULT 'Untitled Resume';
ALTER TABLE resumes ALTER COLUMN status SET DEFAULT 'draft';
