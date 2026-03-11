# MCP Unexpected Restarts Fix (PM2 Watch + Build Paths)

> Date: 2026-03-10  
> Scope: `scopesflow-mcp-server` running under PM2

## Problem
The MCP process stops mid-build and then comes back only after a resume. In logs, the stop happens immediately after Cursor Agent edits files under `cursor-projects/...`, and PM2 reports a SIGINT stop.

## Root Cause
PM2 watch mode (or any file watcher) restarts the process when files change under the MCP working directory. The Cursor Agent writes project files inside the repo (for example `cursor-projects/...`), so any edit triggers a restart.

By default, build output paths are derived from `process.cwd()` when `MCP_BUILD_PROJECTS_DIR` is not set, which keeps generated projects inside the repo. See `scopesflow-mcp-server/build-runner.ts` where `baseDir` falls back to `process.cwd()`.

## Fix (Recommended)
1. Keep PM2 watch disabled for the MCP process.
2. Move generated projects outside the repo by setting `MCP_BUILD_PROJECTS_DIR`.
3. If watch must stay enabled, ignore build output directories.

## Implementation Steps
1. Ensure PM2 is not started with `--watch`.
2. Update `scopesflow-mcp-server/ecosystem.config.cjs` to set `MCP_BUILD_PROJECTS_DIR` and add ignore rules.
3. Restart the process with PM2.
4. If existing builds use paths inside `cursor-projects` or `builds`, update those rows (or restart the build with the new path).

## Example PM2 Config

```js
const path = require('path');

module.exports = {
  apps: [{
    name: 'scopesflow-mcp',
    script: 'dist/server.js',
    interpreter: 'node',
    cwd: path.resolve(__dirname),
    env: {
      NODE_ENV: 'production',
      MCP_SERVER_PORT: '3001',
      MCP_SERVER_HOST: '0.0.0.0',
      MCP_USE_BUILD_WORKERS: 'true',
      MCP_HEADLESS: 'true',
      MCP_BUILD_LOG_TYPE_INFO: 'build_log',
      MCP_BUILD_LOG_TYPE_ERROR: 'build_log',
      MCP_BUILD_PROJECTS_DIR: '/var/scopesflow/projects'
    },
    instances: 1,
    autorestart: true,
    max_restarts: 10,
    min_uptime: '10s',
    watch: false,
    ignore_watch: [
      'cursor-projects',
      'builds',
      'node_modules',
      '.git',
      'dist',
      'supabase'
    ]
  }]
};
```

## Validation
1. Start a build and confirm file edits happen under `/var/scopesflow/projects` (or your chosen path).
2. Check `pm2 logs scopesflow-mcp` during a running build and confirm there is no "Stopping app" message.
3. Verify `pm2 describe scopesflow-mcp` shows `watch: disabled` (or the ignore list is active).

## Notes
- If you need hot-reload during development, run a separate dev process. Keep the production PM2 process non-watching.
- This change does not affect the build logic; it only prevents restarts caused by file writes in the repo.
