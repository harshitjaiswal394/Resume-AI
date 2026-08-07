"""
Memory Agent — 3-tier memory system.

Tier 1: Session memory (Redis/in-memory, TTL 30min)
Tier 2: Durable user memory (Supabase, permanent career history)
Tier 3: Semantic memory (pgvector, "what did we already tell this user")
"""

from __future__ import annotations

import logging
import time
from typing import Any, Dict, List, Optional

from app.services.ai_gateway import GatewayRequest, GatewayRouter
from app.agents.model_router import model_router
from app.agents.tools.memory_tools import (
    get_session_memory,
    set_session_memory,
    get_user_memory,
    upsert_user_memory,
    search_semantic_memory,
    store_semantic_memory,
)

logger = logging.getLogger("resumatch-ai.agents.memory")


class MemoryAgent:
    """3-tier memory: session → durable → semantic."""

    def __init__(self, router: GatewayRouter):
        self._router = router

    # ── Session Memory ───────────────────────────────────────────────────────

    async def get_session_context(self, session_id: str) -> Dict[str, Any]:
        """Get the current session context (conversation summary, active topic)."""
        context = await get_session_memory(session_id, "context")
        return context or {"topic": None, "entities": [], "turn_count": 0}

    async def update_session_context(self, session_id: str, context: Dict[str, Any]) -> None:
        """Update session context after each turn."""
        await set_session_memory(session_id, "context", context, ttl_seconds=1800)

    # ── Durable User Memory ──────────────────────────────────────────────────

    async def get_career_context(self, user_id: str) -> Dict[str, Any]:
        """Assemble full career context from durable memory for agent use."""
        career_goals = await get_user_memory(user_id, "career_goal")
        feedback_history = await get_user_memory(user_id, "feedback")
        interview_results = await get_user_memory(user_id, "interview_result")
        preferences = await get_user_memory(user_id, "preference")

        return {
            "career_goals": [m["content"] for m in career_goals[:5]],
            "feedback_history": [m["content"] for m in feedback_history[:10]],
            "interview_results": [m["content"] for m in interview_results[:5]],
            "preferences": preferences[0]["content"] if preferences else {},
        }

    async def save_career_goal(self, user_id: str, goal: Dict[str, Any]) -> str:
        """Store a career goal."""
        return await upsert_user_memory(user_id, "career_goal", goal)

    async def save_feedback(self, user_id: str, feedback: Dict[str, Any]) -> str:
        """Store user feedback on advice given."""
        return await upsert_user_memory(user_id, "feedback", feedback)

    async def save_interview_result(self, user_id: str, result: Dict[str, Any]) -> str:
        """Store interview simulation results."""
        return await upsert_user_memory(user_id, "interview_result", result)

    # ── Semantic Memory ──────────────────────────────────────────────────────

    async def remember(self, user_id: str, text_content: str, memory_type: str = "advice") -> str:
        """Store a piece of advice/recommendation for semantic retrieval later."""
        return await store_semantic_memory(
            user_id=user_id,
            memory_type=memory_type,
            content={"text": text_content},
            text_content=text_content,
        )

    async def recall(self, user_id: str, query: str, limit: int = 5) -> List[Dict[str, Any]]:
        """Retrieve past advice/recommendations similar to the current query."""
        return await search_semantic_memory(user_id, query, limit=limit)

    async def avoid_repetition(self, user_id: str, proposed_advice: str) -> Dict[str, Any]:
        """
        Check if proposed advice overlaps with past advice.
        Returns {"repetitive": bool, "similar_past": [...]}
        """
        past = await self.recall(user_id, proposed_advice, limit=3)
        if not past:
            return {"repetitive": False, "similar_past": []}

        # Simple overlap check via word sets
        proposed_words = set(proposed_advice.lower().split())
        for mem in past:
            past_words = set(mem.get("content", {}).get("text", "").lower().split())
            overlap = proposed_words & past_words
            if len(overlap) > len(proposed_words) * 0.6:
                return {"repetitive": True, "similar_past": [mem]}

        return {"repetitive": False, "similar_past": past}

    # ── Memory Write (async, fire-and-forget) ────────────────────────────────

    async def async_remember(self, user_id: str, text_content: str, memory_type: str = "advice") -> None:
        """Fire-and-forget memory write — never blocks the user-facing response."""
        try:
            await self.remember(user_id, text_content, memory_type)
        except Exception as e:
            logger.warning("ASYNC_REMEMBER_FAILED | user=%s error=%s", user_id, e)


# Process-wide singleton
memory_agent: Optional[MemoryAgent] = None
