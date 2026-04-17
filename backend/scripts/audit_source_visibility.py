import os
from sqlalchemy import create_engine, text
from dotenv import load_dotenv

load_dotenv('backend/.env')
SUPABASE_URL = os.getenv("DATABASE_URL")

def audit_visibility():
    print(f"Auditing Supabase visibility for: {SUPABASE_URL.split('@')[-1]}")
    engine = create_engine(SUPABASE_URL)
    tables = ["auth.users", "storage.objects", "public.users", "public.job_postings"]
    
    with engine.connect() as conn:
        for t in tables:
            try:
                count = conn.execute(text(f"SELECT count(*) FROM {t}")).scalar()
                print(f"VISIBLE: {t} | Count: {count}")
            except Exception as e:
                # Get the core error message without the full traceback
                err_msg = str(e).splitlines()[0]
                print(f"HIDDEN: {t} | Error: {err_msg}")

if __name__ == "__main__":
    audit_visibility()
