/**
 * BuildOrchestrator — Multi-build management, port allocation, and worker session tracking.
 *
 * Tracks concurrent builds, assigns preview ports from a configurable range,
 * and manages per-build worker sessions (PIDs, lifecycle, log files).
 */

import { ChildProcess } from 'child_process';

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
  private portRange = { start: 3100, end: 3200 };
  private usedPorts = new Set<number>();

  constructor(maxConcurrent?: number) {
    this.maxConcurrentBuilds = maxConcurrent ?? parseInt(process.env.MCP_MAX_CONCURRENT_BUILDS || '5', 10);
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
}
