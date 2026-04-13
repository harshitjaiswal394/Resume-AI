import os
from dotenv import load_dotenv
# Load env before any local imports
load_dotenv()

import psycopg2
import asyncio
from typing import List

# Import service AFTER env is loaded
from app.services.nvidia_service import nvidia_service

DATABASE_URL = os.getenv("DATABASE_URL")

MOCK_JOBS = [
    {
        "title": "Senior Frontend Developer",
        "company": "TechInnovate",
        "location": "Bangalore, India",
        "description": "We are looking for a Senior Frontend Developer proficient in React, Next.js, and TypeScript. Experience with high-performance dashboards and premium UI/UX is a must.",
        "skills": ["React", "Next.js", "TypeScript", "Tailwind CSS"],
        "salary_range": "30-50 LPA"
    },
    {
        "title": "Backend Engineer (Go/Python)",
        "company": "DataStream",
        "location": "Remote, India",
        "description": "Join our backend team building high-throughput data pipelines using Go and Python. Experience with PostgreSQL and vector databases is a plus.",
        "skills": ["Go", "Python", "PostgreSQL", "Docker"],
        "salary_range": "25-45 LPA"
    }
]

async def seed_raw():
    print(f"Connecting to: {DATABASE_URL.split('@')[-1]}")
    
    conn = psycopg2.connect(DATABASE_URL)
    cur = conn.cursor()
    
    try:
        # 1. Set search path and verify
        cur.execute("SET search_path TO public, pg_catalog;")
        
        # 2. Iterate and seed
        for job in MOCK_JOBS:
            print(f"Generating embedding for: {job['title']}...")
            profile_text = f"{job['title']} {', '.join(job['skills'])} {job['description']}"
            embedding = await nvidia_service.generate_embedding(profile_text)
            
            # Format embedding as string for postgres cast
            embedding_str = f"[{','.join(map(str, embedding))}]"
            
            print(f"Inserting into job_postings...")
            cur.execute("""
                INSERT INTO job_postings (title, company, location, description, skills, salary_range, embedding)
                VALUES (%s, %s, %s, %s, %s, %s, %s::vector)
            """, (job['title'], job['company'], job['location'], job['description'], job['skills'], job['salary_range'], embedding_str))
            
        conn.commit()
        print("SUCCESS: Seeding successful!")
        
    except Exception as e:
        print(f"ERROR: Seeding failed: {e}")
        conn.rollback()
    finally:
        cur.close()
        conn.close()

if __name__ == "__main__":
    asyncio.run(seed_raw())
