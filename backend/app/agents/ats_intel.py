"""
ATS Intelligence Agent — deterministic checks + LLM judgment.

Combines rule-based ATS parsing checks with LLM-powered analysis.
"""

from __future__ import annotations

import json
import logging
import re
import time
from typing import Any, Dict, List, Optional

from app.services.ai_gateway import GatewayRequest, GatewayRouter
from app.agents.model_router import model_router

logger = logging.getLogger("resumatch-ai.agents.ats_intel")

# ── Deterministic ATS Checks (no LLM) ──────────────────────────────────────

ATS_FORMAT_RULES = [
    {
        "id": "no_tables",
        "check": lambda data: _check_no_tables(data),
        "severity": "high",
        "description": "ATS cannot parse tables well",
    },
    {
        "id": "section_headers",
        "check": lambda data: _check_section_headers(data),
        "severity": "high",
        "description": "Resume must have clear section headers",
    },
    {
        "id": "contact_info",
        "check": lambda data: _check_contact_info(data),
        "severity": "medium",
        "description": "Resume should include contact information",
    },
    {
        "id": "skills_length",
        "check": lambda data: _check_skills_length(data),
        "severity": "medium",
        "description": "Skills section should be comprehensive",
    },
    {
        "id": "experience_count",
        "check": lambda data: _check_experience_count(data),
        "severity": "low",
        "description": "Should list relevant experience",
    },
]


def _check_no_tables(data: Dict[str, Any]) -> Dict[str, Any]:
    """Check if resume uses tables (bad for ATS)."""
    raw = data.get("rawText", "")
    has_tables = bool(re.findall(r"\|.*\|.*\|", raw))
    return {
        "passed": not has_tables,
        "message": "No tables detected" if not has_tables else "Tables detected — ATS may not parse correctly",
    }


def _check_section_headers(data: Dict[str, Any]) -> Dict[str, Any]:
    """Check for clear section headers."""
    required_sections = ["experience", "skills", "education"]
    found = []
    for section in required_sections:
        if section in data and data[section]:
            found.append(section)
    missing = set(required_sections) - set(found)
    return {
        "passed": len(missing) == 0,
        "message": f"Found: {found}" if not missing else f"Missing sections: {missing}",
    }


def _check_contact_info(data: Dict[str, Any]) -> Dict[str, Any]:
    """Check for contact information (name, email, phone, links)."""
    has_name = bool(data.get("fullName"))
    has_email = bool(data.get("email"))
    has_phone = bool(data.get("phone") or data.get("phone_number"))
    has_links = bool(
        (data.get("links") and any(data["links"].values()))
        or data.get("linkedin")
        or data.get("github")
    )
    present = [p for p, ok in [
        ("name", has_name),
        ("email", has_email),
        ("phone", has_phone),
        ("links", has_links),
    ] if ok]
    passed = has_name and (has_email or has_phone)
    message = f"Contact info found: {', '.join(present)}" if present else "No contact information detected"
    return {
        "passed": passed,
        "message": message,
    }


def _check_skills_length(data: Dict[str, Any]) -> Dict[str, Any]:
    """Check if skills section is comprehensive."""
    skills = data.get("skills", [])
    return {
        "passed": len(skills) >= 5,
        "message": f"{len(skills)} skills listed" if len(skills) >= 5 else f"Only {len(skills)} skills — consider adding more",
    }


def _check_experience_count(data: Dict[str, Any]) -> Dict[str, Any]:
    """Check if experience is listed."""
    experience = data.get("experience", [])
    return {
        "passed": len(experience) >= 1,
        "message": f"{len(experience)} experiences listed" if experience else "No experience listed",
    }


class ATSIntelAgent:
    """Combines deterministic checks with LLM-powered ATS analysis."""

    def __init__(self, router: GatewayRouter):
        self._router = router

    async def analyze(
        self,
        resume_data: Dict[str, Any],
        jd_data: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        """
        Full ATS analysis: deterministic checks + LLM judgment.

        Returns score, issues, and recommendations.
        """
        start = time.monotonic()

        # Step 1: Deterministic checks (no LLM cost)
        deterministic_results = []
        passed_count = 0
        for rule in ATS_FORMAT_RULES:
            result = rule["check"](resume_data)
            deterministic_results.append({
                "rule_id": rule["id"],
                "severity": rule["severity"],
                "description": rule["description"],
                **result,
            })
            if result["passed"]:
                passed_count += 1

        deterministic_score = (passed_count / len(ATS_FORMAT_RULES)) * 100

        # Step 2: LLM-powered analysis (only if JD provided, for keyword analysis)
        llm_analysis = None
        if jd_data:
            llm_analysis = await self._llm_analysis(resume_data, jd_data)

        # Step 3: Calculate final score
        if llm_analysis:
            final_score = (deterministic_score * 0.3) + (llm_analysis.get("score", 50) * 0.7)
        else:
            final_score = deterministic_score

        latency = (time.monotonic() - start) * 1000
        logger.info(
            "ATS_ANALYSIS | score=%.1f deterministic=%.1f latency_ms=%.1f",
            final_score, deterministic_score, latency,
        )

        return {
            "status": "success",
            "ats_score": round(final_score, 1),
            "deterministic_score": round(deterministic_score, 1),
            "deterministic_checks": deterministic_results,
            "llm_analysis": llm_analysis,
            "recommendations": self._generate_recommendations(deterministic_results, llm_analysis),
        }

    async def _llm_analysis(
        self,
        resume_data: Dict[str, Any],
        jd_data: Dict[str, Any],
    ) -> Optional[Dict[str, Any]]:
        """LLM-powered ATS analysis for keyword matching and narrative feedback."""
        route = model_router.route("ats_intel")

        system_prompt = """You are an ATS (Applicant Tracking System) analyst.
Analyze the resume against the job description and provide:
1. An ATS compatibility score (0-100)
2. Missing keywords that should be added
3. Formatting issues
4. Narrative feedback for improvement

Respond with JSON:
{
  "score": 75.0,
  "missing_keywords": ["keyword1", "keyword2"],
  "formatting_issues": ["issue1"],
  "narrative_feedback": "brief feedback"
}"""

        user_content = f"""RESUME:
{json.dumps(resume_data, indent=2)[:4000]}

JOB DESCRIPTION:
{json.dumps(jd_data, indent=2)[:3000]}

Analyze ATS compatibility."""

        try:
            request = GatewayRequest(
                messages=[{"role": "user", "content": user_content}],
                system_instruction=system_prompt,
                temperature=route.temperature,
                max_tokens=route.max_tokens,
            )
            response = await self._router.execute(request)
            content = response.content
            if "```json" in content:
                content = content.split("```json")[1].split("```")[0]
            elif "```" in content:
                content = content.split("```")[1].split("```")[0]
            return json.loads(content)
        except Exception as e:
            logger.error("ATS_LLM_ANALYSIS_FAILED | error=%s", str(e))
            return None

    def _generate_recommendations(
        self,
        deterministic_results: List[Dict[str, Any]],
        llm_analysis: Optional[Dict[str, Any]],
    ) -> List[str]:
        """Generate actionable recommendations."""
        recommendations = []

        for check in deterministic_results:
            if not check["passed"]:
                recommendations.append(f"[{check['severity'].upper()}] {check['message']}")

        if llm_analysis:
            missing = llm_analysis.get("missing_keywords", [])
            if missing:
                recommendations.append(f"Add these keywords: {', '.join(missing[:10])}")
            feedback = llm_analysis.get("narrative_feedback", "")
            if feedback:
                recommendations.append(f"Narrative: {feedback}")

        return recommendations


# Process-wide singleton
ats_intel_agent: Optional[ATSIntelAgent] = None
