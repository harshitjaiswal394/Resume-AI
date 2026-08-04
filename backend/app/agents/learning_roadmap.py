"""
Learning Roadmap Agent — structured learning plans.

Can run as batch (weekly refresh) or on-demand.
Reads from Memory Agent for user context.
"""

from __future__ import annotations

import json
import logging
import time
from typing import Any, Dict, List, Optional

from app.services.ai_gateway import GatewayRequest, GatewayRouter
from app.agents.model_router import model_router

logger = logging.getLogger("resumatch-ai.agents.learning_roadmap")


ROADMAP_PROMPT = """You are a career learning advisor. Create a structured learning roadmap.

RULES:
1. Base recommendations on the user's current skills and target role.
2. Prioritize skills by job market demand and gap severity.
3. Include specific resources (courses, certifications, projects).
4. Structure as phases with time estimates.
5. Be realistic — not everyone can learn everything at once.

OUTPUT FORMAT (JSON):
{
  "roadmap_title": "...",
  "target_role": "...",
  "current_skill_level": "beginner|intermediate|advanced",
  "phases": [
    {
      "phase_number": 1,
      "title": "...",
      "duration_weeks": 4,
      "skills": [
        {
          "name": "...",
          "priority": "high|medium|low",
          "resources": [
            {"type": "course|certification|project|book", "name": "...", "url": "...", "estimated_hours": 20}
          ]
        }
      ],
      "milestone": "By end of this phase, you should be able to..."
    }
  ],
  "total_estimated_weeks": 12,
  "weekly_commitment_hours": 10
}"""


class LearningRoadmapAgent:
    """Generates structured learning roadmaps."""

    def __init__(self, router: GatewayRouter):
        self._router = router

    async def generate(
        self,
        user_id: str,
        resume_data: Dict[str, Any],
        jd_data: Optional[Dict[str, Any]] = None,
        career_goals: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        """
        Generate a learning roadmap based on resume, JD, and career goals.
        """
        start = time.monotonic()
        route = model_router.route("learning_roadmap")

        user_content = f"""CURRENT RESUME DATA:
{json.dumps(resume_data, indent=2)[:4000]}

TARGET JOB DESCRIPTION:
{json.dumps(jd_data, indent=2)[:3000] if jd_data else "Not provided"}

CAREER GOALS:
{json.dumps(career_goals, indent=2)[:2000] if career_goals else "Not provided"}

Create a personalized learning roadmap."""

        request = GatewayRequest(
            messages=[{"role": "user", "content": user_content}],
            system_instruction=ROADMAP_PROMPT,
            temperature=route.temperature,
            max_tokens=route.max_tokens,
        )

        response = await self._router.execute(request)

        try:
            content = response.content
            if "```json" in content:
                content = content.split("```json")[1].split("```")[0]
            elif "```" in content:
                content = content.split("```")[1].split("```")[0]
            roadmap = json.loads(content)
        except (json.JSONDecodeError, ValueError):
            roadmap = {
                "roadmap_title": "Learning Roadmap",
                "phases": [],
                "error": "Failed to parse roadmap",
            }

        latency = (time.monotonic() - start) * 1000
        logger.info("LEARNING_ROADMAP_GENERATED | user=%s phases=%d latency_ms=%.1f",
                     user_id, len(roadmap.get("phases", [])), latency)

        return {
            "status": "success",
            "roadmap": roadmap,
        }


# Process-wide singleton
learning_roadmap_agent: Optional[LearningRoadmapAgent] = None
