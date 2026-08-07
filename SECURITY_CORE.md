# AI Security Core — Phase 1

Enterprise-grade security layer for the ResuMatch agentic AI chat. Implemented
against OWASP LLM Top 10, NIST AI RMF, and ISO 27001 control families. Policy:
**block high-risk, warn medium**, PII masked before it reaches any external
provider.

---

## 1. What's enforced (and how)

| Gate | Module | Behavior | Env kill-switch |
|---|---|---|---|
| 0 — Request rate limit | `rate_limit.py` | 429 after `chat` budget (30/60s default, per user) | `AI_RATE_LIMIT_ENABLED` |
| 1 — Prompt injection / jailbreak | `prompt_injection.py` | score >= 0.75 BLOCK (friendly SSE error); >= 0.40 WARN (proceeds, logged) | `AI_INJECTION_ENABLED` |
| 2 — PII masking | `pii.py` | emails/phones/Aadhaar/PAN/passport/cards/SSN/bank → `[PLACEHOLDER]` before provider | `AI_PII_ENABLED` |
| 3 — Tool authorization | `permissions.py` | each tool checked (role + permission + payload size); denial fed back to the model loop | `AI_TOOL_PERMISSIONS_ENABLED` |
| 4 — Output validation | `output_validation.py` | secret leaks / prompt echoes / runaway length replaced with safe placeholder | `AI_OUTPUT_VALIDATION_ENABLED` |
| — Audit | `audit.py` | every decision logged (structured logs + `audit_logs` table) | `AI_AUDIT_ENABLED` |

Supporting modules: `config.py` (env-driven policy), `metrics.py` (Prometheus,
graceful no-op when the client is missing), `sanitizer.py` (input normalization),
`prompt_versioning.py` (prompt governance / rollback), `models.py` (types).

### Attack coverage (injection engine)

- Direct injection (`ignore all previous instructions…`)
- System-prompt / hidden-prompt extraction
- DAN / developer-mode / role-swap jailbreaks
- Safety-disable requests
- Secret & memory exfiltration
- Tool ambush / destructive tool requests
- **Base64-encoded attacks** (auto-decoded and re-scanned)
- Unicode obfuscation: zero-width chars, confusables/homoglyphs, fullwidth

### PII categories & validation

| Kind | Checksum / validation |
|---|---|
| Aadhaar | Verhoeff checksum, grouped 4-4-4 |
| Credit card | Luhn |
| PAN | holder-type 4th char + digit check |
| SSN | area/group constraints |
| Phone / email / passport / bank / address / handle | format regex + heuristics |

Overlapping spans keep the **highest-priority** kind (e.g. Aadhaar wins over
phone on the same digits).

---

## 2. Architecture

```
client
  │  POST /api/chat/stream (Bearer JWT)
  ▼
chat_routes.chat_stream
  ├─ gate 0: rate_limiter.check("chat")            → 429
  └─ stream_gemini_response (async generator)
       ├─ gate 1: analyze_prompt()                 → BLOCK: SSE error
       ├─ gate 2: mask_pii()                       → masked user message
       ├─ build_agent_tools() wrapped by _enforce_tool_policy()
       │     └─ gate 3 per tool call (permission + tool_call rate limit)
       ├─ provider_router.execute_agent()          → external LLM (masked payload)
       ├─ gate 4: output_validator.validate()      → replace if unsafe
       ├─ audit_logger.log(...) request/response   → audit_logs + logs
       └─ LATENCY.observe(...) + SSE events
```

- PII never leaves the process to an external provider by default.
- Tool denial is returned as structured JSON to the model so the loop recovers
  gracefully (no raw tool data leaks).
- The DB is **optional** at boot: audit/prompt-version writes degrade to logs if
  the table is missing or the write fails.

---

## 3. Deployment

### Migration
```bash
psql "$DATABASE_URL" -f backend/migrations/v9_security_core.sql
```
Idempotent (`ADD COLUMN IF NOT EXISTS`, `CREATE TABLE IF NOT EXISTS`). Extends
the existing `audit_logs` table and creates `prompt_versions`.

### Backend
```bash
cd backend
python -m pip install -r requirements.txt   # adds prometheus-client
uvicorn app.main:app --host 0.0.0.0 --port 8000
```

### Kubernetes (Helm)
```bash
helm upgrade --install resumatch ./helm/resumatch \
  --namespace resumatch-ai --create-namespace
```
Included hardening:
- `securityContext`: non-root (65532), read-only root FS, no privilege
  escalation, drop all caps
- Namespace PSA labels (`baseline` enforced, `restricted` audit/warn)
- `backend-network-policy.yaml`: egress locked to DNS + public providers,
  ingress from frontend/ingress/istio only

### Configuration
Full set of `AI_*` env vars in `backend/.env.example` (mirrored into the Helm
ConfigMap). **Never** set `AI_AUDIT_PROMPT_CAPTURE=true` without a
data-processing/GDPR review — it persists message content to `audit_logs`.

---

## 4. Observability

- `GET /metrics` — Prometheus (`resumatch_ai_security_decisions_total`,
  `resumatch_ai_prompt_injections_total`, `resumatch_ai_pii_masked_total`,
  `resumatch_ai_tool_denied_total`, `resumatch_ai_rate_limited_total`,
  `resumatch_ai_output_rejected_total`, `resumatch_ai_chat_latency_seconds`, …)
- `GET /api/security/status` — engine liveness + active policy thresholds
- Audit rows in `audit_logs` (event_type, verdict, provider, model, latency)
- Structured logs: `PROMPT_BLOCKED`, `PII_MASKED`, `TOOL_DENIED`,
  `RATE_LIMITED`, `OUTPUT_REJECTED`, `CHAT_STREAM_DONE`

---

## 5. Runbooks

### 5.1 Prompt-injection wave or malicious traffic
1. Confirm via `/api/security/status` that `prompt_injection` is `enabled`.
2. Check `resumatch_ai_prompt_injections_total` and `PROMPT_BLOCKED` logs.
3. Tighten: raise `AI_INJECTION_BLOCK_THRESHOLD` (loosen) or lower it (tighten).
   Re-verify with `backend/tests/test_security_injection.py`.
4. To hard-stop all AI traffic: set `AI_SECURITY_ENABLED=false` and restart —
   **use only in emergencies** (also disables masking/audit).

### 5.2 PII leak suspected / provider breach
1. Audit rows of `event_type = pii_masked` show what was masked.
2. If a masked kind was missed, add/extend a regex in `pii.py` + a test.
3. For hard enforcement: `AI_PII_BLOCK_MODE=true` refuses requests containing
   sensitive PII instead of masking.

### 5.3 False positives blocking legitimate users
1. Identify the rule from the `verdict`/findings (`PROMPT_BLOCKED` log or audit
   `verdict.rules`).
2. Adjust the specific pattern weight in `prompt_injection.py`, or raise
   `AI_INJECTION_BLOCK_THRESHOLD`.
3. Add a regression test with the false-positive payload.

### 5.4 Rate-limit incidents (users getting 429s)
1. `resumatch_ai_rate_limited_total{scope="user"}` + `RATE_LIMITED` logs.
2. Raise the per-user `chat` budget in `rate_limit.py::DEFAULT_LIMITS` or bump
   `AI_RATE_LIMIT_ENABLED=false` only temporarily.
3. Note: the limiter is **in-memory per process**. Multi-replica deployments
   must swap `SlidingWindowLimiter` for Redis or accept per-pod budgets.

### 5.5 Rollback of a prompt change
```python
from app.security import prompt_version_store
prompt_version_store.rollback("default", version=1)  # restore prior prompt
```
Prompt content is checksummed (sha256) and versions persist to
`prompt_versions`; rollback is audited via `PROMPT_VERSIONED`.

---

## 6. Full rollback of Phase 1

```bash
# 1. Revert code
git revert <release-sha>              # removes wiring + engines

# 2. Revert env / chart
git revert <helm-sha>
helm upgrade --install resumatch ./helm/resumatch --namespace resumatch-ai

# 3. Migration rollback (only if the new columns/tables cause issues)
psql "$DATABASE_URL" <<'SQL'
DROP TABLE IF EXISTS prompt_versions;
ALTER TABLE audit_logs DROP COLUMN IF EXISTS organization_id;
ALTER TABLE audit_logs DROP COLUMN IF EXISTS event_type;
ALTER TABLE audit_logs DROP COLUMN IF EXISTS request_id;
ALTER TABLE audit_logs DROP COLUMN IF EXISTS provider;
ALTER TABLE audit_logs DROP COLUMN IF EXISTS model;
ALTER TABLE audit_logs DROP COLUMN IF EXISTS tokens_in;
ALTER TABLE audit_logs DROP COLUMN IF EXISTS tokens_out;
ALTER TABLE audit_logs DROP COLUMN IF EXISTS cost_usd;
ALTER TABLE audit_logs DROP COLUMN IF EXISTS tool;
ALTER TABLE audit_logs DROP COLUMN IF EXISTS agent;
ALTER TABLE audit_logs DROP COLUMN IF EXISTS latency_ms;
ALTER TABLE audit_logs DROP COLUMN IF EXISTS prompt_hash;
ALTER TABLE audit_logs DROP COLUMN IF EXISTS verdict;
SQL
```
Note: dropping columns loses audit history — export before rollback if needed.

---

## 7. Compliance mapping

| Requirement | Control in this phase |
|---|---|
| OWASP LLM01 Prompt Injection | Gate 1 (injection engine, obfuscation-aware) |
| OWASP LLM02 Output Handling | Gate 4 (output validator) |
| OWASP LLM06 Sensitive Disclosure | Gate 2 (PII masking), prompt capture off by default |
| OWASP LLM05 Supply Chain | `prompt_versions` checksums + rollback |
| OWASP LLM04 Model DoS | Gate 0 + tool payload caps |
| NIST AI RMF Govern/Manage | Audit + prompt versioning + thresholds |
| NIST AI RMF Measure | Prometheus metrics |
| ISO 27001 A.12.4 / SOC2 CC7 | Audit logging (`audit_logs`) |
| GDPR Art. 32 / Art. 30 | PII minimization, audit of processing |

---

## 8. Tests

```bash
cd backend
python -m pytest tests -q   # 51 tests: 10 pre-existing + 41 security
```
- `test_security_injection.py` — attack families, base64, obfuscation, thresholds
- `test_security_pii.py` — detection + checksums + no false positives
- `test_security_permissions.py` — tool policy + rate limiter
- `test_security_output.py` — output validator + prompt versioning
