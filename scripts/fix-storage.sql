-- 1. Create the bucket if it doesn't exist
INSERT INTO storage.buckets (id, name, public)
VALUES ('resumes', 'resumes', true)
ON CONFLICT (id) DO NOTHING;

-- 2. Allow anyone to upload resumes (for demo/guest flow)
CREATE POLICY "Allow anon upload"
ON storage.objects FOR INSERT
TO public
WITH CHECK (bucket_id = 'resumes');

-- 3. Allow anyone to read resumes (needed for the processing pipeline)
CREATE POLICY "Allow public read"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'resumes');

-- 4. Allow authenticated users to manage their own resumes
CREATE POLICY "Users can manage own resume files"
ON storage.objects FOR ALL
TO authenticated
USING (bucket_id = 'resumes');
