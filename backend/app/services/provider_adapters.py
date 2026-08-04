import json
import logging
import os
from typing import Any, Dict, List, Optional

import google.generativeai as genai
import httpx
from openai import AsyncOpenAI

from app.services.ai_gateway import AgentTool, AgentTurn, BaseProvider, GatewayRequest, ToolCall

logger = logging.getLogger("resumatch-ai.providers")


DEFAULT_VERTEX_MODEL = os.getenv("VERTEX_GEMINI_MODEL", "gemini-2.5-flash")
DEFAULT_GEMINI_MODEL = os.getenv("GEMINI_MODEL", "gemini-1.5-flash-latest")
DEFAULT_LLAMA_MODEL = os.getenv("NVIDIA_LLM_MODEL", "meta/llama-3.1-70b-instruct")


def _try_json(text: Any) -> Any:
    if not isinstance(text, str):
        return text
    try:
        return json.loads(text)
    except (ValueError, TypeError):
        return text


def _normalize_messages(messages: List[Dict[str, Any]]) -> List[Dict[str, str]]:
    """Text-only transcript used by providers without native tool support."""
    normalized: List[Dict[str, str]] = []
    for message in messages:
        role = message.get("role", "user")
        content = message.get("content")
        if role == "tool":
            continue
        if role == "assistant" and message.get("tool_calls") and not content:
            continue
        if role == "agent":
            role = "assistant"
        normalized.append({"role": role, "content": str(content or "")})
    return normalized


def _render_transcript(messages: List[Dict[str, str]]) -> str:
    lines: List[str] = []
    for message in messages:
        speaker = message["role"].upper()
        lines.append(f"{speaker}: {message['content']}")
    return "\n\n".join(lines)


def _gemini_history(messages: List[Dict[str, str]]) -> List[Dict[str, Any]]:
    history: List[Dict[str, Any]] = []
    for message in messages[:-1]:
        role = "model" if message["role"] == "assistant" else "user"
        history.append({"role": role, "parts": [message["content"]]})
    return history


def _legacy_gemini_history(messages: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    history: List[Dict[str, Any]] = []
    for message in messages:
        role = message.get("role")
        content = message.get("content")
        if role == "user" and content:
            history.append({"role": "user", "parts": [{"text": str(content)}]})
        elif role == "assistant" and content:
            history.append({"role": "model", "parts": [{"text": str(content)}]})
    return history


def _normalize_to_vertex_contents(messages: List[Dict[str, Any]]) -> List[Any]:
    from google.genai import types as genai_types

    contents: List[Any] = []
    for message in messages:
        role = message.get("role")
        if role == "user":
            content = message.get("content")
            if content is None:
                continue
            contents.append(genai_types.Content(role="user", parts=[genai_types.Part(text=str(content))]))
        elif role == "assistant":
            tool_calls = message.get("tool_calls")
            if tool_calls:
                parts = []
                for tc in tool_calls:
                    fn = tc.get("function", {})
                    args = _try_json(fn.get("arguments", {}))
                    parts.append(
                        genai_types.Part(
                            function_call=genai_types.FunctionCall(name=fn.get("name", ""), args=args or {})
                        )
                    )
                contents.append(genai_types.Content(role="model", parts=parts))
            elif message.get("content"):
                contents.append(genai_types.Content(role="model", parts=[genai_types.Part(text=str(message["content"]))]))
        elif role == "tool":
            name = message.get("name") or "unknown_function"
            payload = _try_json(message.get("content") or "")
            response_payload = payload if isinstance(payload, dict) else {"result": str(payload)}
            contents.append(
                genai_types.Content(
                    role="user",
                    parts=[
                        genai_types.Part(
                            function_response=genai_types.FunctionResponse(name=name, response=response_payload)
                        )
                    ],
                )
            )
    return contents


def _openai_tool_schemas(tools: List[AgentTool]) -> Optional[List[Dict[str, Any]]]:
    return [tool.to_openai_tool() for tool in tools] if tools else None


class VertexGeminiProvider(BaseProvider):
    def __init__(self, model: str = DEFAULT_VERTEX_MODEL):
        super().__init__("vertex-gemini", model)
        self.project = os.getenv("GOOGLE_CLOUD_PROJECT") or os.getenv("GCP_PROJECT_ID")
        self.location = os.getenv("GOOGLE_CLOUD_LOCATION") or os.getenv("GCP_LOCATION") or "global"
        self.use_vertex = os.getenv("GOOGLE_GENAI_USE_VERTEXAI", "true").lower() == "true"
        self._available = self._check_available()

    def _check_available(self) -> bool:
        try:
            from google import genai as _  # noqa: F401
            return True
        except ImportError:
            logger.warning("google-genai not installed — VertexGeminiProvider disabled")
            return False

    def _client(self):
        try:
            from google import genai as google_genai
        except ImportError as exc:  # pragma: no cover
            raise RuntimeError("google-genai is required for Vertex Gemini") from exc
        return google_genai.Client(vertexai=True, project=self.project, location=self.location)

    async def complete(self, request: GatewayRequest) -> str:
        if not self._available:
            raise RuntimeError("google-genai is not installed — Vertex Gemini unavailable")
        if not self.project:
            raise RuntimeError("GOOGLE_CLOUD_PROJECT is not configured for Vertex Gemini")
        if not self.use_vertex:
            raise RuntimeError("GOOGLE_GENAI_USE_VERTEXAI must be true for Vertex Gemini")

        from google.genai import types as genai_types

        messages = _normalize_messages(request.messages)
        if not messages:
            raise RuntimeError("No messages were provided")

        client = self._client()
        prompt = _render_transcript(messages)
        config = genai_types.GenerateContentConfig(
            system_instruction=request.system_instruction,
            temperature=request.temperature,
            max_output_tokens=request.max_tokens,
        )
        response = client.models.generate_content(model=self.model, contents=prompt, config=config)
        return response.text or ""

    async def agent_turn(
        self,
        request: GatewayRequest,
        tools: Optional[List[AgentTool]] = None,
        on_tool_call=None,
        on_tool_result=None,
    ) -> AgentTurn:
        if not self._available:
            raise RuntimeError("google-genai is not installed — Vertex Gemini unavailable")
        if not self.project:
            raise RuntimeError("GOOGLE_CLOUD_PROJECT is not configured for Vertex Gemini")
        if not self.use_vertex:
            raise RuntimeError("GOOGLE_GENAI_USE_VERTEXAI must be true for Vertex Gemini")

        from google.genai import types as genai_types

        client = self._client()
        contents = _normalize_to_vertex_contents(request.messages)
        if not contents:
            raise RuntimeError("No messages were provided")

        config = genai_types.GenerateContentConfig(
            system_instruction=request.system_instruction,
            temperature=request.temperature,
            max_output_tokens=request.max_tokens,
        )
        if tools:
            config.tools = [
                genai_types.Tool(function_declarations=[tool.to_gemini_declaration() for tool in tools])
            ]

        response = client.models.generate_content(model=self.model, contents=contents, config=config)

        function_calls = getattr(response, "function_calls", None)
        if function_calls:
            return AgentTurn(
                tool_calls=[
                    ToolCall(
                        id=getattr(fc, "id", None) or f"call_{i}",
                        name=fc.name,
                        arguments=dict(fc.args or {}),
                    )
                    for i, fc in enumerate(function_calls)
                ]
            )
        return AgentTurn(content=response.text or "")


class GeminiProvider(BaseProvider):
    def __init__(self, model: str = DEFAULT_GEMINI_MODEL):
        super().__init__("gemini", model)
        self.api_key = os.getenv("GEMINI_API_KEY") or os.getenv("NEXT_PUBLIC_GEMINI_API_KEY")
        if self.api_key:
            genai.configure(api_key=self.api_key)

    async def complete(self, request: GatewayRequest) -> str:
        if not self.api_key:
            raise RuntimeError("GEMINI_API_KEY is not configured")

        messages = _normalize_messages(request.messages)
        if not messages:
            raise RuntimeError("No messages were provided")

        model = genai.GenerativeModel(self.model, system_instruction=request.system_instruction)
        chat = model.start_chat(history=_gemini_history(messages))
        response = await chat.send_message_async(messages[-1]["content"])
        return response.text or ""

    async def agent_turn(
        self,
        request: GatewayRequest,
        tools: Optional[List[AgentTool]] = None,
        on_tool_call=None,
        on_tool_result=None,
    ) -> AgentTurn:
        if not self.api_key:
            raise RuntimeError("GEMINI_API_KEY is not configured")
        if not tools:
            return AgentTurn(content=await self.complete(request))

        from google.generativeai import protos

        model = genai.GenerativeModel(
            self.model,
            system_instruction=request.system_instruction,
            tools=[{"function_declarations": [tool.to_gemini_declaration() for tool in tools]}],
        )
        chat = model.start_chat(history=_legacy_gemini_history(request.messages[:-1]))

        last = request.messages[-1] if request.messages else {}
        pending: Any = None
        if last.get("role") == "user" and last.get("content"):
            pending = protos.Part(text=str(last["content"]))

        tools_by_name = {tool.name: tool for tool in tools}
        for iteration in range(6):
            response = await chat.send_message_async(pending if pending is not None else "")
            pending = None
            parts = response.candidates[0].content.parts if response.candidates else []
            function_calls = [part.function_call for part in parts if part.function_call is not None]
            if not function_calls:
                text = "".join(part.text for part in parts if part.text is not None)
                return AgentTurn(content=text or "")

            for fc in function_calls:
                tc = ToolCall(
                    id=getattr(fc, "id", None) or f"call_{iteration}",
                    name=fc.name,
                    arguments=dict(fc.args or {}),
                )
                if on_tool_call:
                    await on_tool_call(tc)
                tool = tools_by_name.get(fc.name)
                if tool is None:
                    result_text = json.dumps({"status": "error", "message": f"Unknown tool: {fc.name}"})
                else:
                    try:
                        result_text = await tool.function(**dict(fc.args or {}))
                    except Exception as exc:  # pragma: no cover
                        result_text = json.dumps({"status": "error", "message": str(exc)})
                if on_tool_result:
                    await on_tool_result(tc, result_text)
                pending = protos.Part(
                    function_response=protos.FunctionResponse(name=fc.name, response={"result": result_text})
                )

        return AgentTurn(content="I could not reach a final answer within the allowed steps. Please rephrase your request.")


class OpenAIProvider(BaseProvider):
    def __init__(self, model: str = "gpt-4o-mini"):
        super().__init__("openai", model)
        self.api_key = os.getenv("OPENAI_API_KEY")
        self.client = AsyncOpenAI(api_key=self.api_key) if self.api_key else None

    async def complete(self, request: GatewayRequest) -> str:
        if not self.client:
            raise RuntimeError("OPENAI_API_KEY is not configured")
        response = await self.client.chat.completions.create(
            model=self.model,
            messages=[
                *([{"role": "system", "content": request.system_instruction}] if request.system_instruction else []),
                *_normalize_messages(request.messages),
            ],
            temperature=request.temperature,
            max_tokens=request.max_tokens,
        )
        return response.choices[0].message.content or ""

    async def agent_turn(
        self,
        request: GatewayRequest,
        tools: Optional[List[AgentTool]] = None,
        on_tool_call=None,
        on_tool_result=None,
    ) -> AgentTurn:
        if not self.client:
            raise RuntimeError("OPENAI_API_KEY is not configured")
        tool_schemas = _openai_tool_schemas(tools)
        response = await self.client.chat.completions.create(
            model=self.model,
            messages=[
                *([{"role": "system", "content": request.system_instruction}] if request.system_instruction else []),
                *request.messages,
            ],
            temperature=request.temperature,
            max_tokens=request.max_tokens,
            tools=tool_schemas or None,
        )
        message = response.choices[0].message
        if message.tool_calls:
            return AgentTurn(
                tool_calls=[
                    ToolCall(
                        id=tool_call.id,
                        name=tool_call.function.name,
                        arguments=_try_json(tool_call.function.arguments) or {},
                    )
                    for tool_call in message.tool_calls
                ]
            )
        return AgentTurn(content=message.content or "")


class AnthropicProvider(BaseProvider):
    def __init__(self, model: str = "claude-3-5-haiku-latest"):
        super().__init__("anthropic", model)
        self.api_key = os.getenv("ANTHROPIC_API_KEY")

    async def complete(self, request: GatewayRequest) -> str:
        if not self.api_key:
            raise RuntimeError("ANTHROPIC_API_KEY is not configured")

        payload = {
            "model": self.model,
            "system": request.system_instruction or "",
            "max_tokens": request.max_tokens,
            "messages": _normalize_messages(request.messages),
        }
        headers = {
            "x-api-key": self.api_key,
            "anthropic-version": "2023-06-01",
            "content-type": "application/json",
        }
        async with httpx.AsyncClient(timeout=60.0) as client:
            response = await client.post("https://api.anthropic.com/v1/messages", headers=headers, json=payload)
            response.raise_for_status()
            body = response.json()
        parts = [item.get("text", "") for item in body.get("content", []) if item.get("type") == "text"]
        return "".join(parts)


class NvidiaProvider(BaseProvider):
    def __init__(self, model: str = DEFAULT_LLAMA_MODEL):
        super().__init__("nvidia", model)
        self.api_key = os.getenv("NVIDIA_API_KEY_REASONING") or os.getenv("NVIDIA_API_KEY")
        self.base_url = os.getenv("NVIDIA_API_BASE", "https://integrate.api.nvidia.com/v1")
        self.client = AsyncOpenAI(api_key=self.api_key, base_url=self.base_url) if self.api_key else None

    async def complete(self, request: GatewayRequest) -> str:
        if not self.client:
            raise RuntimeError("NVIDIA_API_KEY_REASONING is not configured")
        response = await self.client.chat.completions.create(
            model=self.model,
            messages=[
                *([{"role": "system", "content": request.system_instruction}] if request.system_instruction else []),
                *_normalize_messages(request.messages),
            ],
            temperature=request.temperature,
            max_tokens=request.max_tokens,
        )
        return response.choices[0].message.content or ""

    async def agent_turn(
        self,
        request: GatewayRequest,
        tools: Optional[List[AgentTool]] = None,
        on_tool_call=None,
        on_tool_result=None,
    ) -> AgentTurn:
        if not self.client:
            raise RuntimeError("NVIDIA_API_KEY_REASONING is not configured")
        tool_schemas = _openai_tool_schemas(tools)
        response = await self.client.chat.completions.create(
            model=self.model,
            messages=[
                *([{"role": "system", "content": request.system_instruction}] if request.system_instruction else []),
                *request.messages,
            ],
            temperature=request.temperature,
            max_tokens=request.max_tokens,
            tools=tool_schemas or None,
        )
        message = response.choices[0].message
        if message.tool_calls:
            return AgentTurn(
                tool_calls=[
                    ToolCall(
                        id=tool_call.id,
                        name=tool_call.function.name,
                        arguments=_try_json(tool_call.function.arguments) or {},
                    )
                    for tool_call in message.tool_calls
                ]
            )
        return AgentTurn(content=message.content or "")


def build_default_provider_router() -> Any:
    providers = []
    if os.getenv("GOOGLE_CLOUD_PROJECT") or os.getenv("GCP_PROJECT_ID"):
        providers.append(VertexGeminiProvider())
    if os.getenv("NVIDIA_API_KEY_REASONING") or os.getenv("NVIDIA_API_KEY"):
        providers.append(NvidiaProvider())
    if os.getenv("GEMINI_API_KEY") or os.getenv("NEXT_PUBLIC_GEMINI_API_KEY"):
        providers.append(GeminiProvider())
    if os.getenv("OPENAI_API_KEY"):
        providers.append(OpenAIProvider())
    if os.getenv("ANTHROPIC_API_KEY"):
        providers.append(AnthropicProvider())

    return providers
