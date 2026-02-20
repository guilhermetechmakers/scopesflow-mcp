# Deploy New MCP Endpoints (/api/create-project and /api/execute-prompt)

## Quick Deployment Steps

The MCP server at `mcp.techmakers.dev` needs to be updated with the new endpoints.

### 1. Deploy Updated Code

**Option A: Using Git (if VPS has repo clone)**
```bash
# On your local machine, commit and push changes
git add scopesflow-mcp-server/server.ts
git commit -m "Add /api/create-project and /api/execute-prompt endpoints"
git push

# On the VPS
cd ~/scopesflow-mcp  # or wherever your MCP server is
git pull
npm install  # in case dependencies changed
pm2 restart scopesflow-mcp
```

**Option B: Using rsync/scp**
```bash
# From your local machine (repo root)
rsync -avz --delete ./scopesflow-mcp-server/ user@mcp.techmakers.dev:~/scopesflow-mcp/

# Then SSH to VPS and restart
ssh user@mcp.techmakers.dev
cd ~/scopesflow-mcp
npm install
pm2 restart scopesflow-mcp
```

### 2. Verify Deployment

Check PM2 logs:
```bash
pm2 logs scopesflow-mcp --lines 30
```

You should see on startup:
```
ScopesFlow Cursor MCP Server on ws://0.0.0.0:3001
HTTP endpoints:
  POST http://0.0.0.0:3001/api/create-project
  POST http://0.0.0.0:3001/api/execute-prompt
  POST http://0.0.0.0:3001/api/start-build
```

### 3. Test Endpoints

Test the new endpoint:
```bash
curl -X POST https://mcp.techmakers.dev/api/create-project \
  -H "Content-Type: application/json" \
  -d '{"test": "connection"}'
```

Should return a 400 (missing fields) instead of 404, confirming the endpoint exists.

### 4. Check Environment Variables

Ensure these are set on the VPS:
```bash
# Check if set
echo $MCP_BUILD_API_KEY  # Optional, for API key auth
```

If using API key authentication, set it:
```bash
export MCP_BUILD_API_KEY="your-secret-key"
# Or add to PM2 ecosystem.config.cjs env section
```

### Troubleshooting

**If still getting 404:**
1. Verify `server.ts` has the new route handlers (lines ~1622, ~1743)
2. Check PM2 is running the updated code: `pm2 describe scopesflow-mcp` shows the script path
3. Check logs for route matching: `pm2 logs scopesflow-mcp` should show `[MCP Server] HTTP request: POST /api/create-project`

**If getting 401 Unauthorized:**
- Check `MCP_BUILD_API_KEY` matches between Supabase Edge Function env and MCP server env
- Or remove API key requirement temporarily for testing

**If getting 400 Bad Request:**
- This is progress! The endpoint exists but payload is invalid
- Check the edge function is sending all required fields
