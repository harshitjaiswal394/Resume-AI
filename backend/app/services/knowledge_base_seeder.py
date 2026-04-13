import os
import asyncio
import logging
import random
from datetime import datetime, timedelta
from typing import List, Dict, Any
from sqlalchemy import text
from app.db import engine
from app.services.nvidia_service import nvidia_service

logger = logging.getLogger("resumatch-api.seeder")

class KnowledgeBaseSeeder:
    def __init__(self):
        self.domains = [
            # Software Development
            "Software Engineer", "Senior Software Engineer", "Principal Software Engineer",
            "Frontend Developer", "Backend Developer", "Full Stack Developer", "Web Developer",
            "Mobile App Developer", "Android Developer", "iOS Developer",
            "React Developer", "Angular Developer", "Vue.js Developer", "Node.js Developer",
            "Python Developer", "Java Developer", "Golang Developer", "PHP Developer",
            " .NET Developer", "Ruby on Rails Developer",
            
            # DevOps & Infrastructure
            "DevOps Engineer", "Senior DevOps Engineer", "Site Reliability Engineer",
            "Cloud Engineer", "Cloud Architect", "Infrastructure Engineer",
            "Platform Engineer", "Build & Release Engineer",
            
            # Data & AI
            "Data Analyst", "Business Intelligence Analyst", "Data Engineer",
            "Data Scientist", "Machine Learning Engineer", "AI Engineer",
            "MLOps Engineer", "Prompt Engineer",
            
            # Security
            "Cybersecurity Analyst", "Cybersecurity Engineer", "Security Engineer",
            "Information Security Analyst", "Ethical Hacker", "Penetration Tester",
            
            # Specialized Engineering
            "Database Administrator", "Big Data Engineer", "ETL Developer",
            "QA Engineer", "Automation Test Engineer", "Manual Tester",
            "Game Developer", "Embedded Systems Engineer", "IoT Engineer", "Robotics Engineer",
            
            # Web3 & Emerging
            "Blockchain Developer", "Smart Contract Developer", "Web3 Developer",
            "AR/VR Developer",
            
            # IT & Support
            "System Administrator", "Network Engineer", "Technical Support Engineer",
            "IT Support Specialist",
            
            # Leadership & Architecture
            "Software Architect", "Solutions Architect", "Enterprise Architect",
            "Technical Lead", "Engineering Manager"
        ]
        self.sources = ["LinkedIn", "Naukri", "Indeed", "Glassdoor", "Instahyre"]
        self.work_modes = ["Remote", "On-site", "Hybrid"]
        self.experience_levels = ["Entry level", "Mid-Senior", "Director", "Executive"]

    async def seed_domain_knowledge(self):
        """
        Main entry point for the hourly seeder.
        Fetches jobs for each domain and saves them with embeddings.
        """
        logger.info(f"🚀 Starting Knowledge Base seeding for {len(self.domains)} domains...")
        
        for domain in self.domains:
            logger.info(f"Targeting domain: {domain}")
            # Smaller limit per domain to keep seeding cycles fast (10 jobs per domain)
            jobs = await self._fetch_jobs_for_domain(domain, limit=10) 
            
            for job in jobs:
                try:
                    if await self._job_exists(job['title'], job['company']):
                        continue
                    
                    content_to_embed = f"{job['title']} {job['company']} {job['location']} {job['description']} {', '.join(job['skills'])}"
                    embedding = await nvidia_service.generate_embedding(content_to_embed)
                    await self._save_job(job, embedding)
                except Exception as e:
                    logger.error(f"Failed to seed job '{job['title']}': {str(e)}")
                    
        logger.info("✅ Seeding cycle complete.")

    async def _fetch_jobs_for_domain(self, domain: str, limit: int = 10) -> List[Dict[str, Any]]:
        """
        Simulates fetching from public job boards with expanded tech-stack mappings.
        """
        tech_stacks = {
            "Frontend Developer": ["React", "Vue", "Angular", "TypeScript", "TailwindCSS", "Next.js"],
            "Backend Developer": ["Node.js", "Python", "Go", "PostgreSQL", "Redis", "Microservices"],
            "Full Stack Developer": ["React", "Node.js", "MongoDB", "Express", "AWS", "Docker"],
            "Mobile App Developer": ["React Native", "Flutter", "Swift", "Kotlin", "Firebase"],
            "DevOps Engineer": ["Kubernetes", "Docker", "Terraform", "Jenkins", "AWS", "Prometheus"],
            "Cloud Architect": ["AWS", "Azure", "GCP", "Serverless", "Security", "Infrastructure as Code"],
            "Data Scientist": ["Python", "PyTorch", "TensorFlow", "Scikit-learn", "Pandas", "NLP"],
            "Machine Learning Engineer": ["MLOps", "Model Deployment", "MLflow", "CUDA", "GPU Optimization"],
            "Cybersecurity Engineer": ["SIEM", "Pentesting", "Zero Trust", "Firewalls", "SOC", "Encryption"],
            "Blockchain Developer": ["Solidity", "Rust", "Ethereum", "Web3.js", "Smart Contracts"],
            "QA Engineer": ["Selenium", "Cypress", "Jest", "TDD", "Automation Testing"],
            "Database Administrator": ["Database Tuning", "Sharding", "Replication", "Oracle", "MongoDB"],
            "Prompt Engineer": ["LLM", "RAG", "Prompt Tuning", "LangChain", "Vector Databases"],
            "AR/VR Developer": ["Unity", "Unreal Engine", "C#", "C++", "Oculus SDK", "Computer Vision"],
            "Embedded Systems Engineer": ["C", "RTOS", "Microcontrollers", "Firmware", "Hardware", "Linux Kernel"]
        }
        
        # Smart fallback for specialized roles
        base_stack = tech_stacks.get(domain, ["Software Architecture", "Problem Solving", "Scalability", "Clean Code"])
        if domain in tech_stacks:
            base_stack = tech_stacks[domain]
        elif "Developer" in domain or "Engineer" in domain:
            # Fallback for roles like "React Developer", "Java Developer"
            specialty = domain.split(' ')[0]
            base_stack = [specialty] + tech_stacks.get("Full Stack Developer", [])[:4]
        
        jobs = []
        for i in range(limit):
            # Generate realistic variation

            title_prefix = random.choice(["", "Lead ", "Associate ", "Staff ", "Inquisitive "])
            title = f"{title_prefix}{domain}"
            company = f"{random.choice(['Tech', 'Data', 'Cloud', 'Nexus', 'Inno'])}{random.choice(['Flow', 'Sync', 'Core', 'Logic', 'Systems'])}"
            
            # Days offset (up to 25 days old as requested)
            posted_at = datetime.utcnow() - timedelta(days=random.randint(0, 24))
            
            jobs.append({
                "title": title,
                "company": company,
                "location": random.choice(["Bangalore", "Hyderabad", "Pune", "Remote", "Delhi NCR"]),
                "description": f"Exciting opportunity for a {title} to join our growing team. Focus on scalability and {random.choice(base_stack)}.",
                "skills": list(set(random.sample(base_stack, 4) + ["Communication", "Agile"])),
                "salary_range": f"{random.randint(15, 60)} LPA",
                "domain": domain,
                "source": random.choice(self.sources),
                "work_mode": random.choice(self.work_modes),
                "experience_level": random.choice(self.experience_levels),
                "education": random.choice(["B.Tech", "M.Tech", "Degree in CS"]),
                "posted_at": posted_at,
                "apply_url": f"https://{company.lower()}.com/careers/{domain.lower().replace(' ', '-')}"
            })
            
        return jobs

    async def _job_exists(self, title: str, company: str) -> bool:
        with engine.connect() as conn:
            query = text("SELECT 1 FROM job_postings WHERE title = :t AND company = :c LIMIT 1")
            result = conn.execute(query, {"t": title, "c": company}).fetchone()
            return result is not None

    async def _save_job(self, job: Dict[str, Any], embedding: List[float]):
        with engine.begin() as conn:
            # Convert list to pgvector string
            embedding_str = f"[{','.join(map(str, embedding))}]"
            
            query = text("""
                INSERT INTO job_postings (
                    title, company, location, description, skills, salary_range, 
                    embedding, domain, source, work_mode, experience_level, 
                    education, apply_url, posted_at
                ) VALUES (
                    :title, :company, :location, :description, :skills, :salary,
                    CAST(:embedding AS vector), :domain, :source, :work_mode, :exp,
                    :edu, :url, :posted
                )
            """)
            
            conn.execute(query, {
                "title": job['title'],
                "company": job['company'],
                "location": job['location'],
                "description": job['description'],
                "skills": job['skills'],
                "salary": job['salary_range'],
                "embedding": embedding_str,
                "domain": job['domain'],
                "source": job['source'],
                "work_mode": job['work_mode'],
                "exp": job['experience_level'],
                "edu": job['education'],
                "url": job['apply_url'],
                "posted": job['posted_at']
            })

job_seeder = KnowledgeBaseSeeder()
