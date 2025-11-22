# Cursor Agent Timeout Fallback Testing

## Overview

This document describes how to test the new timeout fallback mechanism implemented in the MCP server.

## What Was Implemented

The timeout fallback mechanism provides a three-tier strategy when `cursor-agent` times out:

1. **Detect timeout and capture partial state** - Check what files were modified before timeout
2. **Commit partial work** - Save any completed changes to preserve progress  
3. **Retry with longer timeout** - Continue with remaining work using extended timeout

## Key Features

- ✅ **Partial Work Capture**: Detects and validates files modified before timeout
- ✅ **Automatic Commit**: Commits partial work with "WIP: Partial completion (timeout)" message
- ✅ **Smart Retry**: Retries with 2x timeout (10 minutes) and contextual prompt
- ✅ **Graceful Fallback**: Falls back to task file creation if all retries fail
- ✅ **Comprehensive Logging**: Detailed logs for debugging timeout scenarios

## Testing the Implementation

### Method 1: Use Test Script

1. **Create a test project** (or use existing):
   ```bash
   mkdir test-project
   cd test-project
   npm init -y
   npm install react react-dom
   ```

2. **Run the test script**:
   ```bash
   node test-timeout-fallback.js
   ```

3. **Watch for these log messages**:
   - `🚨 TIMEOUT FALLBACK ACTIVATED`
   - `🔍 Capturing partial work from timeout...`
   - `✅ Found partial work: X valid files`
   - `🔄 Retrying with longer timeout...`

### Method 2: Manual Testing

1. **Start the MCP server**:
   ```bash
   npm run build
   node dist/server.js
   ```

2. **Send a request with short timeout**:
   ```json
   {
     "jsonrpc": "2.0",
     "id": 1,
     "method": "tools/call",
     "params": {
       "name": "cursor/execute-prompt",
       "arguments": {
         "prompt": "Create a complex React dashboard with multiple components",
         "projectPath": "./your-project",
         "timeout": 10000,
         "isFirstPrompt": true
       }
     }
   }
   ```

3. **Observe the fallback behavior** in the server logs.

## Expected Behavior

### Scenario 1: Timeout with Partial Work
1. `cursor-agent` starts working
2. Times out after 10 seconds
3. System captures any files that were modified
4. Commits partial work (if GitHub token provided)
5. Retries with 20-second timeout
6. If retry succeeds, returns success
7. If retry also times out, creates task file

### Scenario 2: Timeout with No Work
1. `cursor-agent` starts but doesn't modify files
2. Times out after 10 seconds
3. System detects no partial work
4. Retries with 20-second timeout
5. If retry succeeds, returns success
6. If retry also times out, creates task file

## Response Metadata

The response now includes timeout fallback metadata:

```json
{
  "success": true,
  "output": "...",
  "filesChanged": [...],
  "timedOut": false,
  "partialCompletion": false,
  "retried": true,
  "fallbackMode": "retry"
}
```

### Metadata Fields

- `timedOut`: Whether the operation timed out
- `partialCompletion`: Whether partial work was captured and saved
- `retried`: Whether this was a retry attempt
- `fallbackMode`: Which fallback was used (`none`, `retry`, `task_file`, `task_file_error`)

## Configuration

### Timeout Values
- **First attempt**: 5 minutes (300,000ms) - default
- **Retry attempt**: 10 minutes (600,000ms) - 2x original
- **Max retries**: 1 (prevents infinite loops)

### Retry Logic
- Retries are only attempted if `retryCount < 1`
- Each retry doubles the timeout
- After max retries, falls back to task file creation

## Troubleshooting

### Common Issues

1. **"No files were modified before timeout"**
   - This is normal if `cursor-agent` didn't start writing files yet
   - System will retry with longer timeout

2. **"File appears corrupted"**
   - System detected incomplete file writes
   - Corrupted files are excluded from partial work

3. **"Max retries reached"**
   - Both attempts timed out
   - Task file will be created for manual intervention

### Debug Logging

Enable detailed logging by watching for these patterns:
- `🔍 Capturing partial work from timeout...`
- `📊 Partial work analysis:`
- `✅ Valid file:` / `⚠️ File appears corrupted:`
- `🔄 Retrying with longer timeout...`
- `⚠️ Max retries reached, falling back to task file`

## Success Criteria

✅ **Timeout Detection**: System detects when `cursor-agent` times out
✅ **Partial Work Capture**: Files modified before timeout are captured and validated
✅ **Automatic Commit**: Partial work is committed with descriptive message
✅ **Smart Retry**: Operation retries with longer timeout and contextual prompt
✅ **Graceful Fallback**: Task file is created if all retries fail
✅ **Clear Feedback**: User receives detailed information about timeout and recovery actions

## Future Enhancements

Potential improvements for the timeout fallback mechanism:

1. **Progressive Timeouts**: More sophisticated timeout scaling
2. **Work Estimation**: Estimate remaining work to set appropriate timeouts
3. **Partial State Recovery**: Better context preservation between retries
4. **Metrics Collection**: Track timeout patterns and success rates
5. **User Configuration**: Allow users to configure timeout and retry behavior
















