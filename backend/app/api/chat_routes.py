from fastapi import APIRouter, HTTPException, Depends, Header
from fastapi.responses import StreamingResponse
from typing import Optional, List
import asyncio
import json
import logging
import os
import re
import time
from uuid import uuid4

from sqlalchemy import text

from app.api.chat_models import (
    ChatMessageRequest,
    ConversationCreateRequest,
    ConversationResponse,
    MessageResponse,
    ConversationUpdateRequest,
)
from app.db import engine
from app.services.agent_registry import agent_registry
from app.services.ai_gateway import GatewayRequest, GatewayRouter, ToolCall, AgentTool
from app.api.chat_tools import build_agent_tools
from app.services.auth_service import auth_service
from app.services.provider_adapters import build_default_provider_router

from app.security import (
    EventType,
    Subject,
    analyze_prompt,
    audit_logger,
    mask_pii,
    output_validator,
    permission_engine,
    rate_limiter,
    sanitize_prompt,
)
from app.security.metrics import LATENCY

try:
    from opentelemetry import trace
    from opentelemetry.trace import Status, StatusCode

    _tracer = trace.get_tracer("resumatch.chat")
    _OTEL_ENABLED = True
except Exception:
    _OTEL_ENABLED = False
    _tracer = None  # type: ignore


chat_router = APIRouter()
logger = logging.getLogger("resumatch-api.chat")


class _NullContext:
    def __enter__(self):
        return self

    def __exit__(self, *_):
        return False


def _get_span():
    if _OTEL_ENABLED:
        return trace.get_current_span()
    return None


def enhance_assistant_response(content: str) -> str:
    if not content:
        return content

    section_prefixes = {
        "contact details": "[Contact]",
        "executive summary": "[Summary]",
        "summary": "[Summary]",
        "key strengths": "[Strengths]",
        "strengths": "[Strengths]",
        "areas to improve": "[Improve]",
        "weaknesses": "[Improve]",
        "gaps": "[Gaps]",
        "ats score": "[ATS]",
        "ats keywords": "[Keywords]",
        "keywords": "[Keywords]",
        "missing keywords": "[Missing]",
        "recommendations": "[Ideas]",
        "recommended improvements": "[Ideas]",
        "next steps": "[Next]",
        "action plan": "[Plan]",
        "career advice": "[Career]",
        "learning roadmap": "[Roadmap]",
        "interview readiness": "[Interview]",
        "final verdict": "[Verdict]",
        "overall feedback": "[Feedback]",
    }

    def replace_heading(match: re.Match[str]) -> str:
        hashes = match.group(1)
        label = match.group(2).strip()
        normalized = re.sub(r"[:\s]+$", "", label, flags=re.IGNORECASE).lower()
        prefix = section_prefixes.get(normalized)
        if prefix and not label.startswith("["):
            return f"{hashes} {prefix} {label}"
        return match.group(0)

    content = re.sub(r"^(#{1,3})\s*(.+)$", replace_heading, content, flags=re.MULTILINE)
    content = re.sub(r"([^\n])\s*(#{1,3}\s+)", r"\1\n\n\2", content)
    content = re.sub(r"(#{1,3}\s*[^\n|]+?)\s*(?=\|)", r"\1\n\n", content)
    content = re.sub(r"\|\|\s*", "\n\n", content)
    content = re.sub(r"(\*\*[^\*]+\*\*)\s*(?=\*)", r"\1\n\n", content)
    content = re.sub(r"={3,}\s*", "\n\n", content)
    content = re.sub(r"([^\n])\s*(\|[^\n]*\|[^\n]*\|)", r"\1\n\2", content)
    return content


async def get_current_user_id(authorization: Optional[str] = Header(None)) -> str:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Unauthorized")
    token = authorization.replace("Bearer ", "")
    result = await auth_service.get_user(token)
    if not result.get("success"):
        raise HTTPException(status_code=401, detail="Invalid token")
    return result["user"]["id"]


def _resolve_role(user_id: str) -> str:
    """Map the user's stored plan to a security role. Defaults to 'user'."""
    try:
        with engine.connect() as conn:
            row = conn.execute(
                text("SELECT plan FROM users WHERE id = :uid LIMIT 1"),
                {"uid": user_id},
            ).fetchone()
        if row and row.plan:
            return {"pro": "pro", "enterprise": "admin"}.get(row.plan, "user")
    except Exception:
        pass
    return "user"


def _enforce_tool_policy(user_id: str, tools: List[AgentTool]) -> List[AgentTool]:
    """Wrap each agent tool with permission + tool-call rate-limit enforcement.

    A denied tool returns a structured 'denied' result to the model instead of
    executing, so the loop can recover gracefully without leaking tool output.
    """
    from dataclasses import replace

    role = _resolve_role(user_id)
    subject = Subject(user_id=user_id, role=role)

    def _wrap(tool: AgentTool) -> AgentTool:
        async def guarded(**kwargs) -> str:
            decision = permission_engine.check(tool.name, subject, payload=kwargs)
            audit_logger.log(
                EventType.TOOL_DENIED if not decision.allowed else EventType.TOOL_CALL,
                user_id=user_id,
                tool=tool.name,
                verdict={"allowed": decision.allowed, "reason": decision.reason},
            )
            if not decision.allowed:
                return json.dumps({
                    "status": "denied",
                    "reason": decision.reason,
                    "message": f"Tool '{tool.name}' is not permitted for your account.",
                })

            rl = rate_limiter.check("tool_call", user_id=user_id, count=1)
            if not rl.allowed:
                audit_logger.log(
                    EventType.RATE_LIMITED,
                    user_id=user_id,
                    tool=tool.name,
                    extra={"resource": "tool_call", "retry_after_seconds": rl.retry_after_seconds},
                )
                return json.dumps({
                    "status": "denied",
                    "reason": "rate_limited",
                    "message": "You've reached the tool-call limit. Please wait a moment and try again.",
                })

            return await tool.function(**kwargs)

        return replace(tool, function=guarded)

    return [_wrap(tool) for tool in tools]


@chat_router.post("/conversations", response_model=ConversationResponse)
async def create_conversation(request: ConversationCreateRequest, user_id: str = Depends(get_current_user_id)):
    title = request.title or "New Conversation"
    with engine.begin() as conn:
        result = conn.execute(
            text(
                """
                INSERT INTO conversations (user_id, title, created_at, updated_at)
                VALUES (:uid, :title, NOW(), NOW())
                RETURNING id, user_id, title, created_at, updated_at
                """
            ),
            {"uid": user_id, "title": title},
        )
        row = result.fetchone()
        return dict(row._mapping)


@chat_router.get("/conversations", response_model=List[ConversationResponse])
async def list_conversations(user_id: str = Depends(get_current_user_id)):
    with engine.connect() as conn:
        result = conn.execute(
            text(
                """
                SELECT id, user_id, title, created_at, updated_at
                FROM conversations
                WHERE user_id = :uid
                ORDER BY updated_at DESC
                """
            ),
            {"uid": user_id},
        )
        return [dict(row._mapping) for row in result]


@chat_router.get("/resumes")
async def list_user_resumes(user_id: str = Depends(get_current_user_id)):
    with engine.connect() as conn:
        result = conn.execute(
            text(
                """
                SELECT id, title, status, updated_at, parsed_data IS NOT NULL AS has_parsed_data
                FROM resumes
                WHERE user_id = :uid
                ORDER BY updated_at DESC
                """
            ),
            {"uid": user_id},
        )
        return [dict(row._mapping) for row in result]


@chat_router.get("/conversations/{conversation_id}/messages", response_model=List[MessageResponse])
async def list_messages(conversation_id: str, user_id: str = Depends(get_current_user_id)):
    with engine.connect() as conn:
        conv = conn.execute(
            text("SELECT id FROM conversations WHERE id = :cid AND user_id = :uid"),
            {"cid": conversation_id, "uid": user_id},
        ).fetchone()
        if not conv:
            raise HTTPException(status_code=404, detail="Conversation not found")

        result = conn.execute(
            text(
                """
                SELECT id, conversation_id, user_id, role, content, metadata, created_at
                FROM messages
                WHERE conversation_id = :cid
                ORDER BY created_at ASC
                """
            ),
            {"cid": conversation_id},
        )
        return [dict(row._mapping) for row in result]


@chat_router.delete("/conversations/{conversation_id}")
async def delete_conversation(conversation_id: str, user_id: str = Depends(get_current_user_id)):
    with engine.begin() as conn:
        conv = conn.execute(
            text("SELECT id FROM conversations WHERE id = :cid AND user_id = :uid"),
            {"cid": conversation_id, "uid": user_id},
        ).fetchone()
        if not conv:
            raise HTTPException(status_code=404, detail="Conversation not found")

        conn.execute(
            text("DELETE FROM conversations WHERE id = :cid AND user_id = :uid"),
            {"cid": conversation_id, "uid": user_id},
        )
        return {"success": True, "message": "Conversation deleted"}


@chat_router.patch("/conversations/{conversation_id}")
async def update_conversation(conversation_id: str, request: ConversationUpdateRequest, user_id: str = Depends(get_current_user_id)):
    with engine.begin() as conn:
        conv = conn.execute(
            text("SELECT id FROM conversations WHERE id = :cid AND user_id = :uid"),
            {"cid": conversation_id, "uid": user_id},
        ).fetchone()
        if not conv:
            raise HTTPException(status_code=404, detail="Conversation not found")

        conn.execute(
            text("UPDATE conversations SET title = :title, updated_at = NOW() WHERE id = :cid"),
            {"cid": conversation_id, "title": request.title},
        )
        return {"success": True, "message": "Conversation title updated"}


def _build_gateway_router() -> GatewayRouter:
    providers = build_default_provider_router()
    if not providers:
        raise RuntimeError(
            "No AI providers are configured. Set GOOGLE_CLOUD_PROJECT for Vertex AI and/or configure NVIDIA_API_KEY_REASONING for Llama fallback."
        )
    return GatewayRouter(providers=providers)


def _friendly_stream_error(exc: Exception) -> str:
    """Map known provider failures to a clear, actionable user message."""
    text = str(exc)
    lowered = text.lower()
    if "default credentials" in lowered or "application default credentials" in lowered or "could not automatically determine credentials" in lowered:
        return (
            "GCP Vertex AI is not authenticated on this server. "
            "Run `gcloud auth application-default login` (or set GOOGLE_APPLICATION_CREDENTIALS) and restart the backend, "
            "or configure a fallback provider such as NVIDIA_API_KEY_REASONING."
        )
    if "vertex" in lowered and ("permission" in lowered or "403" in text or "forbidden" in lowered):
        return (
            "GCP Vertex AI rejected the request with a permissions error. "
            "Verify the service account has roles/aiplatform.user and that the Vertex AI API is enabled."
        )
    if "429" in text or "quota" in lowered or "rate limit" in lowered:
        return "The AI provider returned a rate-limit/quota error. Please wait a moment and try again."
    if "all providers failed" in lowered:
        return "All AI providers are currently unavailable. Please try again later."
    if not text:
        return "AI service is currently unavailable. Please try again later."
    return f"AI service error: {text[:300]}"


def _get_latest_resume_context(user_id: str, selected_resume_id: Optional[str] = None):
    with engine.connect() as conn:
        if selected_resume_id:
            row = conn.execute(
                text(
                    "SELECT id, title, status, parsed_data, raw_text, updated_at, resume_score, original_score, phone_number "
                    "FROM resumes WHERE user_id = :uid AND id = :rid LIMIT 1"
                ),
                {"uid": user_id, "rid": selected_resume_id},
            ).fetchone()
        else:
            row = conn.execute(
                text(
                    "SELECT id, title, status, parsed_data, raw_text, updated_at, resume_score, original_score, phone_number "
                    "FROM resumes WHERE user_id = :uid ORDER BY updated_at DESC LIMIT 1"
                ),
                {"uid": user_id},
            ).fetchone()
    if not row:
        return None

    parsed = None
    if row.parsed_data:
        parsed = row.parsed_data if isinstance(row.parsed_data, dict) else json.loads(row.parsed_data)

    def _normalize_contact(parsed_data):
        if not isinstance(parsed_data, dict):
            return {}
        links = parsed_data.get("links") if isinstance(parsed_data.get("links"), dict) else {}
        contact = parsed_data.get("contact") if isinstance(parsed_data.get("contact"), dict) else {}
        return {
            "fullName": parsed_data.get("fullName") or parsed_data.get("full_name") or contact.get("fullName") or contact.get("name"),
            "email": parsed_data.get("email") or contact.get("email"),
            "phone": parsed_data.get("phone") or parsed_data.get("phone_number") or contact.get("phone"),
            "linkedin": links.get("linkedin") or parsed_data.get("linkedin") or contact.get("linkedin"),
            "github": links.get("github") or parsed_data.get("github") or contact.get("github"),
            "portfolio": links.get("portfolio") or parsed_data.get("portfolio") or contact.get("portfolio"),
        }

    return {
        "id": str(row.id),
        "title": row.title,
        "status": row.status,
        "updatedAt": row.updated_at.isoformat() if row.updated_at else None,
        "resumeScore": row.resume_score,
        "originalScore": row.original_score,
        "phoneNumber": row.phone_number,
        "parsed": parsed,
        "contact": _normalize_contact(parsed),
        "rawText": row.raw_text,
    }


def _looks_like_resume_request(message: str) -> bool:
    message = message.lower()
    return any(
        keyword in message
        for keyword in [
            "resume",
            "cv",
            "cover letter",
            "ats",
            "bullet point",
            "interview",
            "skills should i learn",
        ]
    )


def _build_resume_context_text(resume_context: Optional[dict]) -> Optional[str]:
    if not resume_context:
        return None

    summary = resume_context.get("parsed") or {}
    if not isinstance(summary, dict):
        summary = {}

    return json.dumps(
        {
            "resumeId": resume_context.get("id"),
            "title": resume_context.get("title"),
            "status": resume_context.get("status"),
            "updatedAt": resume_context.get("updatedAt"),
            "resumeScore": resume_context.get("resumeScore"),
            "originalScore": resume_context.get("originalScore"),
            "contact": resume_context.get("contact") or {},
            "summary": summary.get("summary"),
            "skills": summary.get("skills", [])[:30],
            "experience": summary.get("experience", [])[:4],
            "education": summary.get("education", [])[:3],
            "projects": summary.get("projects", [])[:3],
            "certifications": summary.get("certifications", [])[:3],
            "rawTextPreview": (resume_context.get("rawText") or "")[:4500],
        },
        ensure_ascii=False,
    )


def _build_gateway_messages(history, user_message: str) -> List[dict]:
    messages: List[dict] = []
    for row in history[:-1]:
        role = "assistant" if row.role == "agent" else row.role
        messages.append({"role": role, "content": row.content})
    messages.append({"role": "user", "content": user_message})
    return messages


def _chunk_text(text: str, size: int = 180):
    for i in range(0, len(text), size):
        yield text[i:i + size]


async def stream_gemini_response(
    conversation_id: str,
    user_id: str,
    user_message: str,
    selected_resume_id: Optional[str] = None,
    client_request_id: Optional[str] = None,
    agent: Optional[str] = None,
):
    stream_start = time.monotonic()
    ctx = _tracer.start_as_current_span("chat.stream", kind=trace.SpanKind.SERVER) if _OTEL_ENABLED and _tracer else None

    try:
        with (ctx if ctx else _NullContext()):
            agent_def = agent_registry.get_or_default(agent)

            # ── Security gate 1: prompt injection / jailbreak detection ──────
            sanitized_message = sanitize_prompt(user_message)
            verdict = analyze_prompt(sanitized_message)
            request_id = client_request_id or f"chat-{uuid4()}"
            audit_logger.log(
                EventType.CHAT_REQUEST,
                user_id=user_id,
                agent=agent_def.name,
                request_id=request_id,
                prompt=sanitized_message,
                verdict={
                    "decision": verdict.decision.value,
                    "risk_level": verdict.risk_level.value,
                    "score": verdict.score,
                    "rules": [f.rule_id for f in verdict.findings],
                },
            )
            if verdict.is_blocked:
                logger.warning(
                    "PROMPT_BLOCKED | user=%s agent=%s score=%.2f rules=%s",
                    user_id, agent_def.name, verdict.score, [f.rule_id for f in verdict.findings],
                )
                yield f"data: {json.dumps({'error': verdict.blocked_reason or 'Your request was blocked by our safety filters.'})}\n\n"
                return

            # ── Security gate 2: PII masking before the provider sees it ────
            masked_message, pii_findings = mask_pii(sanitized_message)
            if pii_findings:
                audit_logger.log(
                    EventType.PII_MASKED,
                    user_id=user_id,
                    agent=agent_def.name,
                    request_id=request_id,
                    extra={"kinds": [f.kind.value for f in pii_findings]},
                )
                logger.info("PII_MASKED | user=%s kinds=%s", user_id, [f.kind.value for f in pii_findings])

            with engine.begin() as conn:
                conn.execute(
                    text(
                        """
                        INSERT INTO messages (conversation_id, user_id, role, content, metadata, created_at)
                        VALUES (:cid, :uid, 'user', :content, :meta, NOW())
                        """
                    ),
                    {
                        "cid": conversation_id,
                        "uid": user_id,
                        "content": user_message,
                        "meta": json.dumps(
                            {
                                "client_request_id": client_request_id,
                                "role": "user",
                                "selected_agent": agent_def.name,
                                "security": {
                                    "score": verdict.score,
                                    "decision": verdict.decision.value,
                                    "pii_masked": [f.kind.value for f in pii_findings],
                                },
                            }
                        ),
                    },
                )

            with engine.connect() as conn:
                history = conn.execute(
                    text(
                        """
                        SELECT role, content FROM messages
                        WHERE conversation_id = :cid
                        ORDER BY created_at ASC LIMIT 20
                        """
                    ),
                    {"cid": conversation_id},
                ).fetchall()

            needs_resume = (
                _looks_like_resume_request(user_message)
                or bool(selected_resume_id)
                or agent_def.name in {"resume", "ats", "career", "interview"}
            )
            resume_context = _get_latest_resume_context(user_id, selected_resume_id) if needs_resume else None
            resume_context_text = _build_resume_context_text(resume_context)

            if needs_resume and agent_def.name in {"resume", "ats", "interview"} and not resume_context_text:
                yield f"data: {json.dumps({'error': 'I could not find a saved resume for this account yet. Upload one first or select an existing resume.'})}\n\n"
                return

            provider_router = _build_gateway_router()
            preferred_provider = agent_def.preferred_provider or os.getenv("DEFAULT_PROVIDER")
            system_instruction = agent_def.system_prompt
            if resume_context_text:
                system_instruction += "\n\nLatest resume context:\n" + resume_context_text

            messages = _build_gateway_messages(history, masked_message)
            agent_tools = _enforce_tool_policy(
                user_id, build_agent_tools(user_id, allowed_tool_names=agent_def.tool_names)
            )
            span = _get_span()
            if span:
                span.set_attribute("chat.conversation_id", conversation_id)
                span.set_attribute("chat.user_id", user_id)
                span.set_attribute("chat.agent", agent_def.name)
                span.set_attribute("chat.message_length", len(masked_message))
                span.set_attribute("chat.tools", json.dumps([tool.name for tool in agent_tools]))

            if resume_context_text:
                yield f"data: {json.dumps({'tool_call': 'fetch_user_resume', 'agent': agent_def.name})}\n\n"

            event_queue: "asyncio.Queue" = asyncio.Queue()

            async def emit_tool_call(tc: ToolCall) -> None:
                logger.info("AGENT_TOOL_START | tool=%s agent=%s", tc.name, agent_def.name)
                await event_queue.put({"tool_call": tc.name, "agent": agent_def.name})

            async def emit_tool_result(tc: ToolCall, result: str) -> None:
                logger.info("AGENT_TOOL_DONE | tool=%s agent=%s", tc.name, agent_def.name)
                await event_queue.put({"tool_result": tc.name, "agent": agent_def.name})

            gateway_task = asyncio.ensure_future(
                provider_router.execute_agent(
                    GatewayRequest(
                        messages=messages,
                        preferred_provider=preferred_provider,
                        metadata={
                            "conversation_id": conversation_id,
                            "user_id": user_id,
                            "agent": agent_def.name,
                        },
                        system_instruction=system_instruction,
                        agent_tools=agent_tools,
                    ),
                    tools=agent_tools,
                    on_tool_call=emit_tool_call,
                    on_tool_result=emit_tool_result,
                    max_iterations=int(os.getenv("CHAT_AGENT_MAX_ITERATIONS", "6")),
                )
            )

            pending_get: Optional["asyncio.Future"] = None
            try:
                while True:
                    pending_get = asyncio.ensure_future(event_queue.get())
                    done, _ = await asyncio.wait(
                        {gateway_task, pending_get}, return_when=asyncio.FIRST_COMPLETED
                    )
                    if pending_get in done and not pending_get.cancelled():
                        event = pending_get.result()
                        yield f"data: {json.dumps(event)}\n\n"
                        pending_get = None
                    if gateway_task.done():
                        break
                while not event_queue.empty():
                    event = event_queue.get_nowait()
                    yield f"data: {json.dumps(event)}\n\n"
            finally:
                if pending_get is not None and not pending_get.done():
                    pending_get.cancel()

            gateway_response = await gateway_task

            full_response = enhance_assistant_response(gateway_response.content)

            # ── Security gate 3: output validation ───────────────────────────
            validation = output_validator.validate(full_response)
            if not validation.valid:
                audit_logger.log(
                    EventType.OUTPUT_REJECTED,
                    user_id=user_id,
                    agent=agent_def.name,
                    provider=gateway_response.provider,
                    request_id=request_id,
                    extra={"reason": validation.reason, "rules": [f.rule_id for f in validation.findings]},
                )
                logger.warning(
                    "OUTPUT_REJECTED | user=%s reason=%s rules=%s",
                    user_id, validation.reason, [f.rule_id for f in validation.findings],
                )
                if validation.truncated:
                    full_response = validation.truncated

            yield f"data: {json.dumps({'content': full_response, 'agent': agent_def.name, 'provider': gateway_response.provider})}\n\n"

            with engine.begin() as conn:
                conn.execute(
                    text(
                        """
                        INSERT INTO messages (conversation_id, user_id, role, content, metadata, created_at)
                        VALUES (:cid, :uid, 'agent', :content, :meta, NOW())
                        """
                    ),
                    {
                        "cid": conversation_id,
                        "uid": user_id,
                        "content": full_response,
                        "meta": json.dumps(
                            {
                                "provider": gateway_response.provider,
                                "model": gateway_response.model,
                                "client_request_id": client_request_id,
                                "selected_agent": agent_def.name,
                                "fallback_used": gateway_response.metadata.get("fallback_used", False),
                                "tools_used": gateway_response.metadata.get("tools_used", []),
                                "iterations": gateway_response.metadata.get("iterations", 1),
                                "security": {
                                    "output_valid": validation.valid,
                                    "output_rules": [f.rule_id for f in validation.findings],
                                },
                            }
                        ),
                    },
                )
                conn.execute(
                    text("UPDATE conversations SET updated_at = NOW() WHERE id = :cid"),
                    {"cid": conversation_id},
                )

            total_latency = (time.monotonic() - stream_start) * 1000
            LATENCY.observe(total_latency / 1000.0)
            audit_logger.log(
                EventType.CHAT_RESPONSE,
                user_id=user_id,
                agent=agent_def.name,
                provider=gateway_response.provider,
                model=gateway_response.model,
                request_id=request_id,
                latency_ms=round(total_latency, 1),
                extra={
                    "tools_used": gateway_response.metadata.get("tools_used", []),
                    "iterations": gateway_response.metadata.get("iterations", 1),
                    "fallback_used": gateway_response.metadata.get("fallback_used", False),
                },
            )
            logger.info(
                "CHAT_STREAM_DONE | conv=%s agent=%s provider=%s model=%s latency_ms=%.1f",
                conversation_id,
                agent_def.name,
                gateway_response.provider,
                gateway_response.model,
                total_latency,
            )
            if span:
                span.set_attribute("chat.used_provider", gateway_response.provider)
                span.set_attribute("chat.used_model", gateway_response.model)
                span.set_attribute("chat.total_latency_ms", round(total_latency, 1))
                span.set_status(Status(StatusCode.OK))

            yield f"data: {json.dumps({'processed_content': full_response, 'agent': agent_def.name, 'provider': gateway_response.provider})}\n\n"
            yield f"data: {json.dumps({'done': True, 'agent': agent_def.name, 'provider': gateway_response.provider})}\n\n"
    except Exception as exc:
        logger.error("CHAT_STREAM_UNHANDLED_ERROR | conv=%s error=%s", conversation_id, str(exc), exc_info=True)
        span = _get_span()
        if span:
            span.record_exception(exc)
            span.set_status(Status(StatusCode.ERROR, str(exc)))
        user_error = _friendly_stream_error(exc)
        yield f"data: {json.dumps({'error': user_error})}\n\n"


@chat_router.post("/stream")
async def chat_stream(request: ChatMessageRequest, user_id: str = Depends(get_current_user_id)):
    # ── Security gate 0: chat rate limit (per user) ───────────────────────
    rl = rate_limiter.check("chat", user_id=user_id, count=1)
    if not rl.allowed:
        audit_logger.log(
            EventType.RATE_LIMITED,
            user_id=user_id,
            extra={"resource": "chat", "retry_after_seconds": rl.retry_after_seconds},
        )
        raise HTTPException(
            status_code=429,
            detail=f"Rate limit exceeded. Try again in {rl.retry_after_seconds}s.",
        )

    with engine.connect() as conn:
        conv = conn.execute(
            text("SELECT id FROM conversations WHERE id = :cid AND user_id = :uid"),
            {"cid": request.conversation_id, "uid": user_id},
        ).fetchone()
        if not conv:
            raise HTTPException(status_code=404, detail="Conversation not found")

    return StreamingResponse(
        stream_gemini_response(
            request.conversation_id,
            user_id,
            request.message,
            request.selected_resume_id,
            request.client_request_id,
            request.agent,
        ),
        media_type="text/event-stream",
    )

