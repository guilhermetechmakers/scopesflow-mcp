# Build Errors and Fixes

This document catalogs errors encountered during automated builds and their solutions.

## Error 1: JWT Expired During Build

### Error Messages
```
[BuildRunner] Failed to update status: JWT expired
[BuildRunner] Failed to append log: JWT expired
```

### Description
The Supabase JWT access token expires during long-running builds. When `runBuildLoop` tries to update the build status or append logs to the database after the token has expired, these operations fail.

### Root Cause
- Supabase JWT tokens have a default expiration time (typically 1 hour)
- Long-running builds (e.g., 12+ minutes) may exceed the token's remaining lifetime
- The Supabase client created at the start of `runBuildLoop` uses a single access token that doesn't refresh automatically
- Build status updates and log appends happen throughout the build process, so expired tokens cause failures

### Impact
- Build status updates fail silently (logged but not persisted)
- Build logs are not written to the database after token expiration
- Build may complete successfully but status/logs won't reflect the final state

### Solutions

#### Solution 1: Refresh Token Before Critical Operations (Recommended)
Implement token refresh logic before database operations:

```typescript
// In build-runner.ts
const refreshTokenIfNeeded = async () => {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session || session.expires_at && session.expires_at * 1000 < Date.now() + 60000) {
      // Token expires in less than 1 minute, refresh it
      const { data, error } = await supabase.auth.refreshSession();
      if (error) {
        console.warn('[BuildRunner] Failed to refresh token:', error.message);
      }
    }
  } catch (error) {
    console.warn('[BuildRunner] Token refresh check failed:', error);
  }
};

const updateStatus = async (status: string, progress?: number) => {
  await refreshTokenIfNeeded();
  // ... rest of updateStatus logic
};

const appendLog = async (message: string, level: string = 'info') => {
  await refreshTokenIfNeeded();
  // ... rest of appendLog logic
};
```

#### Solution 2: Use Service Role Key for Build Operations
Use Supabase service role key (bypasses RLS) for build operations instead of user access token:

```typescript
// In runBuildFromPayload
const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});
```

**Note:** This requires passing `supabaseServiceRoleKey` in the build configuration and ensuring it's available in the build payload.

#### Solution 3: Graceful Degradation
Make status/log updates non-blocking and continue build execution:

```typescript
const updateStatus = async (status: string, progress?: number) => {
  try {
    const payload = { status, updated_at: new Date().toISOString() };
    if (progress !== undefined) payload.progress = progress;
    const { error } = await supabase
      .from('automated_builds')
      .update(payload)
      .eq('id', buildId);
    if (error) {
      log(`Failed to update status: ${error.message}`, 'error');
      // Continue execution - don't throw
    }
  } catch (err) {
    log(`Status update error (non-blocking): ${err instanceof Error ? err.message : 'Unknown'}`, 'error');
    // Continue execution
  }
};
```

#### Solution 4: Batch Updates at End of Build
Only update status/logs at critical points (start, end, major milestones) instead of throughout:

```typescript
// Store logs in memory during build
const buildLogs: Array<{ message: string; level: string; timestamp: string }> = [];

const appendLog = async (message: string, level: string = 'info') => {
  buildLogs.push({
    message,
    level,
    timestamp: new Date().toISOString()
  });
  // Optionally: batch insert every N logs or at milestones
};

// At end of build, flush all logs
const flushLogs = async () => {
  if (buildLogs.length === 0) return;
  try {
    await refreshTokenIfNeeded();
    const logsToInsert = buildLogs.map(log => ({
      build_id: buildId,
      log_type: levelToLogType(log.level),
      message: log.message,
      created_at: log.timestamp
    }));
    const { error } = await supabase.from('build_logs').insert(logsToInsert);
    if (error) {
      console.error('[BuildRunner] Failed to flush logs:', error.message);
    }
  } catch (err) {
    console.error('[BuildRunner] Log flush error:', err);
  }
};
```

### Recommended Implementation
Combine Solution 1 (token refresh) with Solution 3 (graceful degradation) for the most robust approach:

1. Check token expiration before each database operation
2. Attempt to refresh if needed
3. Continue build execution even if database operations fail
4. Log errors but don't block the build

---

## Error 2: GitHub Token Not Found

### Error Message
```
[MCP Server] ℹ️ No GitHub token provided - skipping auto-commit
```

### Description
The build process cannot find a GitHub token for auto-committing changes. This was previously an issue but has been addressed by fetching from the database.

### Root Cause
- GitHub token not found in project git config
- GitHub token not passed in executePrompt args
- GitHub token not found in `github_auth` table for the user

### Current Status
✅ **FIXED** - The code now fetches GitHub auth from `github_auth` table when not found in project config or args.

### Verification
Ensure that:
1. User has a record in `github_auth` table with `access_token`, `login`, and `email`
2. `executePrompt` receives `supabaseClient` and `userId` parameters (already implemented)
3. The fetch logic in `executePrompt` is working correctly

### Additional Notes
If this error still appears, check:
- User ID is correctly passed from `runBuildLoop` to `executePromptFn`
- Supabase client has proper permissions to query `github_auth` table
- RLS policies allow reading `github_auth` for the authenticated user

---

## Error 3: Deprecation Warning (Non-Critical)

### Error Message
```
(node:26183) [DEP0190] DeprecationWarning: Passing args to a child process with shell option true can lead to security vulnerabilities, as the arguments are not escaped, only concatenated.
```

### Description
Node.js deprecation warning about using `shell: true` with child process execution.

### Root Cause
Using `spawn` or `exec` with `shell: true` and passing arguments directly can be insecure if arguments contain user input.

### Impact
- Non-blocking warning
- Potential security vulnerability if user input is not sanitized
- May break in future Node.js versions

### Solution
Use `shell: false` and pass arguments as an array, or properly escape arguments:

```typescript
// Instead of:
spawn('npm', ['run', 'build'], { shell: true, cwd: projectPath });

// Use:
spawn('npm', ['run', 'build'], { shell: false, cwd: projectPath });

// Or if shell is required, use execAsync with proper escaping:
const { exec } = require('child_process');
const { promisify } = require('util');
const execAsync = promisify(exec);

await execAsync(`npm run build`, { cwd: projectPath });
```

### Priority
**Low** - Warning only, doesn't affect functionality but should be addressed for security.

---

## Summary

| Error | Severity | Status | Priority |
|-------|----------|--------|----------|
| JWT Expired | High | ✅ Fixed | P0 |
| GitHub Token Missing | Medium | ✅ Fixed | P1 |
| Deprecation Warning | Low | Needs Fix | P2 |

### Implementation Status

#### ✅ JWT Expiration - IMPLEMENTED
- **Token Refresh**: Added `refreshTokenIfNeeded()` function that checks token expiration and refreshes if needed (within 1 minute of expiry)
- **Graceful Degradation**: All database operations (`updateStatus`, `appendLog`, `flowchart_items` query) now:
  - Attempt token refresh before operations
  - Wrap operations in try-catch blocks
  - Continue execution even if database operations fail
  - Log errors without blocking the build

**Implementation Details:**
- Token refresh checks session expiration before each database operation
- If token expires in < 1 minute, automatically refreshes using `supabase.auth.refreshSession()`
- All database operations are non-blocking - build continues even if DB writes fail
- Errors are logged but don't stop the build process

### Next Steps
1. ✅ **Completed**: Implement token refresh logic (Solution 1) for JWT expiration
2. ✅ **Completed**: Add graceful degradation for database operations
3. **Future Enhancement**: Consider using service role key for build operations if token refresh proves insufficient
4. **Low Priority**: Fix deprecation warning for shell execution security
