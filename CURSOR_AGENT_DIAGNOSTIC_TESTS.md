# Cursor Agent Diagnostic Tests

## Summary

Added comprehensive diagnostic tests to identify why cursor-agent produces no output despite spawning successfully.

## Changes Applied

### 1. Pre-Execution Diagnostic Test

**Location**: `server.ts` lines 1180-1207

Before running the full prompt, the system now tests cursor-agent with a simple input:

```typescript
const testCommand = isWindows 
  ? 'wsl -d Ubuntu bash -c "echo \'test prompt\' | ~/.local/bin/cursor-agent --print --output-format text --force --model auto"'
  : 'echo "test prompt" | cursor-agent --print --output-format text --force --model auto';

const testResult = await execAsync(testCommand, {
  timeout: 30000,  // 30 second timeout
  maxBuffer: 1024 * 1024
});

console.log(`[MCP Server] ✅ Diagnostic test PASSED`);
console.log(`[MCP Server] 📋 Test output: ${testResult.stdout.substring(0, 200)}`);
```

**Purpose**:
- Verify cursor-agent responds to simple input
- Confirm --print flag works
- Test before sending large 113KB prompt
- Immediate feedback if cursor-agent is broken

**Expected Output**:
```
[MCP Server] 🧪 Running diagnostic test of cursor-agent...
[MCP Server] 🧪 Test command: wsl -d Ubuntu bash -c "echo 'test prompt' | ~/.local/bin/cursor-agent --print --output-format text --force --model auto"
[MCP Server] ✅ Diagnostic test PASSED
[MCP Server] 📋 Test output (first 200 chars): <cursor-agent response>
[MCP Server] 📋 Test stderr: (none)
```

**If It Fails**:
```
[MCP Server] ❌ Diagnostic test FAILED: Command failed...
[MCP Server] Diagnostic stdout: <any output>
[MCP Server] Diagnostic stderr: <error messages>
[MCP Server] ⚠️  cursor-agent may not be working correctly, but continuing anyway...
```

### 2. Heartbeat Logging

**Location**: `server.ts` lines 789-800

Logs every 10 seconds while cursor-agent is running:

```typescript
const heartbeatInterval = setInterval(() => {
  const elapsedMs = Date.now() - executionStartTime;
  const elapsedSec = (elapsedMs / 1000).toFixed(1);
  const elapsedMin = (elapsedMs / 60000).toFixed(1);
  console.log(`[MCP Server] 💓 Heartbeat: cursor-agent still running (${elapsedSec}s / ${elapsedMin}m), PID: ${childProcess.pid}`);
}, 10000);
```

**Purpose**:
- Prove cursor-agent process is alive
- Show elapsed time even without output
- Distinguish between "hung" vs "working silently"
- User knows execution hasn't crashed

**Expected Output**:
```
[MCP Server] 💓 Heartbeat: cursor-agent still running (10.2s / 0.2m), PID: 42364
[MCP Server] 💓 Heartbeat: cursor-agent still running (20.5s / 0.3m), PID: 42364
[MCP Server] 💓 Heartbeat: cursor-agent still running (30.8s / 0.5m), PID: 42364
```

Heartbeat stops automatically when process completes or errors.

## What These Tests Will Reveal

### Scenario 1: Diagnostic Test Fails

If you see:
```
[MCP Server] ❌ Diagnostic test FAILED
```

**Diagnosis**: cursor-agent itself is broken or misconfigured

**Next Steps**:
- Check cursor-agent installation
- Verify --print flag is supported
- Test cursor-agent manually in WSL
- Check for missing dependencies

### Scenario 2: Diagnostic Test Passes, But No Main Output

If you see:
```
[MCP Server] ✅ Diagnostic test PASSED
[MCP Server] 📋 Test output: <actual output here>
...
[MCP Server] ✅ Process spawned with PID: 42364
[MCP Server] ✅ stdout and stderr streams are available
[MCP Server] 💓 Heartbeat: cursor-agent still running (10.2s / 0.2m)
[MCP Server] 💓 Heartbeat: cursor-agent still running (20.5s / 0.2m)
[MCP Server] 📥 Received 128 bytes on stdout
[cursor-agent | 25.3s] <output finally appears>
```

**Diagnosis**: cursor-agent works but takes time to process large prompts

**Solution**: Wait for heartbeats - cursor-agent is working, just slow

### Scenario 3: Diagnostic Test Passes, Heartbeats Show Activity, But Still No Output

If you see:
```
[MCP Server] ✅ Diagnostic test PASSED
[MCP Server] 💓 Heartbeat: cursor-agent still running (10.2s / 0.2m)
[MCP Server] 💓 Heartbeat: cursor-agent still running (20.5s / 0.3m)
[MCP Server] 💓 Heartbeat: cursor-agent still running (300.1s / 5.0m)
[MCP Server] 🏁 cursor-agent process completed
[MCP Server] Exit code: 0
[MCP Server] Stdout size: 0 bytes
```

**Diagnosis**: cursor-agent completes but produces no output

**Possible Causes**:
- Prompt too complex/large (113KB)
- Model overloaded
- cursor-agent bug with --print flag
- Need different output format

**Next Steps**:
- Try without --print flag
- Try different --output-format
- Reduce prompt size
- Test with smaller project

### Scenario 4: Heartbeats Stop, Process Never Completes

If heartbeats just stop without completion:

**Diagnosis**: cursor-agent crashed or was killed externally

**Check**:
- Process still exists: `Get-Process -Id <PID>`
- WSL still running: `wsl --list --running`
- System resources: Memory/CPU usage

## How to Use

### Test Immediately

When you restart the server and create a project:

1. Watch for the diagnostic test result
2. If it fails, cursor-agent is broken - fix before proceeding
3. If it passes, watch for heartbeats
4. Heartbeats prove process is alive
5. Wait for actual cursor-agent output

### Manual Testing

You can test cursor-agent directly:

```powershell
# Simple test
wsl -d Ubuntu bash -c "echo 'hello' | ~/.local/bin/cursor-agent --print --output-format text --force --model auto"

# With file (in project directory)
cd cursor-projects\<project-name>
wsl -d Ubuntu bash -c "cd '/mnt/c/...' && cat '.cursor-prompt.tmp' | ~/.local/bin/cursor-agent --print --output-format text --force --model auto"
```

## Benefits

1. **Immediate feedback** - Know within 30 seconds if cursor-agent works
2. **Process visibility** - Heartbeats every 10 seconds show it's alive
3. **Better diagnosis** - Distinguish between different failure modes
4. **Reduced confusion** - Users know if they should wait or troubleshoot

## Files Modified

- `server.ts`: Added diagnostic test and heartbeat logging

## Next Steps

1. ✅ Code updated
2. ✅ Build completed
3. ⏳ **Restart MCP server**: `npm run dev`
4. 🔍 **Watch diagnostic test output**
5. 💓 **Monitor heartbeats**
6. 📊 **Wait for cursor-agent output or completion**

If diagnostic test passes but no output appears after several minutes, the issue is likely with cursor-agent handling large/complex prompts, not with our streaming implementation.




