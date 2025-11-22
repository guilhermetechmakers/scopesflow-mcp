# Setup Instructions for Fixed MCP Server

## 🎉 Fixes Applied

All JSON parsing errors have been fixed in the MCP server! The server now:
- ✅ Handles non-JSON responses from OpenAI gracefully
- ✅ Retries automatically (up to 3 times) with exponential backoff
- ✅ Validates responses before processing
- ✅ Provides detailed logging for debugging

## 🚀 Getting Started

### 1. Configure Environment Variables

Create a `.env` file in the root directory:

```bash
# Create the .env file (PowerShell)
New-Item -Path .env -ItemType File

# Or use your text editor to create .env
```

Add the following content to `.env`:

```env
# OpenAI Configuration (REQUIRED)
OPENAI_API_KEY=sk-your-actual-openai-api-key-here

# MCP Server Configuration (Optional - defaults shown)
MCP_SERVER_PORT=3001
MCP_SERVER_HOST=localhost

# VPS Configuration (Optional - for remote cursor-agent execution)
# If these variables are set, cursor-agent will execute on the VPS instead of locally/WSL
VPS_HOST=72.61.15.135
VPS_USER=root
VPS_PASSWORD=your-vps-password-here
VPS_PORT=22
VPS_PROJECT_BASE_PATH=/root/projects
```

⚠️ **Important:** 
- Replace `sk-your-actual-openai-api-key-here` with your real OpenAI API key from https://platform.openai.com/api-keys
- If using VPS execution, replace `your-vps-password-here` with your actual VPS password (never commit this to git)

### 2. Install Dependencies (if not already done)

```bash
npm install
```

### 3. Build the Server

```bash
npm run build
```

### 4. Start the MCP Server

```bash
# Start in WebSocket mode (for ScopesFlow integration)
npm start

# OR start in Cursor mode (for Cursor IDE integration)
npm start -- --cursor
```

## 🔧 What Was Fixed

### JSON Parsing Error
**Before:** 
```
Failed to implement AI-generated code: SyntaxError: Unexpected token 'G', "Given the "... is not valid JSON
```

**After:** 
- Enhanced prompt engineering to ensure JSON-only responses
- Multiple fallback methods to extract JSON from responses
- Automatic retry with exponential backoff (3 attempts)
- Pre-validation before processing
- Better error messages with detailed logging

### Changes Made to `server.ts`:

1. **Improved AI Prompts** - Clearer instructions for JSON-only output
2. **Retry Logic** - Automatic retries with 2s, 4s, 8s delays
3. **Response Validation** - Validates JSON structure before processing
4. **Better JSON Extraction** - Multiple methods to extract JSON from text
5. **Enhanced Logging** - ✓/✗ indicators for easy debugging
6. **Model Switch** - Using `gpt-4o-mini` for better cost/performance

## 📝 Testing the Fixes

### Test 1: Check Server Startup
```bash
npm start
```

You should see:
```
Starting MCP server in WebSocket mode...
[MCP Server] OpenAI client initialized
Starting ScopesFlow Cursor MCP Server on ws://localhost:3001
```

### Test 2: Create a Test Project

Use your frontend to create a project and execute a prompt. The logs should show:

```
[MCP Server] Attempt 1/3...
[MCP Server] ✓ AI response received (1234 characters)
[MCP Server] ✓ Response validation successful
[MCP Server] ✓ Successfully parsed AI response as JSON
[MCP Server] Processing 3 file(s)...
[MCP Server] ✓ Created file: src/App.tsx
[MCP Server] ✓ Created file: src/components/Button.tsx
[MCP Server] Implementation complete: 3 created, 0 modified
```

### Test 3: Verify Error Recovery

If the AI returns invalid JSON, you should see automatic retries:

```
[MCP Server] Attempt 1/3...
[MCP Server] ✗ Attempt 1 failed: Invalid AI response
[MCP Server] Retrying in 2000ms...
[MCP Server] Attempt 2/3...
[MCP Server] ✓ AI response received
[MCP Server] ✓ Response validation successful
```

## 🐛 React Flow Warning (Frontend Fix Needed)

The React Flow warning in your console:
```
[React Flow]: It looks like you've created a new nodeTypes or edgeTypes object.
```

This needs to be fixed in your **frontend application**, not the MCP server.

### Quick Fix for Your Frontend:

Find where you're using `<ReactFlow>` and update it:

**❌ Before (causes warning):**
```typescript
function MyComponent() {
  return (
    <ReactFlow 
      nodeTypes={{
        custom: CustomNode,
      }}
      edgeTypes={{
        custom: CustomEdge,
      }}
    />
  );
}
```

**✅ After (fixed):**
```typescript
// Define outside the component
const nodeTypes = {
  custom: CustomNode,
};

const edgeTypes = {
  custom: CustomEdge,
};

function MyComponent() {
  return (
    <ReactFlow 
      nodeTypes={nodeTypes}
      edgeTypes={edgeTypes}
    />
  );
}
```

**✅ Alternative (using useMemo):**
```typescript
function MyComponent() {
  const nodeTypes = useMemo(() => ({
    custom: CustomNode,
  }), []);

  const edgeTypes = useMemo(() => ({
    custom: CustomEdge,
  }), []);

  return (
    <ReactFlow 
      nodeTypes={nodeTypes}
      edgeTypes={edgeTypes}
    />
  );
}
```

## 📊 Monitoring and Logs

### Useful Log Indicators

- `✓` - Success
- `✗` - Failure (will retry)
- `[MCP Server] Attempt X/3` - Retry attempt number
- `Response preview:` - Shows first 300 chars of AI response
- `filesCreated` / `filesModified` - Number of files changed

### Common Issues and Solutions

| Issue | Solution |
|-------|----------|
| `OPENAI_API_KEY not found` | Create `.env` file with your API key |
| `Failed to get valid AI response after 3 attempts` | Check your OpenAI API key and credit balance |
| `Project directory does not exist` | Ensure the project path is correct |
| Connection refused on port 3001 | Check if another process is using port 3001, or change `MCP_SERVER_PORT` in `.env` |

## 🌐 VPS Execution Setup (Optional)

If you want to execute cursor-agent on a remote VPS instead of locally, follow these steps:

### Prerequisites

1. **Install sshpass** (required for password authentication):
   - **Linux (Debian/Ubuntu)**: `sudo apt-get install sshpass`
   - **macOS**: `brew install hudochenkov/sshpass/sshpass`
   - **Windows**: Install Git Bash or use WSL, then install sshpass in WSL

2. **Ensure cursor-agent is installed on VPS**:
   ```bash
   ssh root@72.61.15.135
   curl https://cursor.com/install -fsS | bash
   ```

3. **Configure environment variables** in your `.env` file:
   ```env
   VPS_HOST=72.61.15.135
   VPS_USER=root
   VPS_PASSWORD=your-actual-password
   VPS_PORT=22
   VPS_PROJECT_BASE_PATH=/root/projects
   ```

### How It Works

- When VPS configuration is detected, the server will:
  1. Transfer prompt files to the VPS via SCP
  2. Execute cursor-agent commands via SSH
  3. Stream output back in real-time
  4. Handle file synchronization automatically

- **Path Handling**: 
  - If `VPS_PROJECT_BASE_PATH` is set, projects are assumed to be under that path
  - Otherwise, local paths are converted to VPS paths automatically

### Security Notes

- ⚠️ **Never commit your `.env` file** with VPS credentials to git
- 🔒 Password is stored securely in environment variables (never logged)
- 🔑 Consider setting up SSH key authentication for better security (future enhancement)

## 🎯 Next Steps

1. ✅ Create `.env` file with your OpenAI API key
2. ✅ (Optional) Configure VPS settings if using remote execution
3. ✅ Start the MCP server: `npm start`
4. ✅ Test project creation and AI code generation
5. ⚠️ Fix React Flow warning in your frontend (see above)
6. 📊 Monitor console logs for any issues

## 💡 Tips

- **Cost Optimization**: The server now uses `gpt-4o-mini` which is much cheaper than `gpt-4o`
- **Token Limit**: Increased from 4000 to 16000 tokens for larger projects
- **Retries**: Automatic retries mean temporary API issues won't fail your builds
- **Logging**: Use the console logs to debug issues - they're very detailed now

## 🆘 Still Having Issues?

1. Check console logs for detailed error messages
2. Verify your OpenAI API key: https://platform.openai.com/api-keys
3. Check your OpenAI account has available credits
4. Ensure project paths are accessible and have proper permissions
5. Try increasing `max_tokens` in `server.ts` (line 493) if generating very large files

---

**All server-side fixes are complete and tested!** 🎉

The only remaining issue is the React Flow warning in your frontend application.





