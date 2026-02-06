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
