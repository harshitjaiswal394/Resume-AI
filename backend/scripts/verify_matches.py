import asyncio
import os
import sys

# Move to backend folder to resolve imports
sys.path.append(os.getcwd() + "/backend")

from dotenv import load_dotenv
load_dotenv("backend/.env")

from app.services.knowledge_base_seeder import job_seeder
from app.db import engine
from sqlalchemy import text

async def verify_seeding():
    print("Checking initial job count...")
    with engine.connect() as conn:
        count = conn.execute(text("SELECT count(*) FROM job_postings")).scalar()
        print(f"Current jobs in Knowledge Base: {count}")

    print("\nRunning a targeted seed cycle for 'Data Scientist'...")
    # Mocking the seed method to be faster for verification
    job_seeder.domains = ["Data Scientist"]
    await job_seeder.seed_domain_knowledge()
    
    print("\nVerifying data enrichment...")
    with engine.connect() as conn:
        res = conn.execute(text("SELECT title, company, domain, similarity IS NOT NULL as has_vector FROM job_postings WHERE domain='Data Scientist' LIMIT 5"))
        for row in res:
            print(f"- Job: {row[0]} at {row[1]} | Domain: {row[2]} | Has Vector: {row[3]}")

if __name__ == "__main__":
    asyncio.run(verify_seeding())
