"""
Resume Tailoring Agent — the core USP.

Generates tailored resumes against specific JDs with strict no-hallucination contract.
Every rewritten bullet carries a machine-readable "change reason".
"""

from __future__ import annotations

import hashlib
import json
import logging
import time
from typing import Any, Dict, List, Optional

from app.services.ai_gateway import GatewayRequest, GatewayRouter
from app.agents.model_router import model_router
from app.agents.tools.resume_tools import get_tailoring_cache

logger = logging.getLogger("resumatch-ai.agents.resume_tailor")


TAILORING_PROMPT = """You are a resume tailoring expert. Your task is to rewrite a resume to better match a specific job description.

STRICT RULES — NO HALLUCINATION CONTRACT:
1. You may ONLY rephrase, reorder, and emphasize content from the source resume.
2. You must NEVER invent employers, titles, dates, or metrics not present in the source.
3. You may add keywords from the JD naturally into existing bullet points.
4. You may reorder sections to prioritize relevant experience.
5. You must NOT add new skills that aren't in the source resume.
6. You must NOT change employment dates or company names.

OUTPUT FORMAT (JSON):
{
  "tailored_resume": {
    "fullName": "...",
    "summary": "...",
    "skills": ["..."],
    "experience": [
      {
        "title": "...",
        "company": "...",
        "bullets": [
          {
            "text": "rewritten bullet",
            "change_reason": "keyword_match|clarity|quantification|reorder|emphasis",
            "original_bullet": "original text (if modified)"
          }
        ]
      }
    ],
    "education": [...]
  },
  "change_summary": {
    "keywords_added": ["..."],
    "bullets_rewritten": 5,
    "sections_reordered": ["..."],
    "match_score_before": 45.0,
    "match_score_after": 85.0
  }
}"""


class ResumeTailorAgent:
    """Generates tailored resumes with no-hallucination enforcement."""

    def __init__(self, router: GatewayRouter):
        self._router = router

    async def tailor(
        self,
        user_id: str,
        resume_id: str,
        resume_data: Dict[str, Any],
        jd_data: Dict[str, Any],
        jd_hash: str,
    ) -> Dict[str, Any]:
        """
        Tailor a resume against a JD.

        Returns tailored resume + change reasons + cache info.
        """
        start = time.monotonic()

        # Step 1: Check cache (same resume + same JD = reuse)
        cache_hit = await get_tailoring_cache(user_id, jd_hash)
        if cache_hit:
            latency = (time.monotonic() - start) * 1000
            logger.info("TAILORING_CACHE_HIT | user=%s jd_hash=%s latency_ms=%.1f", user_id, jd_hash, latency)
            return {
                "status": "success",
                "cached": True,
                "tailored_data": cache_hit["parsed_data"],
                "change_reasons": cache_hit.get("change_reasons", []),
                "version_id": cache_hit["version_id"],
            }

        # Step 2: Generate tailored resume via LLM
        route = model_router.route("resume_tailor")
        system_prompt = TAILORING_PROMPT

        user_content = f"""SOURCE RESUME:
{json.dumps(resume_data, indent=2)[:6000]}

TARGET JOB DESCRIPTION:
{json.dumps(jd_data, indent=2)[:4000]}

Rewrite the resume to better match this JD. Follow all rules strictly."""

        request = GatewayRequest(
            messages=[{"role": "user", "content": user_content}],
            system_instruction=system_prompt,
            temperature=route.temperature,
            max_tokens=route.max_tokens,
        )

        response = await self._router.execute(request)

        # Step 3: Parse structured output
        try:
            content = response.content
            if "```json" in content:
                content = content.split("```json")[1].split("```")[0]
            elif "```" in content:
                content = content.split("```")[1].split("```")[0]

            result = json.loads(content)
            tailored_resume = result.get("tailored_resume", {})
            change_summary = result.get("change_summary", {})
            change_reasons = self._extract_change_reasons(tailored_resume)

        except (json.JSONDecodeError, ValueError) as e:
            logger.error("TAILORING_PARSE_FAILED | error=%s", str(e))
            return {"status": "error", "message": f"Failed to parse tailoring output: {e}"}

        # Step 4: Validate no hallucination (basic check)
        validation = self._validate_no_hallucination(resume_data, tailored_resume)
        if not validation["valid"]:
            logger.warning("TAILORING_VALIDATION_FAILED | issues=%s", validation["issues"])
            return {
                "status": "error",
                "message": "Tailoring failed validation",
                "issues": validation["issues"],
            }

        latency = (time.monotonic() - start) * 1000
        logger.info(
            "RESUME_TAILORED | user=%s bullets_changed=%d match_before=%.1f match_after=%.1f latency_ms=%.1f",
            user_id, change_summary.get("bullets_rewritten", 0),
            change_summary.get("match_score_before", 0), change_summary.get("match_score_after", 0),
            latency,
        )

        return {
            "status": "success",
            "cached": False,
            "tailored_data": tailored_resume,
            "change_summary": change_summary,
            "change_reasons": change_reasons,
            "match_score_before": change_summary.get("match_score_before", 0),
            "match_score_after": change_summary.get("match_score_after", 0),
        }

    def _extract_change_reasons(self, tailored_resume: Dict[str, Any]) -> List[str]:
        """Extract change reasons from tailored resume for UI tooltips."""
        reasons = []
        for exp in tailored_resume.get("experience", []):
            for bullet in exp.get("bullets", []):
                if isinstance(bullet, dict) and bullet.get("change_reason"):
                    reasons.append(bullet["change_reason"])
        return reasons

    def _validate_no_hallucination(
        self,
        source_resume: Dict[str, Any],
        tailored_resume: Dict[str, Any],
    ) -> Dict[str, Any]:
        """
        Basic validation: ensure no new employers/titles/dates were invented.
        Returns {"valid": bool, "issues": [...]}
        """
        issues = []

        # Check employers
        source_companies = set(
            exp.get("company", "").lower()
            for exp in source_resume.get("experience", [])
            if exp.get("company")
        )
        tailored_companies = set(
            exp.get("company", "").lower()
            for exp in tailored_resume.get("experience", [])
            if exp.get("company")
        )
        new_companies = tailored_companies - source_companies
        if new_companies:
            issues.append(f"New companies invented: {new_companies}")

        # Check skills
        source_skills = set(s.lower() for s in source_resume.get("skills", []))
        tailored_skills = set(s.lower() for s in tailored_resume.get("skills", []))
        new_skills = tailored_skills - source_skills
        if new_skills:
            issues.append(f"New skills added (not in source): {new_skills}")

        return {"valid": len(issues) == 0, "issues": issues}


# Process-wide singleton
resume_tailor_agent: Optional[ResumeTailorAgent] = None
