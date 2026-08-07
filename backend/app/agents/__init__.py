"""
ResuMatch 10-Agent System.

All agents are routed modules in the existing FastAPI app (not separate services).
Each agent is independently testable and follows the BaseProvider abstraction.
"""

from app.agents.model_router import ModelRouter, ModelTier, model_router
from app.agents.orchestrator import AgentOrchestrator, orchestrator
from app.agents.memory import MemoryAgent, memory_agent
from app.agents.reflection import ReflectionAgent, reflection_agent
from app.agents.resume_intel import ResumeIntelAgent, resume_intel_agent
from app.agents.jd_intel import JDIntelAgent, jd_intel_agent
from app.agents.resume_tailor import ResumeTailorAgent, resume_tailor_agent
from app.agents.ats_intel import ATSIntelAgent, ats_intel_agent
from app.agents.interview import InterviewAgent, interview_agent
from app.agents.learning_roadmap import LearningRoadmapAgent, learning_roadmap_agent
from app.agents.career_coach import CareerCoachAgent, career_coach_agent

__all__ = [
    "ModelRouter", "ModelTier", "model_router",
    "AgentOrchestrator", "orchestrator",
    "MemoryAgent", "memory_agent",
    "ReflectionAgent", "reflection_agent",
    "ResumeIntelAgent", "resume_intel_agent",
    "JDIntelAgent", "jd_intel_agent",
    "ResumeTailorAgent", "resume_tailor_agent",
    "ATSIntelAgent", "ats_intel_agent",
    "InterviewAgent", "interview_agent",
    "LearningRoadmapAgent", "learning_roadmap_agent",
    "CareerCoachAgent", "career_coach_agent",
]
