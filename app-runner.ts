/**
 * AppRunner — Manages dev server processes for app previews.
 *
 * Starts/stops preview servers (Next.js, Vite, etc.) for builds and
 * tracks running processes with automatic cleanup.
 */

import { exec, ChildProcess } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs/promises';
import * as path from 'path';

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

    // Wait for server to start
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
          try { app.process.kill('SIGKILL'); } catch { /* already dead */ }
        }, 5000);
      } catch { /* already dead */ }
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
      const pkgContent = await fs.readFile(path.join(projectPath, 'package.json'), 'utf-8');
      const pkg = JSON.parse(pkgContent);

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
