-- Migration: DPDP Act (India) Compliance (v11)
-- Digital Personal Data Protection Act, 2023 + DPDP Rules 2025 readiness.
--
-- 1. user_consents table: explicit, granular, logged consent records.
-- 2. Lifecycle columns on public.users: erasure scheduling + activity tracking.
-- 3. Indexes for the nightly retention purge.
--
-- Idempotent: safe to run multiple times. Applies to Supabase Postgres.
-- NOTE: lifecycle columns live on the APP profile table (public.users), not
-- auth.users, because auth.users is managed by Supabase Auth.

-- ──────────────────────────────────────────────────────────────────────────────
-- 1. Consent management (granular, opt-in, logged)
-- ──────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS user_consents (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id          UUID NOT NULL REFERENCES public.users (id) ON DELETE CASCADE,
    consent_type     TEXT NOT NULL CHECK (consent_type IN ('essential', 'analytics', 'marketing', 'preferences')),
    status           BOOLEAN NOT NULL DEFAULT FALSE,   -- TRUE = granted, FALSE = withdrawn
    notice_version   TEXT NOT NULL DEFAULT 'v1.0',     -- privacy notice revision shown
    language_code    VARCHAR(5) NOT NULL DEFAULT 'en', -- notice language (en, hi, ta, ...)
    ip_address       VARCHAR(45),                      -- masked/full IP for audit trail
    created_at       TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    UNIQUE (user_id, consent_type)
);

CREATE INDEX IF NOT EXISTS user_consents_user_idx ON user_consents (user_id);
CREATE INDEX IF NOT EXISTS user_consents_type_idx ON user_consents (consent_type, status);

-- ──────────────────────────────────────────────────────────────────────────────
-- 2. Data lifecycle columns on the app profile table
-- ──────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS account_status TEXT NOT NULL DEFAULT 'active';
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS deletion_requested_at TIMESTAMPTZ;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS hard_delete_due_at TIMESTAMPTZ;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS last_activity_at TIMESTAMPTZ;

-- Keep status values sane.
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'users_account_status_check'
          AND conrelid = 'public.users'::regclass
    ) THEN
        ALTER TABLE public.users ADD CONSTRAINT users_account_status_check
            CHECK (account_status IN ('active', 'suspended', 'deletion_requested'));
    END IF;
END
$$;

-- Indexes to make the nightly purge scan fast.
CREATE INDEX IF NOT EXISTS users_purge_queue_idx ON public.users (account_status, hard_delete_due_at)
    WHERE account_status = 'deletion_requested' AND hard_delete_due_at IS NOT NULL;

-- Touch last_activity_at on profile updates (data-minimization aid).
CREATE OR REPLACE FUNCTION public.touch_last_activity()
RETURNS TRIGGER AS $$
BEGIN
    NEW.last_activity_at = timezone('utc'::text, now());
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS users_touch_last_activity ON public.users;
CREATE TRIGGER users_touch_last_activity
    BEFORE UPDATE ON public.users
    FOR EACH ROW
    WHEN (OLD.last_activity_at IS DISTINCT FROM NEW.last_activity_at OR NEW.last_activity_at IS NULL)
    EXECUTE FUNCTION public.touch_last_activity();

-- ──────────────────────────────────────────────────────────────────────────────
-- 3. RLS on user_consents: owners can manage their own records only.
-- ──────────────────────────────────────────────────────────────────────────────
ALTER TABLE user_consents ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'user_consents' AND policyname = 'User consents own all') THEN
        CREATE POLICY "User consents own all"
            ON user_consents
            USING (auth.uid() = user_id)
            WITH CHECK (auth.uid() = user_id);
    END IF;
END
$$;
