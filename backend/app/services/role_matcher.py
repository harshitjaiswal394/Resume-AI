"""Semantic similar-roles mapping for job postings.

Each job_posting already stores a 2048-dim embedding (gemini space) built from
title + company + location + description. We compare that embedding against a
fixed set of role prototype texts and return the closest roles, so users see
"similar roles" under each JD instead of a single title.

Matching strategy (two signals, blended):
  * Title signal — the role's own name (or a known alias) appearing in the job
    title is the strongest, most reliable signal.
  * Context signal — matching keywords in the description/skills widens the
    role set to siblings (e.g. a DevOps JD mentioning CI/CD also surfaces
    Cloud Engineer / Site Reliability Engineer).
"""
import logging
import math
import re
from typing import Optional

logger = logging.getLogger("resumatch.role_matcher")

# Standard top-15 tech roles with prototype descriptions used for embedding.
ROLE_PROTOTYPES = {
    "Software Engineer": "Design, build and maintain software applications. Programming, algorithms, data structures, API design, testing, version control.",
    "Frontend Developer": "Build user interfaces with HTML CSS JavaScript React TypeScript. Responsive design, accessibility, state management, web performance.",
    "Backend Developer": "Server-side development, REST APIs, databases, microservices, authentication, caching, SQL NoSQL, system design.",
    "Full Stack Developer": "End-to-end web development across frontend and backend. React Node.js APIs databases deployment.",
    "DevOps Engineer": "CI/CD pipelines, cloud infrastructure, containers, Kubernetes, Docker, Terraform, monitoring, automation, Linux.",
    "Data Scientist": "Statistical modeling, machine learning, data analysis, Python R, experimentation, feature engineering, model evaluation.",
    "Data Analyst": "SQL, data visualization, dashboards, business intelligence, Excel, Tableau Power BI, reporting, insights.",
    "Machine Learning Engineer": "Build and deploy ML models. PyTorch TensorFlow, model training, inference optimization, MLOps, NLP computer vision.",
    "Cloud Engineer": "Cloud platforms AWS GCP Azure, architecture, cost optimization, networking, IAM, serverless, infrastructure as code.",
    "Security Engineer": "Application security, penetration testing, vulnerability management, threat modeling, secure coding, cryptography, incident response.",
    "QA Engineer": "Test automation, Selenium, unit integration end-to-end testing, bug reporting, test plans, quality assurance processes.",
    "Product Manager": "Product strategy, roadmaps, user research, requirements, prioritization, stakeholder management, agile.",
    "iOS Developer": "Swift, Objective-C, Xcode, UIKit SwiftUI, App Store, mobile application development for Apple platforms.",
    "Android Developer": "Kotlin, Java, Android Studio, Jetpack Compose, mobile development, Play Store, mobile SDKs.",
    "Site Reliability Engineer": "System reliability, SLOs SLIs, observability, incident management, capacity planning, automation, large-scale systems.",
    "Data Engineer": "Data pipelines, ETL, Spark, Airflow, data warehousing, streaming, databases, data lakes, orchestration.",
}

# Primary aliases matched against the job TITLE (weight 3). Ordered by specificity.
_TITLE_ALIASES = {
    "Software Engineer": ["software engineer", "sde", "software development engineer", "software dev"],
    "Frontend Developer": ["frontend", "front-end", "front end", "ui developer", "react developer", "vue developer", "angular developer", "web developer", "javascript developer"],
    "Backend Developer": ["backend", "back-end", "back end", "server-side", "java developer", "python developer", "nodejs developer", "node.js developer", "dotnet developer", ".net developer"],
    "Full Stack Developer": ["full stack", "full-stack", "fullstack", "mern", "mean stack"],
    "DevOps Engineer": ["devops", "infrastructure engineer", "platform engineer", "release engineer", "devops engineer"],
    "Data Scientist": ["data scientist", "data science"],
    "Data Analyst": ["data analyst", "business analyst", "data analyst intern"],
    "Machine Learning Engineer": ["machine learning engineer", "ml engineer", "ai engineer", "deep learning engineer", "nlp engineer", "computer vision engineer"],
    "Cloud Engineer": ["cloud engineer", "aws engineer", "aws architect", "gcp engineer", "azure engineer", "cloud architect"],
    "Security Engineer": ["security engineer", "cybersecurity", "cyber security", "infosec", "application security engineer", "penetration tester"],
    "QA Engineer": ["qa engineer", "test engineer", "software engineer in test", "automation engineer", "quality assurance engineer", "qa automation"],
    "Product Manager": ["product manager", "product owner", "technical product manager"],
    "iOS Developer": ["ios developer", "ios engineer", "swift developer", "swift engineer", "mobile developer ios"],
    "Android Developer": ["android developer", "android engineer", "kotlin developer"],
    "Site Reliability Engineer": ["site reliability engineer", "sre engineer", "reliability engineer"],
    "Data Engineer": ["data engineer", "big data engineer", "etl developer", "data pipeline engineer", "data platform engineer"],
}

# Context keywords matched against description/skills (weight 1). Adds sibling roles.
_CONTEXT_KEYWORDS = {
    "Software Engineer": ["software engineering", "algorithms", "data structures", "microservices", "api design"],
    "Frontend Developer": ["react", "typescript", "javascript", "css", "html", "frontend", "front-end"],
    "Backend Developer": ["rest api", "microservices", "sql", "nosql", "server-side", "backend", "node.js", "java", "spring"],
    "Full Stack Developer": ["react", "node.js", "full stack", "full-stack", "end-to-end"],
    "DevOps Engineer": ["ci/cd", "cicd", "kubernetes", "docker", "terraform", "aws", "linux", "jenkins"],
    "Data Scientist": ["machine learning", "statistical", "regression", "python", "experimentation", "feature engineering"],
    "Data Analyst": ["sql", "dashboard", "tableau", "power bi", "data visualization", "excel", "business intelligence"],
    "Machine Learning Engineer": ["machine learning", "pytorch", "tensorflow", "model training", "mlops", "nlp", "deep learning"],
    "Cloud Engineer": ["aws", "gcp", "azure", "cloud infrastructure", "serverless", "infrastructure as code"],
    "Security Engineer": ["penetration testing", "vulnerability", "threat modeling", "secure coding", "cryptography", "incident response"],
    "QA Engineer": ["selenium", "automation testing", "test automation", "test cases", "regression testing", "qa"],
    "Product Manager": ["product roadmap", "user research", "stakeholder", "product strategy", "requirements"],
    "iOS Developer": ["swift", "xcode", "uikit", "swiftui", "ios", "app store"],
    "Android Developer": ["kotlin", "android studio", "jetpack compose", "android", "play store"],
    "Site Reliability Engineer": ["slo", "sli", "observability", "incident management", "capacity planning", "reliability"],
    "Data Engineer": ["etl", "spark", "airflow", "data warehouse", "data pipeline", "hadoop", "kafka"],
}

_CACHE: Optional[dict] = None
_CACHE_PROVIDER: Optional[str] = None


def _parse_vector(raw) -> Optional[list[float]]:
    """Parse a pgvector string like '[-0.01,0.02,...]' into a float list."""
    if isinstance(raw, list):
        return raw
    if not isinstance(raw, str):
        return None
    text = raw.strip()
    if not text.startswith("[") or not text.endswith("]"):
        return None
    try:
        return [float(x) for x in text[1:-1].split(",") if x.strip()]
    except ValueError:
        return None


def _cosine(a: list[float], b: list[float]) -> float:
    if not a or not b or len(a) != len(b):
        return 0.0
    dot = sum(x * y for x, y in zip(a, b))
    na = math.sqrt(sum(x * x for x in a))
    nb = math.sqrt(sum(y * y for y in b))
    if na == 0 or nb == 0:
        return 0.0
    return dot / (na * nb)


async def load_prototypes() -> dict:
    """Prototype embeddings built via the backend embedding service so the
    space matches stored job vectors (gemini-2048). Cached for process life.
    Async-safe: never calls asyncio.run inside a running loop."""
    global _CACHE, _CACHE_PROVIDER
    try:
        from app.services.nvidia_service import nvidia_service
        provider = nvidia_service.last_embedding_provider
    except Exception:
        provider = None
    if _CACHE is not None and _CACHE_PROVIDER == provider:
        return _CACHE
    if _CACHE is not None and provider is None:
        return _CACHE
    if provider is None:
        return _CACHE or {}
    _CACHE = {}
    _CACHE_PROVIDER = provider
    try:
        from app.services.nvidia_service import nvidia_service
        for role, text in ROLE_PROTOTYPES.items():
            emb = await nvidia_service.generate_embedding(text)
            if emb and any(v != 0.0 for v in emb):
                _CACHE[role] = emb
    except Exception as exc:
        logger.warning(f"Role prototype embedding failed: {exc}")
        _CACHE = {}
    return _CACHE


def similar_roles_semantic(embedding_raw, prototypes: Optional[dict] = None, top_n: int = 4) -> list[dict]:
    """Return top-n roles by cosine similarity to the job's embedding.
    Used only as a widening signal; title matching is authoritative."""
    vec = _parse_vector(embedding_raw)
    if not vec:
        return []
    protos = prototypes if prototypes is not None else (_CACHE or {})
    scored = [(role, _cosine(vec, proto)) for role, proto in protos.items() if proto]
    scored.sort(key=lambda x: x[1], reverse=True)
    return [{"role": role, "score": round(float(score), 3)} for role, score in scored[:top_n] if score > 0]


def similar_roles_keyword(title: str = "", description: str = "", skills=None) -> list[dict]:
    """Blend title (strong) and context (weak) keyword signals into a role set."""
    title_l = (title or "").lower()
    desc_l = " ".join(filter(None, [description or ""])).lower()
    skills_l = " ".join(str(s).lower() for s in (skills or []))

    scored: dict[str, float] = {}
    for role, aliases in _TITLE_ALIASES.items():
        for alias in aliases:
            if alias in title_l:
                scored[role] = max(scored.get(role, 0.0), 3.0)
                break

    for role, keywords in _CONTEXT_KEYWORDS.items():
        hits = sum(1 for kw in keywords if kw in desc_l or kw in skills_l)
        if hits:
            bonus = 1.0 + min(hits * 0.25, 0.75)
            scored[role] = max(scored.get(role, 0.0), bonus)

    ranked = sorted(scored.items(), key=lambda x: x[1], reverse=True)
    # Only surface roles with a meaningful signal.
    top = [{"role": role, "score": round(min(score, 3.0), 3)} for role, score in ranked[:4] if score >= 1.25]
    return top
