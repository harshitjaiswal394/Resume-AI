# ResuMatch AI - Agent System End-to-End Guide

This guide explains the entire agent system end to end. There are **two surfaces** that expose agents:

1. **The chat agentic workflow** (`/api/chat/stream`, SSE) — a conversational loop where an LLM picks and calls tools (tailoring, ATS, job search, etc.) and streams events to the frontend.
2. **The REST agent API** (`/api/agents/*`) — direct, deterministic endpoints for intent routing, resume parsing/tailoring, version history, DOCX download, ATS analysis, mock interviews, learning roadmaps, and career coaching.

Both surfaces are backed by the same engine: a `GatewayRouter` with per-provider adapters, a set of agent classes, and a shared tool layer.

---

## 1. Architecture at a glance

```
Frontend (Next.js)                        Backend (FastAPI)
┌──────────────────────┐                  ┌──────────────────────────────────────────────────┐
│ app/chat/page.tsx    │ POST /api/chat/stream (SSE)                                        │
│  ─ resume selector   │ ──────────────►  chat_routes.stream_gemini_response                │
│  ─ tailored card     │                  ├─ orchestrator.route()  → auto-picks agent       │
└──────────▲───────────┘                  │   (rule-first intent classification, LLM fallback)
           │                              ├─ agent_registry.get_or_default(routed_agent)    │
           │                              ├─ build_agent_tools(allowed tools)               │
           │                              ├─ _enforce_tool_policy(...)                      │
           │ SSE events:                  ├─ provider_router.execute_agent(...)             │
           │  tool_call / tool_result     │   └─ ai_gateway.GatewayRouter                   │
           │  content / done / error      │       ├─ picks provider (Vertex first)          │
           └─────────────────────────────►│       ├─ agent loop (up to N iterations)        │
                                         │       │   ├─ provider.agent_turn()               │
                                         │       │   ├─ if tool call -> execute             │
                                         │       │   │   └─ chat_tools (tailor_resume,      │
                                         │       │   │      analyze_ats, search_jobs, ...)  │
                                         │       │   └─ repeat until final answer           │
                                         │       └─ fallback across providers               │
                                         │  └─ persist messages (Supabase/Postgres)         │
                                         │                                                  │
Frontend (Next.js)                       │  REST API (all JWT-authed, reuse existing auth)  │
┌──────────────────────┐                 │  /api/agents/intent, /resume/parse, /resume/tailor│
│ dashboard/page.tsx   │ POST /ats/analyze│  /resume/{id}/versions, /version/{id}/data|diff| │
│ builder/new/page.tsx │ POST /tailor    │   download|to-builder, /ats/analyze, /jd/analyze, │
│ chat/page.tsx (card) │ GET  /download  │  /interview/*, /roadmap, /coach                  │
└──────────────────────┘                 └──────────────────────────────────────────────────┘
```

Key modules:

| File | Responsibility |
|---|---|
| `backend/app/api/agent_routes.py` | REST endpoints for the full agent system: intent, resume parse/tailor, versions, DOCX download, ATS, JD, interview, roadmap, coach. All under `/api/agents`. |
| `backend/app/api/chat_routes.py` | HTTP/SSE endpoint `/api/chat/stream`, message persistence, tool-event forwarding to the client. |
| `backend/app/services/agent_registry.py` | Defines every registered agent, its system prompt, preferred provider, and allowed tool names. |
| `backend/app/services/ai_gateway.py` | `GatewayRouter` + `execute_agent()`: runs the agent loop, executes tool calls, collects final text, cross-provider fallback. |
| `backend/app/services/provider_adapters.py` | Provider-specific `agent_turn()` (Vertex AI, Google Gemini, OpenAI, NVIDIA) mapping `AgentTool` lists to each SDK's function-calling format. |
| `backend/app/agents/orchestrator.py` | `AgentOrchestrator`: rule-first + LLM-fallback intent classification → which agent to invoke. |
| `backend/app/agents/resume_intel.py` | `ResumeIntelAgent`: parses/stores/retrieves resume data + embeddings. |
| `backend/app/agents/jd_intel.py` | `JDIntelAgent`: ingests a JD (text/URL/PDF) into structured data, compares resume vs JD. |
| `backend/app/agents/resume_tailor.py` | `ResumeTailorAgent`: generates a JD-tailored resume with no-hallucination enforcement and passthrough of non-tailored sections. |
| `backend/app/agents/ats_intel.py` | `ATSIntelAgent`: deterministic ATS format rules + optional LLM keyword analysis. |
| `backend/app/agents/interview.py` | `InterviewAgent`: mock interview sessions (question generation, answer feedback). |
| `backend/app/agents/learning_roadmap.py` | `LearningRoadmapAgent`: personalized learning plans. |
| `backend/app/agents/career_coach.py` | `CareerCoachAgent`: career guidance using resume + saved career context. |
| `backend/app/agents/memory.py` | `MemoryAgent`: persists career context/goals per user. |
| `backend/app/agents/reflection.py` | `ReflectionAgent`: post-run reflection/summary hooks. |
| `backend/app/agents/tools/resume_tools.py` | Version store/lookup, tailoring cache, source-section merge, version list. |
| `backend/app/agents/tools/docx_generator.py` | `build_tailored_docx()`: ATS-friendly DOCX from tailored JSON. |
| `backend/app/agents/tools/version_diff.py` | `compute_diff()`: GitHub-style diff between default and tailored resumes. |
| `backend/app/agents/tools/jd_tools.py` / `memory_tools.py` | JD / memory helpers used by the agents. |
| `backend/app/api/chat_tools.py` | The callable tools the LLM can use inside chat: `search_jobs`, `fetch_user_resume`, `analyze_jd`, `compare_resume_jd`, `tailor_resume`, `analyze_ats`, `start_interview`, `answer_interview`, `generate_roadmap`, `get_career_advice`. |
| `frontend/app/chat/page.tsx` | Chat UI: resume selector, streaming renderer, tool badges, tailored-resume card (download DOCX / diff / version history). Auto-routing badges show which agent handled the turn. |
| `frontend/app/dashboard/page.tsx` | Dashboard: ATS score widgets, Default/Tailored toggle, tailored ATS analysis. |
| `frontend/app/dashboard/builder/new/page.tsx` | Resume builder with Default/Tailored mode toggle + DOCX download honoring the active mode. |

---

## 2. Agents and their tools

Two sets of agents exist and are both defined in `backend/app/services/agent_registry.py`:

### 2.1 Registered agent definitions (registry)

| Agent | Tools | Behavior |
|---|---|---|
| `planner` (chat default) | `fetch_user_resume`, `search_jobs` | Orchestrates: identifies the goal, proposes next steps. |
| `resume_intel` | `fetch_user_resume` | Parse/analyze/store resume data. |
| `jd_intel` | — | JD ingestion + resume-vs-JD comparison. |
| `resume_tailor` | `fetch_user_resume`, `tailor_resume` | Tailor resume against a JD. |
| `resume` | `fetch_user_resume` | Resume rewrite/optimization guidance. |
| `ats` | `fetch_user_resume` | ATS compatibility and keyword analysis. |
| `ats_intel` | `fetch_user_resume` | Deterministic ATS engine. |
| `memory` | — | Career context persistence. |
| `reflection` | — | Post-run reflection. |
| `career` | `fetch_user_resume`, `search_jobs` | Career roadmap / role transitions / job search. |
| `interview` | `fetch_user_resume` | STAR stories and interview prep. |
| `interview_sim` | `fetch_user_resume` | Mock interview simulation. |
| `learning_roadmap` | `fetch_user_resume` | Structured learning plan. |
| `career_coach` | `fetch_user_resume` | Personalized career advice. |

If the client does not send an `agent` (the chat page does not), the orchestrator classifies the message and `get_or_default` falls back to `planner` for unknown/general messages.

### 2.2 Intent routing (auto-selection in chat)

`/chat` never asks the user to pick an agent. Instead `orchestrator.route()` classifies every message:

- **Fast path (rule-based):** ~80 keyword/regex rules in `orchestrator.py` match intents like `resume_tailoring`, `ats_check`, `interview_prep`, `jd_analysis`, `learning_roadmap`, `career_planning`, `job_search`, `resume_analysis`, `general_chat`. Priority >= 8 → returned with confidence 0.95, **no LLM call**.
- **Slow path (LLM):** ambiguous/unmatched messages go through `GatewayRouter.execute()` with an intent-classification prompt; the JSON output maps to an agent name. Rule + LLM agreement boosts confidence.
- The routed `agent_name` is passed to `get_or_default()`, which drives the system prompt and allowed tools for the turn.

### 2.3 Concrete agent classes (initialized in `main.py`)

`main.py` builds one `GatewayRouter` from all registered providers, then initializes process-wide singletons: `ResumeIntelAgent`, `JDIntelAgent`, `ResumeTailorAgent`, `ATSIntelAgent`, `MemoryAgent`, `ReflectionAgent`, `InterviewAgent`, `LearningRoadmapAgent`, `CareerCoachAgent`, plus `AgentOrchestrator` — the "10-agent system". The agent classes run **deterministic code first** (rules, parsing, validation) and call the LLM **only when needed** (tailoring, keyword analysis, interview questions).

### 2.4 Chat tools (`backend/app/api/chat_tools.py`)

- `fetch_user_resume` — loads the user's latest parsed resume JSON.
- `search_jobs` — queries the jobs table (title/location/remote filters).
- `analyze_jd` — ingests a JD text into structured data.
- `compare_resume_jd` — skill-gap comparison against the current resume.
- `tailor_resume` — runs the tailor agent for a pasted JD and returns a **version_id** (used by the chat tailored card).
- `analyze_ats` — ATS compatibility for the current resume (optionally vs. a JD).
- `start_interview` / `answer_interview` — interactive mock interview.
- `generate_roadmap` / `get_career_advice` — roadmap + coaching.

`build_agent_tools(user_id, allowed_tool_names=..., selected_resume_id=...)` returns **only** the tools that agent is allowed to call. In the chat route these are additionally filtered by `_enforce_tool_policy(...)` (AI security core tool-permissions gate).

---

## 3. REST agent API (`/api/agents/*`)

All endpoints reuse the existing Supabase JWT auth via `_get_user_id()`: `Authorization: Bearer <session.access_token>` → `auth_service.get_user(token)`. 401 otherwise.

| Method | Endpoint | Purpose |
|---|---|---|
| POST | `/intent` | Classify a message → `intent`, `confidence`, `agent_name`, `reasoning` (rule-first, LLM fallback). |
| POST | `/resume/parse` | Parse a resume PDF → structured data (`resume_id`). |
| POST | `/resume/tailor` | Tailor a resume against `jd_text` → `tailored_data`, `diff_json`, `change_reasons`, `version_id`. |
| GET | `/resume/{resume_id}/versions` | Tailoring history for a resume (newest first). Falls back to the user's latest versions if the source resume was deleted. |
| GET | `/resume/version/{version_id}/data` | Full tailored version: merged `parsed_data`, `diff`, metadata. |
| GET | `/resume/version/{version_id}/diff` | GitHub-style diff + `change_reasons`. |
| GET | `/resume/version/{version_id}/download` | Builds and returns the tailored resume as an ATS-friendly **DOCX** (`StreamingResponse`, `attachment`). |
| POST | `/resume/version/{version_id}/to-builder` | Feed the tailored version into the builder as a new resume. |
| POST | `/jd/ingest` | Ingest a JD from text/URL/PDF → structured data. |
| POST | `/jd/analyze` | Skill-gap comparison: resume vs JD. |
| POST | `/ats/analyze` | ATS analysis. Accepts `resume_id` **or** `version_id` (tailored) + optional `jd_text`; returns dashboard-shaped score breakdown. |
| POST | `/interview/start` | Start a mock interview session. |
| POST | `/interview/answer` | Submit an answer → feedback + next question. |
| GET | `/interview/{session_id}/status` | Current interview progress. |
| POST | `/roadmap` | Generate a learning roadmap. |
| POST | `/coach` | Career coaching advice. |

---

## 4. Chat message flow (step by step)

### Step 1 — Client sends the request
`page.tsx` `sendMessage()` POSTs to `${backend}/api/chat/stream`:

```json
{
  "conversation_id": "...",
  "message": "...",
  "selected_resume_id": "...",
  "client_request_id": "..."
}
```

The client does **not** pick an agent — the backend auto-routes it (see section 2.2).

### Step 2 — Resolve agent and build context (`chat_routes.py`)
- `orchestrator.route(message, ...)` classifies intent (rules first, LLM fallback) → `agent_def = agent_registry.get_or_default(routing["agent_name"])`.
- Security core runs first: prompt-injection scoring + PII masking (recorded in the message metadata).
- Persists the user message.
- Loads the last 20 messages as history.
- Always loads resume context (`_get_latest_resume_context`) and appends it to the system prompt. If an agent needs a resume (`resume`/`ats`/`interview`) and none exists, it short-circuits with a friendly error.
- Appends user feedback preferences (from `_build_user_preference_hint`).

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
During the loop, tool activity is pushed immediately through an asyncio event queue:

```
data: {"tool_call": "tailor_resume", "agent": "resume_tailor"}
data: {"tool_result": "tailor_resume", "agent": "resume_tailor", "version_id": "...",
       "resume_id": "...", "diff": {...}, "cached": false,
       "match_score_before": 61, "match_score_after": 88}
...
data: {"content": "<full final markdown>", "agent": "...", "provider": "..."}
data: {"processed_content": "<full final markdown>", "agent": "...", "provider": "..."}
data: {"done": true, "agent": "...", "provider": "..."}
```

When the model calls `tailor_resume`, the result event carries the `version_id`/`resume_id`/`diff`/scores so the chat page can render the **tailored resume card** with a *Download DOCX* button, a diff preview, and version history — all without another round trip. The card also writes a `resumatch_tailored_pending` localStorage marker so the dashboard/builder auto-open in Tailored mode.

The final answer is sent **in a single SSE event** (no client-side chunk re-assembly). On any exception, a single `data: {"error": "<friendly message>"}` is emitted; `_friendly_stream_error()` maps credentials errors (e.g. `DefaultCredentialsError`) to actionable text.

### Step 6 — Persistence
The agent message (with `provider`, `model`, `fallback_used`, `tools_used`, `iterations`, security verdict in metadata) and `conversations.updated_at` are written to the database.

### Step 7 — Client rendering (`page.tsx`)
- `tool_call` → spinner badge ("Searching Jobs", "Reading Your Resume", "Tailoring Resume"...).
- `tool_result` → clears the badge; for `tailor_resume` it renders the tailored card (download / diff / versions).
- `content` / `processed_content` → updates the streaming markdown bubble.
- `done` → marks the message non-streaming, refreshes the sidebar.
- `error` → red error bubble. Stop cancels via AbortController.

---

## 5. Tailored resume end-to-end flow

This is the main non-chat agent flow (also reachable from chat via `tailor_resume`).

### 5.1 `/api/agents/resume/tailor` (or chat tool)
1. **Resume context** — `resume_intel_agent.get_resume_context(user_id, resume_id)` loads the parsed source resume.
2. **JD ingest** — `jd_intel_agent.ingest(jd_text, "text")` extracts structured JD data.
3. **Cache check** — `get_tailoring_cache(user_id, jd_hash, resume_id)`: same user + same JD (sha256 of text, first 16 hex) + same resume → returns the stored version. Cached results are still re-run through section preservation.
4. **LLM tailoring** — `resume_tailor_agent.tailor(...)`: routes via `model_router.route("resume_tailor")`, sends source resume + JD with the TAILORING_PROMPT, `json_mode=True`, and parses the response with `parse_json_response` (repairs truncated / fenced JSON).
5. **No-hallucination enforcement** — `_validate_no_hallucination` compares tailored skills against the source. Invented skills are dropped (soft-fix); other validation failures abort with an error.
6. **Section passthrough** — `_preserve_source_sections` deterministically copies non-tailorable fields from source to output whenever the model returned them empty: `certifications, achievements, languages, projects, internships, links, email, phone, targetRole`. **No user data is ever lost.**
7. **Diff + version** — `compute_diff(resume_data, tailored_resume)` builds a GitHub-style diff; `store_resume_version(...)` persists a new `resume_versions` row (with `version_number`, `jd_hash`, `change_reasons`, `diff_json`).

### 5.2 Reading a version back (`merge_source_sections_into_version`)
`/version/{id}/data`, `/download`, `/to-builder`, and `/ats/analyze?version_id=` all call `get_resume_version` then **`merge_source_sections_into_version`**, which re-merges the source resume's non-tailored sections into the stored `parsed_data`. If the source resume row is gone, it falls back to the user's **richest** resume (most populated passthrough fields) — so orphaned versions still carry email/phone/certifications/languages etc.

### 5.3 DOCX generation (`/version/{version_id}/download`)
`build_tailored_docx(parsed)` renders, in order:
`fullName` → contact line (email | phone | links) → **Professional Summary** → **Skills** → **Professional Experience** (role bullets) → **Education** → **Projects** → **Internships** → **Certifications** → **Languages** → **Achievements**.

Empty sections are skipped; styling is ATS-friendly (Calibri, single-line bullets, no tables). The endpoint returns a `StreamingResponse` with `Content-Disposition: attachment`. `safe_filename(full_name, version_number)` names the file. Frontend callers (chat card `page.tsx:267`, builder `page.tsx:706`) fetch it with the Bearer token and trigger a browser download. The builder downloads the tailored version in Tailored mode and a Word-compatible HTML export in Default mode.

### 5.4 Version history + builder handoff
- `/resume/{resume_id}/versions` lists versions (with `diff_summary`); falls back to the user's 5 latest versions if none belong to the resume.
- `/version/{version_id}/to-builder` maps tailored JSON → `ExperienceItem`/`EducationItem` and creates a new builder resume.

---

## 6. ATS analysis flow (`/api/agents/ats/analyze`)

1. Resolve the resume: if `version_id` is given, load + merge the tailored version; else load `resume_id`.
2. If `jd_text` is given, ingest it (LLM keyword analysis is only run when a JD is present).
3. **Deterministic rules** (`ATS_FORMAT_RULES`, 5 checks) run always at zero LLM cost:
   - `no_tables` — resume must not be table-based.
   - `section_headers` — standard headers (Work Experience, Education, Skills) present.
   - `contact_info` — requires name + (email or phone); also checks links/phone field; message lists what was found.
   - `skills_length` — at least 3 skills.
   - `experience_count` — at least 1 experience entry.
   - `deterministic_score = passed / 5 * 100`.
4. **LLM analysis** (only with a JD): ATS score + missing keywords + formatting issues + narrative feedback. Final score = `deterministic*0.3 + llm*0.7`.
5. **Normalize to the dashboard shape** — the route rewrites the response so the frontend consumes it directly: `score`, `atsScore`, `keywordScore`, `readabilityScore`, `weaknesses`, `recommendations`, `suggestedRoles`.

The dashboard (`frontend/app/dashboard/page.tsx`) calls `/ats/analyze` with `{version_id}` when the Tailored toggle is active, so the score/keywords/weaknesses reflect the **tailored** resume; Default mode uses the stored `score_breakdown`.

---

## 7. Streaming integrity fix

Previously the backend split the final answer into ~180-char chunks with a 2 ms sleep between each, and the client re-assembled them. On slow/aborted connections this occasionally produced truncated responses. **Current behavior:** the whole answer is emitted as one SSE `content` event, so the client receives the complete response atomically. SSE already guarantees event ordering and completion.

---

## 8. Which API key / credentials are used?

**There is no single "the" key — the router tries providers in order.** With the current `backend/.env`:

| Provider | Credential | Status | Notes |
|---|---|---|---|
| `vertex-gemini` (preferred, first) | **ADC (Application Default Credentials)** — `gcloud auth application-default login` or a service-account JSON via `GOOGLE_APPLICATION_CREDENTIALS` | ⚠️ Not set on this machine | Uses the GCP project `GOOGLE_CLOUD_PROJECT` and `VERTEX_GEMINI_MODEL`. **No API key** — Vertex authenticates via ADC. When ADC is missing you get `DefaultCredentialsError`, which is why chat previously said "AI service is currently unavailable". |
| `nvidia` (fallback) | `NVIDIA_API_KEY_REASONING` (or `NVIDIA_API_KEY`) | ✅ Set | Used when Vertex is unavailable. This key has actually been serving chat responses. |
| `gemini` | `GEMINI_API_KEY` | ⚠️ Empty in `backend/.env` | Not registered while empty. |
| `openai` | `OPENAI_API_KEY` | ⚠️ Not present | Not registered while absent. |
| `anthropic` | `ANTHROPIC_API_KEY` | ⚠️ Empty | Not registered while empty. |

So the real answer:

- **Vertex path (intended for production):** uses Application Default Credentials for the configured GCP project, **not an API key**. Run `gcloud auth application-default login` locally (or point `GOOGLE_APPLICATION_CREDENTIALS` at a service-account JSON with the `aiplatform.user` role).
- **NVIDIA path (working fallback right now):** uses `NVIDIA_API_KEY_REASONING`.

**Security note:** no real credentials are committed in tracked files. Placeholders only: `frontend/.env.example` and `backend/.env.example` contain `[password]` / empty keys; `kubernetes/secrets.yaml` contains `change-me`; the Dockerfile's Supabase anon key is a fake JWT (`"ref":"placeholder"`). Real secrets (a Gemini key, a Supabase DB password in `scripts/setup-db.ts`, a Grafana admin password in `kubernetes/persistent.yaml`) were removed from the working tree, and runtime logs (`*.log`) are gitignored and untracked. **However, the secrets still exist in git history** (commits `f1d00a3`, `26a33cd`, `1428b43`, `c22efe1`) — a history rewrite + force-push + credential rotation is required before deploying to a public repo.

---

## 9. How to verify locally

```powershell
# Backend (from backend/)
.\venv\Scripts\python.exe -m uvicorn app.main:app --reload

# Authenticate Vertex (one-time, so the preferred provider works)
cmd /c "gcloud auth application-default login"

# Or keep using the NVIDIA fallback (already configured in backend/.env)

# Frontend (from frontend/)
npm run dev

# Tests + typecheck
python -m pytest tests/ -q        # from backend/
npx tsc --noEmit                  # from frontend/
```

Checkpoint list:
1. `GET /health` → `{"status":"healthy"}`. Registry sanity: `python -c "from app.services.agent_registry import agent_registry; print(agent_registry.list_names())"` from `backend/` → the 14 agent names.
2. Send a message in `/chat` (e.g. "tailor my resume for this JD" or a greeting) → the backend auto-routes to the right agent, tool badges appear (if tools run), and a complete markdown answer arrives. Logs show `INTENT_ROUTED | intent=... agent=...`.
3. Tailoring: paste a JD in chat (or POST `/api/agents/resume/tailor`) → a tailored card appears with *Download DOCX*, diff preview, and version history. Download the DOCX and verify **all** sections (email, phone, certifications, languages, education, experience, skills).
4. Dashboard: toggle Default/Tailored → the ATS score/keywords/weaknesses reflect the tailored version (`/ats/analyze` with `version_id`).
5. Builder: toggle Tailored → email/phone/certs are populated; DOCX download honors the active mode.
6. Backend logs: `AGENT_TOOL_START`, `AGENT_TOOL_DONE`, `CHAT_STREAM_DONE`, `RESUME_TAILORED`, `TAILORING_VERSION_STORED`, `ATS_ANALYSIS` with provider/model/latency.
7. Message metadata in DB includes `provider`, `model`, `fallback_used`, `tools_used`, `iterations`, and the security verdict.
