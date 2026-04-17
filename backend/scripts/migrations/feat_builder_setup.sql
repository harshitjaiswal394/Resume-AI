-- Migration: Setup Resume Builder and Cover Letter Tables
-- Branch: dev-feat

-- 1. Update Resumes Table for Modular Builder
ALTER TABLE resumes 
ADD COLUMN IF NOT EXISTS title TEXT,
ADD COLUMN IF NOT EXISTS summary TEXT,
ADD COLUMN IF NOT EXISTS skills JSONB DEFAULT '[]'::jsonb,
ADD COLUMN IF NOT EXISTS experience JSONB DEFAULT '[]'::jsonb,
ADD COLUMN IF NOT EXISTS education JSONB DEFAULT '[]'::jsonb,
ADD COLUMN IF NOT EXISTS projects JSONB DEFAULT '[]'::jsonb,
ADD COLUMN IF NOT EXISTS template_id TEXT DEFAULT 'modern',
ADD COLUMN IF NOT EXISTS original_score INTEGER;

-- 2. Create Job Descriptions Table (for URL Parsing & Caching)
CREATE TABLE IF NOT EXISTS job_descriptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id),
    source_url TEXT,
    raw_text TEXT,
    parsed_json JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable RLS for job_descriptions
ALTER TABLE job_descriptions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage their own job descriptions" 
ON job_descriptions FOR ALL 
USING (auth.uid() = user_id);

-- 3. Create Cover Letters Table
CREATE TABLE IF NOT EXISTS cover_letters (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id),
    resume_id UUID REFERENCES resumes(id) ON DELETE CASCADE,
    job_id UUID REFERENCES job_descriptions(id) ON DELETE SET NULL,
    content TEXT,
    template_id TEXT DEFAULT 'professional',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable RLS for cover_letters
ALTER TABLE cover_letters ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage their own cover letters" 
ON cover_letters FOR ALL 
USING (auth.uid() = user_id);

-- 4. Enable standard auditing if needed
CREATE INDEX IF NOT EXISTS idx_resumes_user_id ON resumes(user_id);
CREATE INDEX IF NOT EXISTS idx_cover_letters_user_id ON cover_letters(user_id);
