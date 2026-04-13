-- Add new specialized fields for the Knowledge Base and UI Filtering
ALTER TABLE job_postings ADD COLUMN IF NOT EXISTS domain TEXT;
ALTER TABLE job_postings ADD COLUMN IF NOT EXISTS source TEXT;
ALTER TABLE job_postings ADD COLUMN IF NOT EXISTS posted_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now());
ALTER TABLE job_postings ADD COLUMN IF NOT EXISTS work_mode TEXT;
ALTER TABLE job_postings ADD COLUMN IF NOT EXISTS experience_level TEXT;
ALTER TABLE job_postings ADD COLUMN IF NOT EXISTS education TEXT;
ALTER TABLE job_postings ADD COLUMN IF NOT EXISTS apply_url TEXT;

-- Create an index to quickly filter by domain and posted_at
CREATE INDEX IF NOT EXISTS idx_job_postings_domain ON job_postings (domain);
CREATE INDEX IF NOT EXISTS idx_job_postings_posted_at ON job_postings (posted_at);
