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

sql_file = 'scripts/migrations/feat_builder_setup.sql'
if not os.path.exists(sql_file):
    print(f"Error: {sql_file} not found")
    sys.exit(1)

with open(sql_file, 'r') as file:
    sql_script = file.read()

engine = create_engine(DATABASE_URL)

print(f"Running migration: {sql_file}...")
try:
    with engine.begin() as conn:
        conn.execute(text(sql_script))
    print("Done: Successfully updated database schema for AI Builder!")
except Exception as e:
    print(f"Error: Failed to update database schema: {e}")
