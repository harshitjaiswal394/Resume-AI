-- RLS POLICIES FOR COVER LETTERS

-- 1. Create the cover_letters table if it doesn't exist
CREATE TABLE IF NOT EXISTS cover_letters (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    resume_id UUID REFERENCES resumes(id) ON DELETE CASCADE,
    job_match_id UUID REFERENCES job_matches(id) ON DELETE CASCADE,
    job_title TEXT NOT NULL,
    company TEXT,
    content TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 2. Enable RLS
ALTER TABLE cover_letters ENABLE ROW LEVEL SECURITY;

-- 3. Allow authenticated users to read their own cover letters
CREATE POLICY "Users can read own cover letters"
ON cover_letters FOR SELECT
TO authenticated
USING (user_id = auth.uid());

-- 4. Allow authenticated users to insert their own cover letters
CREATE POLICY "Users can insert own cover letters"
ON cover_letters FOR INSERT
TO authenticated
WITH CHECK (user_id = auth.uid());

-- 5. Allow authenticated users to update their own cover letters
CREATE POLICY "Users can update own cover letters"
ON cover_letters FOR UPDATE
TO authenticated
USING (user_id = auth.uid());

-- 6. Allow authenticated users to delete their own cover letters
CREATE POLICY "Users can delete own cover letters"
ON cover_letters FOR DELETE
TO authenticated
USING (user_id = auth.uid());
