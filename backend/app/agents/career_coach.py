"""
Career Coach Agent — career progression guidance.

Reads from Memory Agent (resume history, interview scores, stated goals).
Can run as batch (weekly check-in) or on-demand.
"""

from __future__ import annotations

import json
import logging
import time
from typing import Any, Dict, List, Optional

from app.services.ai_gateway import GatewayRequest, GatewayRouter
from app.agents.model_router import model_router

logger = logging.getLogger("resumatch-ai.agents.career_coach")


COACH_PROMPT = """You are a senior career coach. Provide personalized career guidance.

CONTEXT:
- You have access to the user's resume, career goals, interview history, and past feedback.
- Tailor advice to their specific situation, not generic advice.
- Be specific, actionable, and honest.

OUTPUT FORMAT (JSON):
{
  "assessment": "Brief assessment of current position and progress",
  "strengths": ["strength1", "strength2"],
  "areas_to_focus": ["area1", "area2"],
  "action_items": [
    {
      "priority": "high|medium|low",
      "action": "specific action to take",
      "timeline": "this week|this month|this quarter",
      "reasoning": "why this matters"
    }
  ],
  "market_insights": "Brief market insights relevant to their field",
  "next_milestone": "The single most important thing to do next",
  "confidence_score": 8.5
}"""


class CareerCoachAgent:
    """Provides personalized career coaching advice."""

    def __init__(self, router: GatewayRouter):
        self._router = router

    async def advise(
        self,
        user_id: str,
        resume_data: Dict[str, Any],
        career_context: Optional[Dict[str, Any]] = None,
        jd_data: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        """
        Generate career coaching advice based on full user context.
        """
        start = time.monotonic()
        route = model_router.route("career_coach")

        user_content = f"""RESUME:
{json.dumps(resume_data, indent=2)[:4000]}

CAREER CONTEXT:
{json.dumps(career_context, indent=2)[:3000] if career_context else "Not available"}

TARGET JOB:
{json.dumps(jd_data, indent=2)[:2000] if jd_data else "Not specified"}

Provide personalized career coaching advice."""

        request = GatewayRequest(
            messages=[{"role": "user", "content": user_content}],
            system_instruction=COACH_PROMPT,
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
            advice = json.loads(content)
        except (json.JSONDecodeError, ValueError):
            advice = {
                "assessment": "Unable to parse coaching advice",
                "action_items": [],
            }

        latency = (time.monotonic() - start) * 1000
        logger.info("CAREER_COACH_ADVICE | user=%s actions=%d latency_ms=%.1f",
                     user_id, len(advice.get("action_items", [])), latency)

        return {
            "status": "success",
            "advice": advice,
        }


# Process-wide singleton
career_coach_agent: Optional[CareerCoachAgent] = None
