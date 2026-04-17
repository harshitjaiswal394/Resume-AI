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

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(resume_router, prefix="/api/resume", tags=["resume"])
app.include_router(auth_router, prefix="/api/auth", tags=["auth"])
app.include_router(resumes_crud_router, prefix="/api/resumes", tags=["builder"])
app.include_router(builder_router, prefix="/api/builder", tags=["builder"])
app.include_router(cover_letters_router, prefix="/api/cover-letter", tags=["cover-letter"])
app.include_router(users_router, prefix="/api/users", tags=["users"])

@app.get("/health")
async def health_check():
    return {"status": "healthy"}

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000)
