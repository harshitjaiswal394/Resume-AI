import json
import logging
from dataclasses import dataclass, field
from typing import Any, Awaitable, Callable, Dict, List, Optional

from app.security.metrics import TOKEN_USAGE, PROVIDER_FAILURES, TOOL_CALLS

logger = logging.getLogger("resumatch-ai.gateway")


def _estimate_tokens(text: Any) -> int:
    """Rough token estimate (~4 chars/token) when providers don't return usage."""
    return max(1, len(str(text or "")) // 4)


def _messages_token_estimate(messages: List[Dict[str, Any]]) -> int:
    total = 0
    for message in messages or []:
        content = message.get("content") or message.get("text") or ""
        if isinstance(content, list):
            for part in content:
                if isinstance(part, dict):
                    total += _estimate_tokens(part.get("text", ""))
                else:
                    total += _estimate_tokens(part)
        else:
            total += _estimate_tokens(content)
    return total

ToolCallable = Callable[..., Awaitable[str]]
ToolCallCallback = Callable[["ToolCall"], Awaitable[None]]
ToolResultCallback = Callable[["ToolCall", str], Awaitable[None]]


@dataclass
class GatewayRequest:
    messages: List[Dict[str, Any]]
    preferred_provider: Optional[str] = None
    stream: bool = False
    metadata: Dict[str, Any] = field(default_factory=dict)
    system_instruction: Optional[str] = None
    tools: List[ToolCallable] = field(default_factory=list)
    agent_tools: List["AgentTool"] = field(default_factory=list)
    temperature: float = 0.35
    max_tokens: int = 8192
    json_mode: bool = False


@dataclass
class GatewayResponse:
    content: str
    provider: str
    model: str
    metadata: Dict[str, Any] = field(default_factory=dict)


@dataclass
class ToolCall:
    id: Optional[str] = None
    name: str = ""
    arguments: Dict[str, Any] = field(default_factory=dict)


@dataclass
class AgentTurn:
    content: Optional[str] = None
    tool_calls: Optional[List[ToolCall]] = None


@dataclass
class AgentTool:
    """A typed tool the model can invoke. `function` receives the parsed JSON arguments."""

    name: str
    description: str
    parameters: Dict[str, Any]
    function: ToolCallable

    def to_openai_tool(self) -> Dict[str, Any]:
        return {
            "type": "function",
            "function": {
                "name": self.name,
                "description": self.description,
                "parameters": self.parameters,
            },
        }

    def to_gemini_declaration(self) -> Dict[str, Any]:
        return {
            "name": self.name,
            "description": self.description,
            "parameters": self.parameters,
        }


class BaseProvider:
    def __init__(self, name: str, model: str):
        self.name = name
        self.model = model

    async def complete(self, request: GatewayRequest) -> str:
        raise NotImplementedError

    async def agent_turn(
        self,
        request: GatewayRequest,
        tools: Optional[List[AgentTool]] = None,
        on_tool_call: Optional[ToolCallCallback] = None,
        on_tool_result: Optional[ToolResultCallback] = None,
    ) -> AgentTurn:
        """Single agentic step. Providers that need stateful tool loops may override
        and drive the full loop internally, returning a final text `AgentTurn`."""
        content = await self.complete(request)
        return AgentTurn(content=content)


class GatewayRouter:
    def __init__(self, providers: List[BaseProvider], default_provider: Optional[str] = None):
        self.providers = providers
        self.default_provider = default_provider

    def _attempt_order(self, preferred: Optional[str]) -> List[str]:
        order: List[str] = []
        if preferred:
            order.append(preferred)
        for provider in self.providers:
            if provider.name not in order:
                order.append(provider.name)
        return order

    def _resolve(self, name: str) -> Optional[BaseProvider]:
        return next((p for p in self.providers if p.name == name), None)

    async def execute(self, request: GatewayRequest) -> GatewayResponse:
        preferred = request.preferred_provider or self.default_provider or (self.providers[0].name if self.providers else None)

        last_error: Optional[Exception] = None
        all_errors: List[str] = []
        for provider_name in self._attempt_order(preferred):
            provider = self._resolve(provider_name)
            if provider is None:
                continue
            try:
                content = await provider.complete(request)
                TOKEN_USAGE.labels(provider=provider.name).inc(
                    _messages_token_estimate(request.messages) + _estimate_tokens(content)
                )
                return GatewayResponse(
                    content=content,
                    provider=provider.name,
                    model=provider.model,
                    metadata={**request.metadata, "fallback_used": provider.name != preferred},
                )
            except Exception as exc:  # pragma: no cover
                last_error = exc
                all_errors.append(f"{provider.name}: {exc}")
                PROVIDER_FAILURES.labels(provider=provider.name, outcome="error").inc()
                logger.warning("provider failed", extra={"provider": provider.name, "error": str(exc)})

        detail = "; ".join(all_errors) if all_errors else str(last_error)
        raise RuntimeError(f"All providers failed: {detail}")

    async def execute_agent(
        self,
        request: GatewayRequest,
        tools: Optional[List[AgentTool]] = None,
        on_tool_call: Optional[ToolCallCallback] = None,
        on_tool_result: Optional[ToolResultCallback] = None,
        max_iterations: int = 6,
    ) -> GatewayResponse:
        """Enterprise agent loop: provider decides, tools execute, results feed back,
        until the model returns a final text answer or the step budget is exhausted.
        Falls back across providers if one fails entirely."""
        preferred = request.preferred_provider or self.default_provider or (self.providers[0].name if self.providers else None)

        last_error: Optional[Exception] = None
        all_errors: List[str] = []
        for provider_name in self._attempt_order(preferred):
            provider = self._resolve(provider_name)
            if provider is None:
                continue
            try:
                return await self._run_agent_loop(
                    provider, provider_name, preferred, request, tools, on_tool_call, on_tool_result, max_iterations
                )
            except Exception as exc:  # pragma: no cover
                last_error = exc
                all_errors.append(f"{provider.name}: {exc}")
                PROVIDER_FAILURES.labels(provider=provider.name, outcome="error").inc()
                logger.warning("agent provider failed", extra={"provider": provider.name, "error": str(exc)})

        detail = "; ".join(all_errors) if all_errors else str(last_error)
        raise RuntimeError(f"All providers failed: {detail}")

    async def _run_agent_loop(
        self,
        provider: BaseProvider,
        provider_name: str,
        preferred: Optional[str],
        request: GatewayRequest,
        tools: Optional[List[AgentTool]],
        on_tool_call: Optional[ToolCallCallback],
        on_tool_result: Optional[ToolResultCallback],
        max_iterations: int,
    ) -> GatewayResponse:
        tools = tools or []
        tools_by_name = {tool.name: tool for tool in tools}
        messages = list(request.messages)
        tools_used: List[str] = []

        for iteration in range(max_iterations):
            turn = await provider.agent_turn(
                GatewayRequest(
                    messages=messages,
                    preferred_provider=provider_name,
                    system_instruction=request.system_instruction,
                    temperature=request.temperature,
                    max_tokens=request.max_tokens,
                    metadata=request.metadata,
                    agent_tools=tools,
                ),
                tools=tools,
                on_tool_call=on_tool_call,
                on_tool_result=on_tool_result,
            )
            TOKEN_USAGE.labels(provider=provider_name).inc(
                _messages_token_estimate(messages) + _estimate_tokens(turn.content)
            )

            if not turn.tool_calls:
                return GatewayResponse(
                    content=turn.content or "",
                    provider=provider.name,
                    model=provider.model,
                    metadata={
                        **request.metadata,
                        "fallback_used": provider_name != preferred,
                        "tools_used": tools_used,
                        "iterations": iteration + 1,
                    },
                )

            for idx, tc in enumerate(turn.tool_calls):
                tool = tools_by_name.get(tc.name)
                tools_used.append(tc.name)
                if on_tool_call:
                    await on_tool_call(tc)

                if tool is None:
                    result_text = json.dumps({"status": "error", "message": f"Unknown tool: {tc.name}"})
                    TOOL_CALLS.labels(tool=tc.name, outcome="unknown").inc()
                    logger.warning("agent requested unknown tool", extra={"tool": tc.name})
                else:
                    try:
                        result_text = await tool.function(**tc.arguments)
                        TOOL_CALLS.labels(tool=tc.name, outcome="success").inc()
                    except Exception as exc:  # pragma: no cover
                        TOOL_CALLS.labels(tool=tc.name, outcome="error").inc()
                        logger.exception("tool execution failed", extra={"tool": tc.name})
                        result_text = json.dumps({"status": "error", "message": str(exc)})

                if on_tool_result:
                    await on_tool_result(tc, result_text)

                call_id = tc.id or f"call_{iteration}_{idx}"
                messages.append(
                    {
                        "role": "assistant",
                        "content": None,
                        "tool_calls": [
                            {
                                "id": call_id,
                                "function": {"name": tc.name, "arguments": json.dumps(tc.arguments)},
                            }
                        ],
                    }
                )
                messages.append(
                    {
                        "role": "tool",
                        "tool_call_id": call_id,
                        "name": tc.name,
                        "content": result_text,
                    }
                )

        logger.warning(
            "agent loop exhausted without a final answer",
            extra={"provider": provider.name, "iterations": max_iterations, "tools": tools_used},
        )
        return GatewayResponse(
            content=(
                "I could not reach a final answer within the allowed steps. "
                "Please rephrase your request or ask a more specific question."
            ),
            provider=provider.name,
            model=provider.model,
            metadata={
                **request.metadata,
                "fallback_used": provider_name != preferred,
                "tools_used": tools_used,
                "iterations": max_iterations,
                "loop_exhausted": True,
            },
        )
