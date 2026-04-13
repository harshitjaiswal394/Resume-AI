import os
from sqlalchemy import create_engine, text
from dotenv import load_dotenv

load_dotenv()
DATABASE_URL = os.getenv("DATABASE_URL")
engine = create_engine(DATABASE_URL)

def check_db():
    with engine.connect() as conn:
        print("Checking extensions...")
        res = conn.execute(text("SELECT extname FROM pg_extension;"))
        for row in res:
            print(f"- {row[0]}")
            
        print("\nChecking tables...")
        res = conn.execute(text("SELECT tablename FROM pg_catalog.pg_tables WHERE schemaname = 'public';"))
        for row in res:
            print(f"- {row[0]}")

if __name__ == "__main__":
    check_db()
