import os
import json
import logging
import asyncio
import google.generativeai as genai
from typing import List, Dict, Any

logger = logging.getLogger("resumatch-ai.ai_service")

from app.services.nvidia_service import nvidia_service
from app.db import execute_vector_search

class AIService:
    def __init__(self):
        logger.info("AIService initialized with NVIDIA NIM Pipeline Engine")

    async def parse_resume(self, text: str) -> Dict[str, Any]:
        """
        Parses resume text using Nemotron-Nano for high-speed structured extraction.
        """
        return await nvidia_service.parse_resume(text)

    async def analyze_resume(self, resume_data: Dict[str, Any]) -> Dict[str, Any]:
        """
        Analyzes profile and provides insights/score using Nemotron-3-Super.
        """
        prompt = f"""
        Analyze this resume profile for ATS compatibility and recruiter appeal.
        Return ONLY a VALID JSON object with:
        {{
            "score": int (0-100),
            "atsScore": int (0-100),
            "keywordScore": int (0-100),
            "readabilityScore": int (0-100),
            "weaknesses": ["Issue 1", "Issue 2"],
            "recommendations": ["Action 1", "Action 2"],
            "suggestedRoles": ["Role 1", "Role 2"]
        }}
        Data: {json.dumps(resume_data)}
        """
        try:
            from app.services.nvidia_service import nvidia_service
            client = nvidia_service.client
            response = client.chat.completions.create(
                model=os.getenv("NIM_MODEL_REASONING", "nvidia/nemotron-3-super-120b-a12b"),
                messages=[{"role": "user", "content": prompt}],
                temperature=0.1,
                max_tokens=1024
            )
            return nvidia_service._clean_json(response.choices[0].message.content)
        except Exception as e:
            logger.error(f"Analysis failed: {str(e)}")
            return {"score": 75, "insights": {"strengths": ["Parsed via Nvidia NIM"], "weaknesses": []}, "suggestedRoles": ["Software Engineer"]}

    async def generate_job_matches(self, resume_data: Dict[str, Any], roles: List[str], filters: Dict[str, Any] = None) -> List[Dict[str, Any]]:
        """
        KNOWLEDGE BASE PIPELINE:
        1. Multi-modal Embedding (Resume + Context)
        2. Vector DB Filtered Search (Top 50)
        3. Native Skillset Gap Analysis (Fastest)
        4. Match Percentage Alignment
        """
        logger.info(f"Starting Knowledge Base matching for roles: {roles}")
        
        # 1. Generate Weighted Profile Embedding
        # Limit to top 3 roles and top 10 skills for faster embedding
        top_roles = roles[:3]
        top_skills = resume_data.get('skills', [])[:10]
        profile_text = f"{' '.join(top_roles)} {' '.join(top_skills)}"
        embedding = await nvidia_service.generate_embedding(profile_text)
        
        # 2. Vector Similarity Search from Knowledge Base (Top 50)
        candidates = execute_vector_search(embedding, limit=50, filters=filters)
        
        if not candidates:
            logger.warning("No job candidates found in Knowledge Base.")
            return []

        # 3. Native Skill-Gap Analysis & Scoring
        # We calculate this in Python to provide instant results for 50 jobs
        user_skills = set([s.lower() for s in resume_data.get('skills', [])])
        
        processed_matches = []
        for job in candidates:
            job_skills = set([s.lower() for s in job.get('skills', [])])
            
            # Intersection for matching
            matching = list(job_skills.intersection(user_skills))
            missing = list(job_skills.difference(user_skills))
            
            # Calculate a blended match score (60% vector similarity, 40% keyword match)
            keyword_score = (len(matching) / len(job_skills)) * 100 if job_skills else 0
            
            # Defensive check for similarity type (SQL similarity vs potential sequence bug)
            raw_similarity = job.get('similarity', 0.5)
            if isinstance(raw_similarity, (list, tuple)):
                raw_similarity = raw_similarity[0] if raw_similarity else 0.5
            
            vector_score = float(raw_similarity) * 100
            
            final_score = int((vector_score * 0.7) + (keyword_score * 0.3))
            
            job.update({
                "match_score": min(final_score, 100),
                "matching_skills": matching[:10],
                "missing_skills": missing[:10],
                "reasoning": f"Strong match for {job['title']} based on your background in {', '.join(matching[:2])}." if matching else f"Potential match for {job['title']} in {job['location']}."
            })
            processed_matches.append(job)
            
        return processed_matches

    async def generate_cover_letter(self, resume_data: Dict[str, Any], job_role: str) -> str:
        """Uses Nemotron-3-Super for high-quality professional content."""
        from app.services.nvidia_service import nvidia_service
        prompt = f"Create a world-class cover letter for {job_role} based on: {json.dumps(resume_data)}"
        response = nvidia_service.client.chat.completions.create(
            model=os.getenv("NIM_MODEL_REASONING", "nvidia/nemotron-3-super-120b-a12b"),
            messages=[{"role": "user", "content": prompt}],
            max_tokens=2048
        )
        return response.choices[0].message.content

    async def rewrite_bullet_point(self, bullet: str, role: str) -> str:
        """Impactful rewriting using Nemotron-Nano."""
        from app.services.nvidia_service import nvidia_service
        prompt = f"Rewrite this bullet to be more impactful for {role}: {bullet}"
        response = nvidia_service.client.chat.completions.create(
            model=os.getenv("NIM_MODEL_PARSING", "nvidia/nvidia-nemotron-nano-9b-v2"),
            messages=[{"role": "user", "content": prompt}],
            max_tokens=256
        )
        return response.choices[0].message.content

    async def generate_embedding(self, text: str) -> List[float]:
        return await nvidia_service.generate_embedding(text)

ai_service = AIService()
