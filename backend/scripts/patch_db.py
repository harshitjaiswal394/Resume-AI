import os
from sqlalchemy import create_engine, text
from dotenv import load_dotenv

load_dotenv('backend/.env')
engine = create_engine(os.getenv('GCP_DATABASE_URL'))

with engine.begin() as conn:
    print("Patching job_postings with 'source' column...")
    conn.execute(text("ALTER TABLE job_postings ADD COLUMN IF NOT EXISTS source TEXT;"))
    print("Done!")
