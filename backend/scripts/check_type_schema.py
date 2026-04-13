import os
from sqlalchemy import create_engine, text
from dotenv import load_dotenv

load_dotenv()
DATABASE_URL = os.getenv("DATABASE_URL")
engine = create_engine(DATABASE_URL)

def check_vector_type():
    with engine.connect() as conn:
        print("Checking where 'vector' type is...")
        res = conn.execute(text("SELECT n.nspname FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace WHERE t.typname = 'vector';"))
        for row in res:
            print(f"Type 'vector' is in schema: {row[0]}")

if __name__ == "__main__":
    check_vector_type()
