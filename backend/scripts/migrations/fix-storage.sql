-- 1. Make the bucket PRIVATE. Raw resumes contain PII; only the owner may
-- read or manage their own files. The backend AI service receives the file
-- bytes directly via multipart upload (never via file_url), so public read
-- is not required.
INSERT INTO storage.buckets (id, name, public)
VALUES ('resumes', 'resumes', false)
ON CONFLICT (id) DO UPDATE SET public = false;

-- 2. Clear ALL existing storage policies to remove the old open ones
DO $$ 
DECLARE 
  pol name;
BEGIN
  FOR pol IN (SELECT policyname FROM pg_policies WHERE tablename = 'objects' AND schemaname = 'storage') 
  LOOP
    EXECUTE format('DROP POLICY %I ON storage.objects', pol);
  END LOOP;
END $$;

-- 3. Ensure RLS is enabled on storage.objects
ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;

-- 4. READ POLICY (Owner): users may only read files inside their own folder.
-- Folder path used by the app: resumes/{userId}/filename
-- (first folder segment is the bucket name, so the owner id is segment 2)
CREATE POLICY "Allow owner read access"
ON storage.objects FOR SELECT
TO authenticated
USING (bucket_id = 'resumes' AND (storage.foldername(name))[2] = auth.uid()::text);

-- 5. INSERT POLICY (Authenticated): upload only into own folder.
CREATE POLICY "Allow authenticated upload access"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'resumes' AND (storage.foldername(name))[2] = auth.uid()::text);

-- 6. ALL ACCESS POLICY (Owner): update/delete own files.
CREATE POLICY "Allow users to manage own files"
ON storage.objects FOR ALL
TO authenticated
USING (bucket_id = 'resumes' AND (storage.foldername(name))[2] = auth.uid()::text)
WITH CHECK (bucket_id = 'resumes' AND (storage.foldername(name))[2] = auth.uid()::text);
