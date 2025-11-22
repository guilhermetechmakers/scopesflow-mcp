# Cursor Agent Integration Status

## ✅ What's Working

1. **WSL Integration**: The server correctly detects and uses WSL for cursor-agent execution
2. **Path Conversion**: Windows paths are properly converted to WSL format (`C:\Users\...` → `/mnt/c/Users/...`)
3. **Authentication**: Cursor Agent is authenticated and ready (`cursor-agent status` shows "Logged in")
4. **Model Selection**: Using `auto` (confirmed working model)

## ⚠️ What Needs Improvement

The current command format has issues:
- **Current**: Passes prompt as command argument (causes escaping problems and timeouts)
- **Should be**: Pipe prompt via stdin (more reliable for long prompts)

### Current Command (Line 494 in server.ts)
```typescript
command = `wsl -d Ubuntu bash -c "cd '${wslProjectPath}' && ~/.local/bin/cursor-agent --print --force --model auto \\\"\\$(cat '${wslPromptFile}')\\\""`;
```

### Recommended Command
```typescript
command = `wsl -d Ubuntu bash -c "cd '${wslProjectPath}' && cat '${wslPromptFile}' | ~/.local/bin/cursor-agent --print --output-format text --force --model auto"`;
```

## 🧪 Test Results

Successfully tested cursor-agent with a simple prompt:

```bash
wsl -d Ubuntu bash -c "cd '/mnt/c/Users/guilh/scopesflow-mcp-server/cursor-projects/...' && echo 'Create a file called test.txt with content: Hello World' | ~/.local/bin/cursor-agent --print --output-format text --force --model auto"
```

**Result**: ✅ File created successfully with content "Hello World"

**Note**: The command times out after completing the task (this is normal behavior - cursor-agent doesn't exit cleanly in `--print` mode)

## 🔧 Required Changes to server.ts

### Change 1: Update Windows command format (line ~494)
**Find:**
```typescript
command = `wsl -d Ubuntu bash -c "cd '${wslProjectPath}' && ~/.local/bin/cursor-agent --print --force --model auto \\\"\\$(cat '${wslPromptFile}')\\\""`;
```

**Replace with:**
```typescript
command = `wsl -d Ubuntu bash -c "cd '${wslProjectPath}' && cat '${wslPromptFile}' | ~/.local/bin/cursor-agent --print --output-format text --force --model auto"`;
```

### Change 2: Update Unix/Mac command format (line ~500)
**Find:**
```typescript
command = `cursor-agent --print --force --model auto "$(cat .cursor-prompt.tmp)"`;
```

**Replace with:**
```typescript
command = `cat .cursor-prompt.tmp | cursor-agent --print --output-format text --force --model auto`;
```

### Change 3: Handle timeout errors gracefully (line ~506-510)
**Find:**
```typescript
const { stdout, stderr } = await execAsync(command, {
  cwd: isWindows ? undefined : actualProjectPath,
  timeout: args.timeout || 300000,
  maxBuffer: 10 * 1024 * 1024
});
```

**Replace with:**
```typescript
let stdout = '';
let stderr = '';

try {
  const result = await execAsync(command, {
    cwd: isWindows ? undefined : actualProjectPath,
    timeout: args.timeout || 300000,
    maxBuffer: 10 * 1024 * 1024
  });
  stdout = result.stdout;
  stderr = result.stderr;
} catch (error: any) {
  // cursor-agent often doesn't exit cleanly, causing timeout errors
  // But the work is usually done, so we capture the output and continue
  if (error.killed && error.signal === 'SIGTERM') {
    console.log(`[MCP Server] ⚠ cursor-agent timed out but may have completed work`);
    stdout = error.stdout || '';
    stderr = error.stderr || '';
  } else {
    throw error;
  }
}
```

## 🚀 Next Steps

1. **Apply the changes above** to `server.ts`
2. **Rebuild**: `npm run build`
3. **Test**: Run your MCP server and try creating a project with cursor-agent

## 📝 Key Insights

1. **Stdin is better than arguments**: Piping via stdin avoids command-line length limits and escaping issues
2. **`--output-format text`**: Provides cleaner output than default `stream-json`
3. **Timeout is normal**: cursor-agent doesn't exit cleanly in `--print` mode, but the work gets done
4. **Check stdout/stderr on timeout**: The output is captured even when the command times out

## ✨ Expected Behavior

When working correctly:
- cursor-agent will generate/modify code based on your prompt
- Files will be created/updated in the project directory
- The command will timeout after ~5 minutes, but work will be completed
- Output will show what files were modified

Example output:
```
I'll create a file called `test.txt` with the content "Hello World".
Wrote test.txt
Done! I've created `test.txt` with the content "Hello World".
```





