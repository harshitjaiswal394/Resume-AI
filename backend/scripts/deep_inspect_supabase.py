import os
from sqlalchemy import create_engine, text
from dotenv import load_dotenv

def deep_inspect():
    load_dotenv('backend/.env')
    url = os.getenv("DATABASE_URL")
    if not url:
        print("Error: DATABASE_URL not found.")
        return

    print(f"--- DEEP INSPECTION: SUPABASE ---")
    engine = create_engine(url)
    with engine.connect() as conn:
        # 1. Get ALL schemas (excluding internal pg ones)
        result = conn.execute(text("SELECT schema_name FROM information_schema.schemata WHERE schema_name NOT IN ('information_schema', 'pg_catalog')"))
        schemas = [r[0] for r in result]
        print(f"TOTAL SCHEMAS FOUND: {len(schemas)}")
        print(f"SCHEMAS: {', '.join(schemas)}\n")

        # 2. Get ALL tables and views across all schemas
        result = conn.execute(text("""
            SELECT table_schema, table_name, table_type 
            FROM information_schema.tables 
            WHERE table_schema NOT IN ('information_schema', 'pg_catalog')
            ORDER BY table_schema, table_name
        """))
        
        current_schema = ""
        for r in result:
            if r[0] != current_schema:
                current_schema = r[0]
                print(f"--- SCHEMA: {current_schema} ---")
            
            # Get row count
            count = "N/A"
            if r[2] == 'BASE TABLE':
                try:
                    count = conn.execute(text(f"SELECT count(*) FROM {r[0]}.{r[1]}")).scalar()
                except Exception:
                    count = "PROHIBITED"
            
            print(f"  [{r[2]}] {r[1]} | rows: {count}")

        # 3. Get extensions
        print(f"\n--- ACTIVE EXTENSIONS ---")
        result = conn.execute(text("SELECT extname, extversion FROM pg_extension"))
        for r in result:
            print(f"  - {r[0]} ({r[1]})")

if __name__ == "__main__":
    deep_inspect()
