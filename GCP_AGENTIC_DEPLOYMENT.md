# GCP Agentic Deployment — /chat

How the enterprise agentic `/chat` flow runs today, which GCP pieces it uses,
and exactly what you must enable in GCP (and what you do **not** need).

## 1. What was implemented

The `/chat` flow is now a real agentic loop (model-in-the-loop function calling):

1. Frontend sends `POST /api/chat/stream` with `{ agent, message, selected_resume_id, ... }`.
2. Backend resolves the agent (`planner`, `resume`, `ats`, `career`, `interview`) from `agent_registry.py`.
3. Tools are exposed per agent (`search_jobs`, `fetch_user_resume`) as typed declarations (`chat_tools.py`).
4. `GatewayRouter.execute_agent()` (`ai_gateway.py`) runs the loop:
   - model returns either final text **or** function calls
   - function calls are executed with the user's context injected
   - tool results are appended back into the conversation
   - repeats until a final answer or `CHAT_AGENT_MAX_ITERATIONS` (default 6)
5. Tool activity streams to the UI as SSE `tool_call` / `tool_result` events; the final answer persists to `messages`.

Provider support for native function calling:
- **Vertex Gemini (GCP)** — `VertexGeminiProvider.agent_turn()` via `google-genai` (Vertex AI endpoint)
- NVIDIA / OpenAI — OpenAI-compatible `tools`
- Gemini API key — `google-generativeai` function calling
- Anthropic — text-only (no tools)

## 2. Do you need to deploy models in "Agent Platform"?

**No — not for this architecture.** The agent loop lives in your FastAPI
service (`ai_gateway.py`) and calls fully-managed Vertex AI Gemini models.
There is nothing to deploy; you only need the project enabled and an IAM
identity to call the API.

| Option | Do you need it? | Notes |
| --- | --- | --- |
| **Vertex AI Gemini (managed)** | ✅ Use this | `gemini-2.5-flash` via `google-genai` `Client(vertexai=True)` |
| **Vertex AI Agent Builder / Agentspace** | ❌ Not required | Hosted agent runtime + connectors; overkill here, your tools are in your own Postgres/NVIDIA stack |
| **Vertex AI Agent Engine** | ❌ Not required | Hosted agent runtime for Python agents; only if you want GCP to run your loop instead of FastAPI |
| **Custom model deployment / tuning** | ❌ Not required | No custom weights to serve; `gemini-2.5-flash` is pre-hosted |
| **Grounding / RAG connectors** | ❌ Not required | You already ground via resume context + pgvector job search |

When you *would* want Vertex AI Agent Builder / Agent Engine: if you want
GCP-hosted orchestration, built-in grounding, session management, and
connectors without writing the loop yourself. In that model you would deploy
`search_jobs` / `fetch_user_resume` as Cloud Functions or Cloud Run tools and
register them as an Agent Engine tool, then call the agent endpoint from
FastAPI. For this codebase it adds latency and coupling for no benefit.

## 3. GCP setup (one-time, required)

Project detected from `gcloud config`: `resumeai-503317`.

```bash
# 1. Enable Vertex AI API
gcloud services enable aiplatform.googleapis.com --project resumeai-503317

# 2. Auth for local dev (Application Default Credentials)
gcloud auth application-default login

# 3. Service account for the backend (GKE uses Workload Identity)
gcloud iam service-accounts create resumatch-backend \
  --project resumeai-503317
gcloud projects add-iam-policy-binding resumeai-503317 \
  --member "serviceAccount:resumatch-backend@resumeai-503317.iam.gserviceaccount.com" \
  --role "roles/aiplatform.user"
gcloud iam service-accounts add-iam-policy-binding \
  resumeai-503317.svc.id.goog[resumatch-ai/backend] \
  --member "serviceAccount:resumatch-backend@resumeai-503317.iam.gserviceaccount.com" \
  --role "roles/iam.workloadIdentityUser" \
  --project resumeai-503317
# then annotate the backend k8s ServiceAccount:
kubectl annotate serviceaccount backend \
  iam.gke.io/gcp-service-account=resumatch-backend@resumeai-503317.iam.gserviceaccount.com \
  -n resumatch-ai
```

Alternatively, export a service-account JSON key to `GOOGLE_APPLICATION_CREDENTIALS`
in the deployment secret — least recommended for GKE but simplest to test.

## 4. Environment variables

Already set in `backend/.env` (and in `helm/resumatch/values.yaml`):

- `GOOGLE_CLOUD_PROJECT=resumeai-503317`
- `GOOGLE_CLOUD_LOCATION=global`
- `GOOGLE_GENAI_USE_VERTEXAI=true`
- `VERTEX_GEMINI_MODEL=gemini-2.5-flash`
- `DEFAULT_PROVIDER=vertex-gemini`
- `CHAT_AGENT_MAX_ITERATIONS=6` (optional)

Provider order after this config: `vertex-gemini` → `nvidia` fallback
(`NVIDIA_API_KEY_REASONING`).

> ⚠️ `gemini-2.5-pro` is region-locked (e.g. `us-east5`, `europe-west1`,
> `us-central1`). `gemini-2.5-flash` works on `global`. If you switch to Pro,
> set `GOOGLE_CLOUD_LOCATION` to a supported region.

## 5. Verify the loop

- `GET /health` → `{"status": "healthy"}`
- `GET /api/agents/agents` → lists agents + their allowed tools
- In `/chat`, pick **Planner** and ask "Find me SDE2 jobs in Bangalore" —
  the UI shows the *Searching Jobs* badge, then the tool result is grounded
  into the answer.
- Backend logs: `AGENT_TOOL_START` / `AGENT_TOOL_DONE` for each tool,
  `CHAT_STREAM_DONE` with `provider=vertex-gemini`.

## 6. Security notes

- `frontend/.env.example` is for placeholders only — never commit real API
  keys to it. Vertex ADC replaces the need for a key. Rotate any key that was
  ever committed.
- Keep `backend/.env` out of git (it already is).
- Backend IAM should be scoped to `roles/aiplatform.user`, not broad owner.
