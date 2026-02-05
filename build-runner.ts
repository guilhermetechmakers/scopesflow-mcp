import * as path from 'path';
import type { SupabaseClient } from '@supabase/supabase-js';

/** Config passed to create-project (matches server CursorProjectConfig shape). */
export interface BuildCursorConfig {
  projectName: string;
  projectPath: string;
  framework: string;
  packageManager: string;
  template?: string;
  gitRepository?: string;
  gitHubToken?: string;
  gitUserName?: string;
  gitUserEmail?: string;
  supabaseUrl?: string;
  supabaseServiceRoleKey?: string;
  designPattern?: string;
  designPatternSummary?: string;
  designPatternDetails?: string;
  designColorPalette?: string;
  designTypographyLayout?: string;
  designKeyElements?: string;
  designPhilosophy?: string;
  designReference?: string;
  designPatternId?: string;
  designPatternStore?: string;
}

/** Args passed to execute-prompt (matches server ExecutePromptArgs shape). */
export interface BuildExecutePromptArgs {
  prompt: string;
  projectPath: string;
  timeout?: number;
  context?: string;
  files?: string[];
  gitHubToken?: string;
  gitUserName?: string;
  gitUserEmail?: string;
  gitRepository?: string;
  isFirstPrompt?: boolean;
  retryCount?: number;
  isRetry?: boolean;
}

export type CreateProjectFn = (config: BuildCursorConfig) => Promise<unknown>;
export type ExecutePromptFn = (args: BuildExecutePromptArgs) => Promise<unknown>;

export interface RunBuildLoopOptions {
  createProjectFn: CreateProjectFn;
  executePromptFn: ExecutePromptFn;
  /** Optional GitHub auth to merge into create/execute calls */
  githubAuth?: { gitHubToken?: string; gitUserName?: string; gitUserEmail?: string };
}

/** Row from automated_builds (expected columns). */
export interface AutomatedBuildRow {
  id: string;
  user_id: string;
  status: string;
  progress?: number;
  configuration?: {
    cursorConfig?: BuildCursorConfig;
    prompts?: string[];
    [key: string]: unknown;
  };
  created_at?: string;
  updated_at?: string;
}

/**
 * Build loop: load build + config + prompts from DB, create project, run prompts,
 * write build_logs and update automated_builds (status, progress).
 */
export async function runBuildLoop(
  supabase: SupabaseClient,
  buildId: string,
  options: RunBuildLoopOptions
): Promise<void> {
  const { createProjectFn, executePromptFn, githubAuth } = options;

  const log = (message: string, level: 'info' | 'error' = 'info') => {
    console.error(`[BuildRunner] ${message}`);
  };

  const updateStatus = async (status: string, progress?: number) => {
    const payload: { status: string; progress?: number; updated_at?: string } = {
      status,
      updated_at: new Date().toISOString(),
    };
    if (progress !== undefined) payload.progress = progress;
    const { error } = await supabase
      .from('automated_builds')
      .update(payload)
      .eq('id', buildId);
    if (error) log(`Failed to update status: ${error.message}`, 'error');
  };

  const appendLog = async (message: string, level: string = 'info') => {
    const { error } = await supabase.from('build_logs').insert({
      build_id: buildId,
      log_type: level,
      message,
      created_at: new Date().toISOString(),
    });
    if (error) log(`Failed to append log: ${error.message}`, 'error');
  };

  const { data: buildRow, error: fetchError } = await supabase
    .from('automated_builds')
    .select('*')
    .eq('id', buildId)
    .single();

  if (fetchError || !buildRow) {
    log(`Build not found: ${buildId}`, 'error');
    await updateStatus('failed');
    await appendLog(`Build not found: ${buildId}`, 'error');
    return;
  }

  const row = buildRow as AutomatedBuildRow;
  const configuration = row.configuration;
  const cursorConfig = configuration?.cursorConfig;

  if (!configuration || !cursorConfig) {
    log('Build configuration or cursorConfig missing', 'error');
    await updateStatus('failed');
    await appendLog('Build configuration or cursorConfig missing', 'error');
    return;
  }

  let prompts: string[] = Array.isArray(configuration.prompts) ? configuration.prompts : [];
  if (prompts.length === 0) {
    const { data: promptRows } = await supabase
      .from('automated_build_prompts')
      .select('prompt, content, order')
      .eq('build_id', buildId)
      .order('order', { ascending: true });
    if (Array.isArray(promptRows)) {
      prompts = promptRows.map((r: { prompt?: string; content?: string }) => (r.prompt ?? r.content ?? '')).filter(Boolean);
    }
  }

  try {
    await updateStatus('running', 0);
    await appendLog('Build started');

    const projectName =
      (cursorConfig as { projectName?: string; name?: string }).projectName ??
      (cursorConfig as { projectName?: string; name?: string }).name ??
      'app';
    const baseDir =
      process.env.MCP_BUILD_PROJECTS_DIR || process.env.TMPDIR || process.cwd();
    const rawPath =
      (cursorConfig as { projectPath?: string; path?: string }).projectPath ??
      (cursorConfig as { projectPath?: string; path?: string }).path;
    const projectPath =
      typeof rawPath === 'string' && rawPath.trim()
        ? rawPath.trim()
        : path.join(baseDir, 'builds', buildId, projectName);

    const createConfig: BuildCursorConfig = {
      ...cursorConfig,
      projectName,
      projectPath,
    };
    if (githubAuth) {
      if (githubAuth.gitHubToken) createConfig.gitHubToken = githubAuth.gitHubToken;
      if (githubAuth.gitUserName) createConfig.gitUserName = githubAuth.gitUserName;
      if (githubAuth.gitUserEmail) createConfig.gitUserEmail = githubAuth.gitUserEmail;
    }

    await appendLog(`Creating project at ${projectPath}`);
    await createProjectFn(createConfig);
    await appendLog('Project created');

    const totalSteps = prompts.length || 1;
    let done = 0;

    for (let i = 0; i < prompts.length; i++) {
      const prompt = prompts[i];
      const stepNum = i + 1;
      await appendLog(`Running prompt ${stepNum}/${totalSteps}`);
      const executeArgs: BuildExecutePromptArgs = {
        prompt,
        projectPath,
        isFirstPrompt: i === 0,
        retryCount: 0,
        isRetry: false,
      };
      if (githubAuth) {
        if (githubAuth.gitHubToken) executeArgs.gitHubToken = githubAuth.gitHubToken;
        if (githubAuth.gitUserName) executeArgs.gitUserName = githubAuth.gitUserName;
        if (githubAuth.gitUserEmail) executeArgs.gitUserEmail = githubAuth.gitUserEmail;
      }
      await executePromptFn(executeArgs);
      done++;
      const progress = Math.round((done / totalSteps) * 100);
      await updateStatus('running', progress);
    }

    await updateStatus('completed', 100);
    await appendLog('Build completed successfully');
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    log(`Build failed: ${message}`, 'error');
    await appendLog(`Build failed: ${message}`, 'error');
    await updateStatus('failed');
  }
}
