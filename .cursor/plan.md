# Build Dashboard MCP Server Modifications — Implementation Plan

## Summary

Implemented all MCP server modifications required to support the Build Automation Dashboard. This includes a heartbeat system for build liveness detection, per-step tracking in `build_steps`, retry logic with exponential backoff, custom prompt injection support, new HTTP API endpoints (`/api/health`, `/api/builds`, `/api/builds/:id/preview`), and two new utility modules for multi-build orchestration and app preview management.

## Scope

- **In scope:**
  - Heartbeat system (15s interval, `last_heartbeat` on `automated_builds`)
  - `build_steps` row inserts per prompt execution
  - Retry logic (up to 2 retries with exponential backoff)
  - Custom prompt checking from `build_custom_prompts` table
  - Active build tracker (in-memory Map shared between server and build runner)
  - `GET /api/health` endpoint (uptime, memory, disk, active builds)
  - `GET /api/builds` endpoint (list active builds)
  - `POST /api/builds/:id/preview` endpoint (start dev server)
  - `DELETE /api/builds/:id/preview` endpoint (stop dev server)
  - `BuildOrchestrator` class for multi-build management
  - `AppRunner` class for dev server process management
  - CORS support for DELETE method on all API routes

- **Out of scope:**
  - Database migrations (tables `build_steps`, `build_custom_prompts` assumed to exist)
  - Dashboard UI changes (already deployed per spec)
  - `generate-next-prompt` integration (not present in current codebase)

## Architecture

```
server.ts (HTTP endpoints, activeBuildTracker, AppRunner, BuildOrchestrator)
    ↓
build-runner.ts (heartbeat, build_steps, retry, custom prompts)
    ↓
build-orchestrator.ts (multi-build limits, port allocation)
app-runner.ts (dev server process lifecycle)
```

## Files Modified/Created

| File | Action | Key Changes |
|------|--------|-------------|
| `build-runner.ts` | **MODIFIED** | Heartbeat timer, `PromptQueueItem` queue, `build_steps` inserts, retry with backoff, `build_custom_prompts` polling, `ActiveBuildEntry` tracker updates, `ExecutePromptResult` type |
| `server.ts` | **MODIFIED** | `activeBuildTracker` Map, `AppRunner`/`BuildOrchestrator` instances, `GET /api/health`, `GET /api/builds`, `POST/DELETE /api/builds/:id/preview`, `getDiskSpace()` helper, updated CORS, async HTTP handler |
| `build-orchestrator.ts` | **CREATED** | `BuildOrchestrator` class with concurrent build limits and port allocation |
| `app-runner.ts` | **CREATED** | `AppRunner` class for starting/stopping preview dev servers |

## Database Tables Used

| Table | Operations | Purpose |
|-------|-----------|---------|
| `automated_builds` | UPDATE (heartbeat, status) | Heartbeat timestamps, status changes |
| `build_steps` | INSERT, UPDATE | Per-prompt execution tracking |
| `build_logs` | INSERT (existing) | Structured logs |
| `build_custom_prompts` | SELECT, UPDATE | Read pending prompts, update status |

## Testing / Validation

- TypeScript compiles cleanly (`npx tsc --noEmit` — 0 errors)
- See DASHBOARD.md §5 for full testing checklist covering:
  - Heartbeat updates every ~15s
  - `build_steps` rows created per prompt
  - Custom prompt injection and execution
  - Retry logic with `retrying` status
  - Health endpoint response
  - Preview start/stop
  - Multi-build concurrency
