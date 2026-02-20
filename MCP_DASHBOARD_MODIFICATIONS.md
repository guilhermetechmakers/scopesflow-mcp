# MCP Server Modifications for Build Dashboard

> **Purpose**: Exact instructions for modifying the MCP server (`server.ts`, `build-runner.ts`) to support the new Build Automation Dashboard. The ScopesFlow web app has already been updated to consume these changes.
>
> **Priority**: Must be completed before the dashboard fully works. The dashboard UI is already deployed and will gracefully degrade (show empty states) until these MCP changes are made.

---

## Table of Contents

1. [build-runner.ts Changes](#1-build-runnerts-changes)
2. [server.ts — New HTTP Endpoints](#2-serverts--new-http-endpoints)
3. [New File: build-orchestrator.ts](#3-new-file-build-orchestratorts)
4. [New File: app-runner.ts](#4-new-file-app-runnerts)
5. [Testing Checklist](#5-testing-checklist)

---

## 1. build-runner.ts Changes

### 1.1 Add Heartbeat System

The dashboard checks `last_heartbeat` on `automated_builds` to know if the build runner is alive. If the heartbeat is older than 60 seconds, the UI shows a "stale" warning.

**Where**: Inside `runBuildLoop()`, right after `await updateBuildProgress(supabase, buildId, { status: 'running' });`

```typescript
// ──── HEARTBEAT ────
const HEARTBEAT_INTERVAL_MS = 15_000;
const heartbeatTimer = setInterval(async () => {
  try {
    await supabase.from('automated_builds').update({
      last_heartbeat: new Date().toISOString(),
    }).eq('id', buildId);
  } catch (err) {
    console.error('[Build Runner] Heartbeat failed:', err);
  }
}, HEARTBEAT_INTERVAL_MS);
```

**Where**: In every exit path of `runBuildLoop()` (the `return` statements in the try/catch/finally), add:

```typescript
clearInterval(heartbeatTimer);
```

Best approach: wrap the main try block contents and add a `finally`:

```typescript
try {
  // ... existing code ...
} catch (err) {
  // ... existing error handling ...
} finally {
  clearInterval(heartbeatTimer);
}
```

### 1.2 Write build_steps Rows

After each prompt execution, insert a row into `build_steps`. The dashboard's StepsTimeline component reads from this table.

**Where**: After the `executePromptFn` call and status determination, before the `generate-next-prompt` call.

Replace the section from the prompt execution through marking as implemented:

```typescript
// ──── Before executing: record step start ────
const stepStartMs = Date.now();
const stepStartTime = new Date().toISOString();

// Insert step row as 'running'
const { data: stepRow } = await supabase.from('build_steps').insert({
  build_id: buildId,
  step_number: currentStep,
  prompt_id: promptItem.id,
  prompt_content: promptContent,
  prompt_source: (promptItem as any).source ?? 'sequence', // 'sequence' | 'generated' | 'custom'
  status: 'running',
  started_at: stepStartTime,
  retry_count: 0,
}).select().single();

// ──── Execute with retry ────
const MAX_STEP_RETRIES = 2;
let retryCount = 0;
let execResult: ExecutePromptResult = { success: false, error: 'Not executed' };

while (retryCount <= MAX_STEP_RETRIES) {
  execResult = await executePromptFn({
    prompt: promptContent,
    projectPath,
    timeout: config.automationSettings?.timeoutPerStep ?? 300000,
    context: `Step ${currentStep} of automated build`,
  });

  if (execResult.success) break;

  retryCount++;
  if (retryCount > MAX_STEP_RETRIES) {
    await addLog(supabase, buildId, 'error',
      `Step ${currentStep} permanently failed after ${MAX_STEP_RETRIES + 1} attempts.`,
      'cursor');
    break;
  }

  await addLog(supabase, buildId, 'warn',
    `Step ${currentStep} failed (attempt ${retryCount}/${MAX_STEP_RETRIES + 1}): ${execResult.error}`,
    'cursor');

  // Update step to 'retrying'
  if (stepRow?.id) {
    await supabase.from('build_steps').update({
      status: 'retrying',
      retry_count: retryCount,
      error_message: execResult.error ?? null,
    }).eq('id', stepRow.id);
  }

  // Exponential backoff
  await new Promise(r => setTimeout(r, 5000 * retryCount));
}

// ──── Update step row with final result ────
const stepStatus = execResult.success ? 'completed' : 'failed';

if (stepRow?.id) {
  await supabase.from('build_steps').update({
    status: stepStatus,
    completed_at: new Date().toISOString(),
    duration_ms: Date.now() - stepStartMs,
    files_changed: execResult.filesChanged ?? [],
    error_message: execResult.error ?? null,
    retry_count: retryCount,
    has_migrations: execResult.hasMigrations ?? false,
    migrations: execResult.migrations ?? [],
  }).eq('id', stepRow.id);
}

if (!execResult.success) {
  // If the step failed after retries, decide whether to continue or fail the build
  // Option A: Skip and continue (current behavior below continues to next prompt)
  // Option B: Fail the build (uncomment to use)
  // await updateBuildProgress(supabase, buildId, { status: 'failed', completed_at: new Date().toISOString(), current_step: currentStep, total_steps: totalSteps });
  // return;

  // For now, log the permanent failure and continue with next prompt
  await addLog(supabase, buildId, 'warn', `Skipping failed step ${currentStep}, continuing with next prompt`, 'automation');
}
```

### 1.3 Check for Custom Prompts

Before pulling the next prompt from the queue, check `build_custom_prompts` for any pending user-injected prompts.

**Where**: At the top of the `while (promptQueue.length > 0)` loop, before `const promptItem = promptQueue.shift()!;`

```typescript
// ──── Check for custom prompts ────
const { data: customPrompts } = await supabase
  .from('build_custom_prompts')
  .select('*')
  .eq('build_id', buildId)
  .eq('status', 'pending')
  .order('created_at');

if (customPrompts && customPrompts.length > 0) {
  const customPrompt = customPrompts[0];

  // Mark as executing
  await supabase.from('build_custom_prompts')
    .update({ status: 'executing', executed_at: new Date().toISOString() })
    .eq('id', customPrompt.id);

  await addLog(supabase, buildId, 'info',
    `Executing custom prompt: ${customPrompt.prompt_title ?? customPrompt.prompt_content.substring(0, 50)}...`,
    'automation');

  // Prepend to queue as a synthetic prompt item
  const syntheticItem = {
    id: customPrompt.id,
    prompt_content: customPrompt.prompt_content,
    title: customPrompt.prompt_title ?? 'Custom Prompt',
    source: 'custom',
    type: 'prompt',
  };

  // If position is 'next', put it at the front; if 'end', push to back
  if (customPrompt.position === 'next') {
    promptQueue.unshift(syntheticItem);
  } else {
    promptQueue.push(syntheticItem);
  }
  totalSteps += 1;
}
```

After the step completes, update the custom prompt status:

```typescript
// After step execution, if this was a custom prompt:
if ((promptItem as any).source === 'custom') {
  await supabase.from('build_custom_prompts')
    .update({
      status: execResult.success ? 'completed' : 'failed',
      step_id: stepRow?.id ?? null,
    })
    .eq('id', promptItem.id);
}
```

### 1.4 Update analysis_completion_pct on build_steps

After the `generate-next-prompt` call (which invokes `analyze-github-code`), if we get completion data, update the step:

```typescript
// After generate-next-prompt returns:
if (nextPromptData?.analysis?.completionPercentage && stepRow?.id) {
  await supabase.from('build_steps').update({
    analysis_result: nextPromptData.analysis,
    analysis_completion_pct: nextPromptData.analysis.completionPercentage,
  }).eq('id', stepRow.id);
}
```

---

## 2. server.ts — New HTTP Endpoints

Add these endpoints inside the `runWebSocket()` method's HTTP request handler, alongside the existing `/api/create-project`, `/api/execute-prompt`, and `/api/start-build` handlers.

### 2.1 GET /api/health

```typescript
if (req.method === 'GET' && urlPath === '/api/health') {
  const diskSpace = await getDiskSpace(); // implement helper below

  const health = {
    status: 'ok',
    uptime: process.uptime(),
    activeBuilds: activeBuildTracker.size, // see section 3
    cursorAgentAvailable: this.cursorAgentAvailable,
    memoryUsage: process.memoryUsage(),
    diskSpace,
    timestamp: new Date().toISOString(),
  };

  res.writeHead(200, { 'Content-Type': 'application/json', ...corsHeaders });
  res.end(JSON.stringify(health));
  return;
}

// Helper function (add as class method or standalone):
async function getDiskSpace(): Promise<{ freeGb: number; totalGb: number } | null> {
  try {
    const { stdout } = await execAsync("df -BG --output=avail,size / | tail -1");
    const parts = stdout.trim().split(/\s+/);
    return {
      freeGb: parseFloat(parts[0]),
      totalGb: parseFloat(parts[1]),
    };
  } catch {
    return null;
  }
}
```

### 2.2 GET /api/builds

Returns list of active builds tracked in memory.

```typescript
if (req.method === 'GET' && urlPath === '/api/builds') {
  const builds = Array.from(activeBuildTracker.values());
  res.writeHead(200, { 'Content-Type': 'application/json', ...corsHeaders });
  res.end(JSON.stringify({
    activeBuilds: builds,
    maxConcurrent: 5,
    available: Math.max(0, 5 - builds.length),
  }));
  return;
}
```

### 2.3 POST /api/builds/:id/preview

Starts a dev server for the build's project.

```typescript
const previewStartMatch = urlPath.match(/^\/api\/builds\/([^/]+)\/preview$/);
if (req.method === 'POST' && previewStartMatch) {
  const buildId = previewStartMatch[1];
  let body = '';
  req.on('data', (chunk) => { body += chunk; });
  req.on('end', async () => {
    try {
      // Look up project path from active tracker or DB
      const buildInfo = activeBuildTracker.get(buildId);
      if (!buildInfo?.projectPath) {
        res.writeHead(404, { 'Content-Type': 'application/json', ...corsHeaders });
        res.end(JSON.stringify({ error: 'Build not found or no project path' }));
        return;
      }

      const result = await appRunner.startPreview(buildId, buildInfo.projectPath);
      res.writeHead(200, { 'Content-Type': 'application/json', ...corsHeaders });
      res.end(JSON.stringify(result));
    } catch (e) {
      res.writeHead(500, { 'Content-Type': 'application/json', ...corsHeaders });
      res.end(JSON.stringify({ error: e instanceof Error ? e.message : 'Internal error' }));
    }
  });
  return;
}
```

### 2.4 DELETE /api/builds/:id/preview

```typescript
const previewStopMatch = urlPath.match(/^\/api\/builds\/([^/]+)\/preview$/);
if (req.method === 'DELETE' && previewStopMatch) {
  const buildId = previewStopMatch[1];
  await appRunner.stopPreview(buildId);
  res.writeHead(200, { 'Content-Type': 'application/json', ...corsHeaders });
  res.end(JSON.stringify({ stopped: true }));
  return;
}
```

### 2.5 Active Build Tracker

Add a module-level tracker that gets updated by `runBuildLoop`:

```typescript
// At the top of server.ts or in a shared module:
const activeBuildTracker = new Map<string, {
  buildId: string;
  projectId: string;
  projectName: string;
  startedAt: string;
  currentStep: number;
  totalSteps: number;
  status: string;
  projectPath: string;
  previewPort?: number;
}>();
```

Pass it to `runBuildLoop` and have the loop update it at each step:

```typescript
// Inside runBuildLoop, after each step:
activeBuildTracker.set(buildId, {
  buildId,
  projectId: config.projectId,
  projectName: config.projectName,
  startedAt: new Date().toISOString(),
  currentStep,
  totalSteps,
  status: 'running',
  projectPath,
});

// On completion/failure:
activeBuildTracker.delete(buildId);
```

---

## 3. New File: build-orchestrator.ts

This is optional but recommended for multi-build management.

```typescript
// scopesflow-mcp-server/build-orchestrator.ts

export class BuildOrchestrator {
  private activeBuilds = new Map<string, { buildId: string; pid?: number; port?: number }>();
  private maxConcurrentBuilds = 5;
  private portRange = { start: 3100, end: 3200 };
  private usedPorts = new Set<number>();

  canStartBuild(): boolean {
    return this.activeBuilds.size < this.maxConcurrentBuilds;
  }

  registerBuild(buildId: string): boolean {
    if (!this.canStartBuild()) return false;
    this.activeBuilds.set(buildId, { buildId });
    return true;
  }

  unregisterBuild(buildId: string): void {
    const build = this.activeBuilds.get(buildId);
    if (build?.port) this.usedPorts.delete(build.port);
    this.activeBuilds.delete(buildId);
  }

  getNextAvailablePort(): number | null {
    for (let port = this.portRange.start; port <= this.portRange.end; port++) {
      if (!this.usedPorts.has(port)) {
        this.usedPorts.add(port);
        return port;
      }
    }
    return null;
  }

  releasePort(port: number): void {
    this.usedPorts.delete(port);
  }

  getActiveCount(): number {
    return this.activeBuilds.size;
  }

  getAll(): { buildId: string; pid?: number; port?: number }[] {
    return Array.from(this.activeBuilds.values());
  }
}
```

---

## 4. New File: app-runner.ts

Manages dev server processes for app previews.

```typescript
// scopesflow-mcp-server/app-runner.ts

import { exec, ChildProcess } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

interface RunningApp {
  buildId: string;
  port: number;
  process: ChildProcess;
  projectPath: string;
}

export class AppRunner {
  private runningApps = new Map<string, RunningApp>();
  private serverHost: string;

  constructor(host = 'mcp.techmakers.dev') {
    this.serverHost = host;
  }

  async startPreview(
    buildId: string,
    projectPath: string,
    port?: number
  ): Promise<{ port: number; url: string }> {
    // Stop existing preview if any
    await this.stopPreview(buildId);

    const assignedPort = port ?? await this.findFreePort();

    // Install deps if needed
    try {
      await execAsync('npm install', { cwd: projectPath, timeout: 120000 });
    } catch (err) {
      console.warn('[AppRunner] npm install failed (continuing):', err);
    }

    // Detect the right dev command
    const devCommand = await this.detectDevCommand(projectPath, assignedPort);

    const proc = exec(devCommand, { cwd: projectPath });

    proc.stdout?.on('data', (data) => {
      console.log(`[Preview ${buildId}] ${data}`);
    });

    proc.stderr?.on('data', (data) => {
      console.error(`[Preview ${buildId}] ${data}`);
    });

    proc.on('exit', (code) => {
      console.log(`[Preview ${buildId}] Process exited with code ${code}`);
      this.runningApps.delete(buildId);
    });

    this.runningApps.set(buildId, {
      buildId,
      port: assignedPort,
      process: proc,
      projectPath,
    });

    // Wait a bit for server to start
    await new Promise(r => setTimeout(r, 3000));

    return {
      port: assignedPort,
      url: `http://${this.serverHost}:${assignedPort}`,
    };
  }

  async stopPreview(buildId: string): Promise<void> {
    const app = this.runningApps.get(buildId);
    if (app) {
      try {
        app.process.kill('SIGTERM');
        // Force kill after 5 seconds
        setTimeout(() => {
          try { app.process.kill('SIGKILL'); } catch {}
        }, 5000);
      } catch {}
      this.runningApps.delete(buildId);
    }
  }

  getRunningApps(): { buildId: string; port: number; projectPath: string }[] {
    return Array.from(this.runningApps.values()).map(a => ({
      buildId: a.buildId,
      port: a.port,
      projectPath: a.projectPath,
    }));
  }

  private async detectDevCommand(projectPath: string, port: number): Promise<string> {
    try {
      const { stdout } = await execAsync('cat package.json', { cwd: projectPath });
      const pkg = JSON.parse(stdout);

      if (pkg.scripts?.dev) {
        // Check if it's vite-based
        if (pkg.devDependencies?.vite || pkg.dependencies?.vite) {
          return `npx vite --port ${port} --host 0.0.0.0`;
        }
        // Next.js
        if (pkg.dependencies?.next) {
          return `npx next dev -p ${port} -H 0.0.0.0`;
        }
        // Generic
        return `PORT=${port} npm run dev`;
      }

      return `npx vite --port ${port} --host 0.0.0.0`;
    } catch {
      return `npx vite --port ${port} --host 0.0.0.0`;
    }
  }

  private async findFreePort(startPort = 3100): Promise<number> {
    const usedPorts = new Set(Array.from(this.runningApps.values()).map(a => a.port));
    for (let p = startPort; p < startPort + 100; p++) {
      if (!usedPorts.has(p)) return p;
    }
    throw new Error('No free ports available');
  }
}
```

---

## 5. Testing Checklist

After making all changes, verify:

### Heartbeat
- [ ] Start a build via the dashboard
- [ ] Query `SELECT last_heartbeat FROM automated_builds WHERE id = '<buildId>'`
- [ ] Confirm `last_heartbeat` updates every ~15 seconds
- [ ] Stop the MCP server — confirm the dashboard shows "Stale" after 60s

### build_steps
- [ ] Start a build and let it run 2-3 steps
- [ ] Query `SELECT * FROM build_steps WHERE build_id = '<buildId>' ORDER BY step_number`
- [ ] Confirm each step has: status, started_at, completed_at, duration_ms, files_changed
- [ ] Confirm the Steps Timeline in the dashboard shows all steps with correct data

### Custom Prompts
- [ ] While a build is running, inject a custom prompt from the dashboard UI
- [ ] Query `SELECT * FROM build_custom_prompts WHERE build_id = '<buildId>'`
- [ ] Confirm the build runner picks it up and executes it
- [ ] Confirm the custom prompt status changes: pending → executing → completed

### Retry Logic
- [ ] Simulate a timeout (set very low timeout on one prompt)
- [ ] Confirm the step shows "retrying" status in the dashboard
- [ ] Confirm retry_count increments in build_steps
- [ ] Confirm the build continues to the next prompt after max retries

### Health Endpoint
- [ ] `curl http://localhost:3001/api/health`
- [ ] Confirm response includes: status, uptime, activeBuilds, cursorAgentAvailable, memoryUsage
- [ ] Confirm the MCP Health Banner in the dashboard shows "Online" with stats

### Preview
- [ ] After a build has at least one step completed, click "Start Preview" in the dashboard
- [ ] Confirm `POST /api/builds/:id/preview` returns a URL
- [ ] Confirm the iframe in the dashboard loads the app
- [ ] Confirm `DELETE /api/builds/:id/preview` stops the server

### Multi-Build
- [ ] Start two builds simultaneously
- [ ] Confirm both show in the Build Command Center
- [ ] Confirm both run concurrently (check `GET /api/builds`)
- [ ] Confirm heartbeats work independently for each build

---

## Summary of Files to Modify/Create

| File | Action | Key Changes |
|------|--------|-------------|
| `build-runner.ts` | **MODIFY** | Heartbeat, build_steps inserts, retry logic, custom prompt checking |
| `server.ts` | **MODIFY** | Add GET /api/health, GET /api/builds, POST/DELETE /api/builds/:id/preview, active build tracker |
| `build-orchestrator.ts` | **CREATE** | Multi-build management, port allocation |
| `app-runner.ts` | **CREATE** | Dev server process management for previews |

---

## Database Tables the MCP Server Now Writes To

| Table | Operations | Purpose |
|-------|-----------|---------|
| `automated_builds` | UPDATE (heartbeat, status) | Heartbeat timestamps, status changes |
| `build_steps` | INSERT, UPDATE | Per-prompt execution tracking |
| `build_logs` | INSERT (already exists) | Structured logs |
| `build_custom_prompts` | SELECT, UPDATE | Read pending prompts, update status |
| `flowchart_items` | UPDATE (already exists) | Mark prompts as implemented |
| `flowchart_connections` | INSERT (already exists) | Link generated prompts |
