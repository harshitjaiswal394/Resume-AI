"""
Shared API dependencies: authentication, client metadata.

Centralizes the Bearer-token user resolution used by protected routes so the
same policy (401 on missing/invalid token) is enforced consistently across
every authenticated endpoint.
"""

from __future__ import annotations

from typing import Optional

from fastapi import Header, HTTPException, Request

from app.services.auth_service import auth_service


async def get_current_user_id(authorization: Optional[str] = Header(None)) -> str:
    """Resolve the authenticated user id from the Bearer token, or 401."""
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Unauthorized")
    token = authorization.replace("Bearer ", "")
    result = await auth_service.get_user(token)
    if not result.get("success"):
        raise HTTPException(status_code=401, detail="Invalid token")
    return result["user"]["id"]


async def get_client_ip(request: Request) -> str:
    """Best-effort client IP for rate limiting / audit. Honors X-Forwarded-For."""
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        return forwarded.split(",")[0].strip() or "unknown"
    return request.client.host if request.client else "unknown"
