"""
Model Router — config-driven model tiering.

Maps each agent/step to the cheapest model that can handle it.
Config table, not hardcoded — change behavior by editing ROUTE_TABLE.
"""

from __future__ import annotations

import logging
import os
from dataclasses import dataclass
from enum import Enum
from typing import Dict, Optional

logger = logging.getLogger("resumatch-ai.model_router")


class ModelTier(str, Enum):
    """Model tiers ordered by cost (cheap → expensive)."""
    NONE = "none"                # No LLM — rule-based only
    FLASH_LITE = "flash_lite"    # Gemini 2.0 Flash-Lite or equivalent
    FLASH = "flash"              # Gemini 2.5 Flash
    STRONG = "strong"            # GPT-4o / Claude 3.5 Sonnet (rare use)


@dataclass(frozen=True)
class ModelRoute:
    """A single routing rule: which provider+model to use for a task."""
    tier: ModelTier
    provider: str                # Provider name matching BaseProvider.name
    model: Optional[str] = None  # Override model; None = provider default
    max_tokens: int = 1600
    temperature: float = 0.35


# ── The actual routing table — edit this to change behavior ──────────────────
ROUTE_TABLE: Dict[str, ModelRoute] = {
    # Intent classification / short-turn chat
    "intent_classification": ModelRoute(
        tier=ModelTier.FLASH_LITE,
        provider="vertex-gemini",
        model="gemini-2.0-flash",
        max_tokens=200,
        temperature=0.1,
    ),
    "planner": ModelRoute(
        tier=ModelTier.FLASH,
        provider="vertex-gemini",
        model="gemini-2.5-flash",
        max_tokens=1600,
        temperature=0.35,
    ),

    # Resume intelligence (parsing is rule-based, embeddings need a model)
    "resume_intel": ModelRoute(
        tier=ModelTier.FLASH,
        provider="vertex-gemini",
        model="gemini-2.5-flash",
        max_tokens=2000,
        temperature=0.3,
    ),
    "resume_embed": ModelRoute(
        tier=ModelTier.FLASH_LITE,
        provider="nvidia",
        model="nvidia/nv-embedqa-e5-v5",
        max_tokens=512,
    ),

    # JD intelligence
    "jd_intel": ModelRoute(
        tier=ModelTier.FLASH,
        provider="vertex-gemini",
        model="gemini-2.5-flash",
        max_tokens=8192,
        temperature=0.2,
    ),

    # Resume tailoring (high-stakes — use full Flash)
    "resume_tailor": ModelRoute(
        tier=ModelTier.FLASH,
        provider="vertex-gemini",
        model="gemini-2.5-flash",
        max_tokens=32768,
        temperature=0.4,
    ),

    # ATS intelligence (deterministic checks + LLM for judgment)
    "ats_intel": ModelRoute(
        tier=ModelTier.FLASH,
        provider="vertex-gemini",
        model="gemini-2.5-flash",
        max_tokens=2000,
        temperature=0.2,
    ),

    # Memory (retrieval is pgvector, generation uses Flash-Lite)
    "memory_generate": ModelRoute(
        tier=ModelTier.FLASH_LITE,
        provider="vertex-gemini",
        model="gemini-2.0-flash",
        max_tokens=1000,
        temperature=0.3,
    ),

    # Reflection (rule-first, LLM only for judgment calls)
    "reflection": ModelRoute(
        tier=ModelTier.FLASH_LITE,
        provider="vertex-gemini",
        model="gemini-2.0-flash",
        max_tokens=500,
        temperature=0.1,
    ),

    # Interview (multi-turn, stateful)
    "interview": ModelRoute(
        tier=ModelTier.FLASH,
        provider="vertex-gemini",
        model="gemini-2.5-flash",
        max_tokens=2000,
        temperature=0.5,
    ),

    # Learning roadmap (can be batch)
    "learning_roadmap": ModelRoute(
        tier=ModelTier.FLASH_LITE,
        provider="vertex-gemini",
        model="gemini-2.0-flash",
        max_tokens=2000,
        temperature=0.4,
    ),

    # Career coach (can be batch)
    "career_coach": ModelRoute(
        tier=ModelTier.FLASH_LITE,
        provider="vertex-gemini",
        model="gemini-2.0-flash",
        max_tokens=2000,
        temperature=0.4,
    ),

    # Generic chat (existing chatbot fallback)
    "chat": ModelRoute(
        tier=ModelTier.FLASH,
        provider="vertex-gemini",
        model="gemini-2.5-flash",
        max_tokens=1600,
        temperature=0.35,
    ),
}


class ModelRouter:
    """Resolves which provider+model to use for a given task."""

    def __init__(self, table: Optional[Dict[str, ModelRoute]] = None):
        self._table = table or ROUTE_TABLE

    def route(self, task: str) -> ModelRoute:
        """Get the routing config for a task. Falls back to 'chat' if unknown."""
        return self._table.get(task, self._table["chat"])

    def provider_for(self, task: str) -> str:
        """Just the provider name."""
        return self.route(task).provider

    def model_for(self, task: str) -> Optional[str]:
        """Just the model name (or None for provider default)."""
        return self.route(task).model

    def max_tokens_for(self, task: str) -> int:
        return self.route(task).max_tokens

    def temperature_for(self, task: str) -> float:
        return self.route(task).temperature

    def is_rule_based(self, task: str) -> bool:
        """True if the task requires no LLM call."""
        return self.route(task).tier == ModelTier.NONE

    def list_tasks(self):
        return list(self._table.keys())


# Process-wide singleton
model_router = ModelRouter()
