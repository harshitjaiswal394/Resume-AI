import asyncio
import json

from app.services.ai_gateway import (
    AgentTool,
    AgentTurn,
    GatewayRequest,
    GatewayRouter,
    ToolCall,
)


async def _noop_tool(query: str = None, location: str = None, experience_level: str = None) -> str:
    return json.dumps(
        {
            "status": "success",
            "count": 1,
            "jobs": [{"title": "SDE2", "company": "GCP", "location": location or "Bangalore"}],
        }
    )


SEARCH_TOOL = AgentTool(
    name="search_jobs",
    description="Search jobs",
    parameters={
        "type": "object",
        "properties": {
            "query": {"type": "string"},
            "location": {"type": "string"},
            "experience_level": {"type": "string"},
        },
        "required": ["query"],
    },
    function=_noop_tool,
)


class ScriptedAgentProvider:
    """Returns tool calls on early turns, then a final text answer."""

    def __init__(self, name="vertex-gemini", model="gemini-2.5-flash"):
        self.name = name
        self.model = model
        self.calls = []
        self.tool_script = [ToolCall(name="search_jobs", arguments={"query": "python", "location": "Bangalore"})]

    async def complete(self, request: GatewayRequest) -> str:
        return "scripted"

    async def agent_turn(self, request, tools=None, on_tool_call=None, on_tool_result=None):
        self.calls.append(request.messages)
        if len(self.calls) <= len(self.tool_script):
            return AgentTurn(tool_calls=self.tool_script[:1])
        return AgentTurn(content="Found SDE2 roles at GCP.")


def test_agent_loop_executes_tool_and_fed_results_back():
    provider = ScriptedAgentProvider()
    router = GatewayRouter(providers=[provider], default_provider="vertex-gemini")

    tool_events = []

    async def on_tool_call(tc: ToolCall):
        tool_events.append(("call", tc.name))

    async def on_tool_result(tc: ToolCall, result: str):
        tool_events.append(("result", tc.name, result))

    response = asyncio.run(
        router.execute_agent(
            GatewayRequest(messages=[{"role": "user", "content": "find jobs"}], system_instruction="be concise"),
            tools=[SEARCH_TOOL],
            on_tool_call=on_tool_call,
            on_tool_result=on_tool_result,
        )
    )

    assert response.content == "Found SDE2 roles at GCP."
    assert response.provider == "vertex-gemini"
    assert response.metadata["tools_used"] == ["search_jobs"]
    assert response.metadata["iterations"] == 2
    assert ("call", "search_jobs") in tool_events
    assert any(t[0] == "result" and t[1] == "search_jobs" for t in tool_events)

    # The second model call must include the assistant tool-call + tool result messages.
    second_call = provider.calls[1]
    roles = [m["role"] for m in second_call]
    assert "assistant" in roles and "tool" in roles
    tool_msg = next(m for m in second_call if m["role"] == "tool")
    assert json.loads(tool_msg["content"])["jobs"][0]["title"] == "SDE2"


def test_agent_loop_handles_unknown_tool():
    provider = ScriptedAgentProvider()
    provider.tool_script = [ToolCall(name="nonexistent_tool", arguments={})]
    router = GatewayRouter(providers=[provider], default_provider="vertex-gemini")

    response = asyncio.run(
        router.execute_agent(
            GatewayRequest(messages=[{"role": "user", "content": "hi"}]),
            tools=[SEARCH_TOOL],
        )
    )

    assert response.content == "Found SDE2 roles at GCP."
    assert response.metadata["tools_used"] == ["nonexistent_tool"]
    second_call = provider.calls[1]
    tool_msg = next(m for m in second_call if m["role"] == "tool")
    assert "Unknown tool" in tool_msg["content"]


def test_agent_loop_exhausts_step_budget():
    class NeverEndingProvider:
        name = "vertex-gemini"
        model = "gemini-2.5-flash"

        async def complete(self, request):
            return ""

        async def agent_turn(self, request, tools=None, on_tool_call=None, on_tool_result=None):
            return AgentTurn(tool_calls=[ToolCall(name="search_jobs", arguments={"query": "x"})])

    router = GatewayRouter(providers=[NeverEndingProvider()], default_provider="vertex-gemini")

    response = asyncio.run(
        router.execute_agent(
            GatewayRequest(messages=[{"role": "user", "content": "hi"}]),
            tools=[SEARCH_TOOL],
            max_iterations=3,
        )
    )

    assert response.metadata["loop_exhausted"] is True
    assert response.metadata["iterations"] == 3
    assert "could not reach" in response.content.lower()


def test_agent_loop_falls_back_to_next_provider():
    class FailingProvider:
        name = "vertex-gemini"
        model = "gemini-2.5-flash"

        async def complete(self, request):
            raise RuntimeError("vertex down")

        async def agent_turn(self, request, tools=None, on_tool_call=None, on_tool_result=None):
            raise RuntimeError("vertex down")

    class BackupProvider:
        name = "nvidia"
        model = "llama-70b"

        async def complete(self, request):
            return "backup answer"

        async def agent_turn(self, request, tools=None, on_tool_call=None, on_tool_result=None):
            return AgentTurn(content="backup answer")

    router = GatewayRouter(providers=[FailingProvider(), BackupProvider()], default_provider="vertex-gemini")

    response = asyncio.run(
        router.execute_agent(GatewayRequest(messages=[{"role": "user", "content": "hi"}]), tools=[SEARCH_TOOL])
    )

    assert response.provider == "nvidia"
    assert response.content == "backup answer"
    assert response.metadata["fallback_used"] is True
