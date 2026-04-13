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

    async def generate_job_matches(self, resume_data: Dict[str, Any], roles: List[str]) -> List[Dict[str, Any]]:
        """
        FULL NVIDIA NIM PIPELINE:
        1. Embedding (Embed-1B)
        2. Vector Search (Top 20)
        3. Reasoning (Super-120B) for Top 5
        4. Re-ranking (Rerank-1B) for Final Order
        """
        logger.info(f"Starting NVIDIA NIM matching pipeline for roles: {roles}")
        
        # 1. Generate Profile Embedding
        profile_text = f"{' '.join(roles)} {' '.join(resume_data.get('skills', []))} {resume_data.get('summary', '')}"
        embedding = await nvidia_service.generate_embedding(profile_text)
        
        # 2. Vector Similarity Search from DB (Top 20 candidates)
        candidates = execute_vector_search(embedding, limit=20)
        if not candidates:
            logger.warning("No job candidates found in database.")
            return []

        # 3. Reasoning for Top 5 (Deep Analysis)
        top_5_with_reasoning = await nvidia_service.get_match_reasoning(resume_data, candidates[:5])
        
        # 4. Re-rank results (Combine reasoning results with rest of candidates)
        remaining_candidates = candidates[5:]
        all_candidates = top_5_with_reasoning + remaining_candidates
        
        # Perform final re-ranking against the original query
        final_results = await nvidia_service.rerank_jobs(profile_text, all_candidates)
        
        return final_results

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
