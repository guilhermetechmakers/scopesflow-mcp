# MCP 3000-Concurrency Plan

> Date: 2026-03-10  
> Goal: Support 3000 concurrent automated builds

## Quick Reality Check
Running 3000 full MCP **server** processes on one machine is not realistic. Each build spawns a worker process, uses CLIs, disk, and memory. To reach 3000 concurrent builds, you need a **fleet** of worker nodes plus a smaller number of API/dispatcher nodes behind a load balancer.

The practical target is **3000 concurrent builds**, not 3000 API servers.

## Current Constraints in This Repo
1. Concurrency per dispatcher is capped by `MCP_MAX_CONCURRENT_BUILDS` (default 5).
2. Workers are spawned with `npx tsx build-worker.ts`, which is expensive at high scale.
3. Preview port allocation defaults to 3100–3200, which is far below 3000 slots.
4. Build output defaults to `process.cwd()` unless `MCP_BUILD_PROJECTS_DIR` is set, which is not safe for multi-node scaling.

## Minimal Changes to Allow High Concurrency (Per Dispatcher)
These are required even in a multi-node setup.
1. Set `MCP_MAX_CONCURRENT_BUILDS=3000` on each dispatcher if you truly want one node to attempt that many.
2. Set `MCP_PREVIEW_PORT_START` and `MCP_PREVIEW_PORT_END` to a range that can accommodate your preview needs or disable previews for most builds.
3. Set `MCP_BUILD_PROJECTS_DIR` and `MCP_BUILD_LOG_DIR` to a fast disk path outside the repo.

Example env values:
```
MCP_MAX_CONCURRENT_BUILDS=3000
MCP_PREVIEW_PORT_START=3100
MCP_PREVIEW_PORT_END=6200
MCP_BUILD_PROJECTS_DIR=/var/scopesflow/projects
MCP_BUILD_LOG_DIR=/var/scopesflow/logs/builds
```

## Recommended Architecture for 3000 Concurrent Builds
1. **API/Dispatcher tier**  
   Run a small number of stateless MCP API servers behind a load balancer.
2. **Worker tier**  
   Run many worker nodes that execute builds. Each node runs a bounded number of workers based on CPU and RAM.
3. **Queue**  
   Enqueue builds in a job queue and let workers pull jobs. Use Redis or Postgres with `FOR UPDATE SKIP LOCKED`.
4. **Shared storage**  
   Use a shared volume or object storage for build artifacts so resume works across nodes.

## Capacity Planning Guideline
1. Pick a safe number of workers per node, for example 50–150.
2. Required nodes = `ceil(3000 / workers_per_node)`.
3. Add 20–30% headroom for spikes and restarts.

## Code-Level Notes
1. `build-orchestrator.ts` now supports `MCP_PREVIEW_PORT_START` and `MCP_PREVIEW_PORT_END`.
2. `/api/builds` now reports `MCP_MAX_CONCURRENT_BUILDS` instead of a hardcoded value.
3. If you plan to exceed a few hundred concurrent workers per node, replace `npx tsx build-worker.ts` with `node dist/build-worker.js` to reduce per-worker startup cost.

## Action Checklist
1. Decide target workers per node and total nodes.
2. Add a queue layer for build dispatching.
3. Configure shared storage for `MCP_BUILD_PROJECTS_DIR`.
4. Deploy dispatcher nodes behind a load balancer.
5. Autoscale worker nodes based on queue depth and worker utilization.

## Files Touched for Concurrency Support
- `scopesflow-mcp-server/build-orchestrator.ts`
- `scopesflow-mcp-server/server.ts`

