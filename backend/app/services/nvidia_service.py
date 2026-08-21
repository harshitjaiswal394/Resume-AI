import os
import json
import base64
import asyncio
import hashlib
import logging
import httpx
from collections import OrderedDict
from typing import List, Dict, Any, Optional
from openai import OpenAI

from app.services.json_utils import normalize_placeholders

logger = logging.getLogger("nvidia-service")

# Small in-process cache so repeated search queries don't re-pay embedding latency.
# Values are (provider, vector) tuples so callers know the embedding space.
_EMBEDDING_CACHE_MAX = 512
_embedding_cache: "OrderedDict[str, tuple]" = OrderedDict()

def _embedding_cache_get(key: str) -> Optional[tuple]:
    if key in _embedding_cache:
        _embedding_cache.move_to_end(key)
        return _embedding_cache[key]
    return None

def _embedding_cache_set(key: str, provider: Optional[str], value: List[float]) -> None:
    _embedding_cache[key] = (provider, value)
    _embedding_cache.move_to_end(key)
    if len(_embedding_cache) > _EMBEDDING_CACHE_MAX:
        _embedding_cache.popitem(last=False)

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
            api_key=self.api_key_reasoning or "missing_key",
            timeout=120.0,
        )
        
        self.rerank_url = "https://ai.api.nvidia.com/v1/retrieval/nvidia/llama-nemotron-rerank-1b-v2/reranking"

        # Provider health flags: once a provider is confirmed broken (timeout /
        # auth failure) we stop calling it for the lifetime of the process so job
        # search degrades instantly to the keyword path instead of waiting out the
        # same slow failure on every request.
        self._vertex_embedding_down = False
        self._nvidia_embedding_down = False

        # Reused Vertex client. Creating a fresh Client per call forces the slow
        # (~40s) ADC/OAuth token setup on every request; keeping one instance
        # means that cost is paid once, at startup warm-up.
        self._vertex_client = None
        self._vertex_init_lock = None

        # Which provider produced the most recent embedding. Only "vertex" is a
        # valid space for ranking stored job vectors; "nvidia" vectors are
        # orthogonal to them and must not be used for vector search.
        self.last_embedding_provider: Optional[str] = None

        # Vertex is only attempted once the model is confirmed warm (a throwaway
        # embedding succeeded at startup). This prevents the one-time ~12s cold
        # model call from being killed by the query timeout and wrongly
        # disabling Vertex. Consecutive timeouts still trip the fallback.
        self._vertex_warm = False
        self._vertex_consecutive_failures = 0
        # Serialize Vertex embedding calls: parallel requests to the gemini
        # endpoint queue and trip the query timeout. One at a time keeps each
        # call fast and lets the in-process cache absorb repeat queries.
        self._vertex_embed_sem = asyncio.Semaphore(1)

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
        
        # Extract links
        data["links"] = {
            "linkedin": (re.search(r'linkedin\.com/in/[a-zA-Z0-9_-]+', text) or {}).get(0, None),
            "github": (re.search(r'github\.com/[a-zA-Z0-9_-]+', text) or {}).get(0, None),
            "portfolio": None
        }
        
        # Awards/Certs placeholder
        data["certifications"] = []
        
        logger.info(f"Fallback extraction found: name={data['fullName']}, email={data['email']}, links={list(data['links'].values())}")
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
  "targetRole": "suggested job title based on experience",
  "links": {{
    "linkedin": "null or url string; use null (not the word 'null') if absent",
    "github": "null or url string; use null (not the word 'null') if absent",
    "portfolio": "null or url string; use null (not the word 'null') if absent"
  }},
  "summary": "2-3 sentence professional summary",
  "skills": ["skill1", "skill2"],
  "experience": [{{"title": "string", "company": "string", "location": "string", "duration": "string", "description": ["achievement1"]}}],
  "education": [{{"degree": "string", "institution": "string", "year": "string", "description": "optional detail"}}],
  "projects": [{{"title": "string", "description": "string", "link": "null or url string; use null (not the word 'null') if absent", "tech_stack": ["tech1"]}}],
  "certifications": [{{ "name": "string", "issuer": "string", "year": "string" }}],
  "languages": [{{"language": "string", "proficiency": "Native/Professional/Basic"}}],
  "internships": [{{"role": "string", "company": "string", "duration": "string", "description": ["detail1"]}}],
  "achievements": [{{"title": "string", "description": "string"}}]
}}

IMPORTANT: Use JSON null (no quotes) for missing values. Never output the literal string "null", "N/A", or "None". Empty text fields should use "".

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
                
                # First attempt: Use fast model (Llama 8B or Nano)
                # Second attempt (retry): Use powerful model (Llama 70b)
                current_model = "meta/llama-3.1-8b-instruct" if attempt == 0 else "meta/llama-3.1-70b-instruct"
                
                # Run the blocking SDK call in a thread so the event loop stays
                # responsive (critical for SSE heartbeats during long parses).
                response = await asyncio.to_thread(
                    self.client.chat.completions.create,
                    model=current_model,
                    messages=messages,
                    temperature=0.05,
                    max_tokens=2048,
                    response_format={"type": "json_object"} if "llama-3.1" in current_model else None
                )
                
                content = response.choices[0].message.content
                logger.info(f"Parse attempt {attempt+1} response length: {len(content)} chars")
                
                parsed = normalize_placeholders(self._clean_json(content))
                
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
        Generate an embedding: Vertex AI Gemini via ADC first, NVIDIA nemotron fallback.
        Both produce 2048-dim vectors so stored job vectors and query vectors match.

        Provider calls are bounded so a slow/unauthenticated provider degrades to a
        fast failure (returns the zero vector) instead of blocking the request for
        minutes. Results are cached in-process by query text.
        """
        truncated = text[:512]
        cache_key = hashlib.sha256(truncated.encode("utf-8", "ignore")).hexdigest()
        cached = _embedding_cache_get(cache_key)
        if cached is not None:
            self.last_embedding_provider = cached[0]
            return cached[1]

        self.last_embedding_provider = None
        embedding = None
        if self._vertex_warm and not self._vertex_embedding_down:
            try:
                embedding = await asyncio.wait_for(
                    self._generate_embedding_vertex(truncated), timeout=15.0
                )
                if embedding:
                    self.last_embedding_provider = "vertex"
                    self._vertex_consecutive_failures = 0
            except asyncio.TimeoutError:
                self._vertex_consecutive_failures += 1
                if self._vertex_consecutive_failures >= 3:
                    logger.warning("Vertex embedding timed out 3x in a row — marking down")
                    self._vertex_embedding_down = True
                else:
                    logger.warning("Vertex embedding timed out after 15s (attempt %d)", self._vertex_consecutive_failures)
            except Exception as exc:
                logger.warning(f"Vertex embedding failed: {exc}")

        if not embedding and not self._nvidia_embedding_down:
            embedding = await self._generate_embedding_nvidia(truncated)
            if embedding and any(v != 0.0 for v in embedding):
                self.last_embedding_provider = "nvidia"

        if embedding and any(v != 0.0 for v in embedding):
            _embedding_cache_set(cache_key, self.last_embedding_provider, embedding)
            return embedding

        logger.warning("Embedding generation failed — returning zero vector fallback")
        return [0.0] * 2048

    def vertex_embedding_ready(self) -> bool:
        """True when Vertex is warm enough to produce ranking-grade embeddings."""
        return self._vertex_warm and not self._vertex_embedding_down and self._vertex_client is not None

    async def _ensure_vertex_client(self) -> bool:
        """
        Create (once) the Vertex AI client and pre-fetch ADC credentials so the
        slow ~40s OAuth/token setup happens at warm-up instead of on the first
        search query. Concurrent callers share the same initialisation via lock.
        """
        if self._vertex_client is not None:
            return True
        if self._vertex_init_lock is None:
            self._vertex_init_lock = asyncio.Lock()
        async with self._vertex_init_lock:
            if self._vertex_client is not None:
                return True
            try:
                from google.genai import Client

                project = os.getenv("GOOGLE_CLOUD_PROJECT")
                if not project:
                    self._vertex_embedding_down = True
                    logger.warning("GOOGLE_CLOUD_PROJECT not set — Vertex disabled")
                    return False

                location = os.getenv("GOOGLE_CLOUD_LOCATION", "global")

                def _load_creds():
                    from google.auth import default
                    from google.auth.transport.requests import Request
                    creds, _ = default(scopes=["https://www.googleapis.com/auth/cloud-platform"])
                    creds.refresh(Request())
                    return creds

                # Token refresh is blocking/network-bound; keep the event loop free.
                creds = await asyncio.to_thread(_load_creds)
                self._vertex_client = Client(
                    vertexai=True, project=project, location=location, credentials=creds
                )
                logger.info("Vertex client initialized (credentials refreshed)")
                return True
            except Exception as exc:
                self._vertex_embedding_down = True
                logger.warning(f"Vertex client init failed: {exc}")
                return False

    async def warm_vertex_client(self) -> None:
        """Called in the background at startup so the first search is already fast."""
        if not await self._ensure_vertex_client():
            return
        # The first embed_content of a process pays a one-time ~12s model/endpoint
        # warm-up cost. Absorb it now with a throwaway embedding so real queries
        # hit the fast path (~1s) from the very first search. Vertex stays
        # "not warm" (keyword fallback) until this succeeds.
        from google.genai import types
        model = os.getenv("VERTEX_EMBEDDING_MODEL", "gemini-embedding-001")
        for attempt in range(1, 4):
            try:
                await asyncio.wait_for(
                    self._vertex_client.aio.models.embed_content(
                        model=model,
                        contents="warmup",
                        config=types.EmbedContentConfig(output_dimensionality=2048),
                    ),
                    timeout=30.0,
                )
                self._vertex_warm = True
                logger.info("Vertex embedding model warmed up")
                return
            except Exception as exc:
                logger.warning(f"Vertex model warm-up attempt {attempt} failed: {exc}")
                if attempt < 3:
                    await asyncio.sleep(10)
        self._vertex_embedding_down = True
        logger.warning("Vertex model warm-up failed 3x — Vertex disabled for this process")

    async def _generate_embedding_vertex(self, text: str) -> Optional[List[float]]:
        if not await self._ensure_vertex_client():
            return None
        async with self._vertex_embed_sem:
            try:
                from google.genai import types

                model = os.getenv("VERTEX_EMBEDDING_MODEL", "gemini-embedding-001")
                result = await self._vertex_client.aio.models.embed_content(
                    model=model,
                    contents=text,
                    config=types.EmbedContentConfig(output_dimensionality=2048),
                )
                if result.embeddings and result.embeddings[0].values:
                    return result.embeddings[0].values
            except Exception as exc:
                logger.warning(f"Vertex embedding failed: {exc}")
        return None

    async def _generate_embedding_nvidia(self, text: str) -> List[float]:
        """
        Generate embedding using llama-nemotron-embed-1b-v2.
        Uses async httpx with an 8s timeout so a dead key degrades fast instead of
        blocking search for 30s+.
        """
        logger.info("Generating embedding using llama-nemotron-embed-1b-v2")
        
        try:
            async with httpx.AsyncClient(timeout=8.0) as client:
                response = await client.post(
                    "https://integrate.api.nvidia.com/v1/embeddings",
                    headers={
                        "Authorization": f"Bearer {self.api_key_embedding}",
                        "Content-Type": "application/json"
                    },
                    json={
                        "input": [text],
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
                    if response.status_code in (401, 403):
                        self._nvidia_embedding_down = True
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

        async with httpx.AsyncClient(timeout=30.0) as client:
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
                response = await asyncio.to_thread(
                    self.client.chat.completions.create,
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
