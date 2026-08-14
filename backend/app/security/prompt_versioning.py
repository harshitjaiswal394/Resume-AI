"""
Prompt Versioning & Model Governance.

Tracks every version of every agent's system prompt with a content checksum,
author, and activation state so changes are auditable and rollback is one
command. Reads from the `prompt_versions` table when available; falls back
to the registry defaults at boot so the app never depends on the DB to start.

Reference: ISO 27001 A.12.1/12.5 (change management), NIST AI RMF (Govern/
Measure/Manage), SOC2 CC8.
"""

from __future__ import annotations

import hashlib
import logging
import time
from dataclasses import dataclass
from typing import Dict, List, Optional

from app.security.models import EventType
from app.security.audit import audit_logger

logger = logging.getLogger("resumatch-api.security.prompts")

try:
    from app.db import engine  # type: ignore
    from sqlalchemy import text  # type: ignore

    _DB_AVAILABLE = True
except Exception:  # pragma: no cover
    engine = None
    text = None
    _DB_AVAILABLE = False


@dataclass(frozen=True)
class PromptVersion:
    agent: str
    version: int
    content: str
    checksum: str
    author: Optional[str] = None
    active: bool = False
    created_at: Optional[float] = None


def checksum(content: str) -> str:
    return hashlib.sha256(content.encode("utf-8")).hexdigest()


class PromptVersionStore:
    """DB-backed store with in-memory fallback (seeded from agent registry)."""

    def __init__(self, seed: Optional[Dict[str, str]] = None) -> None:
        self._active: Dict[str, PromptVersion] = {}
        self._versions: Dict[str, List[PromptVersion]] = {}
        self._db = _DB_AVAILABLE
        if seed:
            for agent, content in seed.items():
                self._seed(agent, content)

    def _seed(self, agent: str, content: str) -> None:
        version = PromptVersion(
            agent=agent,
            version=1,
            content=content,
            checksum=checksum(content),
            author="system-bootstrap",
            active=True,
            created_at=time.time(),
        )
        self._active[agent] = version
        self._versions[agent] = [version]

    # -- DB persistence ------------------------------------------------------
    def _persist(self, version: PromptVersion) -> None:
        if not self._db or engine is None:
            return
        try:
            with engine.begin() as conn:
                conn.execute(
                    text(
                        """
                        INSERT INTO prompt_versions (agent, version, content, checksum, author, active, created_at)
                        VALUES (:agent, :version, :content, :checksum, :author, :active, NOW())
                        """
                    ),
                    {
                        "agent": version.agent,
                        "version": version.version,
                        "content": version.content,
                        "checksum": version.checksum,
                        "author": version.author,
                        "active": version.active,
                    },
                )
        except Exception:
            logger.exception("prompt_version_persist_failed")

    # -- API -----------------------------------------------------------------
    def active(self, agent: str) -> Optional[PromptVersion]:
        return self._active.get(agent)

    def list_versions(self, agent: str) -> List[PromptVersion]:
        return list(reversed(self._versions.get(agent, [])))

    def promote(self, agent: str, content: str, author: Optional[str] = None) -> PromptVersion:
        """Create the next version of a prompt and activate it. Old versions
        remain for rollback."""
        current = self._active.get(agent)
        next_version = (current.version + 1) if current else 1
        version = PromptVersion(
            agent=agent,
            version=next_version,
            content=content,
            checksum=checksum(content),
            author=author or "system",
            active=True,
            created_at=time.time(),
        )
        # Deactivate prior versions in memory.
        for v in self._versions.get(agent, []):
            self._versions[agent] = [PromptVersion(v.agent, v.version, v.content, v.checksum, v.author, False, v.created_at) if v.version != next_version else v for v in self._versions[agent]]
        self._active[agent] = version
        self._versions.setdefault(agent, []).append(version)
        self._persist(version)
        audit_logger.log(
            EventType.PROMPT_VERSIONED,
            agent=agent,
            extra={"prompt_version": next_version, "checksum": version.checksum, "author": version.author},
        )
        logger.info("PROMPT_VERSIONED | agent=%s version=%d author=%s", agent, next_version, version.author)
        return version

    def rollback(self, agent: str, version: int, author: Optional[str] = None) -> Optional[PromptVersion]:
        """Restore a previous version as active (rollback)."""
        target = next((v for v in self._versions.get(agent, []) if v.version == version), None)
        if target is None:
            return None
        rolled = PromptVersion(agent, target.version, target.content, target.checksum, author or "system", True, time.time())
        self._active[agent] = rolled
        audit_logger.log(
            EventType.PROMPT_VERSIONED,
            agent=agent,
            extra={"prompt_version": version, "action": "rollback", "checksum": target.checksum, "author": rolled.author},
        )
        return rolled

    def verify(self, agent: str) -> bool:
        """Check the active prompt's checksum matches the stored content."""
        version = self._active.get(agent)
        if version is None:
            return False
        return version.checksum == checksum(version.content)


prompt_version_store = PromptVersionStore()
