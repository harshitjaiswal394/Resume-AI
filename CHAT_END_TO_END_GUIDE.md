# ResuMatch /chat End-to-End Guide

This document describes the complete `/chat` feature flow in ResuMatch: from the frontend chat UI, through the backend streaming API, to database persistence and trace propagation.

## 1. Overview

The `/chat` feature is built in three primary layers:

- Frontend: `frontend/app/chat/page.tsx`
- Backend: `backend/app/api/chat_routes.py`
- Database instrumentation: `backend/app/db.py`

The feature uses SSE for streaming assistant responses in real time while persisting both user messages and assistant replies into the database.

## 2. Frontend request flow

### 2.1 Entry point

The chat page implementation is at `frontend/app/chat/page.tsx`.

Key responsibilities include:

- authenticating the user with Supabase
- loading conversation metadata
- loading saved resumes
- loading message history
- sending chat messages to the backend
- rendering markdown content from the assistant

### 2.2 Backend base URL

The frontend resolves the backend API URL from:

- `process.env.NEXT_PUBLIC_BACKEND_API_URL`

When not configured, it defaults to `http://localhost:8000`.

### 2.3 Sending the SSE chat request

When the user sends a message, the frontend:

1. ensures a conversation exists
2. appends an optimistic user message locally
3. appends a temporary streaming assistant message locally
4. opens a `fetch` request to `${backendUrl}/api/chat/stream`
5. sends JSON payload with:
   - `conversation_id`
   - `message`
   - `selected_resume_id`
   - `client_request_id`

The request includes the authenticated bearer token.

### 2.4 Reading SSE chunks

The backend responds as `text/event-stream`.

The frontend uses `res.body.getReader()` and a `TextDecoder` to read streaming chunks.

It parses each SSE line that begins with `data: ` and processes:

- `parsed.content`: partial assistant text
- `parsed.processed_content`: final normalized assistant output
- `parsed.done`: stream completion signal
- `parsed.error`: error message
- `parsed.tool_call`: optional tool metadata

Partial chunks are appended to the temporary assistant message. When the final `processed_content` event arrives, the frontend replaces the temporary content with the normalized final output.

### 2.5 Markdown normalization and render

The frontend normalizes assistant text using `normalizeAssistantText()` in `frontend/app/chat/page.tsx`.

Normalization includes:

- replacing squashed headings with proper newlines
- ensuring tables and markdown sections render cleanly
- injecting emoji icons into headings

The rendered assistant content uses `ReactMarkdown` with:

- `remark-gfm`
- `remark-breaks`
- `rehype-highlight`
- `rehype-sanitize`

Custom heading components render rich cards and badge styling for assistant structure.

## 3. Backend chat flow

### 3.1 Route wiring

The backend route is defined in `backend/app/api/chat_routes.py`:

- `@chat_router.post("/stream")`
- `chat_stream()` validates conversation ownership
- returns `StreamingResponse(stream_gemini_response(...), media_type="text/event-stream")`

### 3.2 Authentication

`get_current_user_id()` extracts the bearer token from the `Authorization` header and resolves the user via `auth_service.get_user(token)`.

If the token is missing or invalid, the request returns `401 Unauthorized`.

### 3.3 Conversation ownership guard

`chat_stream()` queries the `conversations` table to ensure the current user owns the requested conversation ID.

If ownership is missing, it returns `404 Conversation not found`.

### 3.4 Chat stream lifecycle

`stream_gemini_response()` drives the entire streaming workflow:

1. start a root OpenTelemetry span `chat.stream`
2. persist the user message to `messages`
3. query recent conversation history
4. build the model history payload
5. optionally attach resume context
6. select models and call the LLM provider
7. stream partial model text to the client
8. normalize final assistant text
9. persist the assistant response to `messages`
10. update `conversations.updated_at`
11. emit `done` event

### 3.5 Persisting user message

The backend immediately inserts the user message into the `messages` table with:

- `conversation_id`
- `user_id`
- `role = 'user'`
- `content = user_message`
- `metadata` including `client_request_id`

This preserves chat history before inference begins.

### 3.6 Fetching conversation history

The backend loads up to 20 most recent messages for the conversation.

For Gemini model history conversion, it maps:

- `user` → `user`
- assistant/agent roles → `model`

This history is used to create the prior conversation context for the LLM.

### 3.7 Resume context injection

If the user asks about a resume or passes `selected_resume_id`, the backend tries to attach resume context.

It loads a resume row from `resumes` and normalizes:

- contact fields
- resume summary
- skills
- experience
- education
- projects
- certifications
- raw text preview

If the request clearly targets resume analysis and no resume exists, the backend terminates early with a user-facing prompt asking the user to upload or select a resume.

### 3.8 Model selection and fallback

Model selection logic in `backend/app/api/chat_routes.py`:

- `NIM_MODEL_CHAT` configures the NVIDIA model name, defaulting to `meta/llama-3.1-70b-instruct`
- `NIM_CHAT_FIRST` controls preference for NVIDIA
- if `GEMINI_API_KEY` or `NEXT_PUBLIC_GEMINI_API_KEY` is present, Gemini models are added to the fallback list:
  - `gemini-1.5-flash-latest`
  - `gemini-1.5-pro-latest`

The backend attempts models in order and moves to the next provider only on error.

### 3.9 Streaming model output

The backend streams model output as chunks:

- For NVIDIA, it reads `chunk.choices[0].delta.content`
- For Gemini, it reads `chunk.text`

Each chunk is forwarded as an SSE event with:

- `data: {"content": "<chunk>"}`

The backend also logs the model success and inference latency.

### 3.10 Final assistant persistence

After generating the full response, the backend normalizes it using `enhance_assistant_response()`.

Then it inserts the assistant message into `messages` with:

- `role = 'agent'`
- `content = full_response`
- `metadata` containing model name, streamed flag, response size, chunk count, and client request ID

It also updates the conversation's `updated_at` timestamp.

### 3.11 SSE completion

At the end of the stream, the backend sends:

- `data: {"processed_content": "<final normalized response>"}`
- `data: {"done": true}`

This tells the frontend the stream is complete and the final assistant content is ready.

## 4. Database and tracing

### 4.1 SQLAlchemy instrumentation

`backend/app/db.py` configures the SQLAlchemy engine and attempts to instrument it with OpenTelemetry:

- `SQLAlchemyInstrumentor().instrument(engine=engine)` if available
- attaches a `handle_error` listener to record DB exceptions into the current span

This means DB reads and writes during chat processing can appear as nested spans under the backend request.

### 4.2 Backend OpenTelemetry setup

`backend/app/tracing.py` initializes OTel for the backend service:

- creates a `TracerProvider`
- exports spans to `OTEL_EXPORTER_OTLP_ENDPOINT`
- instruments FastAPI via `FastAPIInstrumentor`
- optionally instruments HTTPX, Requests, and urllib3

### 4.3 Chat-specific spans

`backend/app/api/chat_routes.py` creates tracing spans for:

- the overall chat stream: `chat.stream`
- each model attempt: `chat.inference.<provider>.<model>`

Span attributes include:

- `chat.conversation_id`
- `chat.user_id`
- `chat.message_length`
- `chat.history_messages`
- `llm.model`
- `llm.provider`
- `llm.response_chars`
- `llm.stream_chunks`
- `llm.latency_ms`
- `chat.used_model`
- `chat.total_latency_ms`
- `chat.client_request_id`

Errors during inference are recorded on the active span.

### 4.4 Frontend browser tracing

Frontend browser tracing is installed in `frontend/src/components/BrowserTracing.tsx` and `frontend/src/lib/browser-tracing.ts`.

It patches `window.fetch` to:

- generate a W3C `traceparent` header
- attach it to requests targeting `/api/`
- emit a browser-span event to `/telemetry/browser-span`

This preserves trace context from the browser into the backend.

The root layout `frontend/app/layout.tsx` includes `<BrowserTracing />`, which ensures this instrumentation loads for all pages.

## 5. Validation checklist

To verify the end-to-end flow for `/chat`, confirm:

- [ ] frontend `/chat` page sends `POST /api/chat/stream` with valid bearer auth
- [ ] frontend reads SSE chunked responses and updates assistant text progressively
- [ ] backend authenticates the user and checks conversation ownership
- [ ] backend persists user messages before inference
- [ ] backend loads conversation history and optional resume context
- [ ] backend streams model text chunks as SSE
- [ ] backend persists the normalized assistant response
- [ ] DB rows appear in `messages` for both user and agent
- [ ] OpenTelemetry traces include `chat.stream` and `chat.inference.*` spans
- [ ] HTTP requests from the browser carry `traceparent`

## 6. Troubleshooting

### 6.1 No assistant output

- verify the backend route is reachable at `/api/chat/stream`
- verify `Authorization` header is sent with a valid token
- check logs for `CHAT_STREAM_START`, `CHAT_MODEL_ATTEMPT`, and `CHAT_STREAM_DONE`

### 6.2 Incomplete or malformed markdown

- ensure the frontend uses `normalizeAssistantText()` before rendering
- ensure the backend final event includes `processed_content`

### 6.3 Missing trace context

- verify browser fetch patching is enabled in `frontend/src/lib/browser-tracing.ts`
- ensure `traceparent` is present on `/api/chat/stream`
- confirm backend FastAPI instrumentation is active via `backend/app/tracing.py`

### 6.4 Resume context not applied

- ensure the request contains `selected_resume_id` or the message explicitly mentions resume analysis
- verify `resumes` are present for the authenticated user
- confirm backend logs for resume context loading

## 7. Key files and functions

- `frontend/app/chat/page.tsx`
- `frontend/src/lib/browser-tracing.ts`
- `frontend/src/components/BrowserTracing.tsx`
- `backend/app/api/chat_routes.py`
- `backend/app/tracing.py`
- `backend/app/db.py`

## 8. Deployment / env variables

Required environment variables for `/chat` and tracing:

- `NEXT_PUBLIC_BACKEND_API_URL`
- `GEMINI_API_KEY` or `NEXT_PUBLIC_GEMINI_API_KEY`
- `NIM_MODEL_CHAT`
- `NIM_CHAT_FIRST`
- `OTEL_EXPORTER_OTLP_ENDPOINT`
- `OTEL_SERVICE_NAME`

Optional but helpful:

- `DATABASE_URL`
- `OTEL_PYTHON_EXCLUDED_URLS`

## 9. Final notes

The `/chat` feature is a fully streaming experience with client-side SSE handling, backend model orchestration, database persistence, and OpenTelemetry tracing from browser to backend.

For any debugging, search logs for `CHAT_STREAM_*` and confirm trace spans in Jaeger or your OTEL backend.
