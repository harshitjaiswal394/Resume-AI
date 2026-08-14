-- Additive DB migration: 5 new tables for 10-agent system
-- All tables use IF NOT EXISTS (safe to re-run)

-- 1. Resume versioning
CREATE TABLE IF NOT EXISTS resume_versions (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    resume_id TEXT NOT NULL,
    version_number SERIAL,
    parent_version_id TEXT,
    parsed_data JSONB NOT NULL,
    diff_json JSONB,
    jd_hash TEXT,
    change_reasons JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. JD extraction cache
CREATE TABLE IF NOT EXISTS jd_extractions (
    url_hash TEXT PRIMARY KEY,
    data JSONB NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    expires_at TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '24 hours')
);

-- 3. User durable memory (3-tier memory system)
CREATE TABLE IF NOT EXISTS user_memory (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    user_id TEXT NOT NULL,
    memory_type TEXT NOT NULL,
    content JSONB NOT NULL,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. Semantic memory with embeddings (pgvector-ready)
CREATE TABLE IF NOT EXISTS semantic_memory (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    memory_type TEXT NOT NULL,
    content JSONB NOT NULL,
    embedding JSONB,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. Interview sessions
CREATE TABLE IF NOT EXISTS interview_sessions (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    interview_type TEXT DEFAULT 'mixed',
    num_questions INTEGER DEFAULT 5,
    current_question INTEGER DEFAULT 0,
    status TEXT DEFAULT 'active',
    resume_data JSONB,
    jd_data JSONB,
    transcript JSONB DEFAULT '[]',
    scores JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for query performance
CREATE INDEX IF NOT EXISTS idx_resume_versions_user ON resume_versions(user_id);
CREATE INDEX IF NOT EXISTS idx_resume_versions_resume ON resume_versions(resume_id);
CREATE INDEX IF NOT EXISTS idx_user_memory_user ON user_memory(user_id);
CREATE INDEX IF NOT EXISTS idx_user_memory_type ON user_memory(user_id, memory_type);
CREATE INDEX IF NOT EXISTS idx_semantic_memory_user ON semantic_memory(user_id);
CREATE INDEX IF NOT EXISTS idx_interview_sessions_user ON interview_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_jd_extractions_expires ON jd_extractions(expires_at);
