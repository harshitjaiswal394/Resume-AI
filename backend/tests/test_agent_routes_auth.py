import asyncio

import fastapi
import pytest

from app.api.agent_routes import _get_user_id
from app.services.auth_service import auth_service


class FakeAuth:
    def __init__(self, user_id):
        self._uid = user_id

    async def get_user(self, token):
        return {"success": True, "user": {"id": self._uid, "email": "x@y.z"}}


class FakeAuthDeny:
    async def get_user(self, token):
        return {"success": False, "error": "Invalid or expired session"}


def test_get_user_id_no_header():
    async def case():
        with pytest.raises(fastapi.HTTPException) as exc:
            await _get_user_id(None)
        return exc.value.status_code

    assert asyncio.run(case()) == 401


def test_get_user_id_invalid_token(monkeypatch):
    async def case():
        monkeypatch.setattr(auth_service, "get_user", FakeAuthDeny().get_user)
        with pytest.raises(fastapi.HTTPException) as exc:
            await _get_user_id("Bearer bad-token")
        return exc.value.status_code

    assert asyncio.run(case()) == 401


def test_get_user_id_valid_token(monkeypatch):
    async def case():
        monkeypatch.setattr(auth_service, "get_user", FakeAuth("u-123").get_user)
        return await _get_user_id("Bearer good-token")

    assert asyncio.run(case()) == "u-123"
