# Automated Build via VPS — Implementation Plan

## Summary
Fix the VPS-driven automated build so the MCP receives complete build context (Supabase URL + anon key, prompts, and optional GitHub metadata), injects it into the create-project flow, and produces the same end-to-end project generation as the local `dist/server.js` run. The plan focuses on repairing configuration propagation and validation, not on UI warnings from the frontend console.

## Scope
- In scope: propagate Supabase connection data into create-project, ensure prompts load and execute, improve logging/validation around missing build fields, and align build config merging between DB and start-build payload.
- Out of scope: React Flow warnings, Radix Dialog accessibility warnings, and general UI performance issues in ScopesFlow.

## Architecture / Approach
The start-build payload already includes `supabaseUrl`, `anonKey`, and `accessToken`, but those values are not persisted into the build configuration consumed by `runBuildLoop`/`createProject`. The MCP should merge those runtime values into the cursor config at the build runner boundary and explicitly support a `supabaseAnonKey` field for env generation. We will also ensure prompts are reliably read from `automated_build_prompts` and that missing configuration results in clear build logs and status updates.

## Implementation Steps

### Step 1: Trace and validate build configuration flow
- Files to modify: `server.ts`, `build-runner.ts`
- Description: Add targeted logging/guard clauses to confirm the payload (start-build) is merged into config before project creation. Ensure missing critical fields (project name/path, framework, package manager, prompts) fail fast with a build log entry.
- Dependencies: none

### Step 2: Merge start-build Supabase data into create-project config
- Files to modify: `server.ts`, `build-runner.ts`
- Description: Extend `runBuildLoop` options to accept a `configOverrides` object (e.g., `supabaseUrl`, `supabaseAnonKey`) derived from `runBuild`’s start-build payload. Merge these overrides into the cursor config before calling `createProjectFn`.
- Dependencies: Step 1

### Step 3: Support `supabaseAnonKey` explicitly and fix env generation
- Files to modify: `server.ts`
- Description: Update `CursorProjectConfig` and `validateCreateProjectArgs` to accept `supabaseAnonKey` (and `supabase_anon_key`) in addition to the existing `supabaseServiceRoleKey` variants. Use anon key when writing `VITE_SUPABASE_ANON_KEY` (and Expo equivalents) so generated projects get correct public credentials.
- Dependencies: Step 2

### Step 4: Ensure prompts are loaded and executed on VPS
- Files to modify: `build-runner.ts`
- Description: If `configuration.prompts` is empty, confirm the `automated_build_prompts` query is executed and log how many prompts were loaded. If zero, log a warning and set status to `failed` with a helpful message to surface missing prompt data.
- Dependencies: Step 1

### Step 5: Update deployment docs for VPS expectations
- Files to modify: `auto-build-vps-deployment-plan.md` (or a new short note in `README.md`)
- Description: Document the requirement that start-build payload values are merged into build config, and that anon keys (not service role keys) are used in generated `.env` files.
- Dependencies: Step 2

## Data / API Changes
- No schema changes required.
- Runtime changes: start-build payload values (`supabaseUrl`, `anonKey`) are merged into `cursorConfig` at runtime to avoid persisting secrets in `automated_builds`.

## Testing / Validation
- Trigger a build via `/api/start-build` and confirm:
  - Logs show merged config includes `supabaseUrl` and `supabaseAnonKey`.
  - `.env.local` (or `.env`) is created with correct Supabase URL + anon key.
  - Prompts are fetched and executed; `build_logs` shows each prompt step.
  - `automated_builds.status` progresses from `running` → `completed`.
- Negative test: run with missing `anonKey` and verify build fails with a clear log message.

## Notes / Risks
- Avoid persisting `accessToken` or `anonKey` into DB rows; only pass them in-memory during build execution.
- Ensure logs do not print full access tokens or keys.

---

# Realtime Build Logs — Implementation Plan

## Summary
Add more granular entries to `build_logs` throughout the build lifecycle so users can follow the build in realtime from the UI. This involves (1) passing `buildId` into prompt execution so the MCP server can write logs during each prompt, (2) adding more `appendLog` calls in the build runner at key steps, and (3) streaming cursor-agent events (status, file changes, errors) into `build_logs` as they occur.

## Scope
- In scope: pass `buildId` through execute-prompt args; add build_logs at build-runner steps (config loaded, prompts loaded, per-prompt start/end, project creation steps); add build_logs from server.ts during executePrompt (project verified, git config, agent start/end, validation, commit, migrations); stream cursor-agent events to build_logs in realtime via optional callback.
- Out of scope: changing `build_logs` table schema; frontend UI for displaying logs (assumed already subscribes to build_logs or polls).

## Architecture / Approach
- **build-runner.ts**: Already has `appendLog(buildId, message)`. Add more calls: after loading build row (success), after validating config, "Starting prompt execution (N prompts)", per-prompt "Running prompt N/M: &lt;preview&gt;", "Prompt N/M completed", and ensure every error path logs. Pass `buildId` in `BuildExecutePromptArgs` so the server can write logs for the same build.
- **server.ts**: Add optional `buildId` to `ExecutePromptArgs`. When `buildId` and `supabaseClient` are present, define a non-blocking `appendBuildLog(message, level)` that inserts into `build_logs` (same columns: build_id, log_type, message, created_at). Call it at: execute start, project verified, git config loaded, cursor-agent unavailable (fallback), before/after cursor-agent run, file count, Tailwind/build validation, commit, migrations, success/error. Add optional `onBuildLog` callback to `executeCursorAgentStreaming`; when provided, invoke it for each agent log (status, file, thinking, error, completion, etc.) so events appear in build_logs in realtime.

## Implementation Steps

### Step 1: Pass buildId and add more logs in build-runner
- Files: `build-runner.ts`
- Add `buildId` to `BuildExecutePromptArgs` (redundant with closure but needed for type parity with server). In the loop, pass `buildId` in `executeArgs`. Add `appendLog`: "Build loaded, validating configuration"; "Configuration valid, starting project creation"; "Starting prompt execution (N prompts)"; for each prompt "Running prompt N/M: &lt;first 60 chars of prompt&gt;..."; after each prompt "Prompt N/M completed".
- Dependencies: none

### Step 2: Add buildId to ExecutePromptArgs and appendBuildLog in server
- Files: `server.ts`
- Add `buildId?: string` to `ExecutePromptArgs`. In `validateExecutePromptArgs`, accept and return `buildId`. In `executePrompt`, when `args.buildId` and `args.supabaseClient` exist, implement `appendBuildLog(message, level)` that inserts into `build_logs` (fire-and-forget, same shape as build-runner). Call it at: "Executing prompt...", "Project directory verified", "Git config loaded", "Cursor Agent not available, using fallback", "Starting Cursor Agent...", "Cursor Agent completed", "Files changed: N", "Tailwind validation done", "Build validation passed/failed", "Committing changes" / "Commit successful" / "No GitHub token, skipping commit", "Migrations: N found" / "No migrations", success/error.
- Dependencies: Step 1 (so buildId is passed from runner)

### Step 3: Stream cursor-agent events to build_logs
- Files: `server.ts`
- Add optional 4th parameter to `executeCursorAgentStreaming`: `onBuildLog?: (message: string, level?: 'info' | 'error') => void | Promise<void>`. Inside the existing `addLog` helper, after pushing to `logs`, if `onBuildLog` is provided, call it with a one-line message (e.g. "[Agent] status: ..." or "File: ..."). In `executePrompt`, when calling `executeCursorAgentStreaming`, pass an `onBuildLog` that calls `appendBuildLog` when `buildId` and `supabaseClient` exist. Keep messages short to avoid huge rows (e.g. truncate to 500 chars).
- Dependencies: Step 2

## Data / API Changes
- No schema changes. `build_logs` already has `build_id`, `log_type`, `message`, `created_at` (and optional columns if present). All new inserts use existing columns.

## Testing / Validation
- Start a build via `/api/start-build`; in Supabase (or app) watch `build_logs` for that `build_id`. Confirm: build loaded, config valid, project creation, "Starting prompt execution", "Running prompt 1/N: ...", then server-side logs (Executing prompt, Project verified, Git config, Starting Cursor Agent), then streamed agent lines (status, file, etc.), then "Cursor Agent completed", files changed, validation, commit, "Prompt 1/N completed", etc.
- Realtime: new rows should appear during the cursor-agent run, not only at the end.

## Notes / Risks
- Throttling: if agent emits hundreds of lines, we may want to batch inserts or rate-limit; for now we insert each line (fire-and-forget) to maximize realtime feel. Can add batching later if DB load is high.
- Supabase client is passed from build-runner with user's JWT; RLS must allow insert into `build_logs` for the build's owner.
