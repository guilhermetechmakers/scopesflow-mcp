/**
 * build-worker.ts — Standalone per-build worker process.
 *
 * Spawned by the dispatcher (server.ts) for each build.
 * Reads configuration from environment variables, runs the build loop,
 * then exits with code 0 (success) or 1 (failure).
 *
 * Usage (via tsx):
 *   BUILD_ID=xxx SUPABASE_URL=... SUPABASE_ANON_KEY=... \
 *   MCP_SUPABASE_SERVICE_ROLE_KEY=... tsx build-worker.ts
 *
 * The dispatcher also passes these to the child via env:
 *   SUPABASE_ACCESS_TOKEN  — user JWT (optional when service role key is set)
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import * as dotenv from 'dotenv';
import {
  runBuildFromPayload,
  type ActiveBuildEntry,
  type BuildCursorConfig,
  type BuildExecutePromptArgs,
} from './build-runner.js';

dotenv.config();

const execAsync = promisify(exec);

// ──── Read env ────
const BUILD_ID = process.env.BUILD_ID?.trim();
const SUPABASE_URL = process.env.SUPABASE_URL?.trim();
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY?.trim();
const SUPABASE_ACCESS_TOKEN = process.env.SUPABASE_ACCESS_TOKEN?.trim();
const SERVICE_ROLE_KEY = process.env.MCP_SUPABASE_SERVICE_ROLE_KEY?.trim();

if (!BUILD_ID || !SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.error('[BuildWorker] Missing required env: BUILD_ID, SUPABASE_URL, SUPABASE_ANON_KEY');
  process.exit(1);
}

if (!SUPABASE_ACCESS_TOKEN && !SERVICE_ROLE_KEY) {
  console.error('[BuildWorker] Need at least one of SUPABASE_ACCESS_TOKEN or MCP_SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

// ──── Structured header (no secrets) ────
console.log(JSON.stringify({
  event: 'worker_start',
  buildId: BUILD_ID,
  pid: process.pid,
  timestamp: new Date().toISOString(),
}));

// ──── Minimal "MCP-like" functions for the worker ────
// The worker doesn't run the full CursorMCPServer; instead it provides
// lightweight createProject and executePrompt functions that call
// cursor-agent directly (same logic as server.ts but self-contained).

/** Check if cursor-agent CLI is available. */
async function checkCursorAgent(): Promise<boolean> {
  try {
    const isWindows = process.platform === 'win32';
    const command = isWindows
      ? 'wsl -d Ubuntu bash -c "~/.local/bin/cursor-agent --version"'
      : 'cursor-agent --version';
    const { stdout } = await execAsync(command);
    console.log(`[BuildWorker] cursor-agent detected: ${stdout.trim()}`);
    return true;
  } catch {
    console.warn('[BuildWorker] cursor-agent not available');
    return false;
  }
}

// ──── Main ────
async function main() {
  const hasCursorAgent = await checkCursorAgent();
  if (!hasCursorAgent) {
    console.error('[BuildWorker] Cannot run build without cursor-agent CLI.');
    process.exit(1);
  }

  // Build lightweight createProject / executePrompt fns.
  // For the worker we import the full server dynamically so we can reuse its
  // MCP tool implementations.  However, that file is very large and tightly coupled.
  // Instead, we delegate to runBuildFromPayload which accepts function references.
  // The dispatcher (server.ts) already provides these; the worker needs its own.

  // For now, we use a pass-through: the build runner calls executePromptFn with
  // BuildExecutePromptArgs; we wrap cursor-agent invocation inline.
  // A full "create project" is normally done by the server; in worker mode the
  // build runner's createProjectFn calls into the server's HTTP endpoint.

  // The simplest approach: import the CursorMCPServer class and instantiate it.
  // Since server.ts exports it (or we can import the file), we do that.
  // But server.ts has side effects (it listens on a port).
  // So we use a dynamic import guard.

  // PRAGMATIC APPROACH: the worker calls the *dispatcher's* HTTP endpoints
  // for create-project and execute-prompt, acting as a lightweight HTTP client.
  // This keeps the worker thin and avoids duplicating 6000 lines of server logic.

  const DISPATCHER_URL = process.env.MCP_DISPATCHER_URL?.trim() || `http://localhost:${process.env.MCP_SERVER_PORT || '3001'}`;
  const API_KEY = process.env.MCP_BUILD_API_KEY?.trim();

  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (API_KEY) headers['X-API-Key'] = API_KEY;

  /** Call dispatcher's /api/create-project. */
  const createProjectFn = async (config: BuildCursorConfig): Promise<unknown> => {
    const res = await fetch(`${DISPATCHER_URL}/api/create-project`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        ...config,
        buildId: BUILD_ID,
        projectId: '',
        supabaseUrl: SUPABASE_URL,
        anonKey: SUPABASE_ANON_KEY,
        accessToken: SUPABASE_ACCESS_TOKEN,
        serviceRoleKey: SERVICE_ROLE_KEY,
      }),
    });
    const data = (await res.json()) as Record<string, unknown>;
    if (!res.ok) throw new Error((data.error as string) || 'create-project failed');
    return { content: [{ type: 'text', text: JSON.stringify(data) }] };
  };

  /** Call dispatcher's /api/execute-prompt. */
  const executePromptFn = async (args: BuildExecutePromptArgs): Promise<unknown> => {
    const res = await fetch(`${DISPATCHER_URL}/api/execute-prompt`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        prompt: args.prompt,
        projectPath: args.projectPath,
        timeout: args.timeout,
        context: args.context,
        files: args.files,
        gitHubToken: args.gitHubToken,
        gitUserName: args.gitUserName,
        gitUserEmail: args.gitUserEmail,
        gitRepository: args.gitRepository,
        isFirstPrompt: args.isFirstPrompt,
        retryCount: args.retryCount,
        isRetry: args.isRetry,
        userId: args.userId,
        buildId: args.buildId,
        model: args.model,
        cursorApiKey: args.cursorApiKey,
        supabaseUrl: SUPABASE_URL,
        anonKey: SUPABASE_ANON_KEY,
        accessToken: SUPABASE_ACCESS_TOKEN,
        serviceRoleKey: SERVICE_ROLE_KEY,
      }),
    });
    const data = (await res.json()) as Record<string, unknown>;
    if (!res.ok && !data.success) {
      return { content: [{ type: 'text', text: JSON.stringify({ success: false, error: (data.error as string) || 'execute-prompt failed' }) }] };
    }
    return { content: [{ type: 'text', text: JSON.stringify(data) }] };
  };

  // In-memory tracker (only this build)
  const activeBuildTracker = new Map<string, ActiveBuildEntry>();

  try {
    await runBuildFromPayload({
      buildId: BUILD_ID!,
      supabaseUrl: SUPABASE_URL!,
      accessToken: SUPABASE_ACCESS_TOKEN || '',
      anonKey: SUPABASE_ANON_KEY!,
      supabaseServiceRoleKey: SERVICE_ROLE_KEY,
      createProjectFn,
      executePromptFn,
      activeBuildTracker,
    });

    console.log(JSON.stringify({
      event: 'worker_done',
      buildId: BUILD_ID,
      pid: process.pid,
      result: 'completed',
      timestamp: new Date().toISOString(),
    }));
    process.exit(0);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(JSON.stringify({
      event: 'worker_done',
      buildId: BUILD_ID,
      pid: process.pid,
      result: 'failed',
      error: message,
      timestamp: new Date().toISOString(),
    }));
    process.exit(1);
  }
}

main();
