import os
from sqlalchemy import create_engine, text
from dotenv import load_dotenv

load_dotenv('backend/.env')
GCP_URL = os.getenv("GCP_DATABASE_URL")

def test_conn():
    print(f"Testing connection to: {GCP_URL.split('@')[-1]}")
    try:
        engine = create_engine(GCP_URL, connect_args={'connect_timeout': 5})
        with engine.connect() as conn:
            res = conn.execute(text("SELECT current_user, current_database()")).fetchone()
            print(f"CONNECTION SUCCESS! User: {res[0]}, DB: {res[1]}")
    except Exception as e:
        print(f"CONNECTION FAILED: {str(e)}")

if __name__ == "__main__":
    test_conn()
