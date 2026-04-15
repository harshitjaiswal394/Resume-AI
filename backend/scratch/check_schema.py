import os
from sqlalchemy import create_engine, text
from dotenv import load_dotenv

load_dotenv()
DATABASE_URL = os.getenv("DATABASE_URL")
engine = create_engine(DATABASE_URL)

def check_schema(table_name):
    query = text(f"""
        SELECT column_name, data_type 
        FROM information_schema.columns 
        WHERE table_name = '{table_name}'
        ORDER BY ordinal_position
    """)
    with engine.connect() as conn:
        res = conn.execute(query)
        print(f"\n--- Schema for {table_name} ---")
        for row in res:
            print(f"{row[0]}: {row[1]}")

if __name__ == "__main__":
    check_schema("resumes")
    check_schema("job_descriptions")
    check_schema("cover_letters")
