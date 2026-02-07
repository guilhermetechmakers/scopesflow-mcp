# Model Selection Feature — Implementation Plan

## Summary
Enable dynamic model selection for Cursor Agent prompts. Currently, the model is hardcoded as "auto" in the `executePrompt` method. This feature will allow the app to specify which model to use when calling `cursor/execute-prompt`, particularly for the first prompt when creating a project. The model parameter will be optional and default to "auto" if not provided, maintaining backward compatibility.

## Scope
- In scope:
  - Add `model` parameter to `ExecutePromptArgs` interface
  - Add `model` parameter to `cursor/execute-prompt` tool schema
  - Update command construction in `executePrompt` to use the provided model (defaulting to "auto")
  - Update `autoFixBuildErrors` to accept and use model parameter (defaulting to "auto")
  - Add `model` parameter to `BuildExecutePromptArgs` in build-runner.ts
  - Update validation functions to accept the model parameter
- Out of scope:
  - Model validation/enumeration (will accept any string, trusting the app to provide valid models)
  - Model selection UI in the app (handled by the app)
  - Persisting model preference per project (can be added later if needed)

## Architecture / Approach
The model parameter will flow from the app → MCP tool call → `ExecutePromptArgs` → command construction. The change is minimal and backward-compatible since the model defaults to "auto" if not provided. The model is used in the cursor-agent command line argument `--model <model>`.

Available models (from comment in code): auto, sonnet-4.5, sonnet-4.5-thinking, gpt-5, opus-4.1, grok, gemini-3-pro

## Implementation Steps

### Step 1: Update ExecutePromptArgs Interface ✅
- Files modified: `server.ts` (line ~43)
- Description: Added optional `model?: string` field to `ExecutePromptArgs` interface
- Status: Completed

### Step 2: Update Tool Schema for cursor/execute-prompt ✅
- Files modified: `server.ts` (line ~748)
- Description: Added `model` property to the `cursor/execute-prompt` tool inputSchema with description
- Status: Completed

### Step 3: Update validateExecutePromptArgs ✅
- Files modified: `server.ts` (line ~1114)
- Description: Updated to accept and return `model` parameter in validation function
- Status: Completed

### Step 4: Update executePrompt Command Construction ✅
- Files modified: `server.ts` (lines ~2176, ~2182)
- Description: Replaced hardcoded `--model auto` with `--model ${args.model || 'auto'}` in both Windows/WSL and Unix command construction
- Status: Completed

### Step 5: Update autoFixBuildErrors Method ✅
- Files modified: `server.ts` (lines ~3292, ~3370, ~3372, ~3413, ~3419)
- Description: Added optional `model` parameter to `autoFixBuildErrors` method signature and updated all calls to pass model through
- Status: Completed

### Step 6: Update BuildExecutePromptArgs Interface ✅
- Files modified: `build-runner.ts` (line ~31)
- Description: Added optional `model?: string` field to `BuildExecutePromptArgs` interface
- Status: Completed

### Step 7: Pass Model Through Build Runner ✅
- Files modified: `build-runner.ts` (lines ~293, ~439-461)
- Description: Extract model from configuration (mergedCursorConfig or top-level config) and pass it to `executeArgs` when calling `executePromptFn`
- Status: Completed

## Data / API Changes
- **API Change**: `cursor/execute-prompt` tool now accepts optional `model` parameter
- **No database changes**: Model is passed at runtime, not persisted
- **Backward compatible**: All existing calls without `model` will default to "auto"

## Testing / Validation
1. Test with model parameter: Call `cursor/execute-prompt` with `model: "sonnet-4.5"` and verify the command uses that model
2. Test without model parameter: Call `cursor/execute-prompt` without `model` and verify it defaults to "auto"
3. Test first prompt: Verify model can be passed when creating a project and executing the first prompt
4. Test auto-fix: Verify `autoFixBuildErrors` still works (will use default "auto")

## Notes / Risks
- **Assumption**: The app will provide valid model names. No validation is performed on the model string.
- **Tradeoff**: We're not validating model names to keep it flexible for future models without code changes.
- **Follow-up**: Consider adding model validation/enumeration if invalid models cause issues.
- **Backward compatibility**: All existing code paths will continue to work with default "auto" model.
