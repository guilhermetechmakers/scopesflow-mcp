# Netlify Deployment Guide

This document outlines the deployment of the ScopesFlow MCP Server to Netlify and important limitations to be aware of.

## Overview

The MCP server has been adapted to run on Netlify Functions, enabling remote access via HTTP while maintaining MCP protocol compatibility.

## Architecture

- **Netlify Function**: `netlify/functions/mcp.ts` - HTTP handler that wraps the MCP server
- **Protocol**: HTTP POST requests with JSON payloads (MCP protocol messages)
- **Response Format**: JSON responses compatible with MCP protocol

## Important Limitations

### Filesystem Limitations

**CRITICAL**: Netlify Functions run in a **read-only filesystem** environment. This means:

1. **File Write Operations**: Any operations that attempt to write files to the local filesystem will **FAIL**
   - Project creation (`cursor/create-project`) - Cannot create directories/files locally
   - File modifications (`cursor/execute-prompt`) - Cannot write to project files
   - Build artifacts - Cannot write build outputs locally

2. **Workarounds Required**:
   - **External Storage**: Use cloud storage services (AWS S3, Supabase Storage, etc.) for project files
   - **Git Integration**: Store projects in Git repositories and clone/push changes
   - **Database Storage**: Store project metadata and file contents in a database
   - **Temporary Storage**: Use Netlify's `/tmp` directory (limited to 512MB, cleared between invocations)

3. **Read Operations**: File read operations may work if files are:
   - Included in the deployment bundle
   - Stored in external storage and fetched
   - Available via network requests

### Function Timeout Limits

- **Free Tier**: 10 seconds maximum execution time
- **Paid Tier**: 26 seconds maximum execution time

**Impact**: Long-running operations (builds, tests, large file operations) may timeout.

### Stateless Execution

Netlify Functions are stateless - each invocation is independent:
- No persistent connections (WebSocket not supported)
- No shared memory between invocations
- Server instance is recreated on each invocation (though we use a singleton pattern)

## Current Implementation Status

The current implementation provides:
- ✅ HTTP endpoint for MCP protocol messages
- ✅ CORS headers for cross-origin requests
- ✅ Error handling and validation
- ✅ MCP protocol compatibility

**Not Yet Implemented**:
- ❌ File storage integration (external storage required)
- ❌ Long-running operation support (timeout limitations)
- ❌ WebSocket fallback (not supported on Netlify)

## Recommended Solutions

### Option 1: External File Storage
Modify tool handlers to use cloud storage:
```typescript
// Example: Store projects in Supabase Storage or S3
const projectPath = `s3://bucket/projects/${projectId}`;
// Or
const projectPath = `supabase://storage/projects/${projectId}`;
```

### Option 2: Git-Based Workflow
Use Git repositories for project storage:
```typescript
// Clone repository, make changes, push back
await git.clone(repoUrl, tempPath);
// ... make changes ...
await git.push(tempPath);
```

### Option 3: Hybrid Approach
- Use Netlify Functions for lightweight operations (info, status checks)
- Use a separate service (VPS, AWS Lambda with longer timeout) for file operations
- Route requests based on operation type

## Environment Variables

Set the following in Netlify Dashboard → Site Settings → Environment Variables:

### MCP Server Configuration
- `MCP_SERVER_PORT` - Not used in Netlify Functions (handled by Netlify)
- `MCP_SERVER_HOST` - Not used in Netlify Functions

### VPS Configuration (Optional)
- `VPS_HOST` - VPS host for remote project deployment
- `VPS_USER` - VPS username for SSH access
- `VPS_PASSWORD` - VPS password for SSH access
- `VPS_PORT` - VPS SSH port (default: 22)
- `VPS_PROJECT_BASE_PATH` - Base path on VPS where projects will be stored

### GitHub Integration (if used)
- `GITHUB_TOKEN` - GitHub personal access token for repository operations
- `GIT_USER_NAME` - Git user name for commits
- `GIT_USER_EMAIL` - Git user email for commits

### Supabase Integration (if used)
- `SUPABASE_URL` - Supabase project URL
- `SUPABASE_SERVICE_ROLE_KEY` - Supabase service role key

### External Storage (Recommended for Netlify)
- `AWS_S3_BUCKET` - AWS S3 bucket for project storage (if using S3)
- `AWS_ACCESS_KEY_ID` - AWS access key ID
- `AWS_SECRET_ACCESS_KEY` - AWS secret access key
- `SUPABASE_STORAGE_BUCKET` - Supabase Storage bucket (if using Supabase Storage)

**Note**: For local development, create a `.env` file with these variables. For Netlify deployment, set them in the Netlify Dashboard.

## Testing Locally

```bash
# Install Netlify CLI
npm install -g netlify-cli

# Run local development server
npm run netlify:dev

# The function will be available at:
# http://localhost:8888/.netlify/functions/mcp
# Or via redirect: http://localhost:8888/api/mcp
```

## Deployment

1. **Connect Repository**: Link your Git repository to Netlify
2. **Build Settings**: Netlify will use `netlify.toml` configuration
3. **Environment Variables**: Set required variables in Netlify Dashboard
4. **Deploy**: Push to your main branch or use Netlify CLI:
   ```bash
   netlify deploy --prod
   ```

## API Usage

### Endpoint
- Production: `https://your-site.netlify.app/.netlify/functions/mcp`
- Or via redirect: `https://your-site.netlify.app/api/mcp`

### Request Format
```bash
POST /.netlify/functions/mcp
Content-Type: application/json

{
  "type": "request",
  "id": "unique-request-id",
  "method": "cursor/server-info",
  "params": {}
}
```

### Response Format
```json
{
  "id": "unique-request-id",
  "type": "response",
  "result": {
    // Tool-specific result
  }
}
```

## Next Steps

1. **Implement External Storage**: Integrate S3, Supabase Storage, or similar
2. **Update Tool Handlers**: Modify handlers to work with external storage
3. **Add Timeout Handling**: Implement graceful timeout handling for long operations
4. **Add Monitoring**: Set up logging and error tracking (Netlify Functions logs)

