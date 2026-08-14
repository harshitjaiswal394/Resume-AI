"""
Memory tools — session memory (Redis), durable memory (Supabase), semantic memory (pgvector).

All DB operations are ADDITIVE ONLY.
"""

from __future__ import annotations

import json
import logging
import os
import time
from datetime import datetime, timezone, timedelta
from typing import Any, Dict, List, Optional

from sqlalchemy import text

from app.db import engine

logger = logging.getLogger("resumatch-ai.tools.memory")


# ── Session Memory (Redis with fallback to in-memory) ───────────────────────

# Simple in-memory fallback when Redis is not available
_session_store: Dict[str, Dict[str, Any]] = {}

_redis_client = None


def _get_redis():
    """Lazy Redis connection with graceful fallback."""
    global _redis_client
    if _redis_client is not None:
        return _redis_client

    redis_url = os.getenv("REDIS_URL")
    if not redis_url:
        logger.info("REDIS_URL not set — using in-memory session store")
        return None

    try:
        import redis.asyncio as aioredis
        _redis_client = aioredis.from_url(redis_url, decode_responses=True)
        return _redis_client
    except Exception as e:
        logger.warning("REDIS_CONNECTION_FAILED | error=%s — using in-memory fallback", e)
        return None


async def get_session_memory(session_id: str, key: str = "context") -> Optional[Any]:
    """Get session-scoped memory (TTL: 30 minutes)."""
    redis = _get_redis()
    if redis:
        try:
            data = await redis.get(f"session:{session_id}:{key}")
            return json.loads(data) if data else None
        except Exception:
            pass

    # In-memory fallback
    store_key = f"{session_id}:{key}"
    entry = _session_store.get(store_key)
    if entry and entry["expires_at"] > time.time():
        return entry["value"]
    elif entry:
        del _session_store[store_key]
    return None


async def set_session_memory(session_id: str, key: str, value: Any, ttl_seconds: int = 1800) -> None:
    """Set session-scoped memory (default TTL: 30 minutes)."""
    redis = _get_redis()
    if redis:
        try:
            await redis.setex(
                f"session:{session_id}:{key}",
                ttl_seconds,
                json.dumps(value, default=str),
            )
            return
        except Exception:
            pass

    # In-memory fallback
    store_key = f"{session_id}:{key}"
    _session_store[store_key] = {
        "value": value,
        "expires_at": time.time() + ttl_seconds,
    }


# ── Durable User Memory (Supabase) ──────────────────────────────────────────

async def get_user_memory(user_id: str, memory_type: Optional[str] = None) -> List[Dict[str, Any]]:
    """
    Get durable user memory (career goals, feedback history, interview results).

    memory_type filter: "career_goal", "feedback", "interview_result", "preference"
    """
    with engine.begin() as conn:
        # Ensure table exists (additive)
        conn.execute(text("""
            CREATE TABLE IF NOT EXISTS user_memory (
                id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
                user_id TEXT NOT NULL,
                memory_type TEXT NOT NULL,
                content JSONB NOT NULL,
                metadata JSONB DEFAULT '{}',
                created_at TIMESTAMPTZ DEFAULT NOW(),
                updated_at TIMESTAMPTZ DEFAULT NOW()
            )
        """))

        if memory_type:
            rows = conn.execute(
                text("""
                    SELECT id, memory_type, content, metadata, created_at, updated_at
                    FROM user_memory
                    WHERE user_id = :uid AND memory_type = :mt
                    ORDER BY created_at DESC LIMIT 50
                """),
                {"uid": user_id, "mt": memory_type},
            ).fetchall()
        else:
            rows = conn.execute(
                text("""
                    SELECT id, memory_type, content, metadata, created_at, updated_at
                    FROM user_memory
                    WHERE user_id = :uid
                    ORDER BY created_at DESC LIMIT 100
                """),
                {"uid": user_id},
            ).fetchall()

    return [
        {
            "id": str(row.id),
            "memory_type": row.memory_type,
            "content": row.content,
            "metadata": row.metadata,
            "created_at": row.created_at.isoformat() if row.created_at else None,
            "updated_at": row.updated_at.isoformat() if row.updated_at else None,
        }
        for row in rows
    ]


async def upsert_user_memory(
    user_id: str,
    memory_type: str,
    content: Dict[str, Any],
    metadata: Optional[Dict[str, Any]] = None,
) -> str:
    """Insert or update durable user memory."""
    memory_id = f"{user_id}_{memory_type}_{int(time.time())}"

    with engine.begin() as conn:
        conn.execute(text("""
            CREATE TABLE IF NOT EXISTS user_memory (
                id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
                user_id TEXT NOT NULL,
                memory_type TEXT NOT NULL,
                content JSONB NOT NULL,
                metadata JSONB DEFAULT '{}',
                created_at TIMESTAMPTZ DEFAULT NOW(),
                updated_at TIMESTAMPTZ DEFAULT NOW()
            )
        """))

        # Check if similar memory exists (update instead of duplicate)
        existing = conn.execute(
            text("SELECT id FROM user_memory WHERE user_id = :uid AND memory_type = :mt ORDER BY created_at DESC LIMIT 1"),
            {"uid": user_id, "mt": memory_type},
        ).fetchone()

        if existing:
            conn.execute(
                text("UPDATE user_memory SET content = :c, metadata = :m, updated_at = NOW() WHERE id = :id"),
                {"id": str(existing.id), "c": json.dumps(content), "m": json.dumps(metadata or {})},
            )
            memory_id = str(existing.id)
        else:
            conn.execute(
                text("""
                    INSERT INTO user_memory (id, user_id, memory_type, content, metadata, created_at, updated_at)
                    VALUES (:id, :uid, :mt, :c, :m, NOW(), NOW())
                """),
                {"id": memory_id, "uid": user_id, "mt": memory_type, "c": json.dumps(content), "m": json.dumps(metadata or {})},
            )

    logger.info("USER_MEMORY_UPSERTED | user=%s type=%s id=%s", user_id, memory_type, memory_id)
    return memory_id


# ── Semantic Memory (pgvector search) ───────────────────────────────────────

async def search_semantic_memory(
    user_id: str,
    query: str,
    memory_type: Optional[str] = None,
    limit: int = 5,
) -> List[Dict[str, Any]]:
    """
    Search semantic memory using pgvector similarity.
    Returns memories similar to the query.
    """
    try:
        from app.services.nvidia_service import nvidia_service
        query_embedding = await nvidia_service.generate_embedding(query[:2000])
    except Exception as e:
        logger.warning("SEMANTIC_SEARCH_EMBEDDING_FAILED | error=%s", e)
        return []

    with engine.connect() as conn:
        # Check if semantic_memory table exists
        try:
            rows = conn.execute(
                text("""
                    SELECT id, memory_type, content, metadata, created_at,
                           1 - (embedding <=> :emb::vector) as similarity
                    FROM semantic_memory
                    WHERE user_id = :uid
                    ORDER BY embedding <=> :emb::vector
                    LIMIT :lim
                """),
                {"uid": user_id, "emb": json.dumps(query_embedding), "lim": limit},
            ).fetchall()

            return [
                {
                    "id": str(row.id),
                    "memory_type": row.memory_type,
                    "content": row.content,
                    "metadata": row.metadata,
                    "similarity": float(row.similarity),
                    "created_at": row.created_at.isoformat() if row.created_at else None,
                }
                for row in rows
            ]
        except Exception:
            # Table might not exist yet — return empty
            return []


async def store_semantic_memory(
    user_id: str,
    memory_type: str,
    content: Dict[str, Any],
    text_content: str,
    metadata: Optional[Dict[str, Any]] = None,
) -> str:
    """Store a semantic memory entry with embedding."""
    try:
        from app.services.nvidia_service import nvidia_service
        embedding = await nvidia_service.generate_embedding(text_content[:2000])
    except Exception as e:
        logger.warning("SEMANTIC_MEMORY_EMBEDDING_FAILED | error=%s", e)
        return ""

    memory_id = f"sem_{user_id}_{int(time.time())}"

    with engine.begin() as conn:
        conn.execute(text("""
            CREATE TABLE IF NOT EXISTS semantic_memory (
                id TEXT PRIMARY KEY,
                user_id TEXT NOT NULL,
                memory_type TEXT NOT NULL,
                content JSONB NOT NULL,
                embedding JSONB,
                metadata JSONB DEFAULT '{}',
                created_at TIMESTAMPTZ DEFAULT NOW()
            )
        """))

        conn.execute(
            text("""
                INSERT INTO semantic_memory (id, user_id, memory_type, content, embedding, metadata, created_at)
                VALUES (:id, :uid, :mt, :c, :emb, :m, NOW())
            """),
            {
                "id": memory_id,
                "uid": user_id,
                "mt": memory_type,
                "c": json.dumps(content),
                "emb": json.dumps(embedding),
                "m": json.dumps(metadata or {}),
            },
        )

    return memory_id
