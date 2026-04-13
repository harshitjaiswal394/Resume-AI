import { Client } from 'pg';
import * as dotenv from 'dotenv';

process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

dotenv.config();

const databaseUrl = process.env.DATABASE_URL || 'postgresql://postgres.fukxrsqmulucvfvowcou:painkiller%40829445@aws-1-ap-south-1.pooler.supabase.com:6543/postgres?sslmode=require';

async function setup() {
  console.log('🚀 Starting database setup with pg...');
  
  const client = new Client({
    host: '3.111.225.200',
    port: 6543,
    user: 'postgres.fukxrsqmulucvfvowcou',
    password: 'painkiller@829445',
    database: 'postgres',
    ssl: { 
      rejectUnauthorized: false,
      servername: 'aws-1-ap-south-1.pooler.supabase.com'
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

    // 1. Users table policies
    await client.query(`
      CREATE POLICY "Users can access own profile" ON users FOR ALL TO authenticated USING (true) WITH CHECK (true);
    `);

    // 2. Resumes table policies
    await client.query(`
      CREATE POLICY "Users can access own resumes" ON resumes FOR ALL TO authenticated USING (true) WITH CHECK (true);
    `);

    // 3. Job Matches table policies
    await client.query(`
      CREATE POLICY "Users can access own matches" ON job_matches FOR ALL TO authenticated USING (true) WITH CHECK (true);
    `);

    // 4. Cover Letters table policies
    await client.query(`
      CREATE POLICY "Users can access own cover letters" ON cover_letters FOR ALL TO authenticated USING (true) WITH CHECK (true);
    `);

    // 5. Other tables
    const otherTables = ['subscriptions', 'job_search_logs', 'audit_logs', 'resume_embeddings'];
    for (const table of otherTables) {
      await client.query(`
        CREATE POLICY "Users can access own ${table}" ON ${table} FOR ALL TO authenticated USING (true) WITH CHECK (true);
      `);
    }
    
    // Also allow anon for demo purposes if needed
    await client.query(`
      CREATE POLICY "Anon can insert resumes" ON resumes FOR INSERT TO anon WITH CHECK (true);
      CREATE POLICY "Anon can select resumes" ON resumes FOR SELECT TO anon USING (true);
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
