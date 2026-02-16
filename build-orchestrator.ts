/**
 * BuildOrchestrator — Multi-build management and port allocation.
 *
 * Tracks concurrent builds and assigns preview ports from a configurable range.
 */

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
