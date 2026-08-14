-- Migration: Message Feedback & Preference Learning (v10)
-- Adds a `message_feedback` table so users can like/dislike AI responses.
-- The backend aggregates this data to learn what structure / style / relevance
-- users prefer and feeds that back into the agent's system prompt.
--
-- Idempotent: safe to run multiple times.
-- Applies to: Supabase Postgres (public schema).

-- ──────────────────────────────────────────────────────────────────────────────
-- 1. message_feedback table
--    - One row per (user_id, message_id): a user can change their vote (upsert).
--    - Stores a snapshot of the response content + extracted structure features
--      so preference analytics can run without touching the messages table.
-- ──────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS message_feedback (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    message_id UUID NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
    feedback TEXT NOT NULL CHECK (feedback IN ('like', 'dislike')),
    agent TEXT,
    provider TEXT,
    model TEXT,
    content TEXT,
    features JSONB,
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
    UNIQUE (user_id, message_id)
);

-- ──────────────────────────────────────────────────────────────────────────────
-- 2. Indexes for analytics queries (per-user, per-agent, per-feedback).
-- ──────────────────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS message_feedback_user_idx ON message_feedback (user_id);
CREATE INDEX IF NOT EXISTS message_feedback_conv_idx ON message_feedback (conversation_id);
CREATE INDEX IF NOT EXISTS message_feedback_agent_idx ON message_feedback (agent);
CREATE INDEX IF NOT EXISTS message_feedback_feedback_idx ON message_feedback (feedback);
CREATE INDEX IF NOT EXISTS message_feedback_created_idx ON message_feedback (created_at DESC);

-- ──────────────────────────────────────────────────────────────────────────────
-- 3. RLS: users can manage their own feedback only.
-- ──────────────────────────────────────────────────────────────────────────────
ALTER TABLE message_feedback ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'message_feedback' AND policyname = 'Users manage own feedback') THEN
        CREATE POLICY "Users manage own feedback"
            ON message_feedback FOR ALL
            USING (auth.uid() = user_id)
            WITH CHECK (auth.uid() = user_id);
    END IF;
END
$$;
