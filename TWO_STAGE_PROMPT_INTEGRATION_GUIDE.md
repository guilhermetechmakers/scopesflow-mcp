# Two-Stage Prompt System - Integration Guide

## Overview

The MCP server now supports a two-stage prompt system that significantly reduces token usage and API costs:

- **First Prompt**: Comprehensive setup with full boilerplate documentation (~15,000-20,000 tokens)
- **Subsequent Prompts**: Streamlined with design reference and success criteria (~2,000-3,000 tokens)

This results in an **85% token reduction** for subsequent prompts.

## How It Works

### First Prompt (isFirstPrompt: true)
When `isFirstPrompt: true` is passed, the server sends:
- Complete REACT_BOILERPLATE.md
- Complete MODERN_STACK_QUICK_REFERENCE.md
- Complete TESTING_GUIDE.md
- Complete API_LAYER_GUIDE.md
- All 12 implementation instructions
- User's prompt

**Use case**: Initial project setup, establishing patterns, installing dependencies

### Subsequent Prompts (isFirstPrompt: false or omitted)
When `isFirstPrompt: false` or omitted, the server sends:
- Minimal critical requirements list
- DESIGN_REFERENCE.md (concise design patterns)
- SUCCESS_CRITERIA.md (quality checklist)
- User's prompt

**Use case**: Feature additions, bug fixes, refactoring, all work after initial setup

## App Integration

### When to Use First Prompt

Pass `isFirstPrompt: true` in these scenarios:

1. **Right after project creation** - First prompt to build initial structure
2. **Major refactoring** - When restructuring the entire project
3. **New developer onboarding** - When starting fresh on existing project

### When to Use Subsequent Prompt

Pass `isFirstPrompt: false` (or omit the parameter) for:

1. **All feature additions** - Adding new components, pages, features
2. **Bug fixes** - Fixing issues in existing code
3. **Improvements** - Refining existing features
4. **Updates** - Updating dependencies or configurations
5. **General development** - 95% of your prompts

## API Usage Examples

### First Prompt Example
```javascript
await mcpClient.callTool('cursor/execute-prompt', {
  prompt: "Set up the initial project structure with authentication, dashboard, and user profile pages",
  projectPath: "/path/to/project",
  isFirstPrompt: true,  // ← Include full boilerplate docs
  gitHubToken: "ghp_...",
  gitUserName: "John Doe",
  gitUserEmail: "john@example.com"
});
```

### Subsequent Prompt Example
```javascript
await mcpClient.callTool('cursor/execute-prompt', {
  prompt: "Add a settings page with dark mode toggle and notification preferences",
  projectPath: "/path/to/project",
  isFirstPrompt: false,  // ← Use streamlined prompt (or omit entirely)
  gitHubToken: "ghp_...",
  gitUserName: "John Doe",
  gitUserEmail: "john@example.com"
});
```

## Recommended App Flow

### Option 1: Automatic Detection
```javascript
// Check if this is the first prompt (e.g., based on prompt count)
const promptCount = await getPromptCountForProject(projectId);
const isFirstPrompt = promptCount === 0;

await executePrompt({
  prompt: userPrompt,
  projectPath: projectPath,
  isFirstPrompt: isFirstPrompt
});
```

### Option 2: User Control
```javascript
// Give user a checkbox: "This is my first prompt for this project"
const isFirstPrompt = userSelectedFirstPrompt;

await executePrompt({
  prompt: userPrompt,
  projectPath: projectPath,
  isFirstPrompt: isFirstPrompt
});
```

### Option 3: Time-Based Detection
```javascript
// If project was created less than 5 minutes ago, treat as first prompt
const projectCreatedAt = await getProjectCreationTime(projectId);
const isRecent = Date.now() - projectCreatedAt < 5 * 60 * 1000;
const isFirstPrompt = isRecent && promptCount === 0;

await executePrompt({
  prompt: userPrompt,
  projectPath: projectPath,
  isFirstPrompt: isFirstPrompt
});
```

## Implementation in Your App

### Step 1: Add isFirstPrompt to Your Database
```sql
-- Track prompt count per project
ALTER TABLE prompts ADD COLUMN prompt_number INTEGER;
ALTER TABLE prompts ADD COLUMN is_first_prompt BOOLEAN DEFAULT false;
```

### Step 2: Update Your executePrompt Function
```typescript
async function executePrompt(params: {
  prompt: string;
  projectPath: string;
  projectId: string;
}) {
  // Get prompt count for this project
  const promptCount = await db.prompts.count({
    where: { projectId: params.projectId }
  });
  
  // First prompt if this is the very first one
  const isFirstPrompt = promptCount === 0;
  
  // Call MCP server
  const result = await mcpClient.callTool('cursor/execute-prompt', {
    prompt: params.prompt,
    projectPath: params.projectPath,
    isFirstPrompt: isFirstPrompt,
    // ... other params
  });
  
  // Save prompt record
  await db.prompts.create({
    data: {
      projectId: params.projectId,
      prompt: params.prompt,
      promptNumber: promptCount + 1,
      isFirstPrompt: isFirstPrompt,
      result: result
    }
  });
  
  return result;
}
```

### Step 3: UI Indication (Optional)
```tsx
function PromptInput({ projectId }: Props) {
  const [promptCount, setPromptCount] = useState(0);
  
  useEffect(() => {
    // Fetch prompt count when component mounts
    fetchPromptCount(projectId).then(setPromptCount);
  }, [projectId]);
  
  return (
    <div>
      <textarea placeholder="Enter your prompt..." />
      {promptCount === 0 && (
        <div className="text-sm text-muted-foreground">
          ℹ️ This is your first prompt - full setup mode enabled
        </div>
      )}
      <button>Generate</button>
    </div>
  );
}
```

## Token Savings Calculator

### Example Project with 10 Prompts

**Old System (all prompts with full docs):**
- 10 prompts × 15,000 tokens = 150,000 tokens

**New System (1 first + 9 subsequent):**
- 1 first prompt × 15,000 tokens = 15,000 tokens
- 9 subsequent × 2,500 tokens = 22,500 tokens
- **Total: 37,500 tokens**

**Savings: 112,500 tokens (75% reduction)**

### Typical Project (50 prompts)
**Old**: 750,000 tokens  
**New**: 15,000 + (49 × 2,500) = 137,500 tokens  
**Savings: 612,500 tokens (82% reduction)**

## Best Practices

1. **Default to subsequent prompts**: Only use `isFirstPrompt: true` when absolutely necessary
2. **Track prompt history**: Keep a count to automatically determine first vs subsequent
3. **Log token usage**: Monitor actual token consumption to verify savings
4. **User education**: Explain to users why the first prompt might take longer
5. **Clear feedback**: Show users when first-prompt mode is being used

## Files Created

This implementation added three new files:

1. **DESIGN_REFERENCE.md** - Concise design patterns and component examples (~500-1000 tokens)
2. **SUCCESS_CRITERIA.md** - Quality checklist for cursor-agent to follow (~300-500 tokens)
3. **TWO_STAGE_PROMPT_INTEGRATION_GUIDE.md** - This guide

## Server Changes

### Modified Files
- **server.ts**
  - Added `isFirstPrompt?: boolean` to `ExecutePromptArgs` interface
  - Updated `validateExecutePromptArgs` to handle the new parameter
  - Refactored `executePrompt` method with conditional prompt logic
  - Added logging to show which prompt type is being used

## Testing

### Manual Test Cases

1. **Test First Prompt**
```bash
# Should include full boilerplate docs
curl -X POST http://localhost:3000/cursor/execute-prompt \
  -d '{
    "prompt": "Create initial app structure",
    "projectPath": "/path/to/test-project",
    "isFirstPrompt": true
  }'
```

2. **Test Subsequent Prompt**
```bash
# Should use streamlined prompt
curl -X POST http://localhost:3000/cursor/execute-prompt \
  -d '{
    "prompt": "Add a new feature",
    "projectPath": "/path/to/test-project",
    "isFirstPrompt": false
  }'
```

3. **Test Default Behavior**
```bash
# Should default to subsequent (isFirstPrompt: false)
curl -X POST http://localhost:3000/cursor/execute-prompt \
  -d '{
    "prompt": "Fix a bug",
    "projectPath": "/path/to/test-project"
  }'
```

## Monitoring

Check server logs for these messages:

- `[MCP Server] Using FIRST PROMPT with full boilerplate documentation`
- `[MCP Server] Using SUBSEQUENT PROMPT with design reference and success criteria`

This helps verify the correct prompt type is being used.

## Support

If you have questions or issues:
1. Check server logs for prompt type being used
2. Verify `isFirstPrompt` parameter is being passed correctly
3. Confirm DESIGN_REFERENCE.md and SUCCESS_CRITERIA.md exist in server directory
4. Review this guide for best practices

