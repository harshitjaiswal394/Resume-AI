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


# Only trust loopback by default. Production proxy CIDRs must be configured
# explicitly via TRUSTED_PROXIES.
_DEFAULT_TRUSTED_PROXIES = [
    "127.0.0.1/32",
    "::1/128",
]



def _normalize_ip(value: str):
    try:
        ip = ipaddress.ip_address(value.strip())
    except ValueError:
        return None
    if isinstance(ip, ipaddress.IPv6Address) and ip.ipv4_mapped:
        return ip.ipv4_mapped
    return ip


def _trusted_proxy_networks():
    configured = os.getenv("TRUSTED_PROXIES", "").strip()
    candidates = [c.strip() for c in configured.split(",") if c.strip()] if configured else _DEFAULT_TRUSTED_PROXIES
    for candidate in candidates:
        try:
            yield ipaddress.ip_network(candidate, strict=False)
        except ValueError:
            continue


def _peer_is_trusted_proxy(host: str) -> bool:
    peer = _normalize_ip(host)
    if not peer:
        return False
    return any(peer in network for network in _trusted_proxy_networks())


def _extract_client_ip_from_forwarded(forwarded: str, peer: str) -> str:
    trusted_networks = list(_trusted_proxy_networks())
    chain = [entry.strip() for entry in forwarded.split(",") if entry.strip()]
    peer_ip = _normalize_ip(peer)
    if peer_ip:
        chain.append(str(peer_ip))

    for candidate in reversed(chain):
        ip = _normalize_ip(candidate)
        if not ip:
            continue
        if not any(ip in network for network in trusted_networks):
            return str(ip)
    return peer or "unknown"


async def get_client_ip(request: Request) -> str:
    """Best-effort client IP for rate limiting / audit.
    Honors X-Forwarded-For only when the immediate peer is an explicitly
    trusted proxy and extracts the last untrusted address from the forwarded
    chain so prepended spoofed values are ignored.
    """
    peer = request.client.host if request.client else ""
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded and peer and _peer_is_trusted_proxy(peer):
        return _extract_client_ip_from_forwarded(forwarded, peer)
    return peer or "unknown"