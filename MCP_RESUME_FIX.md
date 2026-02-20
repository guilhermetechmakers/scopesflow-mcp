# MCP Server: Resume Build Fix

> **Applied:** 2025-02-17  
> **Issue:** Clicking "Resume" on a paused build created a new project instead of continuing from the existing one.

---

## Problem

When a user resumed a paused or failed build, the MCP server's `runBuildLoop()` in `build-runner.ts` would:

1. **Always create a new project** — Ignored `cursor_project_path` from the database and generated a fresh path with `Date.now()`
2. **Re-run all prompts** — Loaded every prompt regardless of `is_implemented`, causing duplicate work and potential conflicts
3. **Reset progress** — Started from step 0 instead of the last completed step

---

## Fix Applied

### File: `build-runner.ts`

#### 1. Resume detection

```typescript
const existingProjectPath = buildRow.cursor_project_path;
const isResume = !!existingProjectPath;
```

#### 2. Filter prompts when resuming

Only load non-implemented prompts when resuming:

```typescript
let promptQuery = supabase
  .from('flowchart_items')
  .select('*')
  .eq('project_id', config.projectId)
  .eq('type', 'prompt');

if (isResume) {
  promptQuery = promptQuery.eq('is_implemented', false);
}

const { data: promptItems, error: promptsError } = await promptQuery.order('sequence_order');
```

#### 3. Skip project creation when resuming

When `cursor_project_path` exists:

- Use the existing path
- Verify the directory exists via `fs.access()`
- Skip `createProjectFn()` entirely
- Log: `"Resuming build at existing project: {path}"`

When the directory is missing, fail with a clear error instead of creating a new project.

#### 4. Correct step tracking for resume

```typescript
let currentStep = isResume ? (buildRow.current_step ?? 0) : 0;
let totalSteps = isResume
  ? (buildRow.current_step ?? 0) + (promptItems?.length ?? 0)
  : (promptItems?.length ?? 0) + 1;
```

#### 5. Handle "all prompts implemented" on resume

If resuming and no non-implemented prompts remain, mark the build as `completed` instead of `failed`.

---

## Dependencies

- **Node.js `fs/promises`** — Used to check if the project directory exists before resuming
- **`buildRow`** — Must include `cursor_project_path`, `current_step` (from `automated_builds`)

---

## Data Flow After Fix

```
Resume request → build-automation-resume edge function
  → Sets status='pending', clears failure_reason
  → Calls MCP /api/start-build with { buildId, supabaseUrl, accessToken, anonKey }

MCP server.runBuild()
  → Loads full build row from DB (includes cursor_project_path, configuration)
  → Calls runBuildLoop()

runBuildLoop()
  1. Fetches buildRow (has cursor_project_path)
  2. isResume = !!cursor_project_path
  3. Load prompts (filter is_implemented=false if resuming)
  4. If isResume:
       - projectPath = cursor_project_path
       - Verify dir exists
       - Skip createProjectFn
  5. Else: create new project as before
  6. Execute remaining prompts in projectPath
```

---

## Testing

1. **Resume after manual pause:** Pause a running build → Resume → Should continue in the same project directory.
2. **Resume after failure:** Let a build fail on step 3 → Resume → Should skip steps 1–2 and continue from step 3.
3. **New build unchanged:** Start a fresh build → Should still create a new project.
4. **Missing directory:** Delete the project folder, then resume → Should fail with "Project directory not found. Cannot resume."
5. **All prompts done:** Resume a build where all prompts are implemented → Should mark as completed, not failed.

---

## Related Changes (App Side)

- **`build-automation-resume`** — Validates configuration, checks remaining prompts, clears failure state
- **`AutomationControls.handleResumeBuild`** — Now calls `resumeBuild()` API instead of only updating state
- **`useActiveBuilds`** — Auto-pauses builds with no activity for over 1 hour
