import os
import sys
from sqlalchemy import create_engine, text
from dotenv import load_dotenv

# Load environment
load_dotenv()
DATABASE_URL = os.getenv("DATABASE_URL")
if not DATABASE_URL:
    print("Error: DATABASE_URL not found in environment")
    sys.exit(1)

migration_path = "../frontend/drizzle/0001_chat_substrate.sql"
if not os.path.exists(migration_path):
    print(f"Error: Migration file not found at {migration_path}")
    sys.exit(1)

print(f"Reading migration file from: {migration_path}")
with open(migration_path, "r", encoding="utf-8") as f:
    sql_script = f.read()

# Split by drizzle statement breakpoints if necessary, or execute block
# Since PostgreSQL can execute multiple statements in one block if we use a transaction,
# but we should split them by --> statement-breakpoint just in case, or run it in one go.
statements = [s.strip() for s in sql_script.split("--> statement-breakpoint") if s.strip()]

engine = create_engine(DATABASE_URL)

try:
    print("Connecting to database...")
    with engine.begin() as conn:
        print(f"Executing {len(statements)} migration statement(s)...")
        for idx, statement in enumerate(statements, 1):
            if not statement:
                continue
            # Remove comments
            lines = [line for line in statement.splitlines() if not line.strip().startswith("--")]
            clean_statement = "\n".join(lines).strip()
            if not clean_statement:
                continue
            
            print(f"[{idx}/{len(statements)}] Executing statement: {clean_statement[:60]}...")
            conn.execute(text(clean_statement))
    print("✅ Migration executed successfully!")
except Exception as e:
    print(f"❌ Migration failed: {e}")
    sys.exit(1)
