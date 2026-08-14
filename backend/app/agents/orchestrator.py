"""
Agent Orchestrator — the routing brain.

Classifies user intent and dispatches to the correct agent.
Uses fast rule-based keyword matching first (zero latency),
then falls back to LLM classification only for ambiguous messages.
"""

from __future__ import annotations

import json
import logging
import re
import time
from dataclasses import dataclass
from typing import Any, Dict, List, Optional, Tuple

from app.services.ai_gateway import GatewayRequest, GatewayRouter

logger = logging.getLogger("resumatch-ai.orchestrator")

# ── Rule-based intent matching (fast path, no LLM) ──────────────────────────
# Each rule: (compiled regex, intent, agent_name, priority)
# Higher priority wins when multiple rules match.

_RULES: List[Tuple[re.Pattern, str, str, int]] = [
    # Resume tailoring
    (re.compile(r"\b(tailor|customiz|customis|adapt|rewrite|adjust)\b.*\b(resume|cv)\b", re.I), "resume_tailoring", "resume_tailor", 10),
    (re.compile(r"\b(resume|cv)\b.*\b(tailor|customiz|customis|adapt|rewrite|adjust)\b", re.I), "resume_tailoring", "resume_tailor", 10),
    (re.compile(r"\bfor (this|that|the) (role|position|job|opening)\b", re.I), "resume_tailoring", "resume_tailor", 8),
    (re.compile(r"\b(tailor(ed|ing)?|adapted|customized)\b.*\b(resume|cv|docx|file|version)\b", re.I), "resume_tailoring", "resume_tailor", 10),
    (re.compile(r"\b(download|get|save|export|share|generate)\b.*\b(tailor(ed)?|version)\b.*\b(resume|cv|docx|file)\b", re.I), "resume_tailoring", "resume_tailor", 10),
    (re.compile(r"\b(download|get|save|export)\b.*\b(resume|cv|docx)\b", re.I), "resume_tailoring", "resume_tailor", 7),

    # JD analysis
    (re.compile(r"\b(analy[sz]e?|review|breakdown|parse|read)\b.*\b(job description|jd)\b", re.I), "jd_analysis", "jd_intel", 10),
    (re.compile(r"\b(job description|jd)\b.*\b(analy[sz]e?|review|breakdown|parse|read)\b", re.I), "jd_analysis", "jd_intel", 10),
    (re.compile(r"\b(hiring|job) (post|listing|description)\b", re.I), "jd_analysis", "jd_intel", 6),

    # ATS check
    (re.compile(r"\b(ats|applicant tracking|atss?|ats score|ats (check|compatib|match|scan|pass))\b", re.I), "ats_check", "ats", 10),
    (re.compile(r"\bwill (my|the) resume (pass|get through|clear)\b", re.I), "ats_check", "ats", 9),

    # Resume analysis / optimization
    (re.compile(r"\b(revise|improve|optimize|optimise|fix|upgrade|enhance|strengthen)\b.*\b(resume|cv)\b", re.I), "resume_analysis", "resume", 9),
    (re.compile(r"\b(resume|cv)\b.*\b(revise|improve|optimize|optimise|fix|upgrade|enhance|strengthen)\b", re.I), "resume_analysis", "resume", 9),
    (re.compile(r"\b(review|analy[sz]e?|evaluate|assess|check|feedback|critique)\b.*\b(resume|cv)\b", re.I), "resume_analysis", "resume", 8),
    (re.compile(r"\b(resume|cv)\b.*\b(review|analy[sz]e?|evaluate|assess|check|feedback|critique)\b", re.I), "resume_analysis", "resume", 8),
    (re.compile(r"\bmy (resume|cv)\b", re.I), "resume_analysis", "resume", 3),

    # Interview prep
    (re.compile(r"\b(interview|mock interview|interview prep|interview practice|interview question|behavioral|technical interview|star method|star story)\b", re.I), "interview_prep", "interview", 10),
    (re.compile(r"\b(prepare|prep|ready|practice)\b.*\binterview\b", re.I), "interview_prep", "interview", 9),
    (re.compile(r"\binterview\b.*\b(prepare|prep|ready|practice)\b", re.I), "interview_prep", "interview", 9),
    (re.compile(r"\b(what questions|tell me about|walk me through|why should)\b", re.I), "interview_prep", "interview", 7),

    # Learning roadmap
    (re.compile(r"\b(learning|study|course|roadmap|upskill|skill gap|learn)\b.*\b(plan|path|roadmap|recommend|suggest)\b", re.I), "learning_roadmap", "learning_roadmap", 10),
    (re.compile(r"\b(plan|path|roadmap|recommend|suggest)\b.*\b(learning|study|course|upskill|skill gap|learn)\b", re.I), "learning_roadmap", "learning_roadmap", 10),
    (re.compile(r"\bwhat (should|can) i (learn|study|pick up)\b", re.I), "learning_roadmap", "learning_roadmap", 9),
    (re.compile(r"\b(skills?|technologies?) to (learn|pick up|master)\b", re.I), "learning_roadmap", "learning_roadmap", 8),
    (re.compile(r"\bwhat (skills?|technologies?) .*\b(learn|need|require)\b", re.I), "learning_roadmap", "learning_roadmap", 8),
    (re.compile(r"\bskills? .*\b(learn|for|role|position|job)\b", re.I), "learning_roadmap", "learning_roadmap", 7),

    # Career planning
    (re.compile(r"\b(career|role|position)\b.*\b(plan|path|growth|transition|switch|progression|advice|guidance)\b", re.I), "career_planning", "career", 9),
    (re.compile(r"\b(plan|path|growth|transition|switch|progression|advice|guidance)\b.*\b(career|role|position)\b", re.I), "career_planning", "career", 9),
    (re.compile(r"\b(transition|switch|move|pivot)\b.*\b(to|into)\b.*\b(engineer|manager|lead|senior|staff|principal|director)\b", re.I), "career_planning", "career", 10),
    (re.compile(r"\b(transition|switch|move|pivot)\b", re.I), "career_planning", "career", 8),
    (re.compile(r"\b(career|role|job)\b.*\badvice\b", re.I), "career_planning", "career", 7),
    (re.compile(r"\bhelp me (with|plan|figure out|decide)\b.*\b(career|role|job|future)\b", re.I), "career_planning", "career", 8),
    (re.compile(r"\b(career|role|job|future)\b.*\bhelp\b", re.I), "career_planning", "career", 7),
    (re.compile(r"\bwhat (should|would|can) i do (next|after|with)\b", re.I), "career_planning", "career", 5),

    # Job search
    (re.compile(r"\b(find|search|look for|recommend|suggest|show me)\b.*\b(jobs?|positions?|openings?|roles?)\b", re.I), "job_search", "career", 8),
    (re.compile(r"\b(jobs?|positions?|openings?|roles?)\b.*\b(in|for|near)\b", re.I), "job_search", "career", 6),
    (re.compile(r"\b(job market|market trend|salary|compensation|demand)\b", re.I), "job_search", "career", 6),

    # General greetings (low priority, go to planner)
    (re.compile(r"^(hi|hello|hey|yo|sup|good morning|good afternoon|good evening|howdy|hola)\s*[!.]?\s*$", re.I), "general_chat", "planner", 5),
    (re.compile(r"^(thanks|thank you|thx|ty|cheers|appreciate)\s*[!.]?\s*$", re.I), "general_chat", "planner", 5),
    (re.compile(r"^(hi|hello|hey|yo|sup|good morning|good afternoon|good evening|howdy|hola)\b", re.I), "general_chat", "planner", 4),
    (re.compile(r"^(thanks|thank you|thx|ty|cheers|appreciate)\b", re.I), "general_chat", "planner", 4),
]


def _rule_based_classify(message: str) -> Optional[IntentClassification]:
    """Fast rule-based intent classification. Returns None if ambiguous."""
    best_match: Optional[Tuple[int, str, str]] = None  # (priority, intent, agent)

    for pattern, intent, agent, priority in _RULES:
        if pattern.search(message):
            if best_match is None or priority > best_match[0]:
                best_match = (priority, intent, agent)

    if best_match is None:
        return None

    priority, intent, agent = best_match
    # High-confidence rules (priority >= 8) skip the LLM entirely
    if priority >= 8:
        return IntentClassification(
            intent=intent,
            confidence=0.95,
            reasoning=f"Rule-based match (priority={priority})",
            agent_name=agent,
        )
    # Medium-confidence rules: return with lower confidence so LLM can confirm
    return IntentClassification(
        intent=intent,
        confidence=0.6,
        reasoning=f"Rule-based partial match (priority={priority})",
        agent_name=agent,
    )


# ── LLM-based classification (slow path, only for ambiguous messages) ────────

INTENT_CLASSIFICATION_PROMPT = """You are an intent classifier for a career copilot AI.

Given the user's message, classify it into ONE of these intents:
- "resume_analysis" — user wants resume review, optimization, or feedback
- "job_search" — user wants job recommendations or market insights
- "jd_analysis" — user wants to analyze a job description
- "resume_tailoring" — user wants to tailor their resume for a specific job
- "ats_check" — user wants ATS compatibility analysis
- "interview_prep" — user wants interview questions, mock interviews, or coaching
- "career_planning" — user wants career progression advice, skill gap analysis, or roadmap
- "learning_roadmap" — user wants a structured learning plan
- "general_chat" — general conversation, greetings, or unclear intent

Respond with ONLY a JSON object:
{"intent": "<intent_name>", "confidence": <0.0-1.0>, "reasoning": "<brief explanation>"}"""


@dataclass
class IntentClassification:
    """Result of intent classification."""
    intent: str
    confidence: float
    reasoning: str
    agent_name: str  # Mapped agent name

    @classmethod
    def from_llm(cls, raw: str, fallback: str = "planner") -> "IntentClassification":
        """Parse LLM JSON output into IntentClassification."""
        try:
            data = json.loads(raw)
            intent = data.get("intent", "general_chat")
            confidence = float(data.get("confidence", 0.5))
            reasoning = data.get("reasoning", "")
        except (json.JSONDecodeError, ValueError, TypeError):
            intent = "general_chat"
            confidence = 0.3
            reasoning = "Failed to parse classification"

        # Map intent -> agent name (must match agent_registry names)
        intent_to_agent = {
            "resume_analysis": "resume",
            "job_search": "career",
            "jd_analysis": "jd_intel",
            "resume_tailoring": "resume_tailor",
            "ats_check": "ats",
            "interview_prep": "interview",
            "career_planning": "career",
            "learning_roadmap": "learning_roadmap",
            "general_chat": "planner",
        }
        agent_name = intent_to_agent.get(intent, fallback)
        return cls(intent=intent, confidence=confidence, reasoning=reasoning, agent_name=agent_name)


class AgentOrchestrator:
    """Routes user messages to the appropriate agent."""

    def __init__(self, router: GatewayRouter):
        self._router = router

    async def classify_intent(self, user_message: str) -> IntentClassification:
        """Classify user intent. Fast path: rules. Slow path: LLM for ambiguous."""
        start = time.monotonic()

        # Fast path: rule-based matching
        rule_result = _rule_based_classify(user_message)
        if rule_result and rule_result.confidence >= 0.8:
            latency = (time.monotonic() - start) * 1000
            logger.info(
                "INTENT_CLASSIFIED_RULE | intent=%s confidence=%.2f agent=%s latency_ms=%.1f",
                rule_result.intent, rule_result.confidence, rule_result.agent_name, latency,
            )
            return rule_result

        # Slow path: LLM classification for ambiguous or unmatched messages
        try:
            request = GatewayRequest(
                messages=[{"role": "user", "content": user_message}],
                system_instruction=INTENT_CLASSIFICATION_PROMPT,
                temperature=0.1,
                max_tokens=200,
            )
            response = await self._router.execute(request)
            llm_result = IntentClassification.from_llm(response.content)

            # If rules had a partial match and LLM agrees, boost confidence
            if rule_result and llm_result.intent == rule_result.intent:
                llm_result.confidence = max(llm_result.confidence, 0.9)
                llm_result.reasoning = f"Rule + LLM agree: {llm_result.reasoning}"

            latency = (time.monotonic() - start) * 1000
            logger.info(
                "INTENT_CLASSIFIED_LLM | intent=%s confidence=%.2f agent=%s latency_ms=%.1f",
                llm_result.intent, llm_result.confidence, llm_result.agent_name, latency,
            )
            return llm_result
        except Exception as e:
            latency = (time.monotonic() - start) * 1000
            logger.error("INTENT_CLASSIFICATION_FAILED | latency_ms=%.1f error=%s", latency, str(e))
            # If rules gave something, use it even if LLM failed
            if rule_result:
                return rule_result
            return IntentClassification(
                intent="general_chat", confidence=0.3,
                reasoning=f"Classification failed: {e}", agent_name="planner",
            )

    async def route(
        self,
        user_message: str,
        user_id: str,
        conversation_id: str,
        context: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        """
        Full orchestration: classify intent -> resolve agent -> return routing info.

        Returns a dict with:
          - agent_name: which agent to invoke
          - intent: classified intent
          - confidence: classification confidence
          - reasoning: why this agent was chosen
        """
        classification = await self.classify_intent(user_message)

        return {
            "agent_name": classification.agent_name,
            "intent": classification.intent,
            "confidence": classification.confidence,
            "reasoning": classification.reasoning,
        }


# Process-wide singleton (initialized lazily after providers are built)
orchestrator: Optional[AgentOrchestrator] = None


def init_orchestrator(router: GatewayRouter) -> AgentOrchestrator:
    """Initialize the global orchestrator with the gateway router."""
    global orchestrator
    orchestrator = AgentOrchestrator(router)
    return orchestrator
