# Deploy MCP server to VPS (full build runner)

The VPS must run **this repo’s** `server.ts` and `build-runner.ts`. If you still see `[MCP Server] Build started (runner stub)` in `pm2 logs`, the VPS is running old code and never runs the real build.

## 1. Files that must be on the VPS

From **idea-flow-nectar** (this repo), the `scopesflow-mcp-server` folder must be deployed as-is. At minimum, these must be the versions from this repo:

- **server.ts** – HTTP handler for `POST /api/start-build` must call `this.runBuild()` and then send 200. No “runner stub” log.
- **build-runner.ts** – `runBuildLoop()` used by `runBuild()`.
- **handlers/** – used by server (projectOverview, scopeSlice, etc.).
- **package.json**, **tsconfig.json**, **ecosystem.config.cjs** – so install and PM2 work.

## 2. Deploy steps (on your machine)

From the repo root:

```bash
# Option A: VPS has a clone of idea-flow-nectar
rsync -avz --delete ./scopesflow-mcp-server/ user@your-vps:~/scopesflow-mcp/

# Option B: Or copy the whole scopesflow-mcp-server folder via git/scp
```

## 3. On the VPS

```bash
cd ~/scopesflow-mcp
git pull   # if you deploy by git; otherwise files are already there from rsync/scp
npm install
pm2 restart scopesflow-mcp
```

## 4. Confirm full runner is running

```bash
pm2 logs scopesflow-mcp --lines 20
```

You should see on startup:

- `ScopesFlow Cursor MCP Server running on http://0.0.0.0:3001 ...`
- **`[MCP Server] Full build runner enabled (POST /api/start-build → runBuild → runBuildLoop)`**  
  If this line is missing, the process is still running old `server.ts`.

When you start a build from the app, you should then see:

- `[MCP Server] POST /api/start-build received`
- `[MCP Server] start-build payload: buildId= ... supabaseUrl= ***`
- `[MCP Server] runBuild started for buildId: ...`
- `[MCP Server] Scheduling build loop for buildId: ...`
- `[Build Runner] runBuildLoop started for buildId: ...`

If you still see only **`Build started (runner stub)`**, the running code is still the old one: re-copy `server.ts` from this repo and restart PM2.
