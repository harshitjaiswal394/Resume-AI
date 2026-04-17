import os
import json
import logging
import asyncio
import time
import google.generativeai as genai
from typing import List, Dict, Any, Optional

logger = logging.getLogger("resumatch-ai.ai_service")

from app.services.nvidia_service import nvidia_service
from app.db import execute_vector_search

class AIService:
    def __init__(self):
        self.models = {
            "primary": os.getenv("NIM_MODEL_REASONING", "nvidia/nemotron-3-super-120b-a12b"),
            "fallback": "meta/llama-3.1-70b-instruct",
            "parsing": os.getenv("NIM_MODEL_PARSING", "meta/llama-3.1-8b-instruct")
        }
        logger.info("AIService initialized with NVIDIA NIM Pipeline Engine and Tiered Fallback")

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

    async def _call_ai_with_fallback(self, prompt: str, system_prompt: str = None, temperature: float = 0.5) -> str:
        """Hierarchical NVIDIA NIM fallback with deep logging."""
        from app.services.nvidia_service import nvidia_service
        
        models_to_try = [self.models["primary"], self.models["fallback"]]
        last_error = None
        
        for model in models_to_try:
            start_time = time.time()
            try:
                logger.debug(f"AI_PROCESS_START - Model: {model} - Prompt Length: {len(prompt)}")
                messages = []
                if system_prompt:
                    messages.append({"role": "system", "content": system_prompt})
                messages.append({"role": "user", "content": prompt})
                
                response = nvidia_service.client.chat.completions.create(
                    model=model,
                    messages=messages,
                    temperature=temperature,
                    max_tokens=2048
                )
                
                content = self._get_completion_content(response)
                latency = time.time() - start_time
                
                if content:
                    logger.info(f"AI_PROCESS_SUCCESS - Model: {model} - Latency: {latency:.2f}s")
                    return content.strip().strip('"')
                
                raise Exception("Empty response from AI")
                
            except Exception as e:
                latency = time.time() - start_time
                logger.warning(f"AI_PROCESS_FAIL - Model: {model} - Latency: {latency:.2f}s - Error: {str(e)}")
                last_error = e
                continue
                
        logger.error(f"AI_PROCESS_CRITICAL - All models failed. Last error: {str(last_error)}")
        return ""

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

    async def generate_smart_cover_letter(self, resume_data: Dict[str, Any], jd_text: str) -> str:
        """Generates a tailored letter matching candidate skills with JD using hierarchical fallback."""
        prompt = f"""
        You are a professional recruiter. Generate a tailored cover letter (150-200 words).
        
        CANDIDATE DATA:
        {json.dumps(resume_data)}
        
        JOB DESCRIPTION:
        {jd_text[:5000]}
        
        Requirements:
        - Professional tone.
        - Highlight impact and specific matching skills.
        - No generic content.
        - Return ONLY the letter body text.
        """
        
        content = await self._call_ai_with_fallback(prompt, temperature=0.7)
        return content or "Professional Cover Letter: [Generation error]"


    async def clean_job_description(self, raw_text: str) -> str:
        """
        Uses AI to strip away irrelevant noise (headers, footers, ads) from scraped JD text.
        Returns ONLY the core job details.
        """
        prompt = f"""
        Extract ONLY the relevant Job Description content from the following noisy text.
        
        START extraction if you see: "Job Title", "About the Role", "Responsibilities", "We are looking for", "Qualifications", or similar JD intros.
        STOP extraction when the actual requirements/role details end (ignore "About the Company" fluff if it's too long, and ignore ALL navigation links, footers, and legal disclaimers).
        
        NOISY TEXT:
        {raw_text[:8000]}
        
        Return ONLY the cleaned Markdown text of the JD sections. Do not provide any conversational filler.
        """
        try:
            from app.services.nvidia_service import nvidia_service
            response = nvidia_service.client.chat.completions.create(
                model="meta/llama-3.1-8b-instruct",
                messages=[
                    {"role": "system", "content": "You are a professional recruiting assistant specialized in JD cleaning. Extract core details only."},
                    {"role": "user", "content": prompt}
                ],
                temperature=0.1,
                max_tokens=1500
            )
            content = self._get_completion_content(response)
            if content:
                logger.info("AI Cleanup successful for JD text.")
                return content.strip()
            return raw_text # Fallback
        except Exception as e:
            logger.error(f"AI JD Cleanup failed: {str(e)}")
            return raw_text # Fallback


    async def rewrite_bullet_point(self, bullet: str, role: str) -> str:
        """Impactful rewriting using reasoning model with strict format enforcement."""
        system_prompt = "You are a world-class professional resume writer. Return ONLY the final rewritten bullet point text. Do not provide explanations, do not use quotes, and do not include any reasoning. One bullet point only."
        prompt = f"Example:\nOriginal: Developed a website.\nOutput: Engineered a responsive web platform using modern frameworks, improving user engagement by 15%.\n\nNow rewrite this for a {role} position:\nOriginal: {bullet}\nOutput:"
        
        content = await self._call_ai_with_fallback(prompt, system_prompt=system_prompt)
        return content or bullet


    async def optimize_work_experience(self, experience: Dict[str, Any], target_role: str, years_of_exp: int) -> Dict[str, Any]:
        """
        Enhances work experience bullet points for maximum ATS impact.
        Focuses on action verbs, metrics, and seniority-appropriate tone.
        """
        bullets = experience.get("description", [])
        if not bullets:
            return experience

        optimized_bullets = []
        for bullet in bullets:
            # For work experience, we use the reasoning model (Llama 3.1 70B) for maximum quality
            optimized = await self.rewrite_bullet_point(bullet, target_role)
            optimized_bullets.append(optimized)
            
        experience["description"] = optimized_bullets
        return experience

    async def generate_smart_summary(self, profile_data: Dict[str, Any], target_role: str) -> str:
        """Generates a high-impact professional summary."""
        prompt = f"""
        Generate a compelling 3-sentence professional summary for a {target_role} position.
        Candidate Data: {json.dumps(profile_data)}
        
        Guidelines:
        - Sentence 1: Hard-hitting intro with years of specific experience.
        - Sentence 2: Key technical achievement or specialization.
        - Sentence 3: Value proposition/Goal.
        - Tone: Executive and professional.
        Return ONLY the summary text.
        """
        try:
            from app.services.nvidia_service import nvidia_service
            response = nvidia_service.client.chat.completions.create(
                model=os.getenv("NIM_MODEL_REASONING", "nvidia/nemotron-3-super-120b-a12b"),
                messages=[{"role": "user", "content": prompt}],
                temperature=0.7,
                max_tokens=512
            )
            content = self._get_completion_content(response)
            return content.strip().strip('"') if content else "Highly motivated professional..."
        except Exception as e:
            logger.error(f"Summary generation failed: {str(e)}")
            return "Experienced professional with a strong background in technology."

    async def parse_job_url(self, html_content: str) -> Dict[str, Any]:
        """Extracts structured JD data from raw HTML using Nemotron-Nano."""
        # This will be called after scraper_service fetches the HTML
        prompt = f"""
        Extract the following job details from this HTML content as JSON nothings else from the HTML:
        - title
        - company
        - location
        - description (clean text)
        - requirements (list)
        - skills (list)
        
        HTML: {html_content[:15000]}
        
        Return ONLY valid JSON.
        """
        try:
            from app.services.nvidia_service import nvidia_service
            response = nvidia_service.client.chat.completions.create(
                model="meta/llama-3.1-8b-instruct",
                messages=[{"role": "system", "content": "You are a job data extraction API. Output ONLY JSON."},
                         {"role": "user", "content": prompt}],
                temperature=0.1,
                response_format={"type": "json_object"}
            )
            content = self._get_completion_content(response)
            return nvidia_service._clean_json(content) if content else {}
        except Exception as e:
            logger.error(f"JD Parsing failed: {str(e)}")
            return {}

    async def generate_embedding(self, text: str) -> List[float]:
        return await nvidia_service.generate_embedding(text)

ai_service = AIService()
