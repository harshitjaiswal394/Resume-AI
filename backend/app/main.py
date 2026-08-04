import uvicorn
from dotenv import load_dotenv
import os

# Load environment variables before any other imports
load_dotenv() # checks backend/.env
load_dotenv("../.env") # checks root .env

import logging
import asyncio
from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from opentelemetry import trace
from opentelemetry.trace import Status, StatusCode

# Configure deep logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - [%(filename)s:%(lineno)d] - %(message)s",
    handlers=[logging.StreamHandler()]
)
logger = logging.getLogger("resumatch-api")

from app.api.endpoints import resume_router
from app.api.auth_routes import auth_router
from app.api.resumes_crud import router as resumes_crud_router
from app.api.builder import router as builder_router
from app.api.cover_letters import router as cover_letters_router
from app.api.chat_routes import chat_router
from app.api.agent_routes import router as agent_router
from app.services.knowledge_base_seeder import job_seeder
from apscheduler.schedulers.background import BackgroundScheduler
from app.tracing import instrument_app

app = FastAPI(title="ResuMatch AI API")
instrument_app(app)


# Setup Background Scheduler
scheduler = BackgroundScheduler()

@app.middleware("http")
async def mark_failed_requests(request: Request, call_next):
    span = trace.get_current_span()
    try:
        response = await call_next(request)
        if response.status_code >= 400:
            span.set_status(Status(StatusCode.ERROR, f"HTTP {response.status_code}"))
            span.set_attribute("error", True)
            span.set_attribute("error.type", "http_error")
            span.set_attribute("error.message", f"HTTP {response.status_code}")
            span.set_attribute("http.status_code", response.status_code)
        return response
    except Exception as exc:
        span.record_exception(exc)
        span.set_status(Status(StatusCode.ERROR, str(exc)))
        span.set_attribute("error", True)
        span.set_attribute("error.type", exc.__class__.__name__)
        span.set_attribute("error.message", str(exc))
        raise

@app.on_event("startup")
async def startup_event():
    # Start Scheduler
    if not scheduler.running:
        scheduler.start()
        logger.info("Background scheduler started.")

    # Initialize the 10-agent system
    try:
        from app.services.provider_adapters import build_default_provider_router
        from app.services.ai_gateway import GatewayRouter
        from app.agents.orchestrator import init_orchestrator
        from app.agents.resume_intel import ResumeIntelAgent
        from app.agents.jd_intel import JDIntelAgent
        from app.agents.resume_tailor import ResumeTailorAgent
        from app.agents.ats_intel import ATSIntelAgent
        from app.agents.memory import MemoryAgent
        from app.agents.reflection import ReflectionAgent
        from app.agents.interview import InterviewAgent
        from app.agents.learning_roadmap import LearningRoadmapAgent
        from app.agents.career_coach import CareerCoachAgent

        providers = build_default_provider_router()
        router = GatewayRouter(providers)

        # Initialize orchestrator
        init_orchestrator(router)

        # Initialize all agents (process-wide singletons)
        import app.agents.resume_intel as ri_mod
        import app.agents.jd_intel as ji_mod
        import app.agents.resume_tailor as rt_mod
        import app.agents.ats_intel as ai_mod
        import app.agents.memory as mem_mod
        import app.agents.reflection as ref_mod
        import app.agents.interview as int_mod
        import app.agents.learning_roadmap as lr_mod
        import app.agents.career_coach as cc_mod

        ri_mod.resume_intel_agent = ResumeIntelAgent(router)
        ji_mod.jd_intel_agent = JDIntelAgent(router)
        rt_mod.resume_tailor_agent = ResumeTailorAgent(router)
        ai_mod.ats_intel_agent = ATSIntelAgent(router)
        mem_mod.memory_agent = MemoryAgent(router)
        ref_mod.reflection_agent = ReflectionAgent(router)
        int_mod.interview_agent = InterviewAgent(router)
        lr_mod.learning_roadmap_agent = LearningRoadmapAgent(router)
        cc_mod.career_coach_agent = CareerCoachAgent(router)

        logger.info("10-agent system initialized successfully (%d providers)", len(providers))
    except Exception as e:
        logger.error("Agent system init failed: %s", e, exc_info=True)

    # Automatic seeding disabled as requested.
    # Use 'python scripts/seed_kb.py' to run it manually.
    logger.info("Backend started. Automatic Knowledge Base seeding is DISABLED.")

@app.on_event("shutdown")
def shutdown_event():
    if scheduler.running:
        scheduler.shutdown()
        logger.info("Background scheduler shut down.")

# Configure CORS
cors_allow_origins = os.getenv(
    "CORS_ALLOW_ORIGINS",
    ",".join([
        "http://localhost:3000",
        "http://localhost:8090",
        "http://127.0.0.1:3000",
        "https://jaiswal.shop",
        "https://www.jaiswal.shop",
        "https://resumatches.com",
        "https://www.resumatches.com",
    ])
)
allow_origins = [origin.strip() for origin in cors_allow_origins.split(",") if origin.strip()]

app.add_middleware(
    CORSMiddleware,
    allow_origins=allow_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(resume_router, prefix="/api/resume", tags=["resume"])
app.include_router(auth_router, prefix="/api/auth", tags=["auth"])
app.include_router(resumes_crud_router, prefix="/api/resumes", tags=["builder"])
app.include_router(builder_router, prefix="/api/builder", tags=["builder"])
app.include_router(cover_letters_router, prefix="/api/cover-letter", tags=["cover-letter"])
app.include_router(chat_router, prefix="/api/chat", tags=["chat"])
app.include_router(agent_router, prefix="/api/agents", tags=["agents"])

from app.security.metrics import metrics_enabled
from fastapi.responses import PlainTextResponse


@app.get("/metrics")
async def metrics_endpoint():
    """Prometheus metrics. Returns a placeholder when the client is absent."""
    if not metrics_enabled():
        return PlainTextResponse("# prometheus_client not installed; metrics disabled\n", media_type="text/plain")
    from prometheus_client import generate_latest
    return PlainTextResponse(generate_latest(), media_type="text/plain")


@app.get("/api/security/status")
async def security_status():
    """Liveness of the AI security core (kill-switch aware)."""
    from app.security import get_config

    cfg = get_config()
    return {
        "enabled": cfg.enabled,
        "engines": {
            "prompt_injection": cfg.injection_enabled,
            "pii_masking": cfg.pii_enabled,
            "tool_permissions": cfg.tool_permissions_enabled,
            "rate_limit": cfg.rate_limit_enabled,
            "audit": cfg.audit_enabled,
            "output_validation": cfg.output_validation_enabled,
        },
        "policy": {
            "injection_block_threshold": cfg.injection_block_threshold,
            "injection_warn_threshold": cfg.injection_warn_threshold,
            "pii_block_mode": cfg.pii_block_mode,
        },
    }

@app.get("/health")
async def health_check():
    return {"status": "healthy"}

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000)
