import os
from sqlalchemy import create_engine, text
from dotenv import load_dotenv

load_dotenv('backend/.env')
engine = create_engine(os.getenv("DATABASE_URL"))

tables = ['users', 'resume_embeddings', 'cover_letters', 'subscriptions', 'job_search_logs']

print("--- SUB-AUDIT: MISSING TABLES ---")
with engine.connect() as conn:
    for t in tables:
        try:
            count = conn.execute(text(f"SELECT count(id) FROM {t}")).scalar()
            print(f"TABLE: {t} | ROWS: {count}")
            
            # Get schema
            columns = conn.execute(text(f"SELECT column_name, data_type FROM information_schema.columns WHERE table_name = '{t}'"))
            print(f"  Columns: {', '.join([f'{c[0]} ({c[1]})' for c in columns])}")
        except Exception as e:
            print(f"  Missing or Error on {t}: {e}")
