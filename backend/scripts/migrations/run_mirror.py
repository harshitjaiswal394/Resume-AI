import os
from sqlalchemy import create_engine, text
from dotenv import load_dotenv

def run_migration():
    load_dotenv('backend/.env')
    DATABASE_URL = os.getenv("GCP_DATABASE_URL")
    if not DATABASE_URL or "change-me" in DATABASE_URL:
        print("❌ Error: GCP_DATABASE_URL not found or placeholder password used.")
        print("Please ensure your .env has the correct credentials.")
        return

    engine = create_engine(DATABASE_URL)
    
    migration_sql = """
    -- 1. Correct job_matches schema (Back to ARRAY / text[])
    ALTER TABLE job_matches 
    ALTER COLUMN matching_skills TYPE text[] USING matching_skills::text[],
    ALTER COLUMN missing_skills TYPE text[] USING missing_skills::text[];

    -- 2. Correct audit_logs schema (Rename details back to metadata)
    ALTER TABLE audit_logs RENAME COLUMN details TO metadata;

    -- 3. Ensure resumes table has defaults
    ALTER TABLE resumes ALTER COLUMN title SET DEFAULT 'Untitled Resume';
    ALTER TABLE resumes ALTER COLUMN status SET DEFAULT 'draft';
    """
    
    try:
        with engine.begin() as conn:
            print("Starting migration to mirror production schema...")
            conn.execute(text(migration_sql))
            print("✅ Migration successful: Staging now mirrors Production schema!")
    except Exception as e:
        print(f"❌ Migration failed: {str(e)}")

if __name__ == "__main__":
    run_migration()
