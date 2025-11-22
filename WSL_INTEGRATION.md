# WSL Integration for Cursor Agent

## Overview
The MCP server has been updated to work with `cursor-agent` installed in WSL (Windows Subsystem for Linux) Ubuntu.

## Changes Made

### 1. Cross-Platform Cursor Agent Detection
**Location:** `server.ts` - `checkCursorAgent()` method

The server now detects the operating system and uses the appropriate command:
- **Windows (WSL):** `wsl -d Ubuntu bash -c "~/.local/bin/cursor-agent --version"`
- **Linux/Mac:** `cursor-agent --version`

### 2. Cross-Platform Cursor Agent Execution
**Location:** `server.ts` - `executePrompt()` method

When executing prompts through cursor-agent:

#### On Windows:
1. Converts Windows paths to WSL paths (e.g., `C:\Users\...` → `/mnt/c/Users/...`)
2. Escapes the prompt properly for bash execution within WSL
3. Executes via: `wsl -d Ubuntu bash -c "cd '<wsl-path>' && ~/.local/bin/cursor-agent ..."`

#### On Linux/Mac:
- Executes cursor-agent directly with the project path as `cwd`

## Installation Verification

To verify cursor-agent is accessible:

```powershell
# From PowerShell/CMD
wsl -d Ubuntu bash -c "~/.local/bin/cursor-agent --version"
```

Expected output: `2025.09.18-7ae6800` (or similar version)

## How It Works

### Windows Path Conversion
```javascript
// Example: C:\Users\guilh\project → /mnt/c/Users/guilh/project
const wslProjectPath = args.projectPath
  .replace(/\\/g, '/')
  .replace(/^([A-Z]):/i, (match, drive) => `/mnt/${drive.toLowerCase()}`);
```

### Prompt Escaping
Special characters are escaped for safe execution in bash:
- Backslashes: `\` → `\\`
- Double quotes: `"` → `\"`
- Single quotes: `'` → `'\''`
- Dollar signs: `$` → `\$`
- Backticks: `` ` `` → ``\` ``
- Newlines: `\n` → ` ` (space)

## Testing

### Start the server:
```powershell
npm run build
node dist/server.js
```

The server will log:
- `✓ Cursor Agent CLI detected and available (version: ...)` - if cursor-agent is found
- `⚠ Cursor Agent CLI not found` - if cursor-agent is not available

### Test cursor-agent execution:
The server will automatically use WSL when running on Windows, ensuring seamless integration with the cursor-agent installed in your Ubuntu distribution.

## Troubleshooting

### Cursor Agent Not Detected
1. Verify WSL Ubuntu is running: `wsl --list --verbose`
2. Check cursor-agent installation: `wsl -d Ubuntu bash -c "~/.local/bin/cursor-agent --version"`
3. Ensure PATH is set in WSL: `wsl -d Ubuntu bash -c "source ~/.bashrc && echo \$PATH"`

### Path Issues
- Ensure project paths use Windows format (`C:\Users\...`) - the server will convert them automatically
- WSL path conversion only works for mounted drives (default: C, D, E, etc. under `/mnt/`)

## Environment Support

| Platform | Support | Command Format |
|----------|---------|----------------|
| Windows 10/11 with WSL2 | ✅ Full | Via `wsl -d Ubuntu` |
| Linux | ✅ Full | Direct execution |
| macOS | ✅ Full | Direct execution |
| Windows (without WSL) | ⚠️ Fallback | Task file method |

## Next Steps

The server is now configured to work with cursor-agent in WSL. When you call `cursor/execute-prompt`, it will:

1. Detect your OS (Windows)
2. Convert the project path to WSL format
3. Execute cursor-agent in your Ubuntu WSL distribution
4. Return the results to the MCP client

All of this happens automatically - no manual intervention required!





