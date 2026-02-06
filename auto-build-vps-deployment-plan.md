# Auto Build — VPS Deployment Plan (Server-to-Server Trigger)

This document describes the specific changes required to make **Auto Build** work when the app is deployed and the MCP runs on a **Hostinger VPS**. The trigger to start a build moves from the **browser** to the **Supabase Edge Function**, so the client never calls the MCP directly.

---

## Overview

| Layer | Role |
|-------|------|
| **App (client)** | Calls only `build-automation-start` Edge Function; no direct call to MCP. |
| **Supabase Edge Function** | Creates build row, then calls MCP public URL to start the runner. |
| **MCP (VPS)** | Exposed over HTTPS; receives start-build from Edge Function; runs build loop. |
| **Hostinger VPS** | Node + nginx + SSL + process manager; firewall and DNS. |

---

## 1. App (idea-flow-nectar frontend)

### 1.1 `src/services/buildAutomationService.ts`

**Current behavior:** After calling the Edge Function, the client calls `fetch(MCP_BUILD_API_URL + '/api/start-build', ...)`.

**Required change:**

- **Remove** the entire `fetch` block that calls the MCP (the `try { const res = await fetch(...) } catch ...` block).
- **Keep** only:
  1. Get session.
  2. Call `supabase.functions.invoke('build-automation-start', { body: { config }, headers: { Authorization } })`.
  3. If success, return `startData.buildId`.
  4. If the Edge Function returns an error (e.g. "MCP unreachable"), surface that message to the user; do **not** retry the MCP from the client.

**Optional (recommended):**

- Keep `MCP_BUILD_API_URL` (or rename to e.g. `VITE_MCP_BUILD_API_URL`) only for **local development**: when set (e.g. `http://localhost:3001`), the client can still call the MCP directly so you can test without deploying the Edge Function change. When unset (or in production build), the client **only** calls the Edge Function. So: if `VITE_MCP_BUILD_API_URL` is set, do the current fetch; else, only call the Edge Function and return `buildId`. That way production never needs the env var.

**Exact scope of removal (conceptual):**

- Delete the `try { fetch(...MCP_BUILD_API_URL...) } catch` block.
- After `if (!buildId) throw ...`, simply `return buildId;`.
- Optionally: if `startData?.mcpTriggerError` exists (see Edge Function section), show a toast or message that the build was created but the runner could not be started.

### 1.2 Environment variables

- **Production / Hostinger-deployed app:** Do **not** set `VITE_MCP_BUILD_API_URL`. The app must only call the Edge Function.
- **Local dev (optional):** Set `VITE_MCP_BUILD_API_URL=http://localhost:3001` if you want the client to trigger the MCP directly when testing locally.

### 1.3 No other app changes

- Stop build, progress, logs, and Realtime subscription stay as they are (they use Supabase only).

---

## 2. Supabase Edge Function: `build-automation-start`

**File:** `supabase/functions/build-automation-start/index.ts`

### 2.1 New secret

- In **Supabase Dashboard** → **Project Settings** → **Edge Functions** → **Secrets**, add:
  - **Name:** `MCP_BUILD_API_URL`
  - **Value:** Your MCP public URL, e.g. `https://mcp.yourdomain.com` (no trailing slash, no path).

Optional (recommended for production):

- **Name:** `MCP_BUILD_API_KEY`
  - **Value:** A long random string (e.g. `openssl rand -hex 32`). The Edge Function will send this in a header; the MCP will verify it and reject requests without it.

### 2.2 Logic changes in the function

After the successful `insert` into `automated_builds` (and before `return new Response(JSON.stringify({ buildId }), ...)`):

1. **Read** `const mcpBaseUrl = Deno.env.get('MCP_BUILD_API_URL')?.trim();`
2. **If** `mcpBaseUrl` is missing or empty, log a warning and return `{ buildId }` as today (build row exists; runner not triggered).
3. **Otherwise**, call the MCP:
   - URL: `${mcpBaseUrl}/api/start-build`
   - Method: `POST`
   - Headers:
     - `Content-Type: application/json`
     - If `MCP_BUILD_API_KEY` is set: `X-API-Key: <value>`
   - Body (JSON):  
     `{ buildId, supabaseUrl: SUPABASE_URL, accessToken: token, anonKey: supabaseAnonKey }`
4. Use `fetch()` (Deno supports it). Do **not** await longer than e.g. 15–30 seconds; use `AbortController` if needed.
5. **If** the request fails (network error, non-2xx status):
   - Log the error (and status/body if available).
   - Still return `{ buildId }` so the client can show the build and see “pending” or a message that the runner did not start. Optionally return `{ buildId, mcpTriggerError: "Runner could not be started" }` so the client can show a toast.
6. **If** the request succeeds (2xx), return `{ buildId }` as today.

**Important:** Do not expose the user’s `accessToken` in logs. Log only “MCP trigger failed” and status code.

### 2.3 CORS

- No change: keep existing CORS headers on all responses.

---

## 3. MCP server (scopesflow-mcp-server)

### 3.1 Optional: API key check for `/api/start-build`

**File:** `server.ts` (inside the `POST /api/start-build` branch).

- Read env: `const apiKey = process.env.MCP_BUILD_API_KEY;`
- If `apiKey` is set:
  - Read header: `req.headers['x-api-key']` (or `authorization` if you prefer).
  - If the header does not match `apiKey`, respond with `401` and do not call `runBuild`.
- If `apiKey` is not set, skip the check (backward compatible for local dev).

### 3.2 CORS for POST response (optional)

- Currently only OPTIONS sends CORS. If you ever call the MCP from the browser again (e.g. local dev), add to the **POST** response for `/api/start-build`:
  - `Access-Control-Allow-Origin: *` (or your app origin).
- For server-to-server (Edge Function → MCP), CORS is not required.

### 3.3 Bind address on VPS

- When running on the VPS, the server must listen on `0.0.0.0` so nginx (or external clients) can reach it.
- **Environment variable:** Set `MCP_SERVER_HOST=0.0.0.0` in the process that runs the MCP (e.g. in your systemd unit or PM2 env).
- **Port:** Keep `MCP_SERVER_PORT=3001` (or your chosen port) so nginx can proxy to `http://127.0.0.1:3001`.

### 3.4 Summary of MCP changes

| Item | Action |
|------|--------|
| API key | Optional: enforce `MCP_BUILD_API_KEY` on `/api/start-build` when set. |
| Host | Use `MCP_SERVER_HOST=0.0.0.0` on VPS. |
| Port | Keep 3001 (or set via `MCP_SERVER_PORT`). |
| CORS | Optional: add CORS header on POST response for browser clients. |
| Build config | Merge start-build payload (`supabaseUrl`, `anonKey`) into the in-memory build config before `create-project`. Use anon key for `.env` values (Vite/Expo). Do not persist or log full keys. |

---

## 4. Hostinger VPS setup

Assumptions: you have a Hostinger VPS (Linux), SSH access, and a domain (or subdomain) pointing to the VPS IP for the MCP, e.g. `mcp.yourdomain.com`.

### 4.1 System preparation

- Update packages, e.g. `sudo apt update && sudo apt upgrade -y`.
- Install Node.js (v18 or v20 LTS), e.g. via NodeSource or `nvm`.
- Install npm (comes with Node). Ensure `node` and `npm` are in PATH for the user that will run the MCP.

### 4.2 Firewall

- **Option A — nginx on 80/443 only (recommended):**  
  Open only ports **80** and **443**. Do **not** open 3001 to the internet. Nginx will proxy to `localhost:3001`.
- **Option B — direct port 3001:**  
  Open **3001** (and optionally 80/443 for nginx). Simpler but exposes the MCP directly; use only if you don’t use nginx.
- On Hostinger, use their **Firewall** / **Security** panel to allow the chosen ports. If using `ufw`:  
  `sudo ufw allow 80 && sudo ufw allow 443 && sudo ufw enable` (and optionally 3001).

### 4.3 Nginx (reverse proxy + HTTPS)

- Install nginx: `sudo apt install nginx -y`.
- Create a server block for the MCP subdomain, e.g. `/etc/nginx/sites-available/mcp`:

```nginx
server {
    listen 80;
    server_name mcp.yourdomain.com;

    location / {
        proxy_pass http://127.0.0.1:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 86400;
    }
}
```

- Enable the site: `sudo ln -s /etc/nginx/sites-available/mcp /etc/nginx/sites-enabled/` and run `sudo nginx -t`, then `sudo systemctl reload nginx`.

### 4.4 SSL with Let’s Encrypt (Certbot)

- Install certbot and the nginx plugin:  
  `sudo apt install certbot python3-certbot-nginx -y`
- Obtain a certificate:  
  `sudo certbot --nginx -d mcp.yourdomain.com`
- Certbot will adjust the nginx config to listen on 443 and serve the certificate. Ensure port 443 is allowed in the firewall.

### 4.5 Run the MCP as a service (PM2)

- Install PM2 globally: `npm install -g pm2`.
- On the VPS, clone or upload the `scopesflow-mcp-server` project (e.g. under `/var/www/scopesflow-mcp-server` or your preferred path).
- In that directory: `npm install` and `npm run build` (if you have a build step).
- Create an ecosystem file, e.g. `ecosystem.config.cjs`:

```javascript
module.exports = {
  apps: [{
    name: 'scopesflow-mcp',
    script: 'server.ts',
    interpreter: 'node',
    interpreter_args: '--import tsx',
    cwd: '/var/www/scopesflow-mcp-server',
    env: {
      NODE_ENV: 'production',
      MCP_SERVER_PORT: '3001',
      MCP_SERVER_HOST: '0.0.0.0',
      MCP_BUILD_API_KEY: 'your-long-random-secret-here',
    },
    instances: 1,
    autorestart: true,
    watch: false,
  }],
};
```

- Or run with tsx: `script: 'node_modules/.bin/tsx', args: 'server.ts'`, and set env in `env` or in a `.env` file (do not commit secrets).
- Start: `pm2 start ecosystem.config.cjs`.
- Save process list: `pm2 save`.
- Enable startup on boot: `pm2 startup` (run the command it prints).

### 4.6 DNS (Hostinger / domain provider)

- Create an **A** record for `mcp.yourdomain.com` (or your chosen subdomain) pointing to the VPS public IP.
- Wait for propagation; then confirm: `curl -I https://mcp.yourdomain.com` and that nginx and the MCP respond as expected.

### 4.7 Hostinger-specific notes

- **VPS panel:** Use Hostinger’s VPS control panel to open ports 80 and 443 (and 22 for SSH) if the panel overrides the OS firewall.
- **One-click apps:** If Hostinger offers Node or nginx one-click installs, you can use those; then add the nginx server block and PM2 steps above.
- **Backups:** Consider backing up the MCP app directory and any `.env` (without committing secrets to git).

---

## 5. End-to-end checklist

| Step | Where | Action |
|------|--------|--------|
| 1 | App | Remove client-side fetch to MCP in `buildAutomationService.ts`; only call Edge Function. |
| 2 | App | Ensure production build does not require `VITE_MCP_BUILD_API_URL`. |
| 3 | Supabase | Add secret `MCP_BUILD_API_URL` = `https://mcp.yourdomain.com`. |
| 4 | Supabase | Add secret `MCP_BUILD_API_KEY` (optional but recommended). |
| 5 | Edge Function | After insert, call MCP URL with buildId, supabaseUrl, accessToken, anonKey; handle errors and still return buildId. |
| 6 | MCP | Optional: validate `X-API-Key` when `MCP_BUILD_API_KEY` is set. |
| 7 | MCP | On VPS, run with `MCP_SERVER_HOST=0.0.0.0`. |
| 8 | VPS | Install Node, nginx; open 80/443; do not open 3001 publicly. |
| 9 | VPS | Nginx server block for `mcp.yourdomain.com` → `proxy_pass http://127.0.0.1:3001`. |
| 10 | VPS | Certbot for SSL on `mcp.yourdomain.com`. |
| 11 | VPS | Run MCP with PM2 (or systemd); set `MCP_BUILD_API_KEY` to match Supabase secret. |
| 12 | DNS | A record for `mcp.yourdomain.com` → VPS IP. |

---

## 6. Verification

1. **From the app:** Start a build. The client should only call the Edge Function and get a `buildId` back.
2. **Edge Function logs (Supabase Dashboard → Edge Functions → Logs):** Confirm a POST to `https://mcp.yourdomain.com/api/start-build` and 200 response (or log the error if it fails).
3. **VPS:** `pm2 logs scopesflow-mcp` (or your app name) should show the build starting and logs from the runner.
4. **Supabase DB:** The row in `automated_builds` should move from `pending` to `running` and then `completed` or `failed`; `build_logs` should fill for that build.
5. **App:** Progress and logs should update via Realtime or polling without the client ever calling the MCP.

---

## 7. Security summary

- The **browser** never sees or calls the MCP URL; it only calls Supabase.
- **Secrets** (MCP URL and optional API key) live in Supabase Edge Function secrets and in the MCP env on the VPS; they are not in the frontend bundle.
- **HTTPS** end-to-end: App → Supabase (HTTPS), Supabase → MCP (HTTPS via nginx + Certbot).
- **Optional API key** ensures only your Edge Function can trigger builds on the MCP.

If you want, the next step can be implementing the app and Edge Function code changes (client fetch removal and Edge Function MCP call) in the repo.
