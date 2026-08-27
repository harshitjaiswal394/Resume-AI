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
            "fallback": os.getenv("NIM_MODEL_FALLBACK", "nvidia/nemotron-3-nano-30b-a3b"),
            "parsing": os.getenv("NIM_MODEL_PARSING", "nvidia/nemotron-3-nano-30b-a3b")
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

    @staticmethod
    def _strip_reasoning(text: str) -> str:
        """Remove chain-of-thought / reasoning preamble that some models emit."""
        if not text:
            return text
        import re as _re
        # Strip <thinking>...</thinking> blocks
        text = _re.sub(r'<thinking>.*?</thinking>', '', text, flags=_re.DOTALL | _re.IGNORECASE)
        # Strip lines that look like meta-commentary about writing the letter
        lines = text.split('\n')
        skip_patterns = [
            r'^(we need|let.s craft|let.s draft|count words|word count|structure:|'
            r'opening paragraph|body paragraph|closing paragraph|highlight|mention|'
            r'we can|we.ll|ensure|make sure|avoid|provide concrete|describe a relevant|'
            r'reaffirm|format as|no bullet|professional tone|each sentence|total sentences|'
            r'approx|roughly|aim for|draft ~|write:|count manually|dear.*hiring manager.*,?\s*$)',
        ]
        result_lines = []
        for line in lines:
            stripped = line.strip()
            if not stripped:
                result_lines.append(line)
                continue
            if any(_re.match(p, stripped, _re.IGNORECASE) for p in skip_patterns):
                continue
            result_lines.append(line)
        text = '\n'.join(result_lines)
        # Clean up multiple blank lines
        text = _re.sub(r'\n{3,}', '\n\n', text)
        return text.strip()

    @staticmethod
    def _extract_letter(text: str) -> str:
        """Keep only the actual letter body, discarding leaked reasoning/analysis."""
        if not text:
            return text
        import re as _re
        # If the model dumped a plan/analysis before the greeting, cut to the
        # first greeting. Case-insensitive so "dear"/"Dear" both match.
        m = _re.search(r'(?i)Dear [Hh]iring [Mm]anager', text)
        if m:
            text = text[m.start():]
        return text.strip()

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
                
                response = await asyncio.to_thread(
                    nvidia_service.client.chat.completions.create,
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

    async def analyze_resume(self, resume_data: Dict[str, Any], target_role: str = None) -> Dict[str, Any]:
        """Analyzes profile and provides insights/score using Nemotron-3-Super.
        When target_role is provided, the analysis is role-specific — scoring
        reflects how well the resume fits that particular role."""
        role_context = ""
        if target_role:
            role_context = f"""
        TARGET ROLE: {target_role}
        Score this resume SPECIFICALLY for the "{target_role}" position.
        Focus your weaknesses and recommendations on gaps relevant to THIS role.
        The score should reflect role-fit, not just generic ATS compliance.
        """

        prompt = f"""
        Analyze this resume profile for ATS compatibility and recruiter appeal.
        {role_context}
        Return ONLY a VALID JSON object with:
        {{
            "score": int (0-100, role-fit score if target role provided),
            "atsScore": int (0-100),
            "keywordScore": int (0-100),
            "readabilityScore": int (0-100),
            "roleFitSummary": "One sentence explaining how well this resume fits the target role and why",
            "weaknesses": ["Issue 1 (role-specific if target role given)"],
            "recommendations": ["Action 1 (role-specific if target role given)"],
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
            response = await asyncio.to_thread(
                nvidia_service.client.chat.completions.create,
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
                parsed.setdefault("roleFitSummary", "Resume analyzed for general ATS compatibility.")
                
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
                "roleFitSummary": "Analysis timed out. Showing cached score.",
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
        
        # 2. Vector Similarity Search from Knowledge Base
        candidates = await asyncio.to_thread(execute_vector_search, embedding, limit=200, filters=filters)
        
        # Fallback: if vector search returns nothing, try keyword search
        if not candidates:
            logger.info("Vector search returned 0 candidates, falling back to keyword search")
            from app.db import execute_keyword_search
            kw_filters = {k: v for k, v in (filters or {}).items() if v}
            kw_filters["q"] = roles[0] if roles else ""
            kw_results, _ = await asyncio.to_thread(execute_keyword_search, kw_filters, limit=200)
            if kw_results:
                logger.info(f"Keyword fallback found {len(kw_results)} candidates")
                candidates = kw_results
            else:
                logger.warning("No job candidates found in Knowledge Base (both vector and keyword search empty).")
                return []

        # 3. Native Skill-Gap Analysis & Scoring
        # We calculate this in Python to provide instant results for 50 jobs
        user_skills_raw = [s.lower() for s in resume_data.get('skills', [])]
        
        # Expand category skills into core tech keywords (conservative — no false positives)
        CATEGORY_MAP = {
            # DevOps / Platform
            "ci/cd & devops": ["jenkins", "github actions", "ci/cd", "devops", "argocd", "helm"],
            "containers & k8s": ["docker", "kubernetes", "k8s", "helm", "eks", "aks"],
            "iac & cloud": ["terraform", "ansible", "aws", "azure", "gcp", "cloud", "infrastructure"],
            "observability": ["prometheus", "grafana", "datadog", "splunk", "monitoring", "opentelemetry"],
            "registries": ["artifactory", "nexus", "ecr", "acr"],
            # Security
            "security": ["security", "oauth", "jwt", "ssl", "vault", "iam", "sso", "firewall"],
            "cyber security": ["penetration testing", "vulnerability assessment", "incident response", "siem", "compliance"],
            # Languages / General
            "languages": [],
            "programming": [],
            # Data / ML / AI
            "data science": ["machine learning", "deep learning", "data science", "statistics", "nlp", "computer vision", "tensorflow", "pytorch", "pandas", "numpy", "scikit-learn", "matplotlib"],
            "machine learning": ["machine learning", "deep learning", "tensorflow", "pytorch", "keras", "scikit-learn", "xgboost", "neural network", "cnn", "rnn", "transformer", "bert", "gpt", "llm"],
            "data engineering": ["spark", "hadoop", "airflow", "etl", "data pipeline", "kafka", "flink", "dbt", "snowflake", "databricks", "redshift", "bigquery"],
            "data analytics": ["sql", "tableau", "power bi", "excel", "looker", "analytics", "reporting", "dashboard", "kpi", "a/b testing"],
            "big data": ["hadoop", "spark", "kafka", "flink", "hive", "pig", "cassandra", "hbase", "elasticsearch", "data lake"],
            "ai": ["artificial intelligence", "machine learning", "deep learning", "nlp", "computer vision", "reinforcement learning", "generative ai", "llm", "rag", "fine-tuning"],
            "generative ai": ["generative ai", "genai", "llm", "large language model", "gpt", "chatgpt", "openai", "anthropic", "claude", "gemini", "prompt engineering", "langchain", "llamaindex", "huggingface", "diffusers", "stable diffusion", "midjourney", "dall-e", "text-to-image", "text-to-video", "vector database", "embeddings", "openai api", "azure openai"],
            "agentic ai": ["agentic ai", "ai agent", "autonomous agent", "langchain agents", "langgraph", "autogen", "crewai", "tool use", "function calling", "mcp", "model context protocol", "multi-agent", "agent framework", "planning", "reasoning", "chain of thought", "tree of thought", "retrieval augmented"],
            "rag": ["rag", "retrieval augmented generation", "vector database", "embeddings", "semantic search", "pinecone", "weaviate", "milvus", "chromadb", "qdrant", "faiss", "langchain", "llamaindex", "chunking", "document retrieval", "knowledge base", "vector store", "similarity search"],
            "llmops": ["llmops", "model serving", "vllm", "triton", "tensorrt", "quantization", "fine-tuning", "rlhf", "dpo", "lora", "peft", "qlora", "model deployment", "inference optimization", "model monitoring", "prompt management", "guardrails", "evaluation"],
            "mlops": ["mlops", "mlflow", "wandb", "kubeflow", "sagemaker", "vertex ai", "model registry", "feature store", "experiment tracking", "model versioning", "a/b testing", "data drift", "model drift", "pipeline orchestration"],
            "computer vision": ["computer vision", "opencv", "yolo", "yolov8", "object detection", "image segmentation", "image classification", "ocr", "image generation", "video analysis", "3d vision", "depth estimation", "pose estimation"],
            "nlp": ["nlp", "natural language processing", "transformers", "tokenization", "named entity recognition", "sentiment analysis", "text classification", "text generation", "summarization", "question answering", "chatbot", "speech recognition", "text-to-speech", "whisper"],
            "deep learning": ["deep learning", "neural network", "cnn", "rnn", "lstm", "transformer", "attention mechanism", "gan", "vae", "diffusion model", "graph neural network", "autoencoder", "pytorch", "tensorflow", "keras", "jax"],
            "reinforcement learning": ["reinforcement learning", "rl", "q-learning", "policy gradient", "dqn", "ppo", "openai gym", "mujoco", "multi-agent rl", "inverse rl"],
            # Frontend
            "frontend": ["react", "angular", "vue", "html", "css", "javascript", "typescript", "next.js", "nuxt", "svelte", "tailwind", "sass", "webpack", "vite"],
            "web development": ["html", "css", "javascript", "react", "angular", "vue", "node.js", "express", "django", "flask", "spring"],
            "ui/ux": ["figma", "sketch", "adobe xd", "design system", "wireframe", "prototype", "user research", "usability"],
            "mobile development": ["react native", "flutter", "swift", "kotlin", "ios", "android", "dart", "xamarin", "ionic"],
            # Backend
            "backend": ["node.js", "express", "django", "flask", "fastapi", "spring", "spring boot", "rails", "laravel", ".net", "graphql", "rest api", "grpc"],
            "api development": ["rest api", "graphql", "grpc", "swagger", "openapi", "postman", "api gateway"],
            "microservices": ["microservices", "kubernetes", "docker", "service mesh", "istio", "envoy", "grpc", "event driven"],
            "full stack": ["react", "angular", "vue", "node.js", "express", "django", "flask", "fastapi", "spring", "html", "css", "javascript", "typescript", "postgresql", "mongodb"],
            # Databases
            "databases": ["sql", "postgresql", "mysql", "oracle", "mongodb", "redis", "cassandra", "dynamodb", "elasticsearch"],
            "sql": ["sql", "postgresql", "mysql", "oracle"],
            "nosql": ["mongodb", "redis", "cassandra", "dynamodb", "neo4j", "elasticsearch"],
            # Cloud
            "cloud": ["aws", "azure", "gcp", "cloud", "serverless", "lambda", "ec2", "s3"],
            "aws": ["ec2", "s3", "lambda", "rds", "dynamodb", "iam", "ecs", "eks"],
            "azure": ["azure devops", "azure functions", "azure sql", "cosmos db"],
            "gcp": ["gke", "cloud functions", "bigquery", "cloud run"],
            "serverless": ["lambda", "cloud functions", "azure functions"],
            # Networking / Infra
            "networking": ["tcp/ip", "dns", "http", "vpn", "nginx", "load balancer"],
            "infrastructure": ["linux", "bash", "terraform", "ansible", "kubernetes", "docker", "ci/cd"],
            "linux": ["linux", "bash", "shell", "nginx"],
            # Testing
            "testing": ["selenium", "jest", "cypress", "junit", "pytest", "tdd", "unit testing"],
            "qa": ["selenium", "cypress", "appium", "jira", "regression testing", "automation testing"],
            "automation": ["selenium", "cypress", "robot framework", "jenkins", "python", "bash"],
            # Dev Tools
            "dev tools": ["git", "jira", "confluence", "github", "gitlab"],
            "version control": ["git", "github", "gitlab", "bitbucket"],
            "agile": ["agile", "scrum", "kanban", "sprint", "jira"],
            # Project / Management
            "leadership": ["leadership", "team management", "project management", "mentoring"],
            "communication": ["communication", "documentation", "stakeholder management"],
            "problem solving": ["problem solving", "debugging", "troubleshooting"],
            # Blockchain / Web3
            "blockchain": ["blockchain", "web3", "solidity", "ethereum", "smart contract"],
            # Embedded / IoT
            "iot": ["iot", "embedded", "raspberry pi", "arduino", "mqtt"],
            # Game Dev
            "game development": ["unity", "unreal engine", "c++", "game design"],
            # CRM / ERP
            "salesforce": ["salesforce", "apex", "lightning", "crm"],
            # Other common categories
            "devops": ["devops", "ci/cd", "jenkins", "docker", "kubernetes", "terraform"],
            "cloud computing": ["aws", "azure", "gcp", "cloud", "serverless"],
            "information technology": ["networking", "linux", "windows server", "vmware"],
            # SRE / Platform Engineering
            "site reliability": ["sre", "slo", "incident management", "chaos engineering", "monitoring"],
            "platform engineering": ["platform engineering", "backstage", "developer experience"],
            # Additional AI roles
            "ai engineer": ["ai engineer", "ml engineer", "model deployment", "inference", "mlops"],
            "data engineer": ["data engineer", "etl", "airflow", "spark", "kafka", "dbt"],
            "ai research": ["ai research", "research scientist", "paper implementation"],
            "prompt engineering": ["prompt engineering", "chain of thought", "instruction tuning"],
            # Enterprise / Business
            "sap": ["sap", "abap", "fiori", "s/4hana", "erp"],
            "erp": ["erp", "sap", "dynamics 365"],
            "power platform": ["power automate", "power apps", "power bi", "dynamics 365"],
            "technical writing": ["technical writing", "documentation", "api documentation"],
            "product management": ["product management", "roadmap", "user stories", "okr"],
            # Specialized
            "robotics": ["ros", "ros2", "robotics", "plc", "scada"],
            "ar/vr": ["ar", "vr", "mixed reality", "arkit", "arcore", "unity3d"],
            "gis": ["gis", "geospatial", "arcgis", "postgis"],
            "quantum computing": ["quantum computing", "qiskit"],
            "mainframe": ["mainframe", "cobol", "jcl", "cics"],
            "bi": ["business intelligence", "data warehouse", "etl", "reporting", "dashboard"],
        }
        expanded_skills = set()
        for s in user_skills_raw:
            expanded_skills.add(s)
            expanded = CATEGORY_MAP.get(s, [])
            expanded_skills.update(expanded)
        user_skills = expanded_skills
        
        # Word-boundary matcher to prevent false positives (e.g. "scala" from "scalable")
        import re as _re
        def _has_skill(text: str, skill: str) -> bool:
            return bool(_re.search(r'\b' + _re.escape(skill) + r'\b', text))
        
        # Comprehensive tech skill dictionary for extracting ALL skills from job descriptions
        TECH_SKILLS = {
            # DevOps / Platform
            "jenkins", "github actions", "ci/cd", "devops", "argocd", "helm",
            "docker", "kubernetes", "k8s", "eks", "aks", "openshift",
            "terraform", "ansible", "aws lambda", "ec2", "s3", "rds", "ecs", "cloudformation", "cloudwatch",
            "azure devops", "azure monitor", "azure active directory",
            "gke", "cloud build",
            "prometheus", "grafana", "datadog", "splunk", "opentelemetry", "new relic",
            "artifactory", "nexus", "ecr", "acr",
            "vault", "consul", "nomad", "iam", "sso", "devsecops",
            "puppet", "chef",
            "service mesh", "istio", "envoy",
            "sre", "incident management", "chaos engineering", "blameless", "postmortem",
            "gitops", "infrastructure as code",
            "containerization", "virtualization", "vmware",
            "backup", "disaster recovery",
            "configuration management",
            "site reliability", "platform engineering",
            "cncf", "cloud native", "12 factor",
            "sonarqube", "fortify", "checkmarx", "veracode",
            "load balancer", "nginx",
            # AI / ML / Data Science
            "pytorch", "tensorflow", "keras", "scikit-learn", "xgboost", "lightgbm",
            "hugging face", "transformers", "langchain", "llamaindex",
            "openai", "gpt", "bert", "llm", "rag", "vector database",
            "pinecone", "weaviate", "milvus", "chromadb", "faiss",
            "mlflow", "wandb", "kubeflow", "airflow", "ml pipeline",
            "pandas", "numpy", "scipy", "matplotlib", "seaborn",
            "spark", "hadoop", "kafka", "flink", "dbt",
            "snowflake", "databricks", "bigquery", "redshift",
            "tableau", "power bi", "looker",
            "computer vision", "nlp", "deep learning", "machine learning",
            "neural network", "cnn", "rnn", "lstm", "transformer",
            "reinforcement learning", "generative ai", "gen ai", "mlops",
            "data pipeline", "etl", "feature engineering",
            # Programming
            "python", "java", "javascript", "typescript", "golang", "go", "rust",
            "scala", "r", "sql", "nosql", "c++", "c#", ".net",
            # Web / Mobile
            "react", "angular", "vue", "next.js", "node.js", "express",
            "spring", "spring boot", "django", "flask", "fastapi",
            "graphql", "rest api", "grpc", "microservices",
            "react native", "flutter", "swift", "kotlin",
            # Data / Analytics
            "mongodb", "postgresql", "mysql", "redis", "elasticsearch", "dynamodb",
            "cassandra", "neo4j", "couchdb",
            # Security
            "oauth", "jwt", "ssl", "firewall", "siem", "penetration testing",
            "vulnerability assessment", "compliance",
        }

        # Dynamic role-relevance: derive keywords from the requested role(s)
        # instead of a hardcoded whitelist that drops entire job families.
        role_keywords = set()
        for r in roles:
            r_lower = r.lower().strip()
            role_keywords.add(r_lower)
            # Add individual significant words (min 3 chars) from the role
            for word in r_lower.split():
                if len(word) >= 3:
                    role_keywords.add(word)

        processed_matches = []
        for job in candidates:
            title_lower = (job.get('title', '') or '').lower()
            domain_lower = (job.get('domain', '') or '').lower()

            # Job is relevant if its title or domain contains ANY of the role keywords
            title_relevant = any(kw in title_lower or kw in domain_lower for kw in role_keywords)
            if not title_relevant:
                continue

            job_skills = set([s.lower() for s in job.get('skills', [])])

            # Extract skills from job description
            searchable = " ".join(filter(None, [
                job.get('title', ''),
                job.get('description', ''),
            ])).lower()

            desc_skills = set()
            for skill in TECH_SKILLS:
                if _has_skill(searchable, skill):
                    desc_skills.add(skill)

            # Merge DB-stored skills with extracted skills
            all_job_skills = job_skills | desc_skills

            # matching = user's skills the job mentions; missing = job needs but user lacks
            matching = sorted(list(all_job_skills.intersection(user_skills)))
            missing = sorted(list(all_job_skills.difference(user_skills)))

            # Require at least 1 skill match (relaxed — vector similarity already ranks relevance)
            if len(matching) < 1:
                continue
            
            # Calculate a blended match score (70% vector similarity, 30% keyword match)
            # Vector similarity is the primary ranking signal; keyword overlap is supplementary
            keyword_score = (len(matching) / len(all_job_skills)) * 100 if all_job_skills else 0
            
            # Defensive check for similarity type (SQL similarity vs potential sequence bug)
            import math as _math
            raw_similarity = job.get('similarity', 0.5)
            if isinstance(raw_similarity, (list, tuple)):
                raw_similarity = raw_similarity[0] if raw_similarity else 0.5
            try:
                vector_score = float(raw_similarity) * 100
            except (TypeError, ValueError):
                vector_score = 50.0
            if _math.isnan(vector_score) or _math.isinf(vector_score):
                vector_score = 50.0
            
            final_score = int((vector_score * 0.7) + (keyword_score * 0.3))
            
            job.update({
                "match_score": min(final_score, 100),
                "matching_skills": matching[:20],
                "missing_skills": missing[:20],
                "reasoning": f"Strong match for {job['title']} based on your background in {', '.join(matching[:3])}." if matching else f"Potential match for {job['title']} in {job['location']}."
            })
            processed_matches.append(job)
        
        # Sort by match_score descending so best matches show first
        processed_matches.sort(key=lambda x: x.get('match_score', 0), reverse=True)
            
        return processed_matches

    async def generate_cover_letter(self, resume_data: Dict[str, Any], job_role: str) -> str:
        """Generate a professional cover letter from resume data and job role."""
        try:
            from app.services.nvidia_service import nvidia_service

            resume_data = resume_data or {}
            pruned = {
                "name": resume_data.get("name", resume_data.get("fullName", "Candidate")),
                "summary": resume_data.get("summary", ""),
                "skills": (resume_data.get("skills") or [])[:15],
                "experience": [
                    {"title": (e or {}).get("title", ""), "company": (e or {}).get("company", ""), "description": ((e or {}).get("description", []) or [])[:3]}
                    for e in (resume_data.get("experience") or [])[:3]
                ],
            }

            system_prompt = (
                "You write professional cover letters. "
                "Return ONLY the letter. No planning, no analysis, no reasoning, no commentary."
            )
            user_prompt = f"""Write a professional cover letter (250-350 words) for {job_role}.

CANDIDATE:
{json.dumps(pruned)}

Start with "Dear Hiring Manager," and end with "Sincerely," plus the candidate name.
No bullet points. No labels. No thinking or planning text. Just the letter itself."""

            # Primary: Vertex AI Gemini (fast, high-quality). Fallback: NVIDIA.
            content = await nvidia_service.generate_text_via_vertex(
                user_prompt, system_prompt=system_prompt, temperature=0.3, max_tokens=8192
            )
            if not content:
                response = await asyncio.to_thread(
                    nvidia_service.client.chat.completions.create,
                    model=os.getenv("NIM_MODEL_PARSING", "nvidia/nemotron-3-nano-30b-a3b"),
                    messages=[
                        {"role": "system", "content": system_prompt},
                        {"role": "user", "content": user_prompt}
                    ],
                    temperature=0.3,
                    max_tokens=2048
                )
                content = self._get_completion_content(response)
            content = self._strip_reasoning(content)
            content = self._extract_letter(content)
            return content.strip() if content else "Failed to generate cover letter."
        except Exception as e:
            logger.error(f"Cover letter failed: {str(e)}")
            return "Failed to generate cover letter. Please try again."

    async def generate_smart_cover_letter(self, resume_data: Dict[str, Any], jd_text: str) -> str:
        """Generates a tailored letter matching candidate skills with JD using 8B model for speed."""
        
        resume_data = resume_data or {}
        # Optimization: Prune payload to only include essentials (fullName, summary, top skills, top 2 exp)
        pruned_resume = {
            "name": resume_data.get("name", resume_data.get("fullName", "Candidate")),
            "summary": resume_data.get("summary", ""),
            "skills": (resume_data.get("skills") or [])[:15],
            "experience": [
                {
                    "title": (exp or {}).get("title", ""),
                    "company": (exp or {}).get("company", ""),
                    "description": ((exp or {}).get("description", []) or [])[:3]
                } for exp in (resume_data.get("experience") or [])[:3]
            ]
        }

        system_prompt = (
            "You are a professional cover letter writer. "
            "Write the cover letter directly as your final answer. "
            "CRITICAL: Your entire response must be ONLY the finished cover letter text — "
            "start immediately with \"Dear Hiring Manager,\". "
            "Do NOT show any analysis, mapping, reasoning, planning, lists, headings, "
            "or commentary before or after the letter. No labels. Do not repeat the "
            "job description back."
        )
        
        user_prompt = f"""Write a professional cover letter (250-350 words) tailored to this specific job.

CANDIDATE PROFILE:
{json.dumps(pruned_resume)}

JOB DESCRIPTION:
{jd_text[:3000]}

The letter must follow this structure:
1. Opening paragraph: Name the exact role and company. Express genuine enthusiasm and briefly state years of experience and primary domain (2-3 sentences).
2. Body paragraph 1: Pick the TOP 3 requirements from the JD and directly map each to a specific skill, tool, or achievement from the candidate's background. Be precise — name technologies, frameworks, methodologies (4-5 sentences).
3. Body paragraph 2: Describe a concrete project or accomplishment that demonstrates the candidate's ability to deliver results in a similar context. Use metrics — performance gains, team sizes, system uptime, deployment frequency, cost savings (3-4 sentences).
4. Closing paragraph: Reiterate what makes this candidate uniquely suited for THIS role. Express eagerness to contribute and discuss further (2-3 sentences).

Rules:
- Start with "Dear Hiring Manager,"
- End with "Sincerely," followed by the candidate name from the profile.
- Professional, confident tone. No bullet points. No generic filler.
- Every sentence must reference something specific from either the resume or the JD.
- Do NOT invent skills or experiences not present in the candidate profile.
- You MUST NOT write any planning, analysis, or reasoning. Output the letter only, starting directly with "Dear Hiring Manager,"."""
        
        try:
            start_time = time.time()
            from app.services.nvidia_service import nvidia_service

            # Primary: Vertex AI Gemini (fast, high-quality). Fallback: NVIDIA.
            content = await nvidia_service.generate_text_via_vertex(
                user_prompt, system_prompt=system_prompt, temperature=0.3, max_tokens=8192
            )
            if not content:
                response = await asyncio.to_thread(
                    nvidia_service.client.chat.completions.create,
                    model=os.getenv("NIM_MODEL_PARSING", "nvidia/nemotron-3-nano-30b-a3b"),
                    messages=[
                        {"role": "system", "content": system_prompt},
                        {"role": "user", "content": user_prompt}
                    ],
                    temperature=0.3,
                    max_tokens=2048
                )
                content = self._get_completion_content(response)
            content = self._strip_reasoning(content)
            # Guard against leaked thinking/analysis: keep only the letter body
            # from the greeting onward.
            content = self._extract_letter(content)
            latency = time.time() - start_time

            if content:
                logger.info(f"AI_COVER_LETTER_SUCCESS - Model: vertex-gemini - Latency: {latency:.2f}s")
                return content.strip().strip('"').strip('`').strip()
            
            # Fallback to standard pipeline if Vertex returns nothing
            content = await self._call_ai_with_fallback(user_prompt, system_prompt=system_prompt, temperature=0.1)
            return content or "Professional Cover Letter: [Generation error]"
        except Exception as e:
            latency = time.time() - start_time
            logger.warning(f"AI_COVER_LETTER_FAST_FAIL - Latency: {latency:.2f}s - Error: {str(e)}. Falling back...")
            content = await self._call_ai_with_fallback(user_prompt, system_prompt=system_prompt, temperature=0.1)
            return content or "Professional Cover Letter: [Generation error fallback]"


    async def generate_referral_message(self, candidate_data: Dict[str, Any], referral_details: Dict[str, Any]) -> str:
        """Generates a warm, personalized referral request message (LinkedIn DM / email)."""
        pruned = {
            "fullName": candidate_data.get("fullName", "Candidate"),
            "summary": candidate_data.get("summary", ""),
            "skills": (candidate_data.get("skills") or [])[:12],
            "experience": [
                {
                    "title": exp.get("title", ""),
                    "company": exp.get("company", ""),
                } for exp in (candidate_data.get("experience") or [])[:3]
            ],
            "achievements": (candidate_data.get("achievements") or [])[:3],
        }

        system_prompt = (
            "You are an expert at writing warm, human referral-request messages for LinkedIn and email. "
            "Your goal is to return ONLY the final message text. Absolutely no preamble, no quotes around the message, "
            "no explanations, and no subject line unless asked. Write like a real person, not a template."
        )

        user_prompt = f"""
        Write a personalized referral request message using the details below.

        CANDIDATE:
        {json.dumps(pruned)}

        REFERRAL CONTEXT:
        {json.dumps(referral_details)}

        Rules:
        - Be warm and specific: reference the recipient's own work/connection where possible.
        - Show the candidate respects the recipient's time: keep it short unless a longer message was requested.
        - Highlight 1-2 concrete, relevant strengths or achievements, not a full resume dump.
        - Always end with a low-friction ask (e.g., "Would you be open to a quick intro?").
        - Match the requested tone and platform.
        - Output ONLY the message body.
        """

        try:
            start_time = time.time()
            from app.services.nvidia_service import nvidia_service
            response = await asyncio.to_thread(
                nvidia_service.client.chat.completions.create,
                model=os.getenv("NIM_MODEL_PARSING", "nvidia/nemotron-3-nano-30b-a3b"),
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_prompt}
                ],
                temperature=0.4,
                max_tokens=800
            )
            content = self._get_completion_content(response)
            latency = time.time() - start_time

            if content:
                logger.info(f"AI_REFERRAL_SUCCESS - Latency: {latency:.2f}s")
                return content.strip().strip('"').strip('`').strip()

            content = await self._call_ai_with_fallback(user_prompt, system_prompt=system_prompt, temperature=0.4)
            return content or "Referral Message: [Generation error]"
        except Exception as e:
            logger.warning(f"AI_REFERRAL_FAST_FAIL - Error: {str(e)}. Falling back...")
            content = await self._call_ai_with_fallback(user_prompt, system_prompt=system_prompt, temperature=0.4)
            return content or "Referral Message: [Generation error fallback]"

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
            response = await asyncio.to_thread(
                nvidia_service.client.chat.completions.create,
                model=os.getenv("NIM_MODEL_PARSING_JD", "nvidia/nemotron-3-nano-30b-a3b"),
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
        """Generates a high-impact professional summary using 70B model for quality."""
        
        system_prompt = "You are a professional resume writer specializing in high-impact, ATS-optimized summaries. Return ONLY the summary text. No preamble, no word counts, and no reasoning. Ensure every sentence is complete and professional."
        
        user_prompt = f"""
        Generate a compelling, impact-focused professional summary (2-3 lines) for a {target_role} position.
        
        CANDIDATE DATA:
        {json.dumps(profile_data)}
        
        Guidelines:
        - Use specific achievements and quantifiable results from the experience data.
        - Start with a hard-hitting value proposition.
        - Return ONLY the professional summary as finished, cohesive sentences.
        """
        
        try:
            from app.services.nvidia_service import nvidia_service
            response = await asyncio.to_thread(
                nvidia_service.client.chat.completions.create,
                model=os.getenv("NIM_MODEL_PARSING", "nvidia/nemotron-3-nano-30b-a3b"),
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_prompt}
                ],
                temperature=0.3,
                max_tokens=600
            )
            content = self._get_completion_content(response)
            if content:
                return content.strip().strip('"').strip('`').strip()
            
            return "Professional summary: [Generation failed]"
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
            # Use the configured parsing model (available on NVIDIA NIM). Only
            # request json_object for llama-3.1 family models that support it.
            parsing_model = os.getenv("NIM_MODEL_PARSING_JD", "nvidia/nemotron-3-nano-30b-a3b")
            response = await asyncio.to_thread(
                nvidia_service.client.chat.completions.create,
                model=parsing_model,
                messages=[{"role": "system", "content": "You are a job data extraction API. Output ONLY JSON."},
                         {"role": "user", "content": prompt}],
                temperature=0.1,
                response_format={"type": "json_object"} if "llama-3.1" in parsing_model else None
            )
            content = self._get_completion_content(response)
            return nvidia_service._clean_json(content) if content else {}
        except Exception as e:
            logger.error(f"JD Parsing failed: {str(e)}")
            return {}

    async def generate_embedding(self, text: str) -> List[float]:
        return await nvidia_service.generate_embedding(text)

ai_service = AIService()
