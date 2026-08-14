import asyncio
from types import SimpleNamespace

import pytest

from app.services.ai_gateway import GatewayRequest
from app.services.provider_adapters import AnthropicProvider, GeminiProvider, OpenAIProvider


def test_gemini_provider_requires_api_key(monkeypatch):
    monkeypatch.delenv("GEMINI_API_KEY", raising=False)
    monkeypatch.delenv("NEXT_PUBLIC_GEMINI_API_KEY", raising=False)
    provider = GeminiProvider()
    with pytest.raises(RuntimeError):
        asyncio.run(provider.complete(GatewayRequest(messages=[{"role": "user", "content": "hello"}])))


def test_openai_provider_uses_client_response(monkeypatch):
    monkeypatch.setenv("OPENAI_API_KEY", "test-key")
    provider = OpenAIProvider()

    async def fake_create(**kwargs):
        return SimpleNamespace(
            choices=[SimpleNamespace(message=SimpleNamespace(content="openai-response"))]
        )

    provider.client = SimpleNamespace(
        chat=SimpleNamespace(completions=SimpleNamespace(create=fake_create))
    )

    response = asyncio.run(provider.complete(GatewayRequest(messages=[{"role": "user", "content": "hello"}])))
    assert response == "openai-response"


def test_anthropic_provider_parses_text_response(monkeypatch):
    monkeypatch.setenv("ANTHROPIC_API_KEY", "test-key")
    provider = AnthropicProvider()

    class FakeResponse:
        def raise_for_status(self):
            return None

        def json(self):
            return {"content": [{"type": "text", "text": "anthropic-response"}]}

    class FakeClient:
        async def __aenter__(self):
            return self

        async def __aexit__(self, exc_type, exc, tb):
            return False

        async def post(self, *args, **kwargs):
            return FakeResponse()

    monkeypatch.setattr("app.services.provider_adapters.httpx.AsyncClient", lambda timeout=60.0: FakeClient())

    response = asyncio.run(provider.complete(GatewayRequest(messages=[{"role": "user", "content": "hello"}])))
    assert response == "anthropic-response"
