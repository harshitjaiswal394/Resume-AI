import os
import sys
from sqlalchemy import create_engine, text
from dotenv import load_dotenv

# Try to load backend .env first, fallback to root if needed
if os.path.exists('backend/.env'):
    load_dotenv('backend/.env')
else:
    load_dotenv('.env')

DATABASE_URL = os.getenv("DATABASE_URL")
if not DATABASE_URL:
    print("Error: DATABASE_URL not found in .env")
    sys.exit(1)

with open('scripts/update_jobs_schema.sql', 'r') as file:
    sql_script = file.read()

engine = create_engine(DATABASE_URL)

try:
    with engine.begin() as conn:  # using begin() for auto commit transaction
        conn.execute(text(sql_script))
    print("✅ Successfully updated job_postings schema!")
except Exception as e:
    print(f"❌ Failed to update database schema: {e}")
