# Cursor Agent Validation Timeout Fix

## Issue Summary

The cursor-agent execution was failing intermittently with validation errors:

```
❌ WSL or cursor-agent validation failed: Error: Command failed...
code: null, killed: true, signal: 'SIGTERM'
```

This caused the system to fall back to manual task file mode instead of using cursor-agent for automated code generation.

## Root Cause

The pre-execution validation checks had a 5-second timeout, which was **too short** for:

1. **WSL cold starts** - When WSL hasn't been used recently, it needs 5-10 seconds to initialize
2. **System under load** - Heavy CPU/disk usage can slow WSL response
3. **First command after boot** - WSL initialization takes longer on first use

The validation was failing even though cursor-agent was properly installed and working.

## Solution Applied

### 1. Increased Validation Timeout

**Changed in**: `server.ts` lines 1125, 1129, 1139

```typescript
// BEFORE (5 seconds - too short)
await execAsync('wsl --list --quiet', { timeout: 5000 });
await execAsync('wsl -d Ubuntu bash -c "test -f ~/.local/bin/cursor-agent && echo found"', { timeout: 5000 });

// AFTER (15 seconds - allows for WSL initialization)
await execAsync('wsl --list --quiet', { timeout: 15000 });
await execAsync('wsl -d Ubuntu bash -c "test -f ~/.local/bin/cursor-agent && echo found"', { timeout: 15000 });
```

### 2. Made Validation Non-Blocking

Changed from **hard error** (throws exception) to **soft warning** (logs warning and continues):

```typescript
// BEFORE - Would fail and stop execution
catch (error) {
  console.error(`[MCP Server] ❌ WSL or cursor-agent validation failed:`, error);
  throw new Error('WSL or cursor-agent not properly configured');
}

// AFTER - Warns but allows execution to continue
catch (error) {
  console.warn(`[MCP Server] ⚠️  WSL or cursor-agent validation failed (will attempt execution anyway):`, error);
  console.warn(`[MCP Server] ⚠️  If cursor-agent execution fails, ensure cursor-agent is installed in WSL at ~/.local/bin/cursor-agent`);
  // Don't throw - WSL can be slow to respond, let execution continue
}
```

## Why This Works

### Before Fix:
1. Validation command times out after 5 seconds
2. Server throws error and stops execution
3. Falls back to manual task file mode
4. User sees "Manual intervention required"
5. No automated code generation

### After Fix:
1. Validation command has 15 seconds to respond (3x longer)
2. If validation still fails, logs warning but continues
3. Cursor-agent execution proceeds
4. Real-time streaming output visible
5. Automated code generation works

## Evidence from Logs

### First Execution (Failed)
```
[MCP Server] 🔍 Checking cursor-agent in WSL...
[MCP Server] ❌ WSL or cursor-agent validation failed
```
**Result**: Fell back to task file mode ❌

### Second Execution (Succeeded)
```
[MCP Server] 🔍 Checking cursor-agent in WSL...
[MCP Server] ✅ cursor-agent binary found in WSL
[MCP Server] ✅ All pre-execution checks passed
[MCP Server] 🚀 Starting cursor-agent process...
```
**Result**: Cursor-agent executed successfully ✅

The cursor-agent was **always properly installed** - only the validation check timing out.

## Additional Benefits

1. **More forgiving** - Works even when WSL is slow
2. **Better logging** - Clear warnings if validation fails
3. **Fail-safe** - Attempts execution even if pre-check times out
4. **User-friendly** - Provides actionable error messages

## Testing

✅ TypeScript compilation successful  
✅ No linting errors  
✅ Build completed successfully

## Critical Update: Command Execution Fix

### Issue #1: Shell Mode Not Working

After applying the validation timeout fix, we discovered **cursor-agent was starting but producing no output**. 

**First Attempt (shell: true)**: Failed - PowerShell was mangling the WSL command.

### Issue #2: Direct WSL Spawn Implementation

**Root Cause**: The WSL command with nested quotes and pipes wasn't being handled correctly by either approach.

**Final Solution Applied**: Direct WSL spawn with proper command extraction:

```typescript
// Extract the bash command from WSL wrapper
const bashCommandMatch = command.match(/bash -c "(.+)"$/);
const bashCommand = bashCommandMatch[1];

// Spawn WSL directly with clean arguments
childProcess = spawn('wsl', ['-d', 'Ubuntu', 'bash', '-c', bashCommand], {
  cwd: undefined,  // WSL handles its own working directory
  shell: false     // Don't use PowerShell wrapper
});
```

### Diagnostic Logging Added

Added comprehensive diagnostic logging to debug stream issues:
- Full command logging
- Platform detection (Windows WSL vs Unix)
- Process PID tracking
- Stream availability checks
- Byte-level data reception logging
- Stream end event logging

This helps identify exactly where cursor-agent execution fails.

## Next Steps

Restart your MCP server to apply both fixes:

```bash
npm run dev
```

**Expected Results:**
1. ✅ Validation completes without timeout (15s limit)  
2. ✅ Cursor-agent process starts
3. ✅ **Real-time output appears**: `[cursor-agent | Xs]` logs stream to console
4. ✅ You see cursor-agent working in real-time
5. ✅ **No timeout limit**: Complex prompts can run for 15+ minutes

## Critical Update: Timeout Removed (Latest)

**User Feedback**: Some prompts take longer than 10 minutes for complex applications.

**Solution**: Completely removed timeout limit for cursor-agent execution.

```typescript
// BEFORE - 10 minute timeout
const timeoutId = setTimeout(() => {
  childProcess.kill('SIGTERM');
}, 600000);

// AFTER - No timeout
// cursor-agent can run indefinitely until completion
console.log(`[MCP Server] ⏳ No timeout limit - cursor-agent can run as long as needed`);
```

**Benefits:**
- ✅ No artificial time limits on complex code generation
- ✅ Large applications can be built without interruption
- ✅ Execution time displayed in both seconds and minutes
- ✅ Users can manually stop with Ctrl+C if needed

## Related Documentation

- See `CURSOR_AGENT_LOGGING_IMPROVEMENTS.md` for full logging improvements
- See `GIT_LOCK_FIX_SUMMARY.md` for git operation improvements
- See `SETUP_INSTRUCTIONS.md` for cursor-agent installation

