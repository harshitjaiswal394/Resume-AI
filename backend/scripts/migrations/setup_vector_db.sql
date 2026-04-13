-- 1. Enable the pgvector extension to work with embeddings
CREATE EXTENSION IF NOT EXISTS vector;

-- 2. Create the job_postings table
CREATE TABLE IF NOT EXISTS job_postings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title TEXT NOT NULL,
    company TEXT NOT NULL,
    location TEXT DEFAULT 'India',
    description TEXT,
    skills TEXT[],
    salary_range TEXT,
    embedding vector(2048), -- matches llama-nemotron-embed-1b-v2 dimensions
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- If you already created the table, run this to fix the dimension:
-- ALTER TABLE job_postings ALTER COLUMN embedding TYPE vector(2048);

-- 3. Create an IVFFlat index for faster vector search
-- Note: 'lists' should be roughly sqrt(total_rows/1000) or similar, but for small sets 10 is fine
CREATE INDEX IF NOT EXISTS job_postings_embedding_idx ON job_postings 
USING ivfflat (embedding vector_cosine_ops) WITH (lists = 10);

-- 4. Sample check
-- SELECT id, title, 1 - (embedding <=> :query_embedding) as similarity FROM job_postings ORDER BY similarity DESC LIMIT 10;
