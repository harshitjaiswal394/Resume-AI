-- 1. Create the bucket if it doesn't exist (PRIVATE — no public read/write)
-- Raw resumes contain PII; only the owner may read or manage their own files.
-- The backend AI service receives the file bytes directly via multipart upload
-- (it never reads file_url), so no public read is required.
INSERT INTO storage.buckets (id, name, public)
VALUES ('resumes', 'resumes', false)
ON CONFLICT (id) DO UPDATE SET public = false;

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

-- 4. READ POLICY (Owner): Users may only read files inside their own folder.
-- Folder path used by the app: resumes/{userId}/filename
-- (the first folder segment is the bucket name, so the owner id is segment 2)
CREATE POLICY "Allow owner read access"
ON storage.objects FOR SELECT
TO authenticated
USING (bucket_id = 'resumes' AND (storage.foldername(name))[2] = auth.uid()::text);

-- 5. INSERT POLICY (Authenticated): Logged-in users may upload only into their
-- own folder. Used for authenticated onboarding and dashboard 'Upload New'.
CREATE POLICY "Allow authenticated upload access"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'resumes' AND (storage.foldername(name))[2] = auth.uid()::text);

-- 6. ALL ACCESS POLICY (Owner): Allow users to update or delete their own files.
CREATE POLICY "Allow users to manage own files"
ON storage.objects FOR ALL
TO authenticated
USING (bucket_id = 'resumes' AND (storage.foldername(name))[2] = auth.uid()::text)
WITH CHECK (bucket_id = 'resumes' AND (storage.foldername(name))[2] = auth.uid()::text);
