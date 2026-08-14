-- Job Tracker: RLS hardening for the existing job_applications table
-- The table already exists (created previously) with columns:
--   id uuid PK, user_id text NOT NULL, company, title, location, apply_url,
--   salary_range jsonb, status text NOT NULL DEFAULT 'saved', notes,
--   source, job_posting_id, resume_id, cover_letter_id, tailored_version_id,
--   interview_at, offer_amount, offer_currency, offer_at, outcome, applied_at,
--   created_at, updated_at
-- This migration is purely additive: it only enables RLS and adds
-- ownership-scoped policies + indexes. No existing column is altered.

ALTER TABLE job_applications ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_job_applications_user ON job_applications (user_id);
CREATE INDEX IF NOT EXISTS idx_job_applications_status ON job_applications (status);

-- user_id is TEXT; compare against auth.uid() cast to text so the policy holds
-- for both fresh inserts and any existing rows regardless of uuid formatting.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'job_applications' AND policyname = 'Users can read own job_applications') THEN
    CREATE POLICY "Users can read own job_applications" ON job_applications FOR SELECT TO authenticated USING (user_id = auth.uid()::text);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'job_applications' AND policyname = 'Users can insert own job_applications') THEN
    CREATE POLICY "Users can insert own job_applications" ON job_applications FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid()::text);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'job_applications' AND policyname = 'Users can update own job_applications') THEN
    CREATE POLICY "Users can update own job_applications" ON job_applications FOR UPDATE TO authenticated USING (user_id = auth.uid()::text) WITH CHECK (user_id = auth.uid()::text);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'job_applications' AND policyname = 'Users can delete own job_applications') THEN
    CREATE POLICY "Users can delete own job_applications" ON job_applications FOR DELETE TO authenticated USING (user_id = auth.uid()::text);
  END IF;
END
$$;
