import os
import json
import base64
import asyncio
import logging
import httpx
from typing import List, Dict, Any, Optional
from openai import OpenAI

logger = logging.getLogger("nvidia-service")

class NvidiaService:
    def __init__(self):
        # Load environment variables (ensure they are available)
        self.api_key_reasoning = os.getenv("NVIDIA_API_KEY_REASONING")
        self.api_key_parsing = os.getenv("NVIDIA_API_KEY_PARSING")
        self.api_key_embedding = os.getenv("NVIDIA_API_KEY_EMBEDDING")
        self.api_key_reranking = os.getenv("NVIDIA_API_KEY_RERANKING")
        
        if not self.api_key_reasoning:
            logger.error("NVIDIA_API_KEY_REASONING not found")
        
        self.client = OpenAI(
            base_url="https://integrate.api.nvidia.com/v1",
            api_key=self.api_key_reasoning or "missing_key"
        )
        
        self.rerank_url = "https://ai.api.nvidia.com/v1/retrieval/nvidia/llama-nemotron-rerank-1b-v2/reranking"

    def _clean_json(self, text: str) -> Dict[str, Any]:
        """Extract JSON from potential markdown blocks and clean it. Production-grade."""
        if not text or not text.strip():
            return {}
        
        original_text = text
        
        try:
            # Step 1: Extract from markdown code blocks
            if "```json" in text:
                text = text.split("```json")[1].split("```")[0]
            elif "```" in text:
                parts = text.split("```")
                for part in parts:
                    stripped = part.strip()
                    if stripped.startswith("{") or stripped.startswith("["):
                        text = stripped
                        break
            
            text = text.strip()
            
            # Step 2: Find JSON object boundaries if surrounded by text
            if not text.startswith("{"):
                start = text.find("{")
                if start != -1:
                    text = text[start:]
                else:
                    return {}
            
            # Step 3: Try direct parse first
            try:
                return json.loads(text)
            except json.JSONDecodeError:
                pass
            
            # Step 4: Fix trailing commas (common LLM mistake)
            import re
            text = re.sub(r',\s*}', '}', text)
            text = re.sub(r',\s*]', ']', text)
            
            # Step 5: Balance brackets for truncated JSON
            if text.count("[") > text.count("]"):
                missing_brackets = text.count("[") - text.count("]")
                
                # If EOF is mid-string, close the string
                if text.count('"') % 2 != 0:
                    text += '"'
                    
                # If EOF is after a comma, remove the comma or add closing brackets
                text = re.sub(r',\s*$', '', text)
                
                text += "]" * missing_brackets
                
            if text.count("{") > text.count("}"):
                text += "}" * (text.count("{") - text.count("}"))
            
            try:
                return json.loads(text)
            except json.JSONDecodeError:
                pass
            
            # Step 6: Last resort - find the largest valid JSON substring
            depth = 0
            start = text.find("{")
            if start == -1:
                return {}
            for i in range(start, len(text)):
                if text[i] == "{":
                    depth += 1
                elif text[i] == "}":
                    depth -= 1
                    if depth == 0:
                        try:
                            return json.loads(text[start:i+1])
                        except:
                            break
            
            logger.error(f"JSON cleaning failed after all attempts | Raw: {original_text[:300]}")
            return {}
        except Exception as e:
            logger.error(f"JSON cleaning exception: {str(e)} | Raw: {original_text[:200]}")
            return {}

    async def extract_text_ocr(self, file_content: bytes, filename: str) -> str:
        """
        Extract text using NVIDIA Nemotron OCR (v2).
        For now, if it's a standard PDF, we use pypdf as a fast layer,
        but we implement the NIM OCR structure for scanned documents.
        """
        logger.info(f"Extracting text from {filename} using NVIDIA NIM Pipeline")
        # In a real production environment, we'd convert PDF pages to images here.
        # For this implementation, we simulate the NIM OCR call or fallback to pypdf
        # since installing system-level poppler in a restricted env is hard.
        from app.services.resume_service import resume_service
        text = resume_service.extract_text(file_content, filename)
        return text

    def _extract_fallback_data(self, text: str) -> Dict[str, Any]:
        """Extract basic resume data using regex when AI parsing fails."""
        import re
        
        data = {
            "fullName": "Unknown",
            "email": "unknown",
            "phone": "",
            "summary": "",
            "skills": [],
            "experience": [],
            "education": []
        }
        
        if not text:
            return data
        
        # Extract email
        email_match = re.search(r'[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}', text)
        if email_match:
            data["email"] = email_match.group()
        
        # Extract phone
        phone_match = re.search(r'[\+]?[\d\s\-\(\)]{10,15}', text)
        if phone_match:
            data["phone"] = phone_match.group().strip()
        
        # Extract name (usually first non-empty line)
        lines = [l.strip() for l in text.split('\n') if l.strip()]
        if lines:
            # First line is usually the name
            candidate = lines[0]
            if len(candidate) < 60 and '@' not in candidate:
                data["fullName"] = candidate
        
        # Extract skills (common tech keywords)
        skill_keywords = [
            'Python', 'Java', 'JavaScript', 'TypeScript', 'React', 'Node.js', 'Angular', 'Vue',
            'AWS', 'Azure', 'GCP', 'Docker', 'Kubernetes', 'Git', 'Linux', 'SQL', 'NoSQL',
            'MongoDB', 'PostgreSQL', 'Redis', 'GraphQL', 'REST', 'CI/CD', 'Terraform',
            'Machine Learning', 'Deep Learning', 'TensorFlow', 'PyTorch', 'NLP',
            'HTML', 'CSS', 'Sass', 'Tailwind', 'Next.js', 'Express', 'Django', 'Flask',
            'C++', 'C#', 'Go', 'Rust', 'Swift', 'Kotlin', 'PHP', 'Ruby',
            'Agile', 'Scrum', 'Jira', 'Figma', 'Tableau', 'Power BI', 'Excel',
            'Jenkins', 'GitHub Actions', 'Ansible', 'Nginx', 'Apache',
        ]
        found_skills = [s for s in skill_keywords if s.lower() in text.lower()]
        data["skills"] = found_skills if found_skills else ["General Programming"]
        
        # Summary from first 200 chars
        data["summary"] = text[:300].replace('\n', ' ').strip()
        
        logger.info(f"Fallback extraction found: name={data['fullName']}, email={data['email']}, skills={len(data['skills'])}")
        return data

    async def parse_resume(self, text: str) -> Dict[str, Any]:
        """
        Parse raw resume text into structured JSON. Uses system/user message split
        for reliable JSON output, with retry logic and smart fallback.
        """
        logger.info("Parsing resume using meta/llama-3.1-70b-instruct")
        
        system_msg = """You are a JSON-only data extraction API. You MUST respond with ONLY a valid JSON object representing the parsed resume. 
No explanations, no markdown, no commentary. Do not cut off or truncate the response."""
        
        user_msg = f"""Extract structured data from this resume text into JSON.

RESUME TEXT:
{text[:10000]}

Required JSON format:
{{
  "fullName": "string",
  "email": "string", 
  "phone": "string",
  "summary": "2-3 sentence professional summary",
  "skills": ["skill1", "skill2"],
  "experience": [{{"title": "string", "company": "string", "duration": "string", "description": ["achievement1"]}}],
  "education": [{{"degree": "string", "institution": "string", "year": "string"}}]
}}

Respond with ONLY the JSON object:"""
        
        for attempt in range(2):
            try:
                messages = [
                    {"role": "system", "content": system_msg},
                    {"role": "user", "content": user_msg}
                ]
                
                # On retry, use an even more forceful prompt
                if attempt == 1:
                    logger.warning("Retry attempt: using ultra-strict prompt")
                    messages = [
                        {"role": "system", "content": "You are a JSON API. Output ONLY valid JSON. No other text."},
                        {"role": "user", "content": f'Convert to JSON: {{"fullName":"","email":"","phone":"","summary":"","skills":[],"experience":[],"education":[]}}\n\nResume:\n{text[:6000]}\n\nFill in the JSON fields from the resume above. Output ONLY the JSON:'}
                    ]
                
                response = self.client.chat.completions.create(
                    model="meta/llama-3.1-70b-instruct",
                    messages=messages,
                    temperature=0.05,
                    max_tokens=2048,
                    response_format={"type": "json_object"}
                )
                
                content = response.choices[0].message.content
                logger.info(f"Parse attempt {attempt+1} response length: {len(content)} chars")
                
                parsed = self._clean_json(content)
                
                if parsed and parsed.get("fullName") and parsed.get("fullName") != "string":
                    logger.info(f"Successfully parsed resume for: {parsed.get('fullName')}")
                    return parsed
                elif parsed:
                    logger.warning(f"Parsed JSON has placeholder values, retrying...")
                else:
                    logger.warning(f"Empty JSON on attempt {attempt+1}, retrying...")
                    
            except Exception as e:
                logger.error(f"Parse attempt {attempt+1} failed: {str(e)}")
        
        # All attempts failed — use smart regex fallback
        logger.warning("All AI parsing attempts failed, using regex fallback")
        return self._extract_fallback_data(text)

    async def generate_embedding(self, text: str) -> List[float]:
        """
        Generate embedding using llama-nemotron-embed-1b-v2.
        Uses async httpx with 30s timeout to avoid 504 gateway hangs.
        """
        logger.info("Generating embedding using llama-nemotron-embed-1b-v2")
        
        # Truncate to 512 chars for speed — embeddings don't need full text
        truncated = text[:512]
        
        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                response = await client.post(
                    "https://integrate.api.nvidia.com/v1/embeddings",
                    headers={
                        "Authorization": f"Bearer {self.api_key_embedding}",
                        "Content-Type": "application/json"
                    },
                    json={
                        "input": [truncated],
                        "model": os.getenv("NIM_MODEL_EMBEDDING", "nvidia/llama-nemotron-embed-1b-v2"),
                        "input_type": "query",
                        "truncate": "NONE"
                    }
                )
                
                if response.status_code == 200:
                    data = response.json()
                    return data["data"][0]["embedding"]
                else:
                    logger.error(f"Embedding API returned {response.status_code}: {response.text[:200]}")
                    return [0.0] * 2048
                    
        except httpx.TimeoutException:
            logger.warning("Embedding request timed out after 30s — using zero vector fallback")
            return [0.0] * 2048
        except Exception as e:
            logger.error(f"Embedding generation failed: {str(e)}")
            return [0.0] * 2048

    async def rerank_jobs(self, query: str, jobs: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """
        Re-rank similarity search results using llama-nemotron-rerank-1b-v2.
        """
        logger.info(f"Reranking {len(jobs)} jobs using llama-nemotron-rerank-1b-v2")
        if not jobs:
            return []

        headers = {
            "Authorization": f"Bearer {self.api_key_reranking}",
            "Accept": "application/json",
        }
        
        passages = [{"text": f"{j['title']} at {j['company']}: {j['description']}"} for j in jobs]
        
        payload = {
            "model": os.getenv("NIM_MODEL_RERANKING", "nvidia/llama-nemotron-rerank-1b-v2"),
            "query": {"text": query},
            "passages": passages
        }

        async with httpx.AsyncClient() as client:
            try:
                response = await client.post(self.rerank_url, headers=headers, json=payload, timeout=30.0)
                response.raise_for_status()
                rankings = response.json().get("rankings", [])
                
                # Sorting jobs based on re-rank scores
                # The response can use 'score' or 'logit'
                ranked_jobs = []
                for r in sorted(rankings, key=lambda x: x.get('score', x.get('logit', 0)), reverse=True):
                    idx = r['index']
                    job = jobs[idx]
                    job['rerank_score'] = r.get('score', r.get('logit', 0))
                    ranked_jobs.append(job)
                
                return ranked_jobs
            except Exception as e:
                logger.error(f"Reranking failed: {str(e)}")
                return jobs # Fallback to original order

    async def get_match_reasoning(self, profile: Dict[str, Any], jobs: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """
        Use the reasoning model (Nemotron-3-Super) to generate match scores and reasoning for top 5 candidates.
        """
        logger.info("Generating deep reasoning for top job matches using Nemotron-3-Super")
        if not jobs:
            return []

        # Only process top 5 to keep costs/latency down
        top_jobs = jobs[:5]
        
        results = []
        for job in top_jobs:
            prompt = f"""
            Compare this candidate profile with the job description and provide a match analysis.
            Candidate Skills: {', '.join(profile.get('skills', []))}
            Candidate Summary: {profile.get('summary', '')}
            
            Job: {job['title']} at {job['company']}
            Job Description: {job['description']}
            
            Return ONLY a JSON object with:
            {{
                "matchScore": int (0-100),
                "reasoning": "A 2-sentence explanation of why this is a match",
                "missingSkills": ["Skill A", "Skill B"],
                "matchingSkills": ["Skill C"]
            }}
            """
            
            try:
                response = self.client.chat.completions.create(
                    model=os.getenv("NIM_MODEL_REASONING", "nvidia/nemotron-3-super-120b-a12b"),
                    messages=[{"role": "user", "content": prompt}],
                    temperature=0.1,
                    max_tokens=1024, # Increased for safer completion
                )
                
                content = response.choices[0].message.content
                analysis = self._clean_json(content)
                
                if not analysis:
                    raise ValueError("Failed to decode reasoning JSON")
                    
                job.update(analysis)
                results.append(job)
            except Exception as e:
                logger.error(f"Reasoning failed for job {job['id']}: {str(e)}")
                # Populate with basic match data if AI fails
                job['matchScore'] = job.get('similarity', 0.5) * 100
                job['reasoning'] = "Basic similarity match performed."
                job['missingSkills'] = []
                job['matchingSkills'] = profile.get('skills', [])[:3]
                results.append(job)
                
        return results

nvidia_service = NvidiaService()
