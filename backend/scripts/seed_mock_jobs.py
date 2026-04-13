import os
import json
import logging
from app.db import SessionLocal, engine
from sqlalchemy import text
from app.services.nvidia_service import nvidia_service

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("seed-jobs")

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
    },
    {
        "title": "AI/ML Engineer",
        "company": "NVIDIA Partner",
        "location": "Pune, India",
        "description": "Design and deploy large language models using NVIDIA NIM and NeMo. Optimize inference pipelines and implement complex RAG systems.",
        "skills": ["PyTorch", "NLP", "CUDA", "NIM"],
        "salary_range": "40-70 LPA"
    },
    {
        "title": "Full Stack Lead",
        "company": "SaaS Launchpad",
        "location": "Mumbai, India",
        "description": "Leading the development of a flagship SaaS platform. Expertise in Node.js, React, and cloud infrastructure.",
        "skills": ["Node.js", "React", "AWS", "Redis"],
        "salary_range": "35-55 LPA"
    },
    {
        "title": "DevOps Architect",
        "company": "CloudNative",
        "location": "Hyderabad, India",
        "description": "Architecting scalable cloud infrastructure using K8s and Terraform. Focus on CI/CD automation and security.",
        "skills": ["Kubernetes", "Terraform", "CI/CD", "Azure"],
        "salary_range": "32-58 LPA"
    }
]

async def seed_jobs():
    logger.info("Seeding mock jobs with NVIDIA embeddings...")
    
    with engine.connect() as conn:
        for job in MOCK_JOBS:
            # Generate embedding for the job
            profile_text = f"{job['title']} {', '.join(job['skills'])} {job['description']}"
            embedding = await nvidia_service.generate_embedding(profile_text)
            
            embedding_str = f"[{','.join(map(str, embedding))}]"
            
            # Ensure search path includes public
            conn.execute(text("SET search_path TO public, pg_catalog;"))
            
            # Using direct string formatting for the vector literal specifically
            # to avoid SQLAlchemy parameter binding issues with the custom 'vector' type
            query = text(f"""
                INSERT INTO job_postings (title, company, location, description, skills, salary_range, embedding)
                VALUES (:title, :company, :location, :description, :skills, :salary_range, '{embedding_str}'::public.vector)
            """)
            
            conn.execute(query, {
                "title": job['title'],
                "company": job['company'],
                "location": job['location'],
                "description": job['description'],
                "skills": job['skills'],
                "salary_range": job['salary_range']
            })
            conn.commit()
            logger.info(f"Seeded job: {job['title']}")

if __name__ == "__main__":
    import asyncio
    asyncio.run(seed_jobs())
