-- 1. Create the bucket if it doesn't exist (publicly accessible)
INSERT INTO storage.buckets (id, name, public)
VALUES ('resumes', 'resumes', true)
ON CONFLICT (id) DO UPDATE SET public = true;

-- 2. Clear existing policies on storage.objects for the 'resumes' bucket
-- This prevents conflicts between multiple policies
DO $$ 
DECLARE 
  pol name;
BEGIN
  FOR pol IN (SELECT policyname FROM pg_policies WHERE tablename = 'objects' AND schemaname = 'storage') 
  LOOP
    EXECUTE format('DROP POLICY %I ON storage.objects', pol);
  END LOOP;
END $$;

-- 3. Enable RLS on storage.objects
ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;

-- 4. READ POLICY: Allow public (anon + authenticated) to read any resume
-- This is necessary so the backend AI service can fetch the PDF for analysis.
CREATE POLICY "Allow public read access"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'resumes');

-- 5. INSERT POLICY (Guest): Allow anonymous users to upload
-- Used during the initial guest onboarding flow.
CREATE POLICY "Allow guest upload access"
ON storage.objects FOR INSERT
TO anon
WITH CHECK (bucket_id = 'resumes');

-- 6. INSERT POLICY (Authenticated): Allow logged-in users to upload
-- Used for authenticated onboarding and dashboard 'Upload New'.
CREATE POLICY "Allow authenticated upload access"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'resumes');

-- 7. ALL ACCESS POLICY (Owner): Allow users to manage their own files
-- This allows authenticated users to update or delete files in their own folder.
-- Folder path assumed: resumes/{userId}/filename
CREATE POLICY "Allow users to manage own files"
ON storage.objects FOR ALL
TO authenticated
USING (bucket_id = 'resumes' AND (storage.foldername(name))[1] = auth.uid()::text)
WITH CHECK (bucket_id = 'resumes' AND (storage.foldername(name))[1] = auth.uid()::text);
