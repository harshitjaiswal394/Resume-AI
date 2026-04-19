import os
from sqlalchemy import create_engine, text
from dotenv import load_dotenv
import time

def disable_rls():
    load_dotenv('backend/.env')
    DATABASE_URL = os.getenv("GCP_DATABASE_URL")
    if not DATABASE_URL:
        print("Error: GCP_DATABASE_URL not found")
        return

    print(f"Connecting to: {DATABASE_URL.split('@')[1]}")
    engine = create_engine(DATABASE_URL)
    
    tables = ['resumes', 'job_matches', 'users', 'job_descriptions', 'cover_letters', 'resume_embeddings']
    
    with engine.connect() as conn:
        print("Enforcing lock timeout and disabling RLS...")
        
        # Set a short lock timeout so we don't hang the whole app
        conn.execute(text("SET lock_timeout = '15s'"))
        
        for table in tables:
            try:
                print(f"Processing table: {table}")
                # 1. Disable RLS
                conn.execute(text(f"ALTER TABLE {table} DISABLE ROW LEVEL SECURITY"))
                print(f"  [SUCCESS] Disabled RLS for {table}")
                
                # 2. Drop policies
                conn.execute(text(f'DROP POLICY IF EXISTS "Users can manage their own {table}" ON {table}'))
                conn.execute(text(f'DROP POLICY IF EXISTS "allow_all_{table}" ON {table}'))
                print(f"  [SUCCESS] Dropped all policies for {table}")
            except Exception as e:
                print(f"  [FAILED] Could not update {table}: {str(e)}")
            
            # Commit after each table to avoid long-lived locks
            conn.commit()
            
    print("\nDatabase Permission Sync Complete!")

if __name__ == "__main__":
    disable_rls()
