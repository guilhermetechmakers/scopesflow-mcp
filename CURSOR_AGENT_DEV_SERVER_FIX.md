# Cursor Agent "npm run dev" Stuck Fix - ENHANCED

## Problem Identified

Cursor-agent was getting stuck when autonomously deciding to "test the application" by running `npm run dev`, which is a long-running process that never exits.

### Evidence from Logs

```
[Cursor Agent] assistant: "Now let me test the application to make sure everything is working:\n"
[Cursor Agent] tool_call: {"shellToolCall":{"args":{"command":"npm run dev","workingDirectory":"","timeout":300000
[stuck here for 5 minutes until timeout]
```

## Root Cause

1. **Cursor-agent's autonomous behavior**: It was deciding to run `npm run dev` to validate the generated code
2. **Dev servers never exit**: `npm run dev` starts a server that runs indefinitely
3. **5-minute timeout**: Cursor-agent would wait for the full 300-second timeout before continuing
4. **User experience**: Appears "stuck" with no visible progress

## Enhanced Solution Applied

### Multi-Layer Defense Strategy

1. **🚨 Prominent Warning at Top of Prompt** - Uses emojis and visual formatting to grab attention
2. **🔍 Runtime Detection** - Monitors output for dev server attempts
3. **⚡ Automatic Termination** - Kills cursor-agent if dev server detected (10-second grace period)

This ensures cursor-agent sees the instructions FIRST and we catch violations in real-time.

### Changes Made to `server.ts`

#### 1. Prominent Warning at Top of ALL Prompts (lines 839-845, 952-958)

**First Prompts:**
```typescript
⚠️ CRITICAL EXECUTION RULES - READ FIRST ⚠️
❌ NEVER run: npm run dev, npm start, yarn dev, pnpm dev, or ANY development server
❌ NEVER run: long-running processes, servers, or commands that don't exit
❌ NEVER test the application by starting it
✅ ALLOWED: npm install, npm run build, npm run test (if needed)
✅ YOUR TASK: Create/modify files only, then STOP and EXIT immediately
⚠️ The MCP server handles all testing and validation separately
```

**Subsequent Prompts:**
```typescript
⚠️ CRITICAL EXECUTION RULES - READ FIRST ⚠️
❌ NEVER run: npm run dev, npm start, yarn dev, pnpm dev, or ANY development server
❌ NEVER run: long-running processes, servers, or commands that don't exit
❌ NEVER test the application by starting it
✅ ALLOWED: npm install, npm run build, npm run test (if needed)
✅ YOUR TASK: Create/modify files only, then STOP and EXIT immediately
⚠️ The MCP server handles all testing and validation separately
```

#### 2. Runtime Detection in Streaming Method (lines 1703-1715)

```typescript
// ⚠️ DETECT DEV SERVER ATTEMPTS
if (text.match(/npm\s+run\s+dev|npm\s+start|yarn\s+dev|pnpm\s+dev|shellToolCall.*dev/i)) {
  console.error('⚠️⚠️⚠️ [MCP Server] ALERT: cursor-agent is trying to run a dev server!');
  console.error('⚠️⚠️⚠️ [MCP Server] This will cause a 5-minute timeout. Killing in 10 seconds if not stopped...');
  
  // Give cursor-agent 10 seconds to stop on its own, then force kill
  setTimeout(() => {
    if (!childProcess.killed) {
      console.error('⚠️⚠️⚠️ [MCP Server] Force-killing cursor-agent to prevent dev server hang!');
      childProcess.kill('SIGKILL');
    }
  }, 10000);
}
```

## Why This Enhanced Approach Works

### Layer 1: Visual Prominence
- **Emojis and symbols** (⚠️ ❌ ✅) grab AI attention better than plain text
- **Positioned at the very top** - seen before any other instructions
- **Repeated for both first and subsequent prompts** - consistent enforcement

### Layer 2: Runtime Detection
- **Pattern matching** detects attempts to run dev servers in real-time
- **Immediate alerts** to console when violation detected
- **Automatic termination** prevents 5-minute hangs

### Layer 3: Graceful Handling
- **10-second grace period** allows cursor-agent to self-correct
- **Force kill only if needed** - prevents indefinite hangs
- **MCP server validation continues** with proper timeouts

## Expected Behavior After Enhanced Fix

### Scenario 1: Cursor-agent Respects Instructions (Best Case)
```
⚠️ CRITICAL EXECUTION RULES - READ FIRST ⚠️
[Cursor Agent] Creating files...
[Cursor Agent] Files created successfully
✅ Task complete (immediate)
[MCP Server] Validating build...
[MCP Server] Starting dev server check (30s timeout)
✅ Validation complete
```

### Scenario 2: Cursor-agent Attempts Dev Server (Caught by Detection)
```
[Cursor Agent] Creating files...
[Cursor Agent] Testing application...
[Cursor Agent] Running: npm run dev
⚠️⚠️⚠️ [MCP Server] ALERT: cursor-agent is trying to run a dev server!
⚠️⚠️⚠️ [MCP Server] This will cause a 5-minute timeout. Killing in 10 seconds...
⚠️⚠️⚠️ [MCP Server] Force-killing cursor-agent to prevent dev server hang!
[MCP Server] Continuing with validation...
```

### Scenario 3: Old Behavior (Before Fix)
```
[Cursor Agent] Creating files...
[Cursor Agent] Testing application...
[Cursor Agent] Running: npm run dev
[Waiting silently for 5 minutes...]
⏰ Timeout after 300 seconds
❌ Poor user experience
```

## Verification

Build completed successfully:
```bash
✅ npm run build - No errors
✅ TypeScript compilation successful
✅ All linter checks passed
```

## Impact

### Time Savings
- ⏱️ **Eliminates 5-minute waits** per cursor-agent execution
- ⚡ **10-second maximum wait** even if dev server attempted (vs 300 seconds)
- 🚀 **Faster workflow**: Code generation completes immediately after file creation

### User Experience
- 📊 **Clear separation** between code generation and validation
- 🔔 **Visible alerts** if cursor-agent tries to violate rules
- 🛡️ **Automatic protection** against hangs

### Reliability
- ✅ **Multi-layer defense**: Instructions + detection + termination
- 🎯 **Proactive prevention**: Catches violations in real-time
- 💪 **Robust handling**: Graceful with fallbacks

## Testing

To test the fix:

1. **Start the MCP server**: `npm run dev`
2. **Create a new project** using cursor-agent
3. **Observe**: Cursor-agent should complete quickly without running dev server
4. **Verify**: MCP server validation runs with proper timeouts

## Related Files

- `server.ts` - Main fix applied (2 sections updated)
- `CURSOR_AGENT_COMPLETE_FIX_SUMMARY.md` - Previous streaming fixes
- `CURSOR_AGENT_STATUS.md` - Overall cursor-agent integration status

## Status

✅ **ENHANCED FIX DEPLOYED - MULTI-LAYER PROTECTION**

The enhanced fix is now active with:
1. ⚠️ **Visual warnings** at top of all prompts
2. 🔍 **Runtime detection** monitoring for violations
3. ⚡ **Automatic termination** if dev server detected

This provides robust protection against cursor-agent getting stuck on `npm run dev`.

## Important: Restart Required

**If cursor-agent is currently running**, you need to:

1. **Stop the current MCP server** (Ctrl+C)
2. **Kill any existing cursor-agent processes**:
   ```bash
   # Windows (PowerShell)
   Get-Process | Where-Object {$_.ProcessName -like "*cursor*"} | Stop-Process -Force
   
   # Or in WSL
   wsl -d Ubuntu bash -c "pkill -9 cursor-agent"
   ```
3. **Restart the MCP server**:
   ```bash
   npm run dev
   ```

## What Changed from First Fix

| Aspect | First Fix | Enhanced Fix |
|--------|-----------|--------------|
| **Prompt Position** | Bottom of prompt | Top of prompt with emojis |
| **Visual Impact** | Plain text | ⚠️ Emojis and symbols |
| **Detection** | None | Runtime pattern matching |
| **Termination** | Timeout only (5 min) | Force kill (10 sec) |
| **Alerts** | Silent | Visible console warnings |

