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

# Optional filename argument (relative to scripts/migrations/), e.g.:
#   python scripts/run_schema_migration.py add_job_applications.sql
# Defaults to the legacy update_jobs_schema.sql path.
script_arg = sys.argv[1] if len(sys.argv) > 1 else None
if script_arg:
    sql_path = os.path.join('scripts', 'migrations', script_arg)
else:
    sql_path = 'scripts/update_jobs_schema.sql'

if not os.path.exists(sql_path):
    print(f"Error: migration file not found: {sql_path}")
    sys.exit(1)

with open(sql_path, 'r') as file:
    sql_script = file.read()

engine = create_engine(DATABASE_URL)

try:
    with engine.begin() as conn:  # using begin() for auto commit transaction
        conn.execute(text(sql_script))
    print("OK: Successfully applied migration: " + sql_path)
except Exception as e:
    print("FAILED: " + str(e))
