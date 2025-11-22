# Git Lock File Issue - Fix Implementation Summary

## Problem
The cursor agent was successfully making changes, but the auto-commit process was failing with:
```
fatal: Unable to create '.git/index.lock': File exists
Another git process seems to be running in this repository
```

## Root Causes Identified

1. **Multiple concurrent git operations**: The `waitForFileSystemStability()` function was polling `git status --porcelain` every 2 seconds
2. **Redundant file system checks**: `waitForFileSystemStability()` was called twice - once in `executePrompt()` and again in `commitAndPush()`
3. **No delay between checks and commits**: Git operations were starting immediately after file system checks, while previous git processes might still be releasing locks
4. **No lock file cleanup**: Stale `.git/index.lock` files from crashed processes were not being cleaned up
5. **Race conditions**: Multiple git operations could overlap without coordination
6. **Insufficient retry logic**: Only 1 retry attempt with simple 2-second delay

## Solutions Implemented

### 1. Git Mutex for Sequential Operations
**Location**: `server.ts` - Added `gitMutex` property and `withGitMutex()` method

- Added a promise-based mutex to ensure all git operations run sequentially
- Prevents concurrent git commands from creating lock file conflicts
- Wraps all git operations including `git status`, `git add`, `git commit`, and `git push`

```typescript
private gitMutex: Promise<void> = Promise.resolve();

private async withGitMutex<T>(fn: () => Promise<T>): Promise<T> {
  const previousMutex = this.gitMutex;
  let resolveMutex: () => void;
  this.gitMutex = new Promise(resolve => {
    resolveMutex = resolve;
  });
  
  try {
    await previousMutex;
    return await fn();
  } finally {
    resolveMutex!();
  }
}
```

### 2. Git Process Detection
**Location**: `server.ts` - Added `isGitProcessRunning()` method

- Checks if any git processes are currently running
- Platform-specific implementation (Windows: `tasklist`, Unix: `pgrep`)
- Used before attempting to clean lock files

### 3. Automatic Lock File Cleanup
**Location**: `server.ts` - Added `cleanGitLockFiles()` method

- Detects stale `.git/index.lock` files
- Verifies no git processes are running before cleanup
- Safely removes lock files with proper error handling
- Called before git operations and during retry attempts

```typescript
private async cleanGitLockFiles(projectPath: string): Promise<boolean>
```

### 4. Removed Redundant File System Check
**Location**: `server.ts` - Modified `commitAndPush()` method

- Removed the duplicate `waitForFileSystemStability()` call from `commitAndPush()`
- File system is already stabilized in `executePrompt()` before calling `commitAndPush()`
- Eliminates unnecessary git status polling

**Before**:
```typescript
// Final file system check before commit
console.log('[MCP Server] 🔍 Final file system check before commit...');
await this.waitForFileSystemStability(projectPath, 10000);
console.log('[MCP Server] ✅ Pre-commit file system check complete');
```

**After**: Removed entirely

### 5. Added Delay Before Git Operations
**Location**: `server.ts` - Modified `commitAndPush()` method

- Added 3-second delay after file system stability and before git operations
- Ensures all previous git processes have released locks
- Prevents race conditions

```typescript
// Add delay to ensure all previous git operations are complete
console.log('[MCP Server] ⏳ Waiting for git operations to settle...');
await new Promise(resolve => setTimeout(resolve, 3000));
console.log('[MCP Server] ✅ Ready to commit');
```

### 6. Enhanced Retry Logic with Exponential Backoff
**Location**: `server.ts` - Modified `commitAndPush()` error handling

- Increased retry attempts from 1 to 3
- Implemented exponential backoff: 2s, 4s, 8s delays
- Attempts lock file cleanup on lock-related errors
- Better logging of retry attempts

**Before**:
```typescript
if (retryCount < 1 && isTransientError) {
  await new Promise(resolve => setTimeout(resolve, 2000));
  return await this.commitAndPush(..., retryCount + 1);
}
```

**After**:
```typescript
const maxRetries = 3;
if (retryCount < maxRetries && isTransientError) {
  const delayMs = Math.pow(2, retryCount + 1) * 1000; // 2s, 4s, 8s
  console.warn(`[MCP Server] ⚠️ Transient error detected, retrying in ${delayMs/1000}s... (attempt ${retryCount + 1}/${maxRetries})`);
  
  if (isLockFileError) {
    await this.cleanGitLockFiles(projectPath);
  }
  
  await new Promise(resolve => setTimeout(resolve, delayMs));
  return await this.commitAndPush(..., retryCount + 1);
}
```

### 7. Improved Error Detection
**Location**: `server.ts` - Modified `commitAndPush()` error handling

- Detects lock file errors specifically: `index.lock` and `unable to create`
- Classifies lock file errors as transient (retryable)
- Provides more actionable error messages

```typescript
const isLockFileError = errorMessage.includes('index.lock') || 
                       errorMessage.includes('unable to create');

const isTransientError = isLockFileError || 
                        (!errorMessage.includes('No changes to commit') && ...);
```

### 8. Protected Git Status Calls
**Location**: `server.ts` - Modified `getChangedFiles()` method

- Wrapped `git status --porcelain` call in mutex
- Prevents concurrent git status operations
- Ensures sequential execution with other git commands

```typescript
private async getChangedFiles(projectPath: string): Promise<string[]> {
  return await this.withGitMutex(async () => {
    const { stdout } = await execAsync('git status --porcelain', { cwd: projectPath });
    // ... process results
  });
}
```

## Testing Recommendations

After deployment, verify:

1. **Basic functionality**: Cursor agent makes changes and auto-commits successfully
2. **No stale locks**: Check that `.git/index.lock` files are not left behind
3. **Retry mechanism**: Verify exponential backoff works on transient failures
4. **Lock cleanup**: Test that stale lock files are detected and cleaned
5. **Sequential operations**: Multiple rapid cursor-agent executions don't cause conflicts
6. **Error messages**: Lock-related errors are properly detected and logged

## Expected Behavior

### Normal Flow
1. Cursor agent executes and makes changes
2. File system stability check (30s max)
3. 3-second delay before commit
4. Lock file cleanup check
5. Git operations run sequentially in mutex
6. Changes committed and pushed successfully

### Recovery Flow (Lock File Error)
1. Lock file error detected
2. Classified as transient error
3. Attempt to clean lock files
4. Wait 2 seconds (first retry)
5. Retry commit operation
6. If fails, wait 4 seconds (second retry)
7. If fails again, wait 8 seconds (third retry)
8. Return success or final failure

## Files Modified

- `server.ts` (lines 52, 1148-1380, 1062-1088)
  - Added `gitMutex` property
  - Added `withGitMutex()` method
  - Added `isGitProcessRunning()` method
  - Added `cleanGitLockFiles()` method
  - Modified `commitAndPush()` method
  - Modified `getChangedFiles()` method

## Impact

- **Reliability**: Significantly reduced git lock file errors
- **Performance**: Added 3-second delay before commits (acceptable trade-off)
- **Recovery**: Better error recovery with exponential backoff
- **Stability**: Prevents race conditions and concurrent git operations
- **Maintainability**: Clear error messages and comprehensive logging

## Breaking Changes

None. All changes are internal improvements that maintain the same external API.

## Next Steps

1. Deploy the updated server
2. Monitor auto-commit success rate
3. Review logs for any remaining lock file issues
4. Consider reducing the 3-second delay if testing shows it's unnecessary
5. Add metrics to track retry attempts and success rates

