"""
Shared API dependencies: authentication, client metadata.

Centralizes the Bearer-token user resolution used by protected routes so the
same policy (401 on missing/invalid token) is enforced consistently across
every authenticated endpoint.
"""

from __future__ import annotations

import ipaddress
import os
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


# Networks that may set X-Forwarded-For on our behalf. Defaults to loopback +
# private ranges (typical nginx/docker gateways). Override with TRUSTED_PROXIES
# (comma-separated IPs/CIDRs) for proxies running on public addresses.
_DEFAULT_TRUSTED_PROXIES = [
    "127.0.0.1",
    "::1",
    "10.0.0.0/8",
    "172.16.0.0/12",
    "192.168.0.0/16",
    "169.254.0.0/16",
    "fc00::/7",
]


def _peer_is_trusted_proxy(host: str) -> bool:
    try:
        peer = ipaddress.ip_address(host)
    except ValueError:
        return False
    # Normalize IPv4-mapped IPv6 (e.g. "::ffff:127.0.0.1") to IPv4.
    if isinstance(peer, ipaddress.IPv6Address) and peer.ipv4_mapped:
        peer = peer.ipv4_mapped
    configured = os.getenv("TRUSTED_PROXIES", "").strip()
    candidates = [c.strip() for c in configured.split(",") if c.strip()] if configured else _DEFAULT_TRUSTED_PROXIES
    for candidate in candidates:
        try:
            if peer in ipaddress.ip_network(candidate, strict=False):
                return True
        except ValueError:
            continue
    return False


async def get_client_ip(request: Request) -> str:
    """Best-effort client IP for rate limiting / audit.

    Honors X-Forwarded-For only when the immediate peer is a trusted proxy;
    otherwise returns the direct peer address so clients cannot spoof the
    forwarded header to rotate past per-IP rate limits.
    """
    peer = request.client.host if request.client else ""
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded and peer and _peer_is_trusted_proxy(peer):
        return forwarded.split(",")[0].strip() or "unknown"
    return peer or "unknown"
