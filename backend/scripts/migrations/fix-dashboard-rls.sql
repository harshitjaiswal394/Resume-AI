-- RLS POLICIES FOR DASHBOARD DATA ACCESS
-- Run this in Supabase SQL Editor to ensure the dashboard can read your data.

-- 1. Enable RLS on tables (may already be enabled)
ALTER TABLE resumes ENABLE ROW LEVEL SECURITY;
ALTER TABLE job_matches ENABLE ROW LEVEL SECURITY;
ALTER TABLE users ENABLE ROW LEVEL SECURITY;

-- 2. Allow authenticated users to read their own resumes
CREATE POLICY "Users can read own resumes"
ON resumes FOR SELECT
TO authenticated
USING (user_id = auth.uid());

-- 3. Allow authenticated users to insert their own resumes
CREATE POLICY "Users can insert own resumes"
ON resumes FOR INSERT
TO authenticated
WITH CHECK (user_id = auth.uid());

-- 4. Allow authenticated users to update their own resumes
CREATE POLICY "Users can update own resumes"
ON resumes FOR UPDATE
TO authenticated
USING (user_id = auth.uid());

-- 5. Allow authenticated users to delete their own resumes
CREATE POLICY "Users can delete own resumes"
ON resumes FOR DELETE
TO authenticated
USING (user_id = auth.uid());

-- 6. Allow authenticated users to read their own job matches
CREATE POLICY "Users can read own job matches"
ON job_matches FOR SELECT
TO authenticated
USING (user_id = auth.uid());

-- 7. Allow authenticated users to read their own profile
CREATE POLICY "Users can read own profile"
ON users FOR SELECT
TO authenticated
USING (id = auth.uid());

-- 8. Allow authenticated users to update their own profile
CREATE POLICY "Users can update own profile"
ON users FOR UPDATE
TO authenticated
USING (id = auth.uid());

-- 9. Allow the service role (server-side pipeline) to manage all data
-- This is already handled by Supabase's service_role key which bypasses RLS.
-- The Drizzle DB connection uses DATABASE_URL (direct Postgres) which also bypasses RLS.
