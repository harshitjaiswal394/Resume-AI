import os
from sqlalchemy import create_engine, text
from dotenv import load_dotenv

def inspect_db(url, name):
    print(f"\n--- INSPECTING {name} ---")
    engine = create_engine(url)
    with engine.connect() as conn:
        # Get schemas
        result = conn.execute(text("SELECT schema_name FROM information_schema.schemata WHERE schema_name NOT IN ('information_schema', 'pg_catalog')"))
        schemas = [r[0] for r in result]
        
        # Get tables per schema and row counts for public
        for schema in schemas:
            result = conn.execute(text(f"SELECT table_name FROM information_schema.tables WHERE table_schema = '{schema}'"))
            tables = [r[0] for r in result]
            if tables:
                print(f"  [{schema}] Tables:")
                for table in tables:
                    count = 0
                    if name == "SUPABASE (Production)" and schema in ['auth', 'storage', 'realtime', 'vault', 'extensions', 'graphql', 'graphql_public']:
                        # Skip counting Supabase internal tables to avoid permission errors
                        print(f"    - {table}")
                        continue
                    try:
                        count = conn.execute(text(f"SELECT count(*) FROM {schema}.{table}")).scalar()
                        print(f"    - {table}: {count} rows")
                    except:
                        print(f"    - {table}: (could not count)")

        # Get extensions
        result = conn.execute(text("SELECT extname FROM pg_extension"))
        extensions = [r[0] for r in result]
        print(f"Extensions Active: {', '.join(extensions)}")

if __name__ == "__main__":
    load_dotenv('backend/.env')
    inspect_db(os.getenv("DATABASE_URL"), "SUPABASE (Production)")
    inspect_db(os.getenv("GCP_DATABASE_URL"), "GCP (Staging)")
