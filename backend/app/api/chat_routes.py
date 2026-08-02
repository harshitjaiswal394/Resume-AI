from fastapi import APIRouter, HTTPException, Depends, Header
from fastapi.responses import StreamingResponse
from typing import Optional, List
import json
import logging
import time
import re
from sqlalchemy import text
from app.db import engine
from app.api.chat_models import ChatMessageRequest, ConversationCreateRequest, ConversationResponse, MessageResponse, ConversationUpdateRequest
from app.services.auth_service import auth_service
from app.api.chat_tools import build_agent_tools
from app.services.nvidia_service import nvidia_service
import google.generativeai as genai
import os
import asyncio

# ── OpenTelemetry ─────────────────────────────────────────────────────────────
try:
    from opentelemetry import trace
    from opentelemetry.trace import Status, StatusCode
    _tracer = trace.get_tracer("resumatch.chat")
    _OTEL_ENABLED = True
except Exception:
    _OTEL_ENABLED = False
    _tracer = None  # type: ignore

def _get_span():
    """Returns the current active span (no-op if OTel not enabled)."""
    if _OTEL_ENABLED:
        return trace.get_current_span()
    return None


def enhance_assistant_response(content: str) -> str:
    if not content:
        return content

    section_icons = {
        "contact details": "📞",
        "executive summary": "✨",
        "summary": "📌",
        "key strengths": "✅",
        "strengths": "✅",
        "areas to improve": "⚠️",
        "weaknesses": "⚠️",
        "gaps": "🧭",
        "ats score": "🏆",
        "ats keywords": "🏷️",
        "keywords": "🔑",
        "missing keywords": "🔍",
        "recommendations": "💡",
        "recommended improvements": "💡",
        "next steps": "➡️",
        "action plan": "📝",
        "career advice": "🎯",
        "learning roadmap": "📚",
        "interview readiness": "🎯",
        "final verdict": "🏁",
        "overall feedback": "📝",
    }

    def _section_icon_for(label: str) -> str:
        normalized = re.sub(r"[:\s]+$", "", label, flags=re.IGNORECASE).lower()
        return section_icons.get(normalized, "")

    def replace_heading(match: re.Match[str]) -> str:
        hashes = match.group(1)
        label = match.group(2).strip()
        icon = _section_icon_for(label)
        if not icon and not re.match(r"^[^\w\s]", label):
            icon = "📌"
        if icon and not re.match(r"^[^\w\s]", label):
            return f"{hashes} {icon} {label}"
        return match.group(0)

    content = re.sub(
        r"^(#{1,3})\s*(.+)$",
        replace_heading,
        content,
        flags=re.MULTILINE
    )

    # Ensure headings are on their own lines when output is squashed together
    content = re.sub(r"([^\n])\s*(#{1,3}\s+)", r"\1\n\n\2", content)
    content = re.sub(r"(#{1,3}\s*[^\n|]+?)\s*(?=\|)", r"\1\n\n", content)
    content = re.sub(r"\|\|\s*", "\n\n", content)
    content = re.sub(r"(\*\*[^\*]+\*\*)\s*(?=\*)", r"\1\n\n", content)
    content = re.sub(r"={3,}\s*", "\n\n", content)
    content = re.sub(r"([^\n])\s*(\|[^\n]*\|[^\n]*\|)", r"\1\n\2", content)

    # Add icons for common bare section labels and headings with colon
    for label, icon in section_icons.items():
        content = re.sub(
            rf"^(?:\*\*|__)?{re.escape(label)}(?:\*\*|__)?\s*[:\-]?\s*$",
            f"## {icon} {label.title()}",
            content,
            flags=re.IGNORECASE | re.MULTILINE
        )
        content = re.sub(
            rf"^(?:\*\*|__)?{re.escape(label)}(?:\*\*|__)?\s*[:\-]?\s*(?=\S)",
            f"## {icon} {label.title()}: ",
            content,
            flags=re.IGNORECASE | re.MULTILINE
        )

    # Iconify plain bullet lists when bullets are present without existing emoji markers
    content = re.sub(
        r"^(\s*)([-*+])\s+(?![✅🔹•🔥💡📌🎯🏆📚🔑🔍➡️])",
        r"\1- ✅ ",
        content,
        flags=re.MULTILINE
    )

    return content


chat_router = APIRouter()
logger = logging.getLogger("resumatch-api.chat")

# Setup Gemini for Orchestrator
genai.configure(api_key=os.getenv("GEMINI_API_KEY") or os.getenv("NEXT_PUBLIC_GEMINI_API_KEY"))


async def get_current_user_id(authorization: Optional[str] = Header(None)) -> str:
    """Extract user_id from Bearer token."""
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Unauthorized")
    token = authorization.replace("Bearer ", "")
    result = await auth_service.get_user(token)
    if not result.get("success"):
        raise HTTPException(status_code=401, detail="Invalid token")
    return result["user"]["id"]

@chat_router.post("/conversations", response_model=ConversationResponse)
async def create_conversation(request: ConversationCreateRequest, user_id: str = Depends(get_current_user_id)):
    """Create a new chat conversation."""
    title = request.title or "New Conversation"
    with engine.begin() as conn:
        result = conn.execute(
            text("""
                INSERT INTO conversations (user_id, title, created_at, updated_at)
                VALUES (:uid, :title, NOW(), NOW())
                RETURNING id, user_id, title, created_at, updated_at
            """),
            {"uid": user_id, "title": title}
        )
        row = result.fetchone()
        return dict(row._mapping)

@chat_router.get("/conversations", response_model=List[ConversationResponse])
async def list_conversations(user_id: str = Depends(get_current_user_id)):
    """List user conversations."""
    with engine.connect() as conn:
        result = conn.execute(
            text("""
                SELECT id, user_id, title, created_at, updated_at 
                FROM conversations 
                WHERE user_id = :uid 
                ORDER BY updated_at DESC
            """),
            {"uid": user_id}
        )
        return [dict(row._mapping) for row in result]

@chat_router.get("/resumes")
async def list_user_resumes(user_id: str = Depends(get_current_user_id)):
    """List user resumes so chat can let the user choose context."""
    with engine.connect() as conn:
        result = conn.execute(
            text("""
                SELECT id, title, status, updated_at, parsed_data IS NOT NULL AS has_parsed_data
                FROM resumes
                WHERE user_id = :uid
                ORDER BY updated_at DESC
            """),
            {"uid": user_id}
        )
        return [dict(row._mapping) for row in result]

@chat_router.get("/conversations/{conversation_id}/messages", response_model=List[MessageResponse])
async def list_messages(conversation_id: str, user_id: str = Depends(get_current_user_id)):
    """List messages for a conversation."""
    with engine.connect() as conn:
        # Verify ownership
        conv = conn.execute(text("SELECT id FROM conversations WHERE id = :cid AND user_id = :uid"), 
                           {"cid": conversation_id, "uid": user_id}).fetchone()
        if not conv:
            raise HTTPException(status_code=404, detail="Conversation not found")
            
        result = conn.execute(
            text("""
                SELECT id, conversation_id, user_id, role, content, metadata, created_at 
                FROM messages 
                WHERE conversation_id = :cid 
                ORDER BY created_at ASC
            """),
            {"cid": conversation_id}
        )
        return [dict(row._mapping) for row in result]

@chat_router.delete("/conversations/{conversation_id}")
async def delete_conversation(conversation_id: str, user_id: str = Depends(get_current_user_id)):
    """Delete a conversation and all its messages."""
    with engine.begin() as conn:
        conv = conn.execute(
            text("SELECT id FROM conversations WHERE id = :cid AND user_id = :uid"),
            {"cid": conversation_id, "uid": user_id}
        ).fetchone()
        if not conv:
            raise HTTPException(status_code=404, detail="Conversation not found")
        
        conn.execute(
            text("DELETE FROM conversations WHERE id = :cid AND user_id = :uid"),
            {"cid": conversation_id, "uid": user_id}
        )
        return {"success": True, "message": "Conversation deleted"}

@chat_router.patch("/conversations/{conversation_id}")
async def update_conversation(conversation_id: str, request: ConversationUpdateRequest, user_id: str = Depends(get_current_user_id)):
    """Update a conversation title."""
    with engine.begin() as conn:
        conv = conn.execute(
            text("SELECT id FROM conversations WHERE id = :cid AND user_id = :uid"),
            {"cid": conversation_id, "uid": user_id}
        ).fetchone()
        if not conv:
            raise HTTPException(status_code=404, detail="Conversation not found")
        
        conn.execute(
            text("UPDATE conversations SET title = :title, updated_at = NOW() WHERE id = :cid"),
            {"cid": conversation_id, "title": request.title}
        )
        return {"success": True, "message": "Conversation title updated"}

async def stream_gemini_response(conversation_id: str, user_id: str, user_message: str, selected_resume_id: str | None = None, client_request_id: str | None = None):
    """
    Generator for SSE token streaming and DB persistence.
    Fully instrumented with OpenTelemetry manual spans and structured logging.
    """
    stream_start = time.monotonic()
    logger.info(
        "CHAT_STREAM_START | conv=%s user=%s msg_len=%d client_request_id=%s",
        conversation_id, user_id, len(user_message), client_request_id or ""
    )

    # ── Root span for entire stream lifecycle ─────────────────────────────────
    ctx = _tracer.start_as_current_span("chat.stream", kind=trace.SpanKind.SERVER) if _OTEL_ENABLED and _tracer else None
    try:
        with (ctx if ctx else _NullContext()):
            span = _get_span()
            if span:
                span.set_attribute("chat.conversation_id", conversation_id)
                span.set_attribute("chat.user_id", user_id)
                span.set_attribute("chat.message_length", len(user_message))
                span.set_attribute("chat.cancelled", False)
                if client_request_id:
                    span.set_attribute("chat.client_request_id", client_request_id)

            # ── Step 1: Persist user message ──────────────────────────────────
            t0 = time.monotonic()
            with engine.begin() as conn:
                conn.execute(
                    text("""
                        INSERT INTO messages (conversation_id, user_id, role, content, metadata, created_at)
                        VALUES (:cid, :uid, 'user', :content, :meta, NOW())
                    """),
                    {"cid": conversation_id, "uid": user_id, "content": user_message, "meta": json.dumps({"client_request_id": client_request_id, "role": "user"})}
                )
            logger.debug("CHAT_MSG_INSERTED | conv=%s latency_ms=%.1f", conversation_id, (time.monotonic()-t0)*1000)

            # ── Step 2: Fetch conversation history ────────────────────────────
            t0 = time.monotonic()
            with engine.connect() as conn:
                history = conn.execute(
                    text("""
                        SELECT role, content FROM messages 
                        WHERE conversation_id = :cid 
                        ORDER BY created_at ASC LIMIT 20
                    """),
                    {"cid": conversation_id}
                ).fetchall()
            logger.debug(
                "CHAT_HISTORY_FETCHED | conv=%s rows=%d latency_ms=%.1f",
                conversation_id, len(history), (time.monotonic()-t0)*1000
            )
            if span:
                span.set_attribute("chat.history_messages", len(history))

            # Build Gemini History Format (exclude the message we just inserted)
            gemini_history = []
            for row in history[:-1]:
                role = "user" if row.role == "user" else "model"
                gemini_history.append({"role": role, "parts": [row.content]})

            # ── Step 3: LLM Inference (Nvidia fallback check) ───────────────────
            system_instruction = (
                "You are ResuMatch AI, an expert AI Resume Coach and Career Advisor. "
                "Write like a premium assistant: calm, precise, helpful, and visually polished. "
                "Return ONLY valid GitHub-flavored markdown. Never output plain text, raw JSON, malformed markdown, or chain-of-thought. "
                "Use generous spacing, horizontal rules, bullets, tables when useful, and concise paragraphs. "
                "Use emoji-enhanced headings and icons where they improve readability. Prefer headings like `## 📌 Summary`, `## ✅ Strengths`, `## ⚠️ Areas to Improve`, `## 🏆 ATS Score`, `## 📝 Recommended Improvements`, `## 🎯 Career Advice`. "
                "Use short emoji prefixes for bullets when they help scanning, such as `- ✅`, `- 🔧`, `- 📌`, `- 💡`, `- 🔥`. Do not overuse emojis. "
                "For resume analysis, prefer this exact structure when relevant: Contact Details, Executive Summary, Key Strengths, Areas to Improve, ATS Score, Missing Keywords, Recommended Improvements, Career Advice, Learning Roadmap, Interview Readiness, Final Verdict. "
                "When a resume is available, explicitly surface contact details, skills, experience, and any resume scores from the saved profile instead of asking the user to paste them again. "
                "Use one clear heading per section. Do not repeat the same heading. Do not create empty numbered items. Do not use question marks as bullets. "
                "Keep bullets concise, concrete, and scannable. Prefer 3 to 5 bullets per section. When bullets are used, use an emoji prefix for each bullet item if it improves readability. "
                "When ranking recommendations, use a numbered list with no skipped numbers. "
                "When a table would improve clarity, use a compact markdown table. "
                "If the user asks about their resume, skills, ATS, experience, or bullet improvements, always use the latest available resume context first. "
                "If the latest resume context is incomplete, say what is available and what is missing instead of asking them to paste everything again. "
                "When the user shares a resume or job description, tailor the answer to that context and call out concrete next steps. "
                "If you cannot access a resume, explicitly say what is missing and what you need next. "
                "Refuse non-career questions politely and briefly, then redirect back to careers or resumes."
            )

            def _get_latest_resume_context(selected_resume_id: str | None = None):
                with engine.connect() as conn:
                    if selected_resume_id:
                        row = conn.execute(
                            text(
                                "SELECT id, title, status, parsed_data, raw_text, updated_at, resume_score, original_score, phone_number FROM resumes "
                                "WHERE user_id = :uid AND id = :rid LIMIT 1"
                            ),
                            {"uid": user_id, "rid": selected_resume_id}
                        ).fetchone()
                    else:
                        row = conn.execute(
                            text(
                                "SELECT id, title, status, parsed_data, raw_text, updated_at, resume_score, original_score, phone_number FROM resumes "
                                "WHERE user_id = :uid ORDER BY updated_at DESC LIMIT 1"
                            ),
                            {"uid": user_id}
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
                m = message.lower()
                return any(keyword in m for keyword in [
                    "my resume", "resume feedback", "analyse my resume", "analyze my resume",
                    "ats keywords", "skills should i learn", "rewrite bullet", "bullet point",
                    "resume analysis", "resume review", "cv feedback", "cover letter"
                ])

            resume_context = _get_latest_resume_context(selected_resume_id) if (_looks_like_resume_request(user_message) or selected_resume_id) else None
            if resume_context:
                summary = resume_context.get("parsed") or {}
                contact = resume_context.get("contact") or {}
                skills = (summary.get("skills", []) if isinstance(summary, dict) else [])[:30]
                experience = (summary.get("experience", []) if isinstance(summary, dict) else [])[:4]
                education = (summary.get("education", []) if isinstance(summary, dict) else [])[:3]
                projects = (summary.get("projects", []) if isinstance(summary, dict) else [])[:3]
                certifications = (summary.get("certifications", []) if isinstance(summary, dict) else [])[:3]
                resume_context_text = json.dumps({
                    "resumeId": resume_context.get("id"),
                    "title": resume_context.get("title"),
                    "status": resume_context.get("status"),
                    "updatedAt": resume_context.get("updatedAt"),
                    "resumeScore": resume_context.get("resumeScore"),
                    "originalScore": resume_context.get("originalScore"),
                    "contact": contact,
                    "summary": summary.get("summary") if isinstance(summary, dict) else None,
                    "skills": skills,
                    "experience": experience,
                    "education": education,
                    "projects": projects,
                    "certifications": certifications,
                    "rawTextPreview": (resume_context.get("rawText") or "")[:4500],
                }, ensure_ascii=False)
            else:
                resume_context_text = None

            if _looks_like_resume_request(user_message) and not resume_context_text:
                yield f"data: {json.dumps({'content': 'I could not find a saved resume for your account yet. Please upload one, or select a resume if you already have multiple saved.'})}\n\n"
                yield f"data: {json.dumps({'done': True})}\n\n"
                return

            gemini_key = os.getenv("GEMINI_API_KEY") or os.getenv("NEXT_PUBLIC_GEMINI_API_KEY")
            tools = build_agent_tools(user_id)
            nvidia_model = os.getenv("NIM_MODEL_CHAT", "meta/llama-3.1-70b-instruct")
            prefer_nvidia = os.getenv("NIM_CHAT_FIRST", "true").lower() != "false"
            models_to_try = []
            if prefer_nvidia:
                models_to_try.append(("nvidia", nvidia_model))
            if gemini_key:
                models_to_try.extend([("gemini", "gemini-1.5-flash-latest"), ("gemini", "gemini-1.5-pro-latest")])
            elif not models_to_try:
                models_to_try.append(("nvidia", nvidia_model))

            if _looks_like_resume_request(user_message) and not resume_context_text:
                yield f"data: {json.dumps({'content': 'I could not find a saved resume for your account yet. Please upload one, or select a resume if you already have multiple saved.'})}\n\n"
                yield f"data: {json.dumps({'done': True})}\n\n"
                return

            if not models_to_try:
                logger.error("CHAT_NO_MODELS_AVAILABLE | conv=%s", conversation_id)
                yield f"data: {json.dumps({'error': 'AI service is currently unavailable.'})}\n\n"
                return

            full_response = ""
            used_model = models_to_try[0][1]
            token_count = 0

            logger.info(
                "CHAT_INFERENCE_START | conv=%s history_len=%d models=%s",
                conversation_id, len(gemini_history), models_to_try
            )

            for provider, model_name in models_to_try:
                infer_start = time.monotonic()
                infer_span_ctx = _tracer.start_as_current_span(f"chat.inference.{provider}.{model_name}") if _OTEL_ENABLED and _tracer else None
                try:
                    with (infer_span_ctx if infer_span_ctx else _NullContext()):
                        infer_span = _get_span()
                        if infer_span:
                            infer_span.set_attribute("llm.model", model_name)
                            infer_span.set_attribute("llm.provider", provider)
                            infer_span.set_attribute("chat.conversation_id", conversation_id)

                        logger.info("CHAT_MODEL_ATTEMPT | provider=%s model=%s conv=%s", provider, model_name, conversation_id)

                        if provider == "nvidia":
                            nvidia_messages = []
                            if system_instruction:
                                nvidia_messages.append({"role": "system", "content": system_instruction})
                            if resume_context_text:
                                nvidia_messages.append({"role": "system", "content": "Latest resume context:\n" + resume_context_text})
                            for row in history[:-1]:
                                role_name = "assistant" if row.role == "agent" else row.role
                                nvidia_messages.append({"role": role_name, "content": row.content})
                            nvidia_messages.append({"role": "user", "content": user_message})

                            def _call_nvidia():
                                return nvidia_service.client.chat.completions.create(
                                    model=model_name,
                                    messages=nvidia_messages,
                                    temperature=0.35,
                                    max_tokens=1600,
                                    stream=True
                                )

                            loop = asyncio.get_event_loop()
                            response_stream = await loop.run_in_executor(None, _call_nvidia)

                            for chunk in response_stream:
                                content = chunk.choices[0].delta.content if chunk.choices and chunk.choices[0].delta else None
                                if content:
                                    import unicodedata
                                    filtered = "".join(
                                        c for c in content
                                        if unicodedata.category(c) not in ('Cc', 'Cf', 'Cs')
                                        and c != '\ufffd'
                                        and ord(c) < 0xFFF0
                                    )
                                    if not filtered or len(filtered.strip()) == 0:
                                        continue
                                    full_response += filtered
                                    token_count += 1
                                    yield f"data: {json.dumps({'content': filtered})}\n\n"
                                    await asyncio.sleep(0.003)
                        else:
                            model_instruction = system_instruction
                            if resume_context_text:
                                model_instruction += "\n\nLatest resume context:\n" + resume_context_text
                            model = genai.GenerativeModel(
                                model_name,
                                system_instruction=model_instruction,
                                tools=tools
                            )
                            chat_session = model.start_chat(
                                history=gemini_history,
                                enable_automatic_function_calling=True
                            )

                            response_stream = await chat_session.send_message_async(user_message, stream=True)

                            async for chunk in response_stream:
                                if chunk.text:
                                    full_response += chunk.text
                                    token_count += 1
                                    yield f"data: {json.dumps({'content': chunk.text})}\n\n"
                                    await asyncio.sleep(0.003)

                        infer_latency = (time.monotonic() - infer_start) * 1000
                        used_model = model_name
                        logger.info(
                            "CHAT_MODEL_SUCCESS | provider=%s model=%s conv=%s tokens=%d resp_chars=%d latency_ms=%.1f",
                            provider, used_model, conversation_id, token_count, len(full_response), infer_latency
                        )
                        if infer_span:
                            infer_span.set_attribute("llm.response_chars", len(full_response))
                            infer_span.set_attribute("llm.stream_chunks", token_count)
                            infer_span.set_attribute("llm.latency_ms", round(infer_latency, 1))
                        break

                except Exception as e:
                    infer_latency = (time.monotonic() - infer_start) * 1000
                    logger.warning(
                        "CHAT_MODEL_FAIL | provider=%s model=%s conv=%s latency_ms=%.1f error=%s",
                        provider, model_name, conversation_id, infer_latency, str(e)
                    )
                    if _OTEL_ENABLED:
                        cur = _get_span()
                        if cur:
                            cur.record_exception(e)
                            cur.set_status(Status(StatusCode.ERROR, str(e)))
                    if full_response:
                        logger.error("CHAT_STREAM_MID_FAIL | conv=%s ? cannot fallback, partial data already sent", conversation_id)
                        yield f"data: {json.dumps({'error': 'Stream interrupted due to a model error.'})}\n\n"
                        return
                    continue
            else:
                logger.error("CHAT_ALL_MODELS_FAILED | conv=%s", conversation_id)
                if span:
                    span.set_status(Status(StatusCode.ERROR, "All LLM models failed"))
                yield f"data: {json.dumps({'error': 'AI service is currently unavailable. Please try again later.'})}\n\n"
                return
            # ── Step 4: Persist agent response ────────────────────────────────
            processed_response = enhance_assistant_response(full_response)
            if processed_response != full_response:
                full_response = processed_response

            t0 = time.monotonic()
            with engine.begin() as conn:
                conn.execute(
                    text("""
                        INSERT INTO messages (conversation_id, user_id, role, content, metadata, created_at)
                        VALUES (:cid, :uid, 'agent', :content, :meta, NOW())
                    """),
                    {
                        "cid": conversation_id,
                        "uid": user_id,
                        "content": full_response,
                        "meta": json.dumps({
                            "model": used_model,
                            "streamed": True,
                            "response_chars": len(full_response),
                            "stream_chunks": token_count,
                            "client_request_id": client_request_id,
                        })
                    }
                )
                conn.execute(
                    text("UPDATE conversations SET updated_at = NOW() WHERE id = :cid"),
                    {"cid": conversation_id}
                )
            logger.debug("CHAT_AGENT_PERSISTED | conv=%s latency_ms=%.1f", conversation_id, (time.monotonic()-t0)*1000)

            total_latency = (time.monotonic() - stream_start) * 1000
            logger.info(
                "CHAT_STREAM_DONE | conv=%s model=%s total_latency_ms=%.1f resp_chars=%d",
                conversation_id, used_model, total_latency, len(full_response)
            )
            if span:
                span.set_attribute("chat.used_model", used_model)
                span.set_attribute("chat.total_latency_ms", round(total_latency, 1))
                span.set_attribute("chat.response_chars", len(full_response))
                span.set_attribute("chat.cancelled", False)
                if client_request_id:
                    span.set_attribute("chat.client_request_id", client_request_id)
                span.set_status(Status(StatusCode.OK))

            yield f"data: {json.dumps({'processed_content': full_response})}\n\n"
            yield f"data: {json.dumps({'done': True})}\n\n"

    except Exception as e:
        total_latency = (time.monotonic() - stream_start) * 1000
        logger.error(
            "CHAT_STREAM_UNHANDLED_ERROR | conv=%s latency_ms=%.1f error=%s",
            conversation_id, total_latency, str(e), exc_info=True
        )
        if _OTEL_ENABLED:
            cur = _get_span()
            if cur:
                cur.record_exception(e)
                cur.set_status(Status(StatusCode.ERROR, str(e)))
        yield f"data: {json.dumps({'error': str(e)})}\n\n"


class _NullContext:
    """No-op context manager when OTel is not available."""
    def __enter__(self): return self
    def __exit__(self, *_): pass



@chat_router.post("/stream")
async def chat_stream(request: ChatMessageRequest, user_id: str = Depends(get_current_user_id)):
    """Streaming chat endpoint via SSE."""
    # Verify conversation ownership
    with engine.connect() as conn:
        conv = conn.execute(text("SELECT id FROM conversations WHERE id = :cid AND user_id = :uid"), 
                           {"cid": request.conversation_id, "uid": user_id}).fetchone()
        if not conv:
            raise HTTPException(status_code=404, detail="Conversation not found")

    return StreamingResponse(
        stream_gemini_response(request.conversation_id, user_id, request.message, request.selected_resume_id, request.client_request_id),
        media_type="text/event-stream"
    )
