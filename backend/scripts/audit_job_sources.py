import os
from sqlalchemy import create_engine, text
from dotenv import load_dotenv

load_dotenv('backend/.env')
engine = create_engine(os.getenv("DATABASE_URL"))

def audit_sources():
    print("--- AUDITING JOB POSTINGS ---")
    with engine.connect() as conn:
        # Check Source distribution
        print("\n[SOURCE DISTRIBUTION]")
        result = conn.execute(text("SELECT source, count(*) as count FROM job_postings GROUP BY source ORDER BY count DESC"))
        for r in result:
            print(f"  Source: {r[0]} | Count: {r[1]}")

        # Check Company distribution
        print("\n[COMPANY DISTRIBUTION (Top 10)]")
        result = conn.execute(text("SELECT company, count(*) as count FROM job_postings GROUP BY company ORDER BY count DESC LIMIT 10"))
        for r in result:
            print(f"  Company: {r[0]} | Count: {r[1]}")

        # Check Total
        total = conn.execute(text("SELECT count(*) FROM job_postings")).scalar()
        print(f"\nTOTAL ROWS: {total}")

if __name__ == "__main__":
    audit_sources()
