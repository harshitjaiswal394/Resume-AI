import os
from sqlalchemy import create_engine, text
from dotenv import load_dotenv

load_dotenv('backend/.env')
engine = create_engine(os.getenv("DATABASE_URL"))

def audit_table(schema, table):
    print(f"\n--- AUDIT: {schema}.{table} ---")
    with engine.connect() as conn:
        result = conn.execute(text(f"""
            SELECT column_name, data_type, is_nullable, column_default
            FROM information_schema.columns 
            WHERE table_schema = '{schema}' AND table_name = '{table}'
            ORDER BY ordinal_position
        """))
        for r in result:
            print(f"COL: {r[0]} | TYPE: {r[1]} | NULL: {r[2]} | DEFAULT: {r[3]}")

if __name__ == "__main__":
    audit_table('public', 'job_postings')
    audit_table('auth', 'users')
    audit_table('storage', 'objects')
