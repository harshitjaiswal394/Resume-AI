"""Tests for the tool permission engine and rate limiter."""

from app.security.models import Subject, ToolPolicy
from app.security.permissions import PermissionEngine
from app.security.rate_limit import RateLimiter


def make_subject(role="user"):
    return Subject(user_id="u1", organization_id="o1", role=role)


def test_known_tool_allowed_for_user():
    engine = PermissionEngine()
    decision = engine.check("search_jobs", make_subject("user"), payload={"q": "engineer"})
    assert decision.allowed is True


def test_unknown_tool_denied():
    engine = PermissionEngine()
    decision = engine.check("mystery_tool", make_subject("user"))
    assert decision.allowed is False
    assert decision.reason == "unknown_tool"


def test_permission_not_granted_for_role():
    # fetch_user_resume requires resume:read:self; a role lacking it is denied.
    engine = PermissionEngine()
    subject = Subject(user_id="u1", role="viewer")
    decision = engine.check("fetch_user_resume", subject, payload={})
    assert decision.allowed is False


def test_oversized_payload_denied():
    engine = PermissionEngine()
    decision = engine.check("search_jobs", make_subject("user"), payload={"q": "x" * 5000})
    assert decision.allowed is False
    assert decision.reason == "payload_too_large"


def test_custom_policy_registration():
    engine = PermissionEngine(policies={})
    engine.register_policy(
        ToolPolicy(name="admin_only_tool", required_permissions=["jobs:admin"], allowed_roles=["admin"])
    )
    assert engine.check("admin_only_tool", make_subject("user")).allowed is False
    assert engine.check("admin_only_tool", make_subject("admin")).allowed is True


def test_rate_limit_parse():
    engine = PermissionEngine()
    assert engine.parse_rate_limit("search_jobs") == (50, 86400)


def test_rate_limiter_allows_under_budget():
    rl = RateLimiter(enabled=True)
    for _ in range(5):
        result = rl.check("chat", user_id="u-fresh")
        assert result.allowed is True


def test_rate_limiter_blocks_over_budget():
    rl = RateLimiter(enabled=True, limits={"chat": (3, 60)})
    for _ in range(3):
        assert rl.check("chat", user_id="u-burst").allowed is True
    denied = rl.check("chat", user_id="u-burst")
    assert denied.allowed is False
    assert denied.retry_after_seconds > 0


def test_rate_limiter_disabled_always_allows():
    rl = RateLimiter(enabled=False, limits={"chat": (1, 60)})
    for _ in range(5):
        assert rl.check("chat", user_id="u-x").allowed is True


def test_rate_limiter_scopes_are_independent():
    rl = RateLimiter(enabled=True, limits={"chat": (1, 60)})
    assert rl.check("chat", user_id="u-a").allowed is True
    assert rl.check("chat", user_id="u-b").allowed is True
    assert rl.check("chat", user_id="u-a").allowed is False
