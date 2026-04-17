import os
from sqlalchemy import create_engine, text
from dotenv import load_dotenv

load_dotenv('backend/.env')
DATABASE_URL = os.getenv("DATABASE_URL")
engine = create_engine(DATABASE_URL)

try:
    with engine.begin() as conn:
        conn.execute(text("ALTER TABLE resumes ADD COLUMN IF NOT EXISTS target_role TEXT;"))
    print("Successfully added target_role column to resumes table!")
except Exception as e:
    print(f"Error: {e}")
