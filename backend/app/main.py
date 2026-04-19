import uvicorn
from dotenv import load_dotenv
import os

# Load environment variables before any other imports
load_dotenv() # checks backend/.env
load_dotenv("../.env") # checks root .env

import logging
import asyncio
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from uvicorn.middleware.proxy_headers import ProxyHeadersMiddleware

# Configure deep logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - [%(filename)s:%(lineno)d] - %(message)s",
    handlers=[logging.StreamHandler()]
)
logger = logging.getLogger("resumatch-api")

from app.api.endpoints import resume_router
from app.api.resumes_crud import router as resumes_crud_router
from app.api.builder import router as builder_router
from app.api.cover_letters import router as cover_letters_router
from app.api.users import router as users_router
from app.services.knowledge_base_seeder import job_seeder
from apscheduler.schedulers.background import BackgroundScheduler

app = FastAPI(title="ResuMatch AI API")

# Setup Background Scheduler
scheduler = BackgroundScheduler()

@app.on_event("startup")
async def startup_event():
    # Start Scheduler
    if not scheduler.running:
        scheduler.start()
        logger.info("Background scheduler started.")
        
    # Automatic seeding disabled as requested. 
    # Use 'python scripts/seed_kb.py' to run it manually.
    logger.info("Backend started. Automatic Knowledge Base seeding is DISABLED.")

@app.on_event("shutdown")
def shutdown_event():
    if scheduler.running:
        scheduler.shutdown()
        logger.info("Background scheduler shut down.")

# Configure CORS - Use specific origins for credentials support
ALLOWED_ORIGINS = [
    "https://staging.resumatches.com",
    "https://www.staging.resumatches.com",
    "https://resumatches.com",
    "https://www.resumatches.com",
    "http://localhost:3000",
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Trust proxy headers (for HTTPS redirects behind GCP LB)
app.add_middleware(ProxyHeadersMiddleware, trusted_hosts="*")

app.include_router(resume_router, prefix="/api/resume", tags=["resume"], include_in_schema=True)
app.include_router(resumes_crud_router, prefix="/api/resumes", tags=["builder"], include_in_schema=True)
app.include_router(builder_router, prefix="/api/builder", tags=["builder"], include_in_schema=True)
app.include_router(cover_letters_router, prefix="/api/cover-letter", tags=["cover-letter"], include_in_schema=True)
app.include_router(users_router, prefix="/api/users", tags=["users"], include_in_schema=True)

# Note: FastAPI defaults to strict_slashes=True for routers included this way.
# To fix globally, we should set it on the APIRouter objects themselves or here.
# I will set it on the app to be safer if possible, but FastAPI doesn't have a global switch.
# So I'll update the router objects instead.

@app.get("/health")
async def health_check():
    return {"status": "healthy"}

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000)
