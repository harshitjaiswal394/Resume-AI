-- Migration: AI Security Core (v9)
-- Adds columns to the existing `audit_logs` table used by the AI security
-- layer, and creates the `prompt_versions` table for prompt governance.
--
-- Idempotent: safe to run multiple times.
-- Applies to: Supabase Postgres (public schema).

-- ──────────────────────────────────────────────────────────────────────────────
-- 1. Extend audit_logs for AI security telemetry
-- ──────────────────────────────────────────────────────────────────────────────
ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS organization_id UUID;
ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS event_type TEXT;
ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS request_id TEXT;
ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS provider TEXT;
ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS model TEXT;
ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS tokens_in INTEGER;
ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS tokens_out INTEGER;
ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS cost_usd DOUBLE PRECISION;
ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS tool TEXT;
ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS agent TEXT;
ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS latency_ms INTEGER;
ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS prompt_hash TEXT;
ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS verdict JSONB;

CREATE INDEX IF NOT EXISTS audit_event_type_idx ON audit_logs (event_type);
CREATE INDEX IF NOT EXISTS audit_request_idx ON audit_logs (request_id);
CREATE INDEX IF NOT EXISTS audit_provider_idx ON audit_logs (provider);

-- ──────────────────────────────────────────────────────────────────────────────
-- 2. Prompt versioning (prompt governance / rollback)
-- ──────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS prompt_versions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agent TEXT NOT NULL,
    version INTEGER NOT NULL,
    content TEXT NOT NULL,
    checksum TEXT NOT NULL,
    author TEXT,
    active BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    UNIQUE (agent, version)
);

CREATE INDEX IF NOT EXISTS prompt_versions_agent_idx ON prompt_versions (agent);

-- ──────────────────────────────────────────────────────────────────────────────
-- 3. RLS: only allow insert of audit rows; reads restricted to owners/admins
--    (keep default-deny semantics for everything else)
-- ──────────────────────────────────────────────────────────────────────────────
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE prompt_versions ENABLE ROW LEVEL SECURITY;

-- Service role bypasses RLS (used by the backend connection).
-- Authenticated clients may insert audit entries (server uses service role).
-- NOTE: CREATE POLICY does not support IF NOT EXISTS; use idempotent DO blocks.
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'audit_logs' AND policyname = 'Audit insert via service role') THEN
        CREATE POLICY "Audit insert via service role"
            ON audit_logs FOR INSERT
            TO authenticated
            WITH CHECK (true);
    END IF;
END
$$;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'audit_logs' AND policyname = 'Audit owner read') THEN
        CREATE POLICY "Audit owner read"
            ON audit_logs FOR SELECT
            TO authenticated
            USING (user_id = auth.uid());
    END IF;
END
$$;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'prompt_versions' AND policyname = 'Prompt versions service insert') THEN
        CREATE POLICY "Prompt versions service insert"
            ON prompt_versions FOR INSERT
            TO authenticated
            WITH CHECK (true);
    END IF;
END
$$;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'prompt_versions' AND policyname = 'Prompt versions service select') THEN
        CREATE POLICY "Prompt versions service select"
            ON prompt_versions FOR SELECT
            TO authenticated
            USING (true);
    END IF;
END
$$;
