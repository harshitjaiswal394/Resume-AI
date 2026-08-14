import asyncio

from app.services.ai_gateway import GatewayRequest, GatewayRouter


class FakeProvider:
    def __init__(self, name, response_text, fail=False, model="test-model"):
        self.name = name
        self.model = model
        self.response_text = response_text
        self.fail = fail

    async def complete(self, request: GatewayRequest) -> str:
        if self.fail:
            raise RuntimeError("provider unavailable")
        return f"{self.name}:{self.response_text}"


def test_router_uses_preferred_provider_and_fallback():
    primary = FakeProvider("primary", "hello", fail=True)
    fallback = FakeProvider("fallback", "world", fail=False)
    router = GatewayRouter(providers=[primary, fallback])

    response = asyncio.run(
        router.execute(GatewayRequest(messages=[{"role": "user", "content": "hi"}], preferred_provider="primary"))
    )

    assert response.provider == "fallback"
    assert response.model == "test-model"
    assert response.content == "fallback:world"
    assert response.metadata["fallback_used"] is True


def test_router_prefers_configured_provider_without_fallback():
    provider = FakeProvider("configured", "ok", fail=False, model="configured-model")
    router = GatewayRouter(providers=[provider], default_provider="configured")

    response = asyncio.run(router.execute(GatewayRequest(messages=[{"role": "user", "content": "hi"}])))

    assert response.provider == "configured"
    assert response.model == "configured-model"
    assert response.content == "configured:ok"


def test_router_keeps_provider_order_for_fallback_chain():
    primary = FakeProvider("vertex-gemini", "vertex", fail=True, model="gemini-2.5-flash")
    fallback = FakeProvider("nvidia", "llama", fail=False, model="meta/llama-3.1-70b-instruct")
    router = GatewayRouter(providers=[primary, fallback])

    response = asyncio.run(
        router.execute(GatewayRequest(messages=[{"role": "user", "content": "hi"}], preferred_provider="vertex-gemini"))
    )

    assert response.provider == "nvidia"
    assert response.model == "meta/llama-3.1-70b-instruct"
    assert response.metadata["fallback_used"] is True
