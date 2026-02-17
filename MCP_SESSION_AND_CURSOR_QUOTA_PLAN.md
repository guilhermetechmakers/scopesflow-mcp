# MCP Sessions per Build + Per-User Cursor API Quota — Implementation Plan
Last updated: 2026-02-17

## Summary
We will change the build runtime so **each build runs in its own isolated “session” (a dedicated worker process)** instead of running inside the single long-lived MCP server process. This makes VPS-side logs and resource usage easy to track per build.

Separately, we will stop relying on a shared Cursor CLI login and instead run `cursor-agent` authenticated via a **per-user Cursor API key**, so **each user spends their own Cursor quota**.

This plan is written against the current repo structure and code paths:
- `server.ts`: HTTP endpoints (`/api/start-build`, `/api/execute-prompt`) + spawns `cursor-agent`
- `build-runner.ts`: build loop (prompts, status, logs)
- `build-orchestrator.ts`: concurrency/ports helper (currently not used for build sessions)

---

## Scope
### In scope
- **Per-build session isolation**
  - Starting a build creates a new build worker process (a “session”) with its own stdout/stderr and lifecycle.
  - Per-build log files on the VPS and better operational controls (list/stop sessions).
- **Per-user Cursor API quota**
  - Store a **Cursor API key per user** (securely) and use it when invoking `cursor-agent`.
  - If a user has no key configured, fail fast with a clear message and log event.
- **Backwards compatible start trigger**
  - Keep `/api/start-build` as the trigger from the Edge Function (or add `/api/start-build-v2` and migrate safely).

### Out of scope (for this iteration)
- Replacing Supabase build logs with a different logging system (we keep `build_logs` and `build_steps`).
- Adding a full “job queue” (Redis/PG queue). We’ll rely on existing concurrency gating + process isolation.
- Full UI implementation in the frontend (we’ll expose clear API surfaces and DB schema for the app to consume).

---

## Current State (What’s happening today)
### Build runtime
- `/api/start-build` calls `CursorMCPServer.runBuild(...)`, which schedules `runBuildFromPayload(...)` **inside the same MCP process** (the one you keep alive with pm2 on the VPS).
- The build loop (`runBuildLoop` in `build-runner.ts`) repeatedly calls `executePromptFn`, which runs `cursor-agent` for each prompt.

### Why logs are hard to manage
- On the VPS, pm2 collects logs for the **single MCP process**, so multiple builds mix into the same log stream/files.
- Operationally, there’s no “unit of execution” per build that you can isolate, tail, restart, or stop independently.

### Cursor authentication
- `cursor-agent` is spawned without a per-user API key, which means it relies on **whatever Cursor login is configured on the machine** (shared quota).

---

## Target Architecture

## 1) A “dispatcher” MCP + per-build “worker sessions”
Keep **one** long-running MCP process (pm2-managed) as the **dispatcher** and API surface.

When a build starts:
- dispatcher validates the request (existing `MCP_BUILD_API_KEY` header check)
- dispatcher enforces concurrency limits
- dispatcher spawns a **new worker process** dedicated to that build
- dispatcher returns `200 { started: true, sessionId }` immediately

Worker responsibilities:
- run `runBuildFromPayload(...)` for exactly one `buildId`
- fetch the user’s Cursor API key (server-side) and use it for all `cursor-agent` calls
- write logs to:
  - Supabase (`build_logs`, `build_steps`) — already implemented
  - local per-build files on VPS (stdout/stderr) — new
- exit when build completes/fails/cancels

This gives you:
- a clean “session” boundary per build
- per-build log files
- per-build lifecycle controls (kill/retry)

### Implementation choice: “spawn/fork” vs “pm2 per build”
Both achieve isolation. Recommended default is **Node spawn/fork** (simple, fast, no pm2-in-pm2).

- **Option A (recommended): spawn/fork workers**
  - dispatcher uses `child_process.fork()` (or `spawn('node', ...)`) to start `dist/build-worker.js`
  - dispatcher writes worker stdout/stderr to `./logs/builds/<buildId>.log`
  - dispatcher tracks PID + state in memory (and optionally in DB)

- **Option B: pm2-managed workers (one pm2 process per build)**
  - dispatcher shells out to `pm2 start dist/build-worker.js --name build-<buildId> ...`
  - each worker gets its own pm2 log files automatically
  - more operational features but more complexity (pm2 permissions, env/args, cleanup)

We’ll design the worker entrypoint so either option can be used later.

---

## 2) Per-user Cursor API keys (quota isolation)
We will authenticate `cursor-agent` using a per-user Cursor API key:
- preferred: set `CURSOR_API_KEY` in the spawned `cursor-agent` process environment
- optional: also support `cursor-agent --api-key <key>` if needed

Key requirements:
- the user’s Cursor API key must **never** be logged to stdout, stored in plaintext in git, or written into build artifacts.
- the key should be stored **encrypted at rest** in Supabase and only decrypted server-side in the worker.

### Data model (Supabase)
Add a new table, example name: `cursor_api_keys`

Columns (proposed):
- `user_id uuid primary key references auth.users(id) on delete cascade`
- `api_key_ciphertext text not null` (encrypted)
- `key_fingerprint text not null` (e.g., first 6 + last 4 of the key, for debugging only)
- `created_at timestamptz default now() not null`
- `updated_at timestamptz default now() not null`
- `last_used_at timestamptz null`
- `revoked_at timestamptz null`

RLS policies:
- `select/insert/update/delete`: user can only manage their own row (`auth.uid() = user_id`)

Encryption approach (pick one):
- **Preferred**: Supabase Vault / pgsodium (if available in your project)
- **Fallback**: application-level encryption using a server secret `CURSOR_KEYS_ENCRYPTION_SECRET`

### API surface for the app
Provide one of:
- **Edge Function** `cursor-api-key-upsert`: accepts plaintext key from authenticated user, encrypts server-side, stores ciphertext.
- Or: **Direct DB write** from the app using an RPC that encrypts with pgcrypto/pgsodium (still requires careful setup).

Worker behavior:
- load the key for `build.user_id`
- if missing/revoked: mark build as failed + append a clear `build_log` message
- set `last_used_at` on success

---

## Detailed Implementation Steps

## Step 1 — Add a build-worker entrypoint (one-build-per-process)
**Goal**: create a single command that runs exactly one build by `buildId` and then exits.

- Files to create:
  - `build-worker.ts` (new)
- Files to modify:
  - `package.json` (add build output + optional script)
  - `tsconfig.json` (if needed for compiling the new entrypoint)

**`build-worker.ts` responsibilities**
- Read required inputs from env/argv:
  - `BUILD_ID`
  - `SUPABASE_URL`
  - `SUPABASE_ANON_KEY`
  - `SUPABASE_ACCESS_TOKEN` (or prefer service role for DB operations; see Step 5)
  - optional `MCP_SUPABASE_SERVICE_ROLE_KEY` (recommended)
- Call `runBuildFromPayload(...)` from `build-runner.ts`
- Exit code:
  - `0` on completed
  - `1` on failed/canceled

**Notes**
- Do not write secrets to disk.
- Print a small, structured header line on startup: buildId, pid, timestamp (no secrets).

---

## Step 2 — Change `/api/start-build` to start a new worker session
**Goal**: every build start creates a new isolated worker process.

- Files to modify:
  - `server.ts`
  - `build-orchestrator.ts` (extend to track worker PIDs + enforce concurrency)

**Dispatcher logic changes**
- Before starting:
  - verify `MCP_BUILD_API_KEY` header (already present)
  - enforce `maxConcurrentBuilds` using `BuildOrchestrator`
- Start:
  - spawn worker process (Option A: `fork/spawn`)
  - redirect stdout/stderr to per-build log files:
    - `./logs/builds/<buildId>.out.log`
    - `./logs/builds/<buildId>.err.log`
- Track:
  - store `{ buildId, pid, startedAt }` in `activeBuildTracker` (already exists) and/or `BuildOrchestrator.activeBuilds`
- Respond:
  - `200 { started: true, buildId, sessionPid }`

**Add operational endpoints**
- `GET /api/sessions` → list running worker sessions (buildId, pid, uptime)
- `POST /api/sessions/:buildId/stop` → terminate worker; update build status to “canceled” (and log it)

---

## Step 3 — Make cursor-agent invocation accept a per-build/per-user API key
**Goal**: `cursor-agent` must run with the user’s Cursor API key to spend their quota.

- Files to modify:
  - `server.ts` (execute prompt path)

**Implementation approach**
- Extend `ExecutePromptArgs` to include optional:
  - `cursorApiKey?: string`
- Add loader similar to GitHub token loading:
  - if `args.cursorApiKey` missing and `args.supabaseClient + args.userId` present → fetch from `cursor_api_keys`
- Pass API key into `cursor-agent` process:
  - preferred: set env var `CURSOR_API_KEY` in `spawn` options (add `env: { ...process.env, CURSOR_API_KEY: key }`)
  - ensure **no logs** print the key; only print whether a key was present

**WSL consideration**
If `cursor-agent` is executed inside WSL (Windows path), ensure the env var is present inside the WSL shell:
- either pass `CURSOR_API_KEY=...` inline in the `bash -c` string (carefully escaped)
- or move to `spawn('wsl', ['-d','Ubuntu','bash','-lc', '<command>'], { env: ... })` so you can pass env predictably

---

## Step 4 — Fetch Cursor API key once per build (avoid per-prompt DB reads)
**Goal**: keep builds efficient and reduce DB round-trips.

- Files to modify:
  - `build-runner.ts`
  - `server.ts` (runBuild glue)

**Approach**
- At the start of `runBuildLoop(...)` (or `runBuildFromPayload(...)`), fetch the user’s Cursor API key once.
- Store it in memory for the worker process and include it in every `executePromptFn` call as `cursorApiKey`.

Fallback behavior:
- If missing → fail build immediately (status `failed`) and append a clear log entry:
  - “Cursor API key not configured for this user. Please add your API key in Settings.”

---

## Step 5 — Secure storage & lifecycle for Cursor API keys
**Goal**: keys are safe, revocable, auditable.

- Supabase migrations (new):
  - `supabase/migrations/<timestamp>_create_cursor_api_keys.sql`
- Optional Edge Function (new, recommended):
  - `supabase/functions/cursor-api-key-upsert/index.ts`

### 5.1 ScopesFlow changes (collect, store safely, and make available to MCP)
**Goal**: users can add their own Cursor API key, it is stored encrypted-at-rest, and MCP workers can use it without relying on a shared login.

#### A) UI/UX (ScopesFlow app)
Add a settings screen where the user can manage their Cursor API key.

- **Location**: Settings → Integrations → Cursor (or Settings → API Keys)
- **UI requirements**
  - Input: “Cursor API Key” (password-type input, with reveal toggle)
  - Helper text: explain quota isolation (“Used to run builds on your own Cursor quota”)
  - Status card:
    - “Configured” + fingerprint (e.g., `ck_12ab…9xyz`) + last used timestamp
    - “Not configured” state with CTA
  - Actions:
    - Save / Update key
    - Revoke key (immediate; future builds fail until set again)
  - Feedback:
    - Success/error toast
    - Loading state, disabled buttons while saving

#### B) Client-side validation (ScopesFlow app)
Before sending to the backend:
- Trim whitespace; reject empty
- Enforce minimum length (e.g. >= 20 chars) and disallow spaces/newlines
- Never persist the plaintext key locally (no localStorage, no logs)

#### C) Secure storage API (recommended: Supabase Edge Function)
Implement an Edge Function that accepts the plaintext key **once**, encrypts it server-side, and stores only ciphertext.

- **Edge Function**: `cursor-api-key-upsert`
- **Input**: `{ apiKey: string }`
- **Auth**: requires Supabase Auth session (uses `Authorization: Bearer <access_token>`)
- **Behavior**
  - Validate payload
  - Compute `key_fingerprint` (first 6 + last 4; never store the full key)
  - Encrypt the key (Vault/pgsodium if available; otherwise app-level AES-GCM using `CURSOR_KEYS_ENCRYPTION_SECRET`)
  - Upsert into `cursor_api_keys` for `auth.uid()`
  - Return only non-sensitive metadata: `{ hasKey: true, keyFingerprint, updatedAt }`

Also implement:
- **Edge Function**: `cursor-api-key-revoke`
  - sets `revoked_at = now()`
  - returns `{ hasKey: false }`

#### D) “Pass to MCP” (how the build runtime actually gets the key)
**Recommended (do not send plaintext key over the network):**
- ScopesFlow stores the key in `cursor_api_keys` (encrypted)
- When a build starts, ScopesFlow/Edge Function does **not** include the Cursor key in the `/api/start-build` payload
- The MCP **worker** loads the key by `build.user_id` from Supabase (service role recommended) and injects it into the `cursor-agent` process env as `CURSOR_API_KEY`

**Alternative (only if you cannot read keys from DB in MCP):**
- Include an encrypted blob in build configuration and have the worker decrypt it using a server secret.
- This is higher risk and adds complexity; prefer DB lookup.

#### E) Enforcement during build start (ScopesFlow)
To avoid starting builds that will fail:
- On “Start build”, ScopesFlow checks `cursor_api_keys` metadata (via Edge Function or a view) and blocks the action if missing/revoked, showing a clear message:
  - “Add your Cursor API key to start builds.”

**Minimum requirements**
- RLS: only the user can manage their own key
- Encryption at rest
- No plaintext key ever returned to the client after initial set
- `key_fingerprint` available for debugging support tickets

**Key rotation / revoke**
- support “replace key” (overwrite ciphertext, update `updated_at`)
- support “revoke” (set `revoked_at`, worker refuses to use)

---

## Step 6 — VPS operational improvements (log retention, rotation, ergonomics)
**Goal**: logs and sessions are manageable in production.

- Create directories:
  - `./logs/builds/` (owned by the service user)
- Add rotation:
  - OS `logrotate` rule for `logs/builds/*.log`
  - or integrate a lightweight retention cleanup (delete logs older than N days)

Optional:
- structured JSON lines for worker logs (easy to ingest)
- include buildId and pid prefix on every log line

---

## Data / API Changes Summary
### New DB objects
- `cursor_api_keys` table + RLS policies
- (optional) `build_sessions` table if you want persistent session tracking beyond in-memory state

### MCP server API changes
- `/api/start-build`: spawns worker session (or add `/api/start-build-v2` and migrate)
- new: `GET /api/sessions`
- new: `POST /api/sessions/:buildId/stop`

### New runtime env vars (VPS)
- `MCP_BUILD_LOG_DIR` (default `./logs/builds`)
- `MCP_MAX_CONCURRENT_BUILDS` (default 5)
- `MCP_SUPABASE_SERVICE_ROLE_KEY` (already present in code paths; strongly recommended)
- `CURSOR_KEYS_ENCRYPTION_SECRET` (only if using app-level encryption)

---

## Testing / Validation
### Local
- Start dispatcher (`npm run dev`)
- Trigger `/api/start-build` with a known `buildId`
- Verify:
  - a worker process starts and exits
  - log files appear in `logs/builds/`
  - Supabase `build_logs` continues to populate

### Production (VPS)
- Deploy dispatcher under pm2 as today
- Trigger two builds concurrently
- Verify:
  - two different worker PIDs
  - separate per-build log files
  - stopping one build does not affect the other

### Quota isolation
- Configure two different Cursor API keys for two users
- Trigger builds for each
- Verify (operationally):
  - cursor-agent runs successfully for both
  - keys are never printed in logs
  - missing key fails early with a clear message

---

## Risks / Notes
- **Cursor auth mechanics**: confirm the supported auth mechanism for `cursor-agent` in your environment (env var `CURSOR_API_KEY` and/or `--api-key`). Implement both paths and add an integration test that runs `cursor-agent --version` with the env var set.
- **Secrets in worker environment**: passing `SUPABASE_ACCESS_TOKEN` to a worker is acceptable on a trusted VPS, but prefer using the service role key for DB operations (already supported) to avoid JWT expiry during long builds.
- **Zombie workers**: ensure dispatcher tracks child exits and has a “reaper” that cleans up stale sessions.

---

## Rollout Plan
1. Ship worker entrypoint + dispatcher spawning behind a feature flag (e.g. `MCP_USE_BUILD_WORKERS=true`).
2. Run in production for a subset of builds.
3. Enable by default.
4. Add key management UI + require per-user key before allowing build start.

