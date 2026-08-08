-- AUTO-CREATE public.users PROFILE ON SIGNUP
-- Root cause: brand-new auth users have no public.users row, so inserting a
-- resume fails FK resumes_user_id_fkey (23503). Profiles were only created
-- client-side by AuthProvider on a racy PGRST116 path.
--
-- This creates a trigger on auth.users that auto-inserts the profile row.
-- Run this in Supabase SQL Editor (or via pooler as postgres).
-- Safe to re-run (idempotent).

-- 1. Backfill profiles for existing auth users that have none
INSERT INTO public.users (id, email, full_name, avatar_url, plan, credits_remaining, onboarding_done, created_at, updated_at)
SELECT
  u.id,
  COALESCE(u.email, ''),
  COALESCE(u.raw_user_meta_data->>'full_name', u.raw_user_meta_data->>'name', ''),
  COALESCE(u.raw_user_meta_data->>'avatar_url', u.raw_user_meta_data->>'picture', ''),
  'free',
  3,
  false,
  u.created_at,
  now()
FROM auth.users u
WHERE NOT EXISTS (SELECT 1 FROM public.users p WHERE p.id = u.id)
ON CONFLICT (id) DO NOTHING;

-- 2. Function that creates the profile row for new signups
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.users (id, email, full_name, avatar_url, plan, credits_remaining, onboarding_done, created_at, updated_at)
  VALUES (
    NEW.id,
    COALESCE(NEW.email, ''),
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', ''),
    COALESCE(NEW.raw_user_meta_data->>'avatar_url', NEW.raw_user_meta_data->>'picture', ''),
    'free',
    3,
    false,
    NEW.created_at,
    now()
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

-- 3. Attach the trigger to auth.users
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();
