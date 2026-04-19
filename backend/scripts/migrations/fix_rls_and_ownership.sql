-- Migration: Disable RLS and prepare for Application-level ownership
-- Moving away from Supabase-inherited RLS to allow Firebase UIDs

BEGIN;

-- Disable RLS on core tables
ALTER TABLE IF EXISTS resumes DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS job_matches DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS users DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS job_descriptions DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS cover_letters DISABLE ROW LEVEL SECURITY;

-- Remove the Supabase-specific policies if they exist (optional but cleaner)
DROP POLICY IF EXISTS "Users can manage their own resumes" ON resumes;
DROP POLICY IF EXISTS "Users can manage their own job matches" ON job_matches;
DROP POLICY IF EXISTS "Users can manage their own profiles" ON users;
DROP POLICY IF EXISTS "Users can manage their own job descriptions" ON job_descriptions;
DROP POLICY IF EXISTS "Users can manage their own cover letters" ON cover_letters;

COMMIT;
