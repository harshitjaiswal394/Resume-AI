# ResuMatch AI - Agent System End-to-End Guide

This guide explains how the `/chat` agentic workflow works end to end: how agents are defined, how a message flows through the backend, how tools are called, how the response streams to the frontend, and which credentials/API keys are actually used.

---

## 1. Architecture at a glance

```
Frontend (Next.js)                    Backend (FastAPI)
┌─────────────────────┐               ┌──────────────────────────────────────────────┐
│ app/chat/page.tsx   │  POST /api/chat/stream  (SSE)                              │
│  ─ AgentDropdown    │ ─────────────►  chat_routes.stream_gemini_response          │
│  ─ sends SSE events │                  ├─ agent_registry.get_or_default(agent)    │
└──────────▲──────────┘                  ├─ build_agent_tools(allowed tools)        │
           │  SSE events:                ├─ provider_router.execute_agent(...)      │
           │  tool_call / tool_result    │   └─ ai_gateway.GatewayRouter            │
           │  content / done / error     │       ├─ picks provider (Vertex first)   │
           └─────────────────────────────┤       ├─ agent loop (up to N iterations)│
                                         │       │   ├─ provider.agent_turn()       │
                                         │       │   ├─ if tool call -> execute     │
                                         │       │   │   └─ chat_tools (search_jobs)│
                                         │       │   └─ repeat until final answer   │
                                         │       └─ fallback across providers       │
                                         │  └─ persist messages (Supabase/Postgres) │
                                         └──────────────────────────────────────────────┘
```

Key modules:

| File | Responsibility |
|---|---|
| `backend/app/services/agent_registry.py` | Defines the 5 agents (planner, resume, ats, career, interview), their system prompts, preferred provider, and allowed tool names. |
| `backend/app/services/ai_gateway.py` | `GatewayRouter` with `execute_agent()`: runs the agent loop, executes tool calls, collects final text, handles cross-provider fallback. |
| `backend/app/services/provider_adapters.py` | Provider-specific `agent_turn()` implementations (Vertex AI, Google Gemini, OpenAI, NVIDIA) that map our `AgentTool` list to each SDK's native function-calling format. |
| `backend/app/api/chat_tools.py` | The actual tools the model can call: `search_jobs` and `fetch_user_resume`. |
| `backend/app/api/chat_routes.py` | HTTP/SSE endpoint `/api/chat/stream`, message persistence, tool-event forwarding to the client. |
| `frontend/app/chat/page.tsx` | Chat UI: agent dropdown, resume selector, streaming message renderer, tool indicator badges. |

---

## 2. Agents and their tools

Defined in `backend/app/services/agent_registry.py`. The registry is a simple in-memory map; `/api/agents/agents` returns the list.

| Agent | Tools | Behavior |
|---|---|---|
| `planner` (default) | `fetch_user_resume`, `search_jobs` | Orchestrates: identifies the goal, proposes next steps. |
| `resume` | `fetch_user_resume` | Resume rewrite/optimization guidance. |
| `ats` | `fetch_user_resume` | ATS compatibility and keyword analysis. |
| `career` | `fetch_user_resume`, `search_jobs` | Career roadmap / role transitions. |
| `interview` | `fetch_user_resume` | STAR stories and interview prep. |

If the client does not send an `agent` (or sends an unknown one), `get_or_default` falls back to `planner`.

### 2.1 Tools (`backend/app/api/chat_tools.py`)

- `fetch_user_resume`: loads the user's latest parsed resume and returns its JSON so the model can ground its answer.
- `search_jobs`: queries the jobs table (title/location/remote filters) and returns matching roles.

`build_agent_tools(user_id, allowed_tool_names=...)` returns **only** the tools that agent is allowed to call — a per-agent capability gate.

---

## 3. Message flow (step by step)

### Step 1 — Client sends the request
`page.tsx` `sendMessage()` POSTs to `${backend}/api/chat/stream`:

```json
{
  "conversation_id": "...",
  "message": "...",
  "selected_resume_id": "...",
  "client_request_id": "...",
  "agent": "planner"
}
```

### Step 2 — Resolve agent and build context (`chat_routes.py`)
- `agent_def = agent_registry.get_or_default(agent)`
- Persists the user message.
- Loads the last 20 messages as history.
- Auto-detects whether resume context is needed (agent in `{resume, ats, career, interview}`, a resume was selected, or the prompt looks like a resume request). If required but no resume exists, it short-circuits with a friendly error.

### Step 3 — Build the router and run the agent
```python
provider_router = _build_gateway_router()
preferred_provider = agent_def.preferred_provider or os.getenv("DEFAULT_PROVIDER")
provider_router.execute_agent(
    GatewayRequest(messages=..., preferred_provider=..., system_instruction=..., agent_tools=...),
    tools=agent_tools,
    on_tool_call=emit_tool_call,
    on_tool_result=emit_tool_result,
    max_iterations=int(os.getenv("CHAT_AGENT_MAX_ITERATIONS", "6")),
)
```

`provider_router` is a `GatewayRouter` (from `ai_gateway.py`) built from `build_default_provider_router()` in `provider_adapters.py`. Registered providers (in order) come from the environment — see section 5.

### Step 4 — The agent loop (`ai_gateway.py`)
```
for iteration in 1..max_iterations:
    turn = provider.agent_turn(messages, system_instruction, tools, tool_results)
    if turn.tool_calls:
        for each tool call:
            result = execute tool (chat_tools)
            append to conversation, emit on_tool_result
        continue loop   # model sees tool output and decides next step
    else:
        final_text = turn.text
        break
```
- If the preferred provider raises (auth, quota, network), the router falls back to the next registered provider and records `metadata["fallback_used"] = True`.
- `max_iterations` guards against infinite tool loops (default 6, override via `CHAT_AGENT_MAX_ITERATIONS`).

### Step 5 — Stream events back (SSE)
During the loop, tool activity is pushed to the client immediately through an asyncio event queue:

```
data: {"tool_call": "search_jobs", "agent": "planner"}
data: {"tool_result": "search_jobs", "agent": "planner"}
...
data: {"content": "<full final markdown>", "agent": "...", "provider": "..."}
data: {"processed_content": "<full final markdown>", "agent": "...", "provider": "..."}
data: {"done": true, "agent": "...", "provider": "..."}
```

The final answer is sent **in a single SSE event** (no client-side chunk re-assembly), which avoids truncated/partial responses. The `content` event renders the answer while `processed_content` re-applies the backend's markdown enhancer, and `done` finalizes the streaming bubble.

On any exception, a single `data: {"error": "<friendly message>"}` is emitted. `_friendly_stream_error()` maps credentials errors (e.g. `DefaultCredentialsError`) to actionable text.

### Step 6 — Persistence
The agent message (with `provider`, `model`, `fallback_used`, `tools_used`, `iterations` in metadata) and the `conversations.updated_at` timestamp are written to the database.

### Step 7 — Client rendering (`page.tsx`)
- `tool_call` → shows a spinner badge ("Searching Jobs", "Reading Your Resume").
- `tool_result` → clears the badge.
- `content` / `processed_content` → updates the streaming markdown bubble.
- `done` → marks the message non-streaming, refreshes the sidebar list.
- `error` → shows a red error bubble.
- If the user presses Stop, the AbortController cancels the stream.

---

## 4. Streaming integrity fix

Previously the backend split the final answer into ~180-char chunks with a 2 ms sleep between each, and the client re-assembled them. On slow/aborted connections this occasionally produced truncated responses. **Current behavior:** the whole answer is emitted as one SSE `content` event, so the client receives the complete response atomically. SSE already guarantees event ordering and completion.

---

## 5. Which API key / credentials are used?

**There is no single "the" key — the router tries providers in order.** With the current `backend/.env`:

| Provider | Credential | Status | Notes |
|---|---|---|---|
| `vertex-gemini` (preferred, first) | **ADC (Application Default Credentials)** — `gcloud auth application-default login` or a service account JSON via `GOOGLE_APPLICATION_CREDENTIALS` | ⚠️ Not set on this machine | Uses the GCP project `GOOGLE_CLOUD_PROJECT` (currently `resumeai-503317`) and `VERTEX_GEMINI_MODEL` (`gemini-2.5-flash`). **No API key** — Vertex authenticates via ADC. When ADC is missing you get `DefaultCredentialsError`, which is why chat previously said "AI service is currently unavailable". |
| `nvidia` (fallback) | `NVIDIA_API_KEY_REASONING` (or `NVIDIA_API_KEY`) | ✅ Set | Used when Vertex is unavailable. This is the key that has actually been serving chat responses. |
| `gemini` | `GEMINI_API_KEY` | ⚠️ Empty in `backend/.env` | Not registered while empty. |
| `openai` | `OPENAI_API_KEY` | ⚠️ Empty | Not registered while empty. |
| `anthropic` | `ANTHROPIC_API_KEY` | ⚠️ Empty | Not registered while empty. |

So the real answer:

- **Vertex path (intended for production):** uses Application Default Credentials for project `resumeai-503317`, **not an API key**. Run `gcloud auth application-default login` locally (or point `GOOGLE_APPLICATION_CREDENTIALS` at a service-account JSON with the `aiplatform.user` role) to make it work.
- **NVIDIA path (working fallback right now):** uses `NVIDIA_API_KEY_REASONING`.
- `GEMINI_API_KEY`, `OPENAI_API_KEY`, `ANTHROPIC_API_KEY` are empty and therefore not in the router.

**Security note:** `frontend/.env.example` contains a committed Gemini key `AIzaSyD0b...`. It is not used by the backend router (only `backend/.env` matters), but you should rotate/remove it since it is exposed in the repo.

---

## 6. How to verify locally

```powershell
# Backend (from backend/)
.\venv\Scripts\python.exe -m uvicorn app.main:app --reload

# Authenticate Vertex (one-time, so the preferred provider works)
cmd /c "gcloud auth application-default login"

# Or keep using the NVIDIA fallback (already configured in backend/.env)

# Frontend (from frontend/)
npm run dev
```

Checkpoint list:
1. `GET /api/agents/agents` → returns `planner, resume, ats, career, interview`.
2. Send a message in `/chat` with the Planner agent → expect the tool badges to appear (if tools run) and a complete markdown answer.
3. Backend logs: `AGENT_TOOL_START`, `AGENT_TOOL_DONE`, `CHAT_STREAM_DONE` with `provider` + `model` + `latency_ms`.
4. Message metadata in DB includes `provider`, `model`, `fallback_used`, `tools_used`, `iterations`.
