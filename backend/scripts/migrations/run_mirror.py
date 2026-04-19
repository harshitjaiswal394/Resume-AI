import os
from sqlalchemy import create_engine, text
from dotenv import load_dotenv

def run_migration():
    load_dotenv('backend/.env')
    DATABASE_URL = os.getenv("GCP_DATABASE_URL")
    if not DATABASE_URL:
        print("Error: GCP_DATABASE_URL not found in backend/.env")
        return

    engine = create_engine(DATABASE_URL)
    
    migration_sql = """
    -- 1. Reset job_matches skills to match Production (ARRAY/text[])
    -- Since we are mirroring, we drop and recreate to ensure perfect type compliance
    ALTER TABLE job_matches DROP COLUMN IF EXISTS matching_skills;
    ALTER TABLE job_matches DROP COLUMN IF EXISTS missing_skills;
    ALTER TABLE job_matches ADD COLUMN matching_skills text[];
    ALTER TABLE job_matches ADD COLUMN missing_skills text[];

    -- 2. Correct audit_logs schema (Rename details back to metadata if it exists)
    DO $$ 
    BEGIN
        IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='audit_logs' AND column_name='details') THEN
            ALTER TABLE audit_logs RENAME COLUMN details TO metadata;
        END IF;
    END $$;

    -- 3. Ensure resumes table has defaults
    ALTER TABLE resumes ALTER COLUMN title SET DEFAULT 'Untitled Resume';
    ALTER TABLE resumes ALTER COLUMN status SET DEFAULT 'draft';

    -- 4. CONVERT UUID COLUMNS TO TEXT FOR FIREBASE SUPPORT
    -- Drop constraints first
    ALTER TABLE IF EXISTS resumes DROP CONSTRAINT IF EXISTS resumes_user_id_fkey;
    ALTER TABLE IF EXISTS job_matches DROP CONSTRAINT IF EXISTS job_matches_user_id_fkey;
    ALTER TABLE IF EXISTS job_matches DROP CONSTRAINT IF EXISTS job_matches_resume_id_fkey;
    ALTER TABLE IF EXISTS cover_letters DROP CONSTRAINT IF EXISTS cover_letters_user_id_fkey;
    ALTER TABLE IF EXISTS cover_letters DROP CONSTRAINT IF EXISTS cover_letters_resume_id_fkey;
    ALTER TABLE IF EXISTS job_descriptions DROP CONSTRAINT IF EXISTS job_descriptions_user_id_fkey;
    ALTER TABLE IF EXISTS audit_logs DROP CONSTRAINT IF EXISTS audit_logs_user_id_fkey;

    -- Alter column types
    ALTER TABLE IF EXISTS users ALTER COLUMN id TYPE TEXT USING id::text;
    ALTER TABLE IF EXISTS resumes ALTER COLUMN id TYPE TEXT USING id::text;
    ALTER TABLE IF EXISTS resumes ALTER COLUMN user_id TYPE TEXT USING user_id::text;
    ALTER TABLE IF EXISTS job_matches ALTER COLUMN id TYPE TEXT USING id::text;
    ALTER TABLE IF EXISTS job_matches ALTER COLUMN user_id TYPE TEXT USING user_id::text;
    ALTER TABLE IF EXISTS job_matches ALTER COLUMN resume_id TYPE TEXT USING resume_id::text;
    ALTER TABLE IF EXISTS job_descriptions ALTER COLUMN id TYPE TEXT USING id::text;
    ALTER TABLE IF EXISTS job_descriptions ALTER COLUMN user_id TYPE TEXT USING user_id::text;
    ALTER TABLE IF EXISTS cover_letters ALTER COLUMN id TYPE TEXT USING id::text;
    ALTER TABLE IF EXISTS cover_letters ALTER COLUMN user_id TYPE TEXT USING user_id::text;
    ALTER TABLE IF EXISTS cover_letters ALTER COLUMN resume_id TYPE TEXT USING resume_id::text;
    ALTER TABLE IF EXISTS audit_logs ALTER COLUMN user_id TYPE TEXT USING user_id::text;
    """
    
    try:
        with engine.connect() as conn:
            print("Starting migration to mirror production schema...")
            with conn.begin():
                conn.execute(text(migration_sql))
            print("Migration successful: Staging now mirrors Production schema!")
    except Exception as e:
        print(f"Migration failed: {str(e)}")

if __name__ == "__main__":
    run_migration()
