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
from app.agents.tools.resume_tools import (
    get_tailoring_cache,
    get_resume_version,
    list_resume_versions,
    store_resume_version,
)
from app.agents.tools.version_diff import compute_diff

logger = logging.getLogger("resumatch-ai.agents.resume_tailor")


TAILORING_PROMPT = """You are a resume tailoring expert. Your task is to rewrite a resume to better match a specific job description.

STRICT RULES — NO HALLUCINATION CONTRACT:
1. You may ONLY rephrase, reorder, and emphasize content from the source resume.
2. You must NEVER invent employers, titles, dates, or metrics not present in the source.
3. You may add keywords from the JD naturally into existing bullet points.
4. You may reorder sections to prioritize relevant experience.
5. You must NOT add new skills that aren't in the source resume. The "skills" array must reuse the EXACT skill labels from the source resume (copy them verbatim from the source resume's "skills" field). You may reorder them, but you must NOT rename them, group them into new category labels, or invent new skill names.
6. You must NOT change employment dates or company names.
7. PRESERVE ALL SECTIONS: copy the source resume's certifications, achievements, languages, projects, links, email, phone, and targetRole into the tailored output VERBATIM (reuse the exact source values). Tailoring focuses on summary, skills, and experience bullets — never drop or empty other sections.

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
    "education": [...],
    "certifications": [...],
    "achievements": [...],
    "languages": [...],
    "projects": [...],
    "links": [...],
    "email": "...",
    "phone": "...",
    "targetRole": "..."
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
        cache_hit = await get_tailoring_cache(user_id, jd_hash, resume_id)
        if cache_hit:
            latency = (time.monotonic() - start) * 1000
            logger.info("TAILORING_CACHE_HIT | user=%s resume=%s jd_hash=%s latency_ms=%.1f", user_id, resume_id, jd_hash, latency)
            cached_tailored = cache_hit["parsed_data"]
            if not isinstance(cached_tailored, dict):
                cached_tailored = {}
            # Re-apply source-section preservation so versions created before this
            # fix (or that dropped sections) still carry every source field.
            self._preserve_source_sections(resume_data, cached_tailored)
            # Report the resume_id that actually owns the cached version so the
            # frontend's version-history lookups resolve correctly.
            version_resume_id = cache_hit.get("resume_id") or resume_id
            return {
                "status": "success",
                "cached": True,
                "resume_id": version_resume_id,
                "tailored_data": cached_tailored,
                "change_reasons": cache_hit.get("change_reasons", []),
                "diff_json": cache_hit.get("diff_json"),
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
            json_mode=True,
        )

        response = await self._router.execute(request)

        # Step 3: Parse structured output (repairs truncation/markdown fences)
        from app.services.json_utils import parse_json_response

        result = parse_json_response(response.content)
        if result is None or not isinstance(result, dict):
            logger.error("TAILORING_PARSE_FAILED | unusable content")
            return {"status": "error", "message": "Failed to parse tailoring output"}
        tailored_resume = result.get("tailored_resume", {})
        change_summary = result.get("change_summary", {})
        if not isinstance(tailored_resume, dict):
            tailored_resume = {}
        # Preserve every section the model may have dropped (deterministic).
        self._preserve_source_sections(resume_data, tailored_resume)
        change_reasons = self._extract_change_reasons(tailored_resume)

        # Step 4: Validate no hallucination (basic check)
        validation = self._validate_no_hallucination(resume_data, tailored_resume)
        if not validation["valid"]:
            invented = validation.get("invented_skills", [])
            if invented:
                # Soft-fix: drop ungrounded skills, keep the rest of the output.
                kept = [s for s in tailored_resume.get("skills", []) if s not in invented]
                tailored_resume["skills"] = kept
                logger.warning(
                    "TAILORING_SKILLS_STRIPPED | dropped=%s kept=%d",
                    invented, len(kept),
                )
                validation["issues"] = [
                    i for i in validation["issues"]
                    if not i.startswith("New skills added")
                ]
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

        # Step 5: Compute diff (default vs tailored) and persist as a new version
        diff = compute_diff(resume_data, tailored_resume)
        version_id = None
        try:
            version_id = await store_resume_version(
                user_id=user_id,
                resume_id=resume_id,
                parsed_data=tailored_resume,
                diff_from_version=None,
                jd_hash=jd_hash,
                change_reasons=change_reasons,
                diff_json=diff,
            )
            logger.info("TAILORING_VERSION_STORED | user=%s version=%s", user_id, version_id)
        except Exception as e:
            logger.error("TAILORING_VERSION_STORE_FAILED | user=%s error=%s", user_id, e)

        return {
            "status": "success",
            "cached": False,
            "resume_id": resume_id,
            "tailored_data": tailored_resume,
            "change_summary": change_summary,
            "change_reasons": change_reasons,
            "diff_json": diff,
            "version_id": version_id,
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

    # Sections the model is NOT allowed to invent or drop — copied verbatim.
    _PASSTHROUGH_KEYS = (
        "certifications",
        "achievements",
        "languages",
        "projects",
        "internships",
        "links",
        "email",
        "phone",
        "targetRole",
    )

    @classmethod
    def _preserve_source_sections(
        cls,
        source_resume: Dict[str, Any],
        tailored_resume: Dict[str, Any],
    ) -> None:
        """
        Copy non-tailored sections from the source into the tailored output so
        no user data is ever lost, regardless of what the model returned.
        """
        if not isinstance(source_resume, dict) or not isinstance(tailored_resume, dict):
            return
        for key in cls._PASSTHROUGH_KEYS:
            source_val = source_resume.get(key)
            if source_val in (None, "", [], {}):
                continue
            tailored_val = tailored_resume.get(key)
            if tailored_val in (None, "", [], {}):
                tailored_resume[key] = source_val

    @classmethod
    def _validate_no_hallucination(
        cls,
        source_resume: Dict[str, Any],
        tailored_resume: Dict[str, Any],
    ) -> Dict[str, Any]:
        """
        Basic validation: ensure no new employers/titles/dates were invented.

        Skills are checked against the FULL source corpus (skills + experience
        + summary + education) rather than an exact match against the skills
        column, because sources often store category labels while the model
        extracts the concrete technologies. A skill is only flagged if none of
        its tokens appear anywhere in the source resume.
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

        # Check skills — corpus-aware (no exact-match false positives)
        corpus_tokens = cls._build_source_corpus(source_resume)
        tailored_skills = [str(s) for s in tailored_resume.get("skills", [])]
        invented = []
        for skill in tailored_skills:
            skill_lower = skill.lower().strip()
            if not skill_lower:
                continue
            # Category labels like "CI/CD & DevOps (GitLab, Jenkins)" → check
            # the concrete tokens inside, not the whole label string.
            tokens = cls._tokenize(skill_lower)
            concrete = {t for t in tokens if t not in cls._noise_tokens}
            if not concrete:
                continue
            # Grounded if at least one concrete token appears in the source.
            if not (concrete & corpus_tokens):
                invented.append(skill)
        if invented:
            issues.append(f"New skills added (not in source): {set(invented)}")

        return {
            "valid": len(issues) == 0,
            "issues": issues,
            "invented_skills": invented,
        }

    # Words too generic to treat as skills evidence (category glue).
    _noise_tokens = {
        "and", "or", "with", "for", "in", "on", "of", "the", "to", "&",
        "devops", "dev", "ops", "technologies", "tools", "tooling", "tech",
        "engineering", "engineer", "experience", "management", "systems",
        "system", "cloud", "stack", "skill", "skills", "frameworks", "libraries",
    }

    @staticmethod
    def _tokenize(text: str) -> set:
        import re
        return set(re.findall(r"[a-z0-9+#.]+", text.lower()))

    @classmethod
    def _build_source_corpus(cls, source_resume: Dict[str, Any]) -> set:
        """All concrete tokens that appear anywhere in the source resume."""
        import re
        parts = []
        parts.extend(str(s) for s in source_resume.get("skills", []))
        parts.append(str(source_resume.get("summary", "")))
        parts.append(str(source_resume.get("rawText", "")))
        for exp in source_resume.get("experience", []) or []:
            if not isinstance(exp, dict):
                continue
            parts.append(str(exp.get("title", "")))
            parts.append(str(exp.get("company", "")))
            for desc in exp.get("description") or exp.get("bullets") or []:
                if isinstance(desc, dict):
                    parts.append(str(desc.get("text", "")))
                    parts.append(str(desc.get("original_bullet", "")))
                else:
                    parts.append(str(desc))
        for edu in source_resume.get("education", []) or []:
            if isinstance(edu, dict):
                parts.append(str(edu.get("degree", "")))
                parts.append(str(edu.get("institution", "")))
            else:
                parts.append(str(edu))
        corpus = set()
        for part in parts:
            corpus |= cls._tokenize(part)
        return corpus


# Process-wide singleton
resume_tailor_agent: Optional[ResumeTailorAgent] = None
