-- FIX: Cross-user data leak (IDOR)
-- Replace wide-open RLS policies (`USING (true)`) with ownership-scoped ones so
-- one user can never read/write another user's data via the Supabase anon key.
-- Safe to run multiple times (drops all existing policies on these tables first,
-- so it is idempotent even if fix-dashboard-rls.sql / fix-cover-letters-rls.sql
-- or the old setup-db.ts open policies were applied previously).

-- Drop ALL existing policies on these tables (whatever their names), then
-- recreate with ownership-scoped definitions below.
DO $$
DECLARE
  pol record;
BEGIN
  FOR pol IN (
    SELECT tablename, policyname FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename IN ('users', 'resumes', 'job_matches', 'cover_letters', 'subscriptions', 'job_search_logs', 'audit_logs', 'resume_embeddings')
  ) LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', pol.policyname, pol.tablename);
  END LOOP;
END
$$;

-- Enable RLS (idempotent)
ALTER TABLE resumes ENABLE ROW LEVEL SECURITY;
ALTER TABLE job_matches ENABLE ROW LEVEL SECURITY;
ALTER TABLE cover_letters ENABLE ROW LEVEL SECURITY;
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE job_search_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

-- Resumes: users can only read/insert/update/delete their own
CREATE POLICY "Users can read own resumes" ON resumes FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "Users can insert own resumes" ON resumes FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "Users can update own resumes" ON resumes FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "Users can delete own resumes" ON resumes FOR DELETE TO authenticated USING (user_id = auth.uid());

-- Job matches: users can only access their own
CREATE POLICY "Users can read own matches" ON job_matches FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "Users can insert own matches" ON job_matches FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "Users can update own matches" ON job_matches FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "Users can delete own matches" ON job_matches FOR DELETE TO authenticated USING (user_id = auth.uid());

-- Cover letters: users can only access their own
CREATE POLICY "Users can read own cover letters" ON cover_letters FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "Users can insert own cover letters" ON cover_letters FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "Users can update own cover letters" ON cover_letters FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "Users can delete own cover letters" ON cover_letters FOR DELETE TO authenticated USING (user_id = auth.uid());

-- Users: users can only access their own profile.
-- INSERT is required by the signup flow, which creates the profile row from
-- the client (AuthProvider) with id = auth.uid().
CREATE POLICY "Users can insert own profile" ON users FOR INSERT TO authenticated WITH CHECK (id = auth.uid());
CREATE POLICY "Users can read own profile" ON users FOR SELECT TO authenticated USING (id = auth.uid());
CREATE POLICY "Users can update own profile" ON users FOR UPDATE TO authenticated USING (id = auth.uid()) WITH CHECK (id = auth.uid());

-- Subscriptions: users can only access their own
CREATE POLICY "Users can access own subscriptions" ON subscriptions FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- Job search logs: users can only access their own
CREATE POLICY "Users can access own job_search_logs" ON job_search_logs FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- audit_logs: the Razorpay checkout handler writes a payment record from the
-- client (user_id = auth.uid()); reads are restricted to the owner.
CREATE POLICY "Users can insert own audit_logs" ON audit_logs FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "Users can read own audit_logs" ON audit_logs FOR SELECT TO authenticated USING (user_id = auth.uid());

-- NOTE: resume_embeddings has no user_id column; it is only written/read by the
-- server-side pipeline (service role / direct DATABASE_URL), which bypasses RLS.
-- No policies are granted to authenticated/anon here on purpose.
