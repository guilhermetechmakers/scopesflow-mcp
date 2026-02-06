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
  supabaseAnonKey?: string;
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
  /** Optional overrides from start-build payload (not persisted) */
  configOverrides?: Partial<BuildCursorConfig>;
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
  const { createProjectFn, executePromptFn, githubAuth, configOverrides } = options;

  const log = (message: string, level: 'info' | 'error' = 'info') => {
    console.error(`[BuildRunner] ${message}`);
  };

  const maskSecret = (value: unknown): unknown => {
    if (typeof value !== 'string') return value;
    if (value.length <= 8) return '***';
    return `${value.slice(0, 4)}...${value.slice(-4)}`;
  };

  const REDACT_KEYS = new Set([
    'supabaseAnonKey',
    'supabaseServiceRoleKey',
    'supabaseServiceKey',
    'supabase_service_role_key',
    'supabase_service_key',
    'supabase_anon_key',
    'accessToken',
    'anonKey',
    'gitHubToken',
  ]);

  const sanitizeRecord = (input: unknown): unknown => {
    if (!input || typeof input !== 'object') return input;
    const record = input as Record<string, unknown>;
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(record)) {
      result[key] = REDACT_KEYS.has(key) ? maskSecret(value) : value;
    }
    return result;
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

  // log_type must match DB CHECK constraint: 'build_log' or 'mcp_log'
  // Override via env if needed (e.g. MCP_BUILD_LOG_TYPE_ERROR='mcp_log')
  const LOG_TYPE_INFO = process.env.MCP_BUILD_LOG_TYPE_INFO ?? 'build_log';
  const LOG_TYPE_ERROR = process.env.MCP_BUILD_LOG_TYPE_ERROR ?? 'build_log';
  const levelToLogType = (level: string): string =>
    level === 'error' ? LOG_TYPE_ERROR : LOG_TYPE_INFO;

  const appendLog = async (message: string, level: string = 'info') => {
    const logTypeValue = levelToLogType(level);
    // Debug: log what we're trying to insert
    if (process.env.DEBUG_BUILD_LOGS === 'true') {
      console.error(`[BuildRunner] appendLog: level="${level}", log_type="${logTypeValue}", LOG_TYPE_INFO="${LOG_TYPE_INFO}", LOG_TYPE_ERROR="${LOG_TYPE_ERROR}"`);
    }
    const { error } = await supabase.from('build_logs').insert({
      build_id: buildId,
      log_type: logTypeValue,
      message,
      created_at: new Date().toISOString(),
    });
    if (error) {
      log(`Failed to append log: ${error.message}`, 'error');
      console.error(`[BuildRunner] Failed insert details: log_type="${logTypeValue}", level="${level}", env MCP_BUILD_LOG_TYPE_INFO="${process.env.MCP_BUILD_LOG_TYPE_INFO}", env MCP_BUILD_LOG_TYPE_ERROR="${process.env.MCP_BUILD_LOG_TYPE_ERROR}"`);
    }
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

  // Debug: log what we received from DB (redacted)
  console.error('[BuildRunner] Full configuration from DB:', JSON.stringify(sanitizeRecord(configuration), null, 2));
  console.error('[BuildRunner] cursorConfig from DB:', JSON.stringify(sanitizeRecord(cursorConfig), null, 2));

  // Merge any top-level configuration fields into cursorConfig (in case ScopesFlow stores them there)
  const cursorConfigObj = cursorConfig as unknown as Record<string, unknown>;
  const configObj = configuration as unknown as Record<string, unknown>;
  const mergedCursorConfig: Record<string, unknown> = {
    ...(cursorConfigObj || {}),
  };
  // Merge top-level fields if they exist and aren't already in cursorConfig
  if (configObj.projectName && !mergedCursorConfig.projectName) mergedCursorConfig.projectName = configObj.projectName;
  if (configObj.name && !mergedCursorConfig.projectName && !mergedCursorConfig.name) mergedCursorConfig.projectName = configObj.name;
  if (configObj.projectPath && !mergedCursorConfig.projectPath) mergedCursorConfig.projectPath = configObj.projectPath;
  if (configObj.path && !mergedCursorConfig.projectPath && !mergedCursorConfig.path) mergedCursorConfig.projectPath = configObj.path;
  if (configObj.gitRepository && !mergedCursorConfig.gitRepository) mergedCursorConfig.gitRepository = configObj.gitRepository;
  if (configObj.supabaseUrl && !mergedCursorConfig.supabaseUrl) mergedCursorConfig.supabaseUrl = configObj.supabaseUrl;
  if (configObj.supabase_url && !mergedCursorConfig.supabaseUrl) mergedCursorConfig.supabaseUrl = configObj.supabase_url;
  if (configObj.supabase_anon_key && !mergedCursorConfig.supabaseAnonKey) mergedCursorConfig.supabaseAnonKey = configObj.supabase_anon_key;
  if (configObj.designReference && !mergedCursorConfig.designReference) mergedCursorConfig.designReference = configObj.designReference;
  if (configObj.designPatternId && !mergedCursorConfig.designPatternId) mergedCursorConfig.designPatternId = configObj.designPatternId;
  if (mergedCursorConfig.supabase_url && !mergedCursorConfig.supabaseUrl) mergedCursorConfig.supabaseUrl = mergedCursorConfig.supabase_url;
  if (mergedCursorConfig.supabase_anon_key && !mergedCursorConfig.supabaseAnonKey) mergedCursorConfig.supabaseAnonKey = mergedCursorConfig.supabase_anon_key;

  if (configOverrides && typeof configOverrides === 'object') {
    const overrideEntries = Object.entries(configOverrides).filter(([, value]) => value !== undefined);
    if (overrideEntries.length > 0) {
      for (const [key, value] of overrideEntries) {
        mergedCursorConfig[key] = value as unknown;
      }
      console.error(
        '[BuildRunner] Applied config overrides:',
        JSON.stringify(sanitizeRecord(Object.fromEntries(overrideEntries)), null, 2)
      );
      await appendLog(`Merged start-build overrides into cursorConfig: ${overrideEntries.map(([key]) => key).join(', ')}`);
    }
  }
  
  // Debug: log merged config
  console.error('[BuildRunner] Merged cursorConfig:', JSON.stringify(sanitizeRecord(mergedCursorConfig), null, 2));

  let prompts: string[] = Array.isArray(configuration.prompts) ? configuration.prompts : [];
  let promptSource: string | undefined = prompts.length > 0 ? 'configuration.prompts' : undefined;
  if (prompts.length === 0) {
    const { data: promptRows, error: promptError } = await supabase
      .from('automated_build_prompts')
      .select('prompt, content, order')
      .eq('build_id', buildId)
      .order('order', { ascending: true });
    if (promptError) {
      log(`Failed to query automated_build_prompts: ${promptError.message}`, 'error');
      await appendLog(`Failed to query automated_build_prompts: ${promptError.message}`, 'error');
    }
    if (Array.isArray(promptRows)) {
      prompts = promptRows
        .map((r: { prompt?: string; content?: string }) => (r.prompt ?? r.content ?? ''))
        .filter(Boolean);
      if (prompts.length > 0) promptSource = 'automated_build_prompts';
    }
  }
  if (prompts.length === 0) {
    const projectId =
      (configuration as { projectId?: string; project_id?: string }).projectId ??
      (configuration as { projectId?: string; project_id?: string }).project_id;
    if (projectId) {
      const { data: flowchartRows, error: flowchartError } = await supabase
        .from('flowchart_items')
        .select('prompt, prompt_content, content, sequence_order')
        .eq('project_id', projectId)
        .eq('type', 'prompt')
        .order('sequence_order', { ascending: true });
      if (flowchartError) {
        log(`Failed to query flowchart_items: ${flowchartError.message}`, 'error');
        await appendLog(`Failed to query flowchart_items: ${flowchartError.message}`, 'error');
      }
      if (Array.isArray(flowchartRows)) {
        prompts = flowchartRows
          .map((r: { prompt?: string; prompt_content?: string; content?: string }) => (r.prompt_content ?? r.prompt ?? r.content ?? ''))
          .filter(Boolean);
        if (prompts.length > 0) promptSource = 'flowchart_items';
      }
    }
  }
  if (prompts.length === 0) {
    const message = `No prompts found for build ${buildId}. Checked configuration.prompts, automated_build_prompts, and flowchart_items.`;
    log(message, 'error');
    await appendLog(message, 'error');
    await updateStatus('failed');
    return;
  }
  await appendLog(`Loaded ${prompts.length} prompts from ${promptSource ?? 'unknown source'}`);

  const hasString = (value: unknown): value is string =>
    typeof value === 'string' && value.trim().length > 0;

  const rawProjectName =
    (mergedCursorConfig as { projectName?: unknown; name?: unknown }).projectName ??
    (mergedCursorConfig as { projectName?: unknown; name?: unknown }).name;
  const rawProjectPath =
    (mergedCursorConfig as { projectPath?: unknown; path?: unknown }).projectPath ??
    (mergedCursorConfig as { projectPath?: unknown; path?: unknown }).path;
  const rawFramework = (mergedCursorConfig as { framework?: unknown }).framework;
  const rawPackageManager = (mergedCursorConfig as { packageManager?: unknown }).packageManager;

  const missingFields: string[] = [];
  if (!hasString(rawProjectName)) missingFields.push('projectName');
  if (!hasString(rawFramework)) missingFields.push('framework');
  if (!hasString(rawPackageManager)) missingFields.push('packageManager');
  if (missingFields.length > 0) {
    const message = `Missing required build configuration: ${missingFields.join(', ')}`;
    log(message, 'error');
    await appendLog(message, 'error');
    await updateStatus('failed');
    return;
  }

  const rawSupabaseUrl = (mergedCursorConfig as { supabaseUrl?: unknown }).supabaseUrl;
  const rawSupabaseAnonKey = (mergedCursorConfig as { supabaseAnonKey?: unknown }).supabaseAnonKey;
  if ((hasString(rawSupabaseUrl) && !hasString(rawSupabaseAnonKey)) || (!hasString(rawSupabaseUrl) && hasString(rawSupabaseAnonKey))) {
    const message =
      'Supabase configuration incomplete: both supabaseUrl and supabaseAnonKey are required for automated builds.';
    log(message, 'error');
    await appendLog(message, 'error');
    await updateStatus('failed');
    return;
  }

  try {
    await updateStatus('running', 0);
    await appendLog('Build started');

    const projectName = (rawProjectName as string).trim();
    const baseDir =
      process.env.MCP_BUILD_PROJECTS_DIR || process.env.TMPDIR || process.cwd();
    const projectPath = hasString(rawProjectPath)
      ? rawProjectPath.trim()
      : path.join(baseDir, 'builds', buildId, projectName);
    if (!hasString(rawProjectPath)) {
      await appendLog(`projectPath missing; using default path ${projectPath}`);
    }

    const createConfig: BuildCursorConfig = {
      ...(mergedCursorConfig as unknown as BuildCursorConfig),
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
