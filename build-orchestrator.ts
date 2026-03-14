/**
 * BuildOrchestrator — Multi-build management, port allocation, and worker session tracking.
 *
 * Tracks concurrent builds, assigns preview ports from a configurable range,
 * and manages per-build worker sessions (PIDs, lifecycle, log files).
 */

import { ChildProcess } from 'child_process';
import type { SupabaseClient } from '@supabase/supabase-js';

/** Metadata for a running worker session. */
export interface WorkerSession {
  buildId: string;
  pid: number;
  process: ChildProcess;
  startedAt: string;
  logFile?: string;
  errFile?: string;
  /** Port assigned for app preview (if any). */
  port?: number;
}

export class BuildOrchestrator {
  private activeBuilds = new Map<string, { buildId: string; pid?: number; port?: number }>();
  private workerSessions = new Map<string, WorkerSession>();
  private maxConcurrentBuilds: number;
  private portRange: { start: number; end: number };
  private usedPorts = new Set<number>();

  constructor(maxConcurrent?: number) {
    const parsedMax = parseInt(process.env.MCP_MAX_CONCURRENT_BUILDS || '5', 10);
    this.maxConcurrentBuilds = maxConcurrent ?? (Number.isFinite(parsedMax) && parsedMax > 0 ? parsedMax : 5);

    const parsedStart = parseInt(process.env.MCP_PREVIEW_PORT_START || '3100', 10);
    const parsedEnd = parseInt(process.env.MCP_PREVIEW_PORT_END || '3200', 10);
    if (Number.isFinite(parsedStart) && Number.isFinite(parsedEnd) && parsedStart > 0 && parsedEnd >= parsedStart) {
      this.portRange = { start: parsedStart, end: parsedEnd };
    } else {
      this.portRange = { start: 3100, end: 3200 };
    }
  }

  // ──── Build slot management ────

  canStartBuild(): boolean {
    return this.workerSessions.size < this.maxConcurrentBuilds;
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

  // ──── Port allocation ────

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

  // ──── Worker session management ────

  /** Register a newly spawned worker process. */
  registerWorker(session: WorkerSession): void {
    this.workerSessions.set(session.buildId, session);
  }

  /** Remove a worker session (on exit/cleanup). */
  unregisterWorker(buildId: string): void {
    const session = this.workerSessions.get(buildId);
    if (session?.port) this.usedPorts.delete(session.port);
    this.workerSessions.delete(buildId);
    this.activeBuilds.delete(buildId);
  }

  /** Get a specific worker session by buildId. */
  getWorkerSession(buildId: string): WorkerSession | undefined {
    return this.workerSessions.get(buildId);
  }

  /** Terminate a running worker (SIGTERM then SIGKILL). */
  async stopWorker(buildId: string): Promise<boolean> {
    const session = this.workerSessions.get(buildId);
    if (!session) return false;

    try {
      session.process.kill('SIGTERM');
      // Force kill after 10 seconds
      await new Promise<void>((resolve) => {
        const timer = setTimeout(() => {
          try { session.process.kill('SIGKILL'); } catch { /* already dead */ }
          resolve();
        }, 10_000);

        session.process.on('exit', () => {
          clearTimeout(timer);
          resolve();
        });
      });
    } catch {
      // Process already dead
    }

    this.unregisterWorker(buildId);
    return true;
  }

  // ──── Queries ────

  getActiveCount(): number {
    return this.workerSessions.size;
  }

  getAll(): { buildId: string; pid?: number; port?: number }[] {
    return Array.from(this.activeBuilds.values());
  }

  /** List all running worker sessions (for /api/sessions). */
  getAllSessions(): Array<{
    buildId: string;
    pid: number;
    startedAt: string;
    uptimeSeconds: number;
    logFile?: string;
  }> {
    const now = Date.now();
    return Array.from(this.workerSessions.values()).map((s) => ({
      buildId: s.buildId,
      pid: s.pid,
      startedAt: s.startedAt,
      uptimeSeconds: Math.round((now - new Date(s.startedAt).getTime()) / 1000),
      logFile: s.logFile,
    }));
  }

  /** Clean up zombie sessions whose process has already exited. */
  reapDeadWorkers(): number {
    let reaped = 0;
    for (const [buildId, session] of this.workerSessions) {
      if (session.process.exitCode !== null || session.process.killed) {
        this.unregisterWorker(buildId);
        reaped++;
      }
    }
    return reaped;
  }

  /**
   * Start periodic liveness monitoring.
   * Checks each active worker's heartbeat in the database. If a running build
   * hasn't heartbeated in > STALL_THRESHOLD_MS, the worker is force-killed and
   * the build marked as failed.
   */
  startLivenessMonitor(supabase: SupabaseClient, intervalMs = 60_000): NodeJS.Timeout {
    const STALL_THRESHOLD_MS = 180_000; // 3 minutes

    return setInterval(async () => {
      // Also reap already-dead processes
      this.reapDeadWorkers();

      for (const [buildId, session] of this.workerSessions) {
        try {
          const { data } = await supabase
            .from('automated_builds')
            .select('last_heartbeat, status')
            .eq('id', buildId)
            .single();

          if (data?.status === 'running' && data.last_heartbeat) {
            const age = Date.now() - new Date(data.last_heartbeat).getTime();
            if (age > STALL_THRESHOLD_MS) {
              console.error(
                `[Orchestrator] Worker ${buildId} (pid ${session.pid}) stalled ` +
                `(heartbeat ${Math.round(age / 1000)}s ago). Killing.`
              );
              await this.stopWorker(buildId);
              await supabase.from('automated_builds').update({
                status: 'failed',
                error_message: `Build stalled — no heartbeat for ${Math.round(age / 1000)}s. Automatically terminated.`,
                completed_at: new Date().toISOString(),
              }).eq('id', buildId);
            }
          }
        } catch {
          // Non-blocking — continue checking other workers
        }
      }
    }, intervalMs);
  }
}
