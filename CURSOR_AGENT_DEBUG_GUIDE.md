# Cursor Agent Debug Guide

## Current Issue

The cursor-agent is starting but producing **no output**. The logs show an incorrect command being executed.

### What We're Seeing

From your logs (line 510):
```bash
~/.local/bin/ce --model auto
```

### What It Should Be

```bash
~/.local/bin/cursor-agent --print --output-format text --force --model auto
```

## Problems Identified

1. ❌ Binary name is wrong: `ce` instead of `cursor-agent`
2. ❌ Missing flags: `--print --output-format text --force`
3. ❌ Only has: `--model auto`

## What We Verified

From WSL (your binaries):
```bash
~/.local/bin/
├── agent
├── cursor  
└── cursor-agent -> /home/guilmeira/.local/share/cursor-agent/versions/2025.10.02-bd871ac/cursor-agent
```

✅ `cursor-agent` exists and is properly symlinked  
❌ `ce` does NOT exist

## Latest Changes Applied

### 1. Added Command Construction Logging

**Location**: `server.ts` lines 1118, 1125

Added immediate logging right after command is constructed:
```typescript
command = `wsl -d Ubuntu bash -c "cd '${wslProjectPath}' && cat '${wslPromptFile}' | ~/.local/bin/cursor-agent --print --output-format text --force --model auto"`;
console.log(`[MCP Server] 🔍 Command constructed (Windows): ${command}`);
```

### 2. Added Command Parsing Logging

**Location**: `server.ts` lines 756-767

Added detailed logging in the streaming method:
```typescript
console.log(`[MCP Server] 🔍 Parsing WSL command...`);
console.log(`[MCP Server] Command to parse: ${command}`);
// ... parse logic
console.log(`[MCP Server] 🔧 Extracted bash command: ${bashCommand}`);
```

### 3. Added Diagnostic Test (NEW!)

**Location**: `server.ts` lines 1180-1207

Before running the full prompt, tests cursor-agent with simple input:
```typescript
// Test with simple "test prompt" input
const testCommand = 'wsl -d Ubuntu bash -c "echo \'test prompt\' | ~/.local/bin/cursor-agent --print --output-format text --force --model auto"';
const testResult = await execAsync(testCommand, { timeout: 30000 });
console.log(`[MCP Server] ✅ Diagnostic test PASSED`);
console.log(`[MCP Server] 📋 Test output: ${testResult.stdout.substring(0, 200)}`);
```

This will immediately show if cursor-agent is working at all!

### 4. Added Heartbeat Logging (NEW!)

**Location**: `server.ts` lines 789-800

Logs every 10 seconds to show cursor-agent is still alive:
```typescript
setInterval(() => {
  console.log(`[MCP Server] 💓 Heartbeat: cursor-agent still running (45.2s / 0.8m), PID: 12345`);
}, 10000);
```

This proves the process hasn't hung, even if cursor-agent produces no output.

## Next Steps to Debug

### Step 1: Restart Server Completely

**CRITICAL**: You must restart the MCP server to pick up the new code:

1. Stop the current server (Ctrl+C in the terminal where it's running)
2. Wait for it to fully stop
3. Run: `npm run dev`

### Step 2: Watch for New Logs

When you create a new project, you should now see:

```
[MCP Server] 🔍 Command constructed (Windows): wsl -d Ubuntu bash -c "cd '/mnt/...' && cat '...' | ~/.local/bin/cursor-agent --print --output-format text --force --model auto"
[MCP Server] ========================================
[MCP Server] 🚀 Starting cursor-agent process...
[MCP Server] Full command: wsl -d Ubuntu bash -c "..."
[MCP Server] 🔍 Parsing WSL command...
[MCP Server] Command to parse: wsl -d Ubuntu bash -c "..."
[MCP Server] 🔧 Extracted bash command: cd '/mnt/...' && cat '...' | ~/.local/bin/cursor-agent --print --output-format text --force --model auto
[MCP Server] ✅ Process spawned with PID: 12345
[MCP Server] ✅ stdout and stderr streams are available
```

### Step 3: If Still Shows `ce`

If you still see `ce` in the logs, this means:

**Possibility 1**: Old server process still running
- Check for multiple node/tsx processes: `Get-Process | Where-Object {$_.Name -like "*node*" -or $_.Name -like "*tsx*"}`
- Kill all: `Stop-Process -Name node,tsx -Force`
- Restart: `npm run dev`

**Possibility 2**: Bash alias in WSL
- Test manually: `wsl -d Ubuntu bash -c "type cursor-agent"`
- Check aliases: `wsl -d Ubuntu bash -c "alias | grep cursor"`

**Possibility 3**: Source file corruption
- Verify line 1117: `Get-Content server.ts | Select-Object -Index 1116`
- Should contain: `cursor-agent --print --output-format text --force`

## Expected Behavior After Fix

Once the correct command runs:

```
[MCP Server] ✅ Process spawned with PID: 52304
[MCP Server] ✅ stdout and stderr streams are available
[MCP Server] 📥 Received 128 bytes on stdout
[cursor-agent | 2.3s] Analyzing project structure...
[cursor-agent | 5.4s] Reading existing files...
[cursor-agent | 10.2s] Generating component code...
[cursor-agent | 15.7s] Writing files...
[MCP Server] 📭 stdout stream ended
[MCP Server] 🏁 cursor-agent process completed
[MCP Server] Execution time: 18.3s (0.3 minutes)
```

## Troubleshooting Commands

### Check what's actually in server.ts at line 1117
```powershell
Get-Content server.ts | Select-Object -Index 1116
```

### Verify no stale processes
```powershell
Get-Process | Where-Object {$_.ProcessName -eq "node" -or $_.ProcessName -eq "tsx"}
```

### Force clean rebuild
```powershell
Remove-Item dist\* -Recurse -Force
npm run build
npm run dev
```

### Test cursor-agent directly in WSL
```powershell
wsl -d Ubuntu bash -c "echo 'test' | ~/.local/bin/cursor-agent --print --output-format text --force --model auto"
```

This should produce output if cursor-agent is working correctly.

## Files Modified

- `server.ts`: Added command construction and parsing logging
- All changes are backward compatible
- No breaking changes

## Summary

The issue is that somehow the command variable contains `ce --model auto` instead of the correct `cursor-agent --print --output-format text --force --model auto`. 

The new logging will show us **exactly** where and when the command gets corrupted, allowing us to pinpoint the issue.

**Action Required**: 
1. ✅ Build completed
2. ⏳ **Restart the MCP server completely**
3. 🔍 **Create a new project and share the new logs**

