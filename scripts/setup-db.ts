import { Client } from 'pg';
import * as dotenv from 'dotenv';

dotenv.config();

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  console.error('❌ DATABASE_URL is not set. Set it in .env or the environment before running setup.');
  process.exit(1);
}

async function setup() {
  console.log('🚀 Starting database setup with pg...');

  const client = new Client({
    connectionString: databaseUrl,
    ssl: {
      rejectUnauthorized: false
    }
  });

  try {
    await client.connect();
    console.log('✅ Connected to database.');

    // 1. Extensions
    console.log('📦 Creating extensions...');
    await client.query('CREATE EXTENSION IF NOT EXISTS "uuid-ossp";');
    await client.query('CREATE EXTENSION IF NOT EXISTS "vector";');
    await client.query('CREATE EXTENSION IF NOT EXISTS "pg_trgm";');
    console.log('✅ Extensions created.');

    // 2. Tables (Manual creation since drizzle-kit push is failing)
    console.log('🏗️ Creating tables...');
    
    // Users table
    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id UUID PRIMARY KEY,
        email TEXT NOT NULL UNIQUE,
        full_name TEXT,
        avatar_url TEXT,
        plan TEXT DEFAULT 'free' NOT NULL,
        credits_remaining INTEGER DEFAULT 3 NOT NULL,
        credits_reset_at TIMESTAMPTZ,
        onboarding_done BOOLEAN DEFAULT false,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);

    // Resumes table
    await client.query(`
      CREATE TABLE IF NOT EXISTS resumes (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        file_url TEXT NOT NULL,
        file_name TEXT NOT NULL,
        file_type TEXT NOT NULL,
        file_size_bytes INTEGER,
        file_hash TEXT,
        status TEXT DEFAULT 'uploading' NOT NULL,
        raw_text TEXT,
        parsed_data JSONB,
        resume_score INTEGER,
        ats_score INTEGER,
        score_breakdown JSONB,
        error_message TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);

    // Job Matches table
    await client.query(`
      CREATE TABLE IF NOT EXISTS job_matches (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        resume_id UUID NOT NULL REFERENCES resumes(id) ON DELETE CASCADE,
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        job_title TEXT NOT NULL,
        company TEXT,
        location TEXT,
        job_description TEXT,
        match_score INTEGER NOT NULL,
        embedding_score INTEGER,
        reasoning_score INTEGER,
        rerank_score INTEGER,
        matching_skills TEXT[],
        missing_skills TEXT[],
        salary_min INTEGER,
        salary_max INTEGER,
        ai_reasoning TEXT,
        rejection_reasons TEXT[],
        improvement_steps TEXT[],
        apply_links JSONB,
        is_saved BOOLEAN DEFAULT false,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);

    // Resume Embeddings table
    await client.query(`
      CREATE TABLE IF NOT EXISTS resume_embeddings (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        resume_id UUID NOT NULL REFERENCES resumes(id) ON DELETE CASCADE,
        embedding VECTOR(1536),
        skill_keywords TEXT[],
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);

    // Cover Letters table
    await client.query(`
      CREATE TABLE IF NOT EXISTS cover_letters (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        resume_id UUID REFERENCES resumes(id) ON DELETE SET NULL,
        job_match_id UUID REFERENCES job_matches(id) ON DELETE SET NULL,
        job_title TEXT,
        company TEXT,
        content TEXT NOT NULL,
        tone TEXT DEFAULT 'professional',
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);

    // Subscriptions table
    await client.query(`
      CREATE TABLE IF NOT EXISTS subscriptions (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        razorpay_sub_id TEXT UNIQUE,
        razorpay_customer_id TEXT,
        plan TEXT NOT NULL,
        status TEXT NOT NULL,
        current_period_start TIMESTAMPTZ,
        current_period_end TIMESTAMPTZ,
        cancelled_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);

    // Job Search Logs table
    await client.query(`
      CREATE TABLE IF NOT EXISTS job_search_logs (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        user_id UUID REFERENCES users(id) ON DELETE SET NULL,
        resume_id UUID REFERENCES resumes(id) ON DELETE SET NULL,
        search_query TEXT,
        result_count INTEGER,
        duration_ms INTEGER,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);

    // Audit Logs table
    await client.query(`
      CREATE TABLE IF NOT EXISTS audit_logs (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        user_id UUID REFERENCES users(id) ON DELETE SET NULL,
        action TEXT NOT NULL,
        metadata JSONB,
        ip_address TEXT,
        user_agent TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);

    console.log('✅ Tables created.');

    const tables = ['users', 'resumes', 'job_matches', 'resume_embeddings', 'cover_letters', 'subscriptions', 'job_search_logs', 'audit_logs'];
    for (const table of tables) {
      await client.query(`ALTER TABLE ${table} ENABLE ROW LEVEL SECURITY;`);
      // Drop any existing policies to start fresh
      await client.query(`
        DO $$ 
        DECLARE 
          pol name;
        BEGIN
          FOR pol IN (SELECT policyname FROM pg_policies WHERE tablename = '${table}') 
          LOOP
            EXECUTE format('DROP POLICY %I ON %I', pol, '${table}');
          END LOOP;
        END $$;
      `);
    }

    // Ownership-scoped policies. Every user can ONLY see/modify their OWN rows.
    // (The backend service role / direct DATABASE_URL connection bypasses RLS,
    // so server-side pipeline writes are unaffected.)

    // 1. Users table policies
    await client.query(`
      CREATE POLICY "Users can access own profile" ON users FOR ALL TO authenticated USING (id = auth.uid()) WITH CHECK (id = auth.uid());
    `);

    // 2. Resumes table policies
    await client.query(`
      CREATE POLICY "Users can read own resumes" ON resumes FOR SELECT TO authenticated USING (user_id = auth.uid());
      CREATE POLICY "Users can insert own resumes" ON resumes FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
      CREATE POLICY "Users can update own resumes" ON resumes FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
      CREATE POLICY "Users can delete own resumes" ON resumes FOR DELETE TO authenticated USING (user_id = auth.uid());
    `);

    // 3. Job Matches table policies
    await client.query(`
      CREATE POLICY "Users can read own matches" ON job_matches FOR SELECT TO authenticated USING (user_id = auth.uid());
      CREATE POLICY "Users can insert own matches" ON job_matches FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
      CREATE POLICY "Users can update own matches" ON job_matches FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
      CREATE POLICY "Users can delete own matches" ON job_matches FOR DELETE TO authenticated USING (user_id = auth.uid());
    `);

    // 4. Cover Letters table policies
    await client.query(`
      CREATE POLICY "Users can read own cover letters" ON cover_letters FOR SELECT TO authenticated USING (user_id = auth.uid());
      CREATE POLICY "Users can insert own cover letters" ON cover_letters FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
      CREATE POLICY "Users can update own cover letters" ON cover_letters FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
      CREATE POLICY "Users can delete own cover letters" ON cover_letters FOR DELETE TO authenticated USING (user_id = auth.uid());
    `);

    // 5. Other user-owned tables (resume_embeddings is scoped via its owning
    // resume, so it is queried by the server-side pipeline / service role only).
    await client.query(`
      CREATE POLICY "Users can access own subscriptions" ON subscriptions FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
      CREATE POLICY "Users can access own job_search_logs" ON job_search_logs FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
      -- audit_logs: the Razorpay checkout handler writes a payment record from
      -- the client with user_id = auth.uid(); reads are restricted to the owner.
      CREATE POLICY "Users can insert own audit_logs" ON audit_logs FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
      CREATE POLICY "Users can read own audit_logs" ON audit_logs FOR SELECT TO authenticated USING (user_id = auth.uid());
    `);

    console.log('✅ RLS setup complete.');
    console.log('🎉 Database setup successful!');
  } catch (error) {
    console.error('❌ Setup failed:', error);
  } finally {
    await client.end();
  }
}

setup();
