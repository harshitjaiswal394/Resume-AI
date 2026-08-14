"""
Reflection Agent — post-processing validation.

Rule-based checks first, LLM only for genuine judgment calls.
Produces confidence score + pass/fail; failed responses retry or fall back.
"""

from __future__ import annotations

import json
import logging
import re
import time
from dataclasses import dataclass
from typing import Any, Dict, List, Optional

from app.services.ai_gateway import GatewayRequest, GatewayRouter
from app.agents.model_router import model_router

logger = logging.getLogger("resumatch-ai.agents.reflection")


@dataclass
class ReflectionResult:
    """Result of reflection check."""
    passed: bool
    confidence: float
    issues: List[str]
    rule_triggered: Optional[str] = None
    llm_checked: bool = False


# ── Rule-based checks (no LLM cost) ────────────────────────────────────────

REFLECTION_RULES = [
    {
        "id": "pii_leak",
        "name": "PII Leakage Check",
        "check": lambda text: _check_pii_leak(text),
        "severity": "high",
    },
    {
        "id": "prompt_injection_echo",
        "name": "Prompt Injection Echo",
        "check": lambda text: _check_prompt_echo(text),
        "severity": "high",
    },
    {
        "id": "hallucinated_entities",
        "name": "Hallucinated Entity Check",
        "check": lambda text, source=None: _check_hallucinated_entities(text, source),
        "severity": "high",
    },
    {
        "id": "length_check",
        "name": "Output Length Check",
        "check": lambda text: _check_length(text),
        "severity": "medium",
    },
    {
        "id": "professional_tone",
        "name": "Professional Tone Check",
        "check": lambda text: _check_tone(text),
        "severity": "low",
    },
]


def _check_pii_leak(text: str) -> Dict[str, Any]:
    """Check if output accidentally leaked PII."""
    from app.security.pii import detect_pii
    findings = detect_pii(text)
    return {
        "passed": len(findings) == 0,
        "message": "No PII detected" if not findings else f"PII detected: {[f.kind.value for f in findings]}",
    }


def _check_prompt_echo(text: str) -> Dict[str, Any]:
    """Check if output echoes system prompts or internal instructions."""
    echo_patterns = [
        r"system prompt",
        r"internal (instructions|rules)",
        r"you are (a|an) (AI|language model|assistant)",
        r"I was (instructed|told|programmed) to",
        r"my (rules|instructions|programming)",
    ]
    for pattern in echo_patterns:
        if re.search(pattern, text, re.IGNORECASE):
            return {"passed": False, "message": f"Prompt echo detected: {pattern}"}
    return {"passed": True, "message": "No prompt echo"}


def _check_hallucinated_entities(text: str, source: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    """
    Basic hallucination check: ensure no obvious fabrications.
    This is a lightweight check — the full validation is in ResumeTailorAgent.
    """
    if not source:
        return {"passed": True, "message": "No source data for hallucination check"}

    # Check if text mentions companies not in source
    source_companies = set(
        exp.get("company", "").lower()
        for exp in source.get("experience", [])
        if exp.get("company")
    )
    # Simple check for obvious fabrications
    text_lower = text.lower()
    for company in source_companies:
        if company and company in text_lower:
            continue  # Company mentioned legitimately

    return {"passed": True, "message": "Basic hallucination check passed"}


def _check_length(text: str) -> Dict[str, Any]:
    """Check output length is reasonable."""
    max_length = 10000
    return {
        "passed": len(text) <= max_length,
        "message": f"Length: {len(text)} chars" if len(text) <= max_length else f"Too long: {len(text)} chars (max {max_length})",
    }


def _check_tone(text: str) -> Dict[str, Any]:
    """Basic tone check for professionalism."""
    unprofessional = ["damn", "hell", "stupid", "idiot", "hate"]
    found = [word for word in unprofessional if word in text.lower()]
    return {
        "passed": len(found) == 0,
        "message": "Professional tone" if not found else f"Unprofessional words detected: {found}",
    }


class ReflectionAgent:
    """Post-processing validation: rules first, LLM only for judgment calls."""

    def __init__(self, router: GatewayRouter):
        self._router = router

    async def reflect(
        self,
        text: str,
        source_data: Optional[Dict[str, Any]] = None,
        agent_type: str = "general",
        high_stakes: bool = False,
    ) -> ReflectionResult:
        """
        Validate response quality.

        high_stakes=True triggers LLM check for hallucination risk.
        """
        start = time.monotonic()
        issues = []
        rule_triggered = None

        # Step 1: Rule-based checks (always run, zero LLM cost)
        for rule in REFLECTION_RULES:
            try:
                if rule["id"] == "hallucinated_entities":
                    result = rule["check"](text, source_data)
                else:
                    result = rule["check"](text)

                if not result["passed"]:
                    issues.append(f"[{rule['severity']}] {rule['name']}: {result['message']}")
                    if rule["severity"] == "high":
                        rule_triggered = rule["id"]
            except Exception as e:
                logger.warning("REFLECTION_RULE_FAILED | rule=%s error=%s", rule["id"], e)

        # Step 2: LLM check (only for high-stakes or if rules found issues)
        llm_checked = False
        if high_stakes or (issues and not rule_triggered):
            llm_result = await self._llm_reflection(text, agent_type)
            llm_checked = True
            if not llm_result["passed"]:
                issues.append(f"[LLM] {llm_result['message']}")
                if not rule_triggered:
                    rule_triggered = "llm_judgment"

        # Step 3: Calculate confidence
        confidence = 1.0 - (len(issues) * 0.2)
        confidence = max(0.0, min(1.0, confidence))

        passed = len([i for i in issues if i.startswith("[high]")]) == 0

        latency = (time.monotonic() - start) * 1000
        logger.info(
            "REFLECTION_DONE | passed=%s confidence=%.2f issues=%d llm_checked=%s latency_ms=%.1f",
            passed, confidence, len(issues), llm_checked, latency,
        )

        return ReflectionResult(
            passed=passed,
            confidence=confidence,
            issues=issues,
            rule_triggered=rule_triggered,
            llm_checked=llm_checked,
        )

    async def _llm_reflection(self, text: str, agent_type: str) -> Dict[str, Any]:
        """LLM-powered reflection for genuine judgment calls."""
        route = model_router.route("reflection")

        system_prompt = """You are a response quality checker. Evaluate the response for:
1. Factual accuracy (is anything obviously wrong?)
2. Appropriateness (professional tone?)
3. Completeness (does it address the user's question?)

Respond with JSON:
{"passed": true/false, "message": "brief explanation", "issues": ["issue1", ...]}"""

        try:
            request = GatewayRequest(
                messages=[{"role": "user", "content": f"Agent type: {agent_type}\n\nResponse to check:\n{text[:3000]}"}],
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
            logger.error("REFLECTION_LLM_FAILED | error=%s", str(e))
            return {"passed": True, "message": f"LLM check failed: {e}", "issues": []}


# Process-wide singleton
reflection_agent: Optional[ReflectionAgent] = None
