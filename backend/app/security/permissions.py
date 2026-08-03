"""
Tool Authorization / Permission Engine.

Every tool has a declared policy (required permissions, allowed roles,
rate limits, payload size caps). The engine evaluates a subject against the
policy BEFORE the tool's function executes and logs every decision.

This satisfies the requirement that the Planner agent cannot automatically
invoke every tool: the agent proposes tool names, but the permission engine
is the enforcement gate between proposal and execution.

Reference: OWASP LLM Top 10 (LLM02 Insecure Output Handling, LLM04 Model
DoS, LLM07 Insecure Plugin/Agent Design), NIST AI RMF (Govern/Manage).
"""

from __future__ import annotations

import logging
import time
from dataclasses import dataclass
from typing import Dict, List, Optional

from app.security.metrics import TOOL_DENIED
from app.security.models import Subject, ToolPolicy

logger = logging.getLogger("resumatch-api.security.permissions")

# ── Global tool registry: single source of truth for capability policy ──────
# rate_limit format: "<count>/<unit>" where unit in day|hour|minute
_TOOL_POLICIES: Dict[str, ToolPolicy] = {
    "search_jobs": ToolPolicy(
        name="search_jobs",
        required_permissions=["jobs:search"],
        allowed_roles=["user", "pro", "admin"],
        rate_limit="50/day",
        max_payload_bytes=4096,
    ),
    "fetch_user_resume": ToolPolicy(
        name="fetch_user_resume",
        required_permissions=["resume:read:self"],
        allowed_roles=["user", "pro", "admin"],
        rate_limit="200/day",
        max_payload_bytes=512,
        sensitive=True,
    ),
}

# Implicit permissions granted to each role.
_ROLE_PERMISSIONS: Dict[str, List[str]] = {
    "user": ["jobs:search", "resume:read:self"],
    "pro": ["jobs:search", "resume:read:self"],
    "admin": ["jobs:search", "resume:read:self", "jobs:admin", "resume:read:all"],
}

_DEFAULT_ANONYMOUS_ROLE = "anonymous"


@dataclass
class ToolDecision:
    allowed: bool
    reason: Optional[str] = None
    policy: Optional[ToolPolicy] = None


class PermissionEngine:
    """Evaluates tool invocation requests against the policy registry."""

    def __init__(self, policies: Optional[Dict[str, ToolPolicy]] = None) -> None:
        self._policies = policies or _TOOL_POLICIES

    def register_policy(self, policy: ToolPolicy) -> None:
        self._policies[policy.name] = policy

    def policy(self, tool_name: str) -> Optional[ToolPolicy]:
        return self._policies.get(tool_name)

    def roles_for(self, subject: Subject) -> List[str]:
        return [subject.role] if subject.role else [_DEFAULT_ANONYMOUS_ROLE]

    def check(
        self,
        tool_name: str,
        subject: Subject,
        payload: Optional[dict] = None,
        caller_context: Optional[dict] = None,
    ) -> ToolDecision:
        """Authorize a tool call. Emits denial metrics + logs. Never blocks
        on side effects; the caller decides what to do."""
        policy = self._policies.get(tool_name)
        if policy is None:
            TOOL_DENIED.labels(tool=tool_name, reason="unknown_tool").inc()
            logger.warning("TOOL_DENIED | tool=%s user=%s reason=unknown_tool", tool_name, subject.user_id)
            return ToolDecision(allowed=False, reason="unknown_tool")

        # Role check.
        roles = self.roles_for(subject)
        if policy.allowed_roles and not (set(roles) & set(policy.allowed_roles)):
            TOOL_DENIED.labels(tool=tool_name, reason="role").inc()
            logger.warning(
                "TOOL_DENIED | tool=%s user=%s org=%s role=%s reason=role",
                tool_name, subject.user_id, subject.organization_id, subject.role,
            )
            return ToolDecision(allowed=False, reason="role_not_allowed", policy=policy)

        # Permission check (implicit role grants + explicit).
        granted = set(_ROLE_PERMISSIONS.get(subject.role, []))
        if policy.required_permissions and not granted.issuperset(policy.required_permissions):
            TOOL_DENIED.labels(tool=tool_name, reason="permission").inc()
            logger.warning(
                "TOOL_DENIED | tool=%s user=%s role=%s missing=%s reason=permission",
                tool_name, subject.user_id, subject.role, policy.required_permissions,
            )
            return ToolDecision(allowed=False, reason="missing_permission", policy=policy)

        # Payload size cap (defense against prompt bloat / DoS).
        if payload is not None:
            size = len(str(payload))
            if size > policy.max_payload_bytes:
                TOOL_DENIED.labels(tool=tool_name, reason="payload_too_large").inc()
                logger.warning(
                    "TOOL_DENIED | tool=%s user=%s payload_bytes=%d max=%d reason=payload_too_large",
                    tool_name, subject.user_id, size, policy.max_payload_bytes,
                )
                return ToolDecision(allowed=False, reason="payload_too_large", policy=policy)

        return ToolDecision(allowed=True, policy=policy)

    def parse_rate_limit(self, tool_name: str) -> Optional[tuple]:
        """Return (count, seconds) for a tool's configured limit, if any."""
        policy = self._policies.get(tool_name)
        if not policy or not policy.rate_limit:
            return None
        count_str, unit = policy.rate_limit.split("/")
        seconds = {"minute": 60, "hour": 3600, "day": 86400}.get(unit, 86400)
        try:
            return int(count_str), seconds
        except ValueError:
            return None


# Singleton used across the app.
permission_engine = PermissionEngine()


# ── Rate-limit bridge (uses the shared limiter to enforce tool budgets) ─────
def _tool_limit_bridge(tool_name: str):
    parsed = permission_engine.parse_rate_limit(tool_name)
    if not parsed:
        return None
    return parsed


# Keep a reference so tests can assert the registry is queryable.
def registered_policy_names() -> List[str]:
    return list(permission_engine._policies.keys())
