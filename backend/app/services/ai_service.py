import os
import json
import logging
import asyncio
import google.generativeai as genai
from typing import List, Dict, Any, Optional

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

    def _get_completion_content(self, response: Any) -> Optional[str]:
        """Safely extracts content from OpenAI/NVIDIA response objects or dicts."""
        if not response:
            return None
            
        try:
            # Handle object-based response (Standard OpenAI SDK)
            if hasattr(response, 'choices') and response.choices:
                return response.choices[0].message.content
            
            # Handle dictionary-based response (Legacy/Mock)
            if isinstance(response, dict):
                choices = response.get('choices')
                if choices and len(choices) > 0:
                    choice = choices[0]
                    if isinstance(choice, dict):
                        return choice.get('message', {}).get('content')
                    return getattr(choice, 'message', {}).get('content')
        except Exception as e:
            logger.error(f"Error extracting completion content: {str(e)}")
            
        return None

    async def analyze_resume(self, resume_data: Dict[str, Any]) -> Dict[str, Any]:
        """Analyzes profile and provides insights/score using Nemotron-3-Super."""
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
            "suggestedRoles": ["Role 1", "Role 2"],
            "insights": {{
               "strengths": ["Item 1"],
               "weaknesses": ["Item 1"]
            }}
        }}
        Resume Data: {json.dumps(resume_data)}
        """
        try:
            from app.services.nvidia_service import nvidia_service
            response = nvidia_service.client.chat.completions.create(
                model=os.getenv("NIM_MODEL_REASONING", "nvidia/nemotron-3-super-120b-a12b"),
                messages=[
                    {"role": "system", "content": "You are a professional ATS resume analyzer. Output only valid JSON."},
                    {"role": "user", "content": prompt}
                ],
                temperature=0.1,
                max_tokens=1024
            )
            content = self._get_completion_content(response)
            if content:
                parsed = nvidia_service._clean_json(content)
                # Standardize scores and ensure all expected keys exist for UI safety
                parsed.setdefault("score", 75)
                parsed.setdefault("atsScore", 70)
                parsed.setdefault("keywordScore", 75)
                parsed.setdefault("readabilityScore", 80)
                parsed.setdefault("weaknesses", [])
                parsed.setdefault("recommendations", [])
                parsed.setdefault("suggestedRoles", ["Software Engineer"])
                
                # Ensure resume_score is always present for the gauge
                parsed["resume_score"] = parsed.get("score", 75)
                
                return parsed
            raise ValueError("Empty AI response")
        except Exception as e:
            logger.error(f"Analysis failed: {str(e)}")
            return {
                "score": 75, 
                "resume_score": 75,
                "atsScore": 70, 
                "keywordScore": 80,
                "readabilityScore": 85,
                "weaknesses": ["Analysis timed out"], 
                "recommendations": ["Try again later"], 
                "suggestedRoles": ["Software Engineer"],
                "insights": {"strengths": ["Data integrity preserved"], "weaknesses": ["Backend timeout"]}
            }

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
        # Limit to top 5 roles and top 10 skills for faster embedding
        top_roles = roles[:5]
        top_skills = resume_data.get('skills', [])[:10]
        
        # Build richer embedding query with personalization context
        profile_parts = [' '.join(top_roles), ' '.join(top_skills)]
        if filters:
            if filters.get("experience_level"):
                exp = filters["experience_level"]
                if isinstance(exp, list):
                    exp = ' '.join(exp)
                profile_parts.append(f"{exp} experience")
            if filters.get("location"):
                loc = filters["location"]
                if isinstance(loc, list):
                    loc = ' '.join(loc)
                profile_parts.append(loc)
            if filters.get("domain"):
                profile_parts.append(str(filters["domain"]))
        
        profile_text = ' '.join(profile_parts)
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
        
        # Sort by match_score descending so best matches show first
        processed_matches.sort(key=lambda x: x.get('match_score', 0), reverse=True)
            
        return processed_matches

    async def generate_cover_letter(self, resume_data: Dict[str, Any], job_role: str) -> str:
        """Uses Nemotron-3-Super for high-quality professional content."""
        try:
            from app.services.nvidia_service import nvidia_service
            prompt = f"Create a cover letter for {job_role} based on: {json.dumps(resume_data)}"
            response = nvidia_service.client.chat.completions.create(
                model=os.getenv("NIM_MODEL_REASONING", "nvidia/nemotron-3-super-120b-a12b"),
                messages=[{"role": "user", "content": prompt}],
                max_tokens=2048
            )
            content = self._get_completion_content(response)
            return content if content else "Failed to generate cover letter. Please check your API configuration."
        except Exception as e:
            logger.error(f"Cover letter failed: {str(e)}")
            return "Professional Cover Letter: [Generation error, original text preserved]"

    async def rewrite_bullet_point(self, bullet: str, role: str) -> str:
        """Impactful rewriting using reasoning model with strict format enforcement."""
        try:
            from app.services.nvidia_service import nvidia_service
            messages = [
                {
                    "role": "system", 
                    "content": "You are a world-class professional resume writer. Return ONLY the final rewritten bullet point text. Do not provide explanations, do not use quotes, and do not include any reasoning. One bullet point only."
                },
                {
                    "role": "user", 
                    "content": f"Example:\nOriginal: Developed a website.\nOutput: Engineered a responsive web platform using modern frameworks, improving user engagement by 15%.\n\nNow rewrite this for a {role} position:\nOriginal: {bullet}\nOutput:"
                }
            ]
            
            response = nvidia_service.client.chat.completions.create(
                model="meta/llama-3.1-8b-instruct",
                messages=messages,
                temperature=0.1,  # Lower temperature for strict instruction following
                max_tokens=256
            )
            content = self._get_completion_content(response)
            
            if content:
                # Clean up any potential conversational leftovers
                clean_content = content.replace('Output:', '').replace('Rewritten:', '').strip().strip('"')
                if len(clean_content) > 5:
                    return clean_content
                    
            return bullet
        except Exception as e:
            logger.error(f"Bullet optimization failed: {str(e)}")
            return bullet

    async def generate_embedding(self, text: str) -> List[float]:
        return await nvidia_service.generate_embedding(text)

ai_service = AIService()
