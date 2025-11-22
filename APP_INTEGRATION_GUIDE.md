# App Integration Guide - GitHub Auto-Commit with MCP Server

## Overview

This guide shows you exactly what to change in your app to integrate with the enhanced MCP server that now supports automatic GitHub commits.

## What Changed in the MCP Server

The MCP server now accepts GitHub OAuth tokens and automatically:
- ✅ Creates initial commit when creating projects
- ✅ Auto-commits after every Cursor Agent execution
- ✅ Pushes to GitHub main branch
- ✅ Retries once on failure, then logs error and continues
- ✅ Includes full prompt text in commit messages

## Required Changes in Your App

### 1. Update cursor/create-project Calls

**BEFORE:**
```typescript
await mcpServer.callTool('cursor/create-project', {
  name: projectName,
  path: projectPath,
  framework: 'vite',
  packageManager: 'npm',
  gitRepository: githubRepoUrl  // Optional
});
```

**AFTER:**
```typescript
await mcpServer.callTool('cursor/create-project', {
  name: projectName,
  path: projectPath,
  framework: 'vite',
  packageManager: 'npm',
  gitRepository: githubRepoUrl,           // e.g., 'https://github.com/user/repo.git'
  gitHubToken: userOAuthToken,            // NEW - From your OAuth
  gitUserName: userGitHubName,            // NEW - From your OAuth user data
  gitUserEmail: userGitHubEmail           // NEW - From your OAuth user data
});
```

### 2. Update cursor/execute-prompt Calls

**BEFORE:**
```typescript
await mcpServer.callTool('cursor/execute-prompt', {
  prompt: userPrompt,
  projectPath: projectPath
});
```

**AFTER:**
```typescript
await mcpServer.callTool('cursor/execute-prompt', {
  prompt: userPrompt,
  projectPath: projectPath,
  gitHubToken: userOAuthToken,            // NEW - From your OAuth
  gitUserName: userGitHubName,            // NEW - From your OAuth user data
  gitUserEmail: userGitHubEmail           // NEW - From your OAuth user data
});
```

## Extracting GitHub User Data from OAuth

### From GitHub OAuth Response

```typescript
// After successful GitHub OAuth authentication:
const userOAuthToken = oauthUser.access_token;    // The OAuth access token
const userGitHubName = oauthUser.login;           // GitHub username
const userGitHubEmail = oauthUser.email;          // User's email

// If email is not in the profile, make an additional API call:
const emailResponse = await fetch('https://api.github.com/user/emails', {
  headers: {
    'Authorization': `Bearer ${userOAuthToken}`,
    'Accept': 'application/vnd.github.v3+json'
  }
});
const emails = await emailResponse.json();
const primaryEmail = emails.find(e => e.primary)?.email;
```

### Example: Complete Integration

```typescript
// Assuming you have a user object from GitHub OAuth
const githubUser = {
  token: 'ghp_xxxxxxxxxxxx',
  login: 'johndoe',
  email: 'john@example.com'
};

// Create project with GitHub integration
const createResult = await mcpServer.callTool('cursor/create-project', {
  name: 'my-awesome-app',
  path: '/path/to/projects/my-awesome-app',
  framework: 'vite',
  packageManager: 'npm',
  gitRepository: 'https://github.com/johndoe/my-awesome-app.git',
  gitHubToken: githubUser.token,
  gitUserName: githubUser.login,
  gitUserEmail: githubUser.email
});

// Execute prompts with auto-commit
const promptResult = await mcpServer.callTool('cursor/execute-prompt', {
  prompt: 'Add a user authentication system with login and signup forms',
  projectPath: '/path/to/projects/my-awesome-app',
  gitHubToken: githubUser.token,
  gitUserName: githubUser.login,
  gitUserEmail: githubUser.email
});
```

## GitHub OAuth Configuration

### Required Scopes

Ensure your GitHub OAuth app requests these scopes:
```typescript
const GITHUB_OAUTH_SCOPES = [
  'repo',        // Full control of private repositories
  'user:email'   // Access to user email addresses
];
```

### OAuth App Setup

1. Go to GitHub Settings > Developer settings > OAuth Apps
2. Create a new OAuth App or update existing one
3. Set the scopes to: `repo user:email`
4. Note your Client ID and Client Secret

## Optional: Conditional GitHub Integration

Make GitHub integration optional based on user authentication:

```typescript
function buildMCPParams(projectData, githubUser = null) {
  const baseParams = {
    name: projectData.name,
    path: projectData.path,
    framework: projectData.framework,
    packageManager: projectData.packageManager
  };

  // Add GitHub fields only if user is authenticated
  if (githubUser && githubUser.token) {
    return {
      ...baseParams,
      gitRepository: projectData.githubRepoUrl,
      gitHubToken: githubUser.token,
      gitUserName: githubUser.login,
      gitUserEmail: githubUser.email
    };
  }

  return baseParams;
}

// Usage
const params = buildMCPParams(projectData, authenticatedGithubUser);
await mcpServer.callTool('cursor/create-project', params);
```

## Error Handling

### Recommended Error Handling Pattern

```typescript
try {
  const result = await mcpServer.callTool('cursor/create-project', {
    name: projectName,
    path: projectPath,
    framework: 'vite',
    packageManager: 'npm',
    gitRepository: githubRepoUrl,
    gitHubToken: userOAuthToken,
    gitUserName: userGitHubName,
    gitUserEmail: userGitHubEmail
  });
  
  const response = JSON.parse(result.content[0].text);
  
  if (response.success) {
    console.log('✅ Project created and pushed to GitHub!');
    console.log(`Files changed: ${response.filesChanged.length}`);
  } else {
    console.error('❌ Project creation failed:', response.error);
  }
} catch (error) {
  console.error('❌ MCP call failed:', error);
  // Handle the error appropriately
}
```

### Note on Commit Failures

The MCP server is designed to be resilient:
- If a commit fails, it will retry once (with 2-second delay)
- If it fails again, it logs the error but continues the operation
- Your project creation or prompt execution will still succeed
- Check MCP server logs for commit failure details

## Testing Checklist

Before deploying to production, test these scenarios:

- [ ] Project creation without GitHub token (should work as before)
- [ ] Project creation with GitHub token (should commit and push)
- [ ] Cursor Agent execution without token (should work as before)
- [ ] Cursor Agent execution with token (should auto-commit)
- [ ] Invalid GitHub token (should log error and continue)
- [ ] Network failure during commit (should retry once, then continue)
- [ ] Verify commits appear in GitHub with correct author
- [ ] Verify commit messages include full prompt text

## Summary of Required Changes

### Minimal Changes Required:

1. ✅ **Add 3 new parameters** to `cursor/create-project` calls:
   - `gitHubToken`
   - `gitUserName`
   - `gitUserEmail`

2. ✅ **Add 3 new parameters** to `cursor/execute-prompt` calls:
   - `gitHubToken`
   - `gitUserName`
   - `gitUserEmail`

3. ✅ **Extract user data** from GitHub OAuth response:
   - Access token
   - Username (login)
   - Email

4. ✅ **Ensure OAuth scopes** include `repo` and `user:email`

### What You Get Automatically:

- ✅ Initial commits on project creation
- ✅ Auto-commits after every AI code generation
- ✅ Automatic pushes to GitHub
- ✅ Retry logic for failed commits
- ✅ Full prompt text in commit messages
- ✅ Proper git author attribution
- ✅ Graceful error handling

## Example Implementation

Here's a complete example of how to integrate this in your app:

```typescript
// 1. Store GitHub user data after OAuth
interface GitHubUser {
  token: string;
  login: string;
  email: string;
}

let currentGitHubUser: GitHubUser | null = null;

// 2. After successful OAuth
async function handleGitHubOAuth(code: string) {
  // Exchange code for token
  const tokenResponse = await exchangeCodeForToken(code);
  
  // Get user info
  const userResponse = await fetch('https://api.github.com/user', {
    headers: {
      'Authorization': `Bearer ${tokenResponse.access_token}`,
      'Accept': 'application/vnd.github.v3+json'
    }
  });
  const userData = await userResponse.json();
  
  // Store user data
  currentGitHubUser = {
    token: tokenResponse.access_token,
    login: userData.login,
    email: userData.email
  };
}

// 3. Use in MCP calls
async function createProject(projectName: string, projectPath: string, githubRepoUrl: string) {
  const params: any = {
    name: projectName,
    path: projectPath,
    framework: 'vite',
    packageManager: 'npm'
  };
  
  // Add GitHub integration if user is authenticated
  if (currentGitHubUser) {
    params.gitRepository = githubRepoUrl;
    params.gitHubToken = currentGitHubUser.token;
    params.gitUserName = currentGitHubUser.login;
    params.gitUserEmail = currentGitHubUser.email;
  }
  
  return await mcpServer.callTool('cursor/create-project', params);
}

async function executePrompt(prompt: string, projectPath: string) {
  const params: any = {
    prompt,
    projectPath
  };
  
  // Add GitHub integration if user is authenticated
  if (currentGitHubUser) {
    params.gitHubToken = currentGitHubUser.token;
    params.gitUserName = currentGitHubUser.login;
    params.gitUserEmail = currentGitHubUser.email;
  }
  
  return await mcpServer.callTool('cursor/execute-prompt', params);
}
```

## Questions?

If you encounter any issues:
1. Check MCP server logs for detailed error messages
2. Verify GitHub OAuth token has correct scopes
3. Ensure GitHub repository exists before creating project
4. Verify user has write access to the repository

The integration is backward compatible - existing functionality without GitHub tokens will continue to work exactly as before!
