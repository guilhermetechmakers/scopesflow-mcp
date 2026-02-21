import * as path from 'path';
import { access } from 'fs/promises';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { runDesignAgent } from './design-agent-runner.js';
import { runDebugAgent } from './debug-agent-runner.js';
import { runScopeCheckAgent } from './scope-check-agent-runner.js';

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
  supabaseClient?: SupabaseClient;
  userId?: string;
  /** When set, the MCP server can append to build_logs for this build in realtime. */
  buildId?: string;
  /** Model to use for cursor-agent (defaults to "composer-1.5" if not provided). */
  model?: string;
  /** Per-user Cursor API key (passed to cursor-agent via CURSOR_API_KEY env var). */
  cursorApiKey?: string;
  /** Flowchart prompt ID — included in mcp_log so build-automation-handle-completion marks the correct prompt. */
  promptId?: string;
}

export type CreateProjectFn = (config: BuildCursorConfig) => Promise<unknown>;
export type ExecutePromptFn = (args: BuildExecutePromptArgs) => Promise<unknown>;

/** Parsed result from executePromptFn (extracted from MCP content[0].text). */
export interface ExecutePromptResult {
  success: boolean;
  error?: string | null;
  output?: string;
  filesChanged?: string[];
  timeElapsed?: number;
  hasMigrations?: boolean;
  migrations?: Array<{ filename: string; description: string; sql: string }>;
}

/** Item in the prompt execution queue. */
export interface PromptQueueItem {
  id: string;
  prompt_content: string;
  title?: string;
  source: 'sequence' | 'generated' | 'custom';
  type: string;
}

/** Active build tracker entry shared with server.ts. */
export interface ActiveBuildEntry {
  buildId: string;
  projectId: string;
  projectName: string;
  startedAt: string;
  currentStep: number;
  totalSteps: number;
  status: string;
  projectPath: string;
  previewPort?: number;
}

export interface RunBuildLoopOptions {
  createProjectFn: CreateProjectFn;
  executePromptFn: ExecutePromptFn;
  /** Optional GitHub auth to merge into create/execute calls */
  githubAuth?: { gitHubToken?: string; gitUserName?: string; gitUserEmail?: string };
  /** Optional overrides from start-build payload (not persisted) */
  configOverrides?: Partial<BuildCursorConfig>;
  /** Shared in-memory build tracker (updated by the loop, read by HTTP endpoints). */
  activeBuildTracker?: Map<string, ActiveBuildEntry>;
  /** Per-user Cursor API key (fetched once at build start, passed to every prompt execution). */
  cursorApiKey?: string;
}

export interface RunBuildFromPayloadOptions {
  buildId: string;
  supabaseUrl: string;
  accessToken: string;
  anonKey: string;
  /** Optional service role key for build DB operations (bypasses RLS, avoids JWT expiry during long builds) */
  supabaseServiceRoleKey?: string;
  createProjectFn: CreateProjectFn;
  executePromptFn: ExecutePromptFn;
  /** Shared in-memory build tracker (updated by the loop, read by HTTP endpoints). */
  activeBuildTracker?: Map<string, ActiveBuildEntry>;
}

/** Row from automated_builds (expected columns). */
export interface AutomatedBuildRow {
  id: string;
  user_id: string;
  status: string;
  current_agent_phase?: string;
  progress?: number;
  /** Path to the project directory (set after create-project, used for resume). */
  cursor_project_path?: string | null;
  /** Last completed step index (0-based, used for resume). */
  current_step?: number | null;
  configuration?: {
    cursorConfig?: BuildCursorConfig;
    prompts?: string[];
    [key: string]: unknown;
  };
  created_at?: string;
  updated_at?: string;
}

/** Parse MCP tool result (content[0].text) to extract typed JSON. */
export const parseMcpResult = (res: unknown): ExecutePromptResult => {
  try {
    const r = res as { content?: Array<{ type?: string; text?: string }> };
    const text = r?.content?.[0]?.text;
    if (!text) return { success: false, error: 'No result content' };
    return JSON.parse(text) as ExecutePromptResult;
  } catch {
    return { success: false, error: 'Failed to parse execute result' };
  }
};

/**
 * Build loop: load build + config + prompts from DB, create project, run prompts,
 * write build_logs and update automated_builds (status, progress).
 */
export async function runBuildLoop(
  supabase: SupabaseClient,
  buildId: string,
  options: RunBuildLoopOptions
): Promise<void> {
  const { createProjectFn, executePromptFn, githubAuth, configOverrides, activeBuildTracker, cursorApiKey } = options;

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
    'cursorApiKey',
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

  // Refresh JWT token if it's about to expire (within 1 minute)
  // Note: When using header-based auth (access token in headers), there may be no stored session.
  // In that case, we allow operations to proceed - they will fail gracefully if token is expired.
  const refreshTokenIfNeeded = async (): Promise<boolean> => {
    try {
      const { data: { session }, error: sessionError } = await supabase.auth.getSession();
      
      // If we have a session, check expiration and refresh if needed
      if (session && !sessionError) {
        const expiresAt = session.expires_at;
        if (expiresAt && expiresAt * 1000 < Date.now() + 60000) {
          console.log('[BuildRunner] 🔄 Token expiring soon, refreshing...');
          const { data, error: refreshError } = await supabase.auth.refreshSession();
          if (refreshError) {
            console.warn('[BuildRunner] Failed to refresh token:', refreshError.message);
            return false;
          }
          if (data.session) {
            console.log('[BuildRunner] ✅ Token refreshed successfully');
            return true;
          }
        }
        return true; // Token is still valid
      }
      
      // No session found - this is expected when using header-based auth (access token in headers)
      // Try to refresh anyway - Supabase may be able to refresh using the access token in headers
      if (!session && !sessionError) {
        try {
          const { data, error: refreshError } = await supabase.auth.refreshSession();
          if (!refreshError && data.session) {
            console.log('[BuildRunner] ✅ Token refreshed successfully (header-based auth)');
            return true;
          }
          // If refresh fails silently, that's okay - operations will proceed and fail gracefully if needed
        } catch (refreshErr) {
          // Refresh failed silently - operations will proceed
        }
      }
      
      // Allow operations to proceed - they will fail gracefully if token is expired
      // This handles both header-based auth (no session) and session errors
      return true;
    } catch (error) {
      // On any error, allow operations to proceed
      // Database operations will handle expired tokens gracefully
      return true;
    }
  };

  const updateStatus = async (status: string, progress?: number, currentStep?: number) => {
    try {
      // Attempt to refresh token before database operation
      await refreshTokenIfNeeded();
      
      const payload: { status: string; progress?: number; current_step?: number; updated_at?: string } = {
        status,
        updated_at: new Date().toISOString(),
      };
      if (progress !== undefined) payload.progress = progress;
      if (currentStep !== undefined) payload.current_step = currentStep;
      
      const { error } = await supabase
        .from('automated_builds')
        .update(payload)
        .eq('id', buildId);
      
      if (error) {
        log(`Failed to update status: ${error.message}`, 'error');
        // Continue execution - don't throw (graceful degradation)
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      log(`Status update error (non-blocking): ${errorMessage}`, 'error');
      // Continue execution - don't throw (graceful degradation)
    }
  };

  // log_type must match DB CHECK constraint: 'build_log' or 'mcp_log'
  // Override via env if needed (e.g. MCP_BUILD_LOG_TYPE_ERROR='mcp_log')
  const LOG_TYPE_INFO = process.env.MCP_BUILD_LOG_TYPE_INFO ?? 'build_log';
  const LOG_TYPE_ERROR = process.env.MCP_BUILD_LOG_TYPE_ERROR ?? 'build_log';
  const levelToLogType = (level: string): string =>
    level === 'error' ? LOG_TYPE_ERROR : LOG_TYPE_INFO;

  const appendLog = async (message: string, level: string = 'info') => {
    try {
      // Attempt to refresh token before database operation
      await refreshTokenIfNeeded();
      
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
        // Continue execution - don't throw (graceful degradation)
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      log(`Log append error (non-blocking): ${errorMessage}`, 'error');
      // Continue execution - don't throw (graceful degradation)
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
  const currentAgentPhase = row.current_agent_phase ?? 'developer';
  const configuration = row.configuration;
  const cursorConfig = configuration?.cursorConfig;

  const existingProjectPath = row.cursor_project_path ?? undefined;
  const isResume = !!existingProjectPath;

  if (!configuration || !cursorConfig) {
    log('Build configuration or cursorConfig missing', 'error');
    await updateStatus('failed');
    await appendLog('Build configuration or cursorConfig missing', 'error');
    return;
  }

  await appendLog('Build loaded, validating configuration');

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
  if (configObj.model && !mergedCursorConfig.model) mergedCursorConfig.model = configObj.model;
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

  // Build prompt queue as typed objects
  let promptQueue: PromptQueueItem[] = [];
  let promptSource: string | undefined;

  const rawPrompts: string[] = Array.isArray(configuration.prompts) ? configuration.prompts : [];
  if (rawPrompts.length > 0) {
    promptSource = 'configuration.prompts';
    const skipCount = isResume ? (row.current_step ?? 0) : 0;
    promptQueue = rawPrompts.slice(skipCount).map((text, idx) => ({
      id: `cfg-${skipCount + idx}`,
      prompt_content: text,
      title: text.length > 60 ? `${text.substring(0, 60)}...` : text,
      source: 'sequence' as const,
      type: 'prompt',
    }));
  }

  if (promptQueue.length === 0) {
    const projectId =
      (configuration as { projectId?: string; project_id?: string }).projectId ??
      (configuration as { projectId?: string; project_id?: string }).project_id;
    if (projectId) {
      try {
        // Attempt to refresh token before database operation
        await refreshTokenIfNeeded();
        
        let flowchartQuery = supabase
          .from('flowchart_items')
          .select('id, prompt, prompt_content, sequence_order')
          .eq('project_id', projectId)
          .eq('type', 'prompt');
        if (isResume) {
          flowchartQuery = flowchartQuery.eq('is_implemented', false);
        }
        const { data: flowchartRows, error: flowchartError } = await flowchartQuery.order('sequence_order', { ascending: true });
        if (flowchartError) {
          log(`Failed to query flowchart_items: ${flowchartError.message}`, 'error');
          await appendLog(`Failed to query flowchart_items: ${flowchartError.message}`, 'error');
        }
        if (Array.isArray(flowchartRows)) {
          const mapped = flowchartRows
            .filter((r: { prompt?: string; prompt_content?: string }) => (r.prompt_content ?? r.prompt ?? '').length > 0)
            .map((r: { id: string; prompt?: string; prompt_content?: string }) => ({
              id: r.id,
              prompt_content: (r.prompt_content ?? r.prompt ?? ''),
              title: (r.prompt_content ?? r.prompt ?? '').substring(0, 60),
              source: 'sequence' as const,
              type: 'prompt',
            }));
          if (mapped.length > 0) {
            promptQueue = mapped;
            promptSource = 'flowchart_items';
          }
        }
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Unknown error';
        log(`Flowchart items query error (non-blocking): ${errorMessage}`, 'error');
        // Continue execution - prompts will remain empty and build will fail gracefully
      }
    }
  }
  if (promptQueue.length === 0) {
    if (currentAgentPhase === 'developer') {
      if (isResume) {
        await appendLog('All prompts already implemented. Awaiting ScopesFlow to finalize.');
        await updateStatus('prompts_completed', 100);
        return;
      }
      const message = `No prompts found for build ${buildId}. Checked configuration.prompts and flowchart_items.`;
      log(message, 'error');
      await appendLog(message, 'error');
      await updateStatus('failed');
      return;
    }
    await appendLog(`No prompts found; continuing with ${currentAgentPhase} phase pipeline.`);
  }
  if (promptQueue.length > 0) {
    await appendLog(`Loaded ${promptQueue.length} prompts from ${promptSource ?? 'unknown source'}`);
  }

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

  await appendLog('Configuration valid, starting project creation');

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

  // ──── HEARTBEAT ────
  const HEARTBEAT_INTERVAL_MS = 15_000;
  let heartbeatTimer: ReturnType<typeof setInterval> | null = null;

  try {
    await updateStatus('running', 0);
    await appendLog('Build started');

    const projectName = (rawProjectName as string).trim();
    const baseDir =
      process.env.MCP_BUILD_PROJECTS_DIR || process.env.TMPDIR || process.cwd();
    let projectPath: string;

    if (isResume && existingProjectPath) {
      projectPath = existingProjectPath.trim();
      try {
        await access(projectPath);
      } catch {
        const message = 'Project directory not found. Cannot resume.';
        log(message, 'error');
        await appendLog(message, 'error');
        await updateStatus('failed');
        return;
      }
      await appendLog(`Resuming build at existing project: ${projectPath}`);
    } else {
      projectPath = hasString(rawProjectPath)
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
    }

    // Start heartbeat (dashboard watches last_heartbeat to detect stale builds)
    heartbeatTimer = setInterval(async () => {
      try {
        await supabase.from('automated_builds').update({
          last_heartbeat: new Date().toISOString(),
        }).eq('id', buildId);
      } catch (err) {
        console.error('[Build Runner] Heartbeat failed:', err);
      }
    }, HEARTBEAT_INTERVAL_MS);

    // Derive projectId for tracker
    const projectId =
      (configuration as { projectId?: string; project_id?: string }).projectId ??
      (configuration as { projectId?: string; project_id?: string }).project_id ?? '';

    // Extract model from configuration (can be at top level or in cursorConfig)
    const rawModel = (mergedCursorConfig as { model?: unknown }).model ?? (configuration as { model?: unknown }).model;
    const model = typeof rawModel === 'string' && rawModel.trim().length > 0 ? rawModel.trim() : undefined;

    // Timeout per step from automationSettings or default 5 min
    const timeoutPerStep =
      ((configuration as { automationSettings?: { timeoutPerStep?: number } }).automationSettings?.timeoutPerStep) ?? 300000;

    if (activeBuildTracker && !activeBuildTracker.has(buildId)) {
      activeBuildTracker.set(buildId, {
        buildId,
        projectId,
        projectName,
        startedAt: new Date().toISOString(),
        currentStep: row.current_step ?? 0,
        totalSteps: row.total_steps ?? promptQueue.length,
        status: 'running',
        projectPath,
      });
    }

    if (currentAgentPhase === 'developer') {
      const completedSteps = isResume ? (row.current_step ?? 0) : 0;
      let totalSteps = completedSteps + promptQueue.length || 1;
      let currentStep = completedSteps;

    await appendLog(`Starting prompt execution (${totalSteps} prompt${totalSteps === 1 ? '' : 's'})`);

    let isFirstPrompt = true;

      while (promptQueue.length > 0) {
      // ──── Check for custom prompts ────
      try {
        const { data: customPrompts } = await supabase
          .from('build_custom_prompts')
          .select('*')
          .eq('build_id', buildId)
          .eq('status', 'pending')
          .order('created_at');

        if (customPrompts && customPrompts.length > 0) {
          const customPrompt = customPrompts[0];

          // Mark as executing
          await supabase.from('build_custom_prompts')
            .update({ status: 'executing', executed_at: new Date().toISOString() })
            .eq('id', customPrompt.id);

          await appendLog(
            `Executing custom prompt: ${customPrompt.prompt_title ?? customPrompt.prompt_content.substring(0, 50)}...`
          );

          // Build synthetic queue item
          const syntheticItem: PromptQueueItem = {
            id: customPrompt.id,
            prompt_content: customPrompt.prompt_content,
            title: customPrompt.prompt_title ?? 'Custom Prompt',
            source: 'custom',
            type: 'prompt',
          };

          // Position: 'next' = front of queue, anything else = back
          if (customPrompt.position === 'next') {
            promptQueue.unshift(syntheticItem);
          } else {
            promptQueue.push(syntheticItem);
          }
          totalSteps += 1;
        }
      } catch (err) {
        console.error('[Build Runner] Custom prompt check failed (non-blocking):', err);
      }

      const promptItem = promptQueue.shift()!;
      currentStep++;
      const promptContent = promptItem.prompt_content;
      const preview = promptContent.length > 60
        ? `${promptContent.substring(0, 60).replace(/\n/g, ' ')}...`
        : promptContent.replace(/\n/g, ' ');
      await appendLog(`Running prompt ${currentStep}/${totalSteps}: ${preview}`);

      console.log(`[BuildRunner] Starting prompt ${currentStep}/${totalSteps}`);
      console.log(`[BuildRunner] buildId=${buildId}, projectPath=${projectPath}`);

      // ──── Record step start in build_steps ────
      const stepStartMs = Date.now();
      const stepStartTime = new Date().toISOString();

      let stepRowId: string | null = null;
      try {
        const { data: stepRow } = await supabase.from('build_steps').insert({
          build_id: buildId,
          step_number: currentStep,
          prompt_id: promptItem.id,
          prompt_content: promptContent,
          prompt_source: promptItem.source,
          status: 'running',
          started_at: stepStartTime,
          retry_count: 0,
        }).select().single();
        stepRowId = stepRow?.id ?? null;
      } catch (err) {
        console.error('[Build Runner] Failed to insert build_steps row (non-blocking):', err);
      }

      // ──── Execute with retry ────
      const MAX_STEP_RETRIES = 2;
      let retryCount = 0;
      let execResult: ExecutePromptResult = { success: false, error: 'Not executed' };

      while (retryCount <= MAX_STEP_RETRIES) {
        const executeArgs: BuildExecutePromptArgs = {
          prompt: promptContent,
          projectPath,
          timeout: timeoutPerStep,
          context: `Step ${currentStep} of automated build`,
          isFirstPrompt,
          retryCount,
          isRetry: retryCount > 0,
          supabaseClient: supabase,
          userId: row.user_id,
          buildId,
          model,
          cursorApiKey,
          promptId: promptItem.id,
        };
        if (githubAuth) {
          if (githubAuth.gitHubToken) {
            executeArgs.gitHubToken = githubAuth.gitHubToken;
          }
          if (githubAuth.gitUserName) executeArgs.gitUserName = githubAuth.gitUserName;
          if (githubAuth.gitUserEmail) executeArgs.gitUserEmail = githubAuth.gitUserEmail;
        }

        const rawResult = await executePromptFn(executeArgs);
        execResult = parseMcpResult(rawResult);

        if (execResult.success) break;

        retryCount++;
        if (retryCount > MAX_STEP_RETRIES) {
          await appendLog(
            `Step ${currentStep} permanently failed after ${MAX_STEP_RETRIES + 1} attempts.`,
            'error'
          );
          break;
        }

        await appendLog(
          `Step ${currentStep} failed (attempt ${retryCount}/${MAX_STEP_RETRIES + 1}): ${execResult.error}`,
          'error'
        );

        // Update step to 'retrying'
        if (stepRowId) {
          try {
            await supabase.from('build_steps').update({
              status: 'retrying',
              retry_count: retryCount,
              error_message: execResult.error ?? null,
            }).eq('id', stepRowId);
          } catch { /* non-blocking */ }
        }

        // Exponential backoff
        await new Promise(r => setTimeout(r, 5000 * retryCount));
      }

      // ──── Update step row with final result ────
      const stepStatus = execResult.success ? 'completed' : 'failed';

      if (stepRowId) {
        try {
          await supabase.from('build_steps').update({
            status: stepStatus,
            completed_at: new Date().toISOString(),
            duration_ms: Date.now() - stepStartMs,
            files_changed: execResult.filesChanged ?? [],
            error_message: execResult.error ?? null,
            retry_count: retryCount,
            has_migrations: execResult.hasMigrations ?? false,
            migrations: execResult.migrations ?? [],
          }).eq('id', stepRowId);
        } catch (err) {
          console.error('[Build Runner] Failed to update build_steps row (non-blocking):', err);
        }
      }

      // ──── Update custom prompt status ────
      if (promptItem.source === 'custom') {
        try {
          await supabase.from('build_custom_prompts')
            .update({
              status: execResult.success ? 'completed' : 'failed',
              step_id: stepRowId ?? null,
            })
            .eq('id', promptItem.id);
        } catch { /* non-blocking */ }
      }

      if (!execResult.success) {
        await appendLog(
          `Skipping failed step ${currentStep}, continuing with next prompt`,
          'error'
        );
      }

      isFirstPrompt = false;
      await appendLog(`Prompt ${currentStep}/${totalSteps} ${stepStatus}`);
      const progress = Math.round((currentStep / totalSteps) * 100);
      await updateStatus('running', progress, currentStep);

      // ──── Update active build tracker ────
      if (activeBuildTracker) {
        activeBuildTracker.set(buildId, {
          buildId,
          projectId,
          projectName,
          startedAt: stepStartTime,
          currentStep,
          totalSteps,
          status: 'running',
          projectPath,
        });
      }
    }

    // ══════ DEVELOPER AGENT CONTINUOUS LOOP ══════
    // After initial prompt queue is exhausted, enter analysis→generate→execute
    // loop until GitHub analysis reports ≥ 90% completion.

    const COMPLETION_THRESHOLD = 90;
    const MAX_AGENT_LOOPS = 50;
    const MAX_CONSECUTIVE_ERRORS = 3;
    const MAX_NO_PROMPT_RETRIES = 3;
    const NO_PROMPT_RETRY_DELAY_MS = 10000;
    let agentLoopCount = 0;
    let consecutiveErrors = 0;
    let noPromptRetries = 0;

    await appendLog('Initial prompt queue exhausted. Entering Developer Agent loop...');

    while (agentLoopCount < MAX_AGENT_LOOPS) {
      agentLoopCount++;
      consecutiveErrors = 0;

      const { data: buildCheck } = await supabase
        .from('automated_builds')
        .select('status')
        .eq('id', buildId)
        .single();
      if (buildCheck?.status === 'cancelled') {
        await appendLog('Build cancelled, exiting agent loop');
        break;
      }

      await supabase.from('automated_builds')
        .update({ agent_loop_count: agentLoopCount })
        .eq('id', buildId);

      await appendLog(`Developer Agent loop ${agentLoopCount}/${MAX_AGENT_LOOPS}: Analyzing project...`);

      let phaseResult: {
        completionPct: number;
        phaseComplete: boolean;
        nextPrompt?: { id: string; prompt_content: string; title: string; source: string; type: string };
        shouldRetry?: boolean;
        error?: string;
      };

      try {
        const { data, error } = await supabase.functions.invoke('agent-phase-continue', {
          body: { buildId, projectId, phase: 'developer' },
        });

        if (error) {
          consecutiveErrors++;
          await appendLog(`Agent loop error: ${error.message}`, 'error');
          if (consecutiveErrors >= MAX_CONSECUTIVE_ERRORS) {
            await appendLog(`${MAX_CONSECUTIVE_ERRORS} consecutive errors, exiting agent loop`, 'error');
            break;
          }
          await new Promise(r => setTimeout(r, 5000));
          continue;
        }

        phaseResult = data;
      } catch (err) {
        consecutiveErrors++;
        const msg = err instanceof Error ? err.message : String(err);
        await appendLog(`Agent loop exception: ${msg}`, 'error');
        if (consecutiveErrors >= MAX_CONSECUTIVE_ERRORS) break;
        await new Promise(r => setTimeout(r, 5000));
        continue;
      }

      await appendLog(`GitHub analysis: ${phaseResult.completionPct}% complete`);
      await supabase.from('automated_builds')
        .update({ developer_completion_pct: phaseResult.completionPct })
        .eq('id', buildId);

      if (phaseResult.phaseComplete || phaseResult.completionPct >= COMPLETION_THRESHOLD) {
        await appendLog(`Developer Agent reached ${phaseResult.completionPct}% — phase complete!`);
        await supabase.from('automated_builds')
          .update({
            developer_completed_at: new Date().toISOString(),
            developer_completion_pct: phaseResult.completionPct,
          })
          .eq('id', buildId);
        break;
      }

      if (phaseResult.nextPrompt) {
        noPromptRetries = 0;
        currentStep++;
        totalSteps++;

        const promptContent = phaseResult.nextPrompt.prompt_content;
        const preview = promptContent.length > 60
          ? `${promptContent.substring(0, 60).replace(/\n/g, ' ')}...`
          : promptContent.replace(/\n/g, ' ');

        await appendLog(`Agent loop prompt ${currentStep}/${totalSteps}: ${preview}`);

        let stepRowId: string | null = null;
        try {
          const { data: stepRow } = await supabase.from('build_steps').insert({
            build_id: buildId,
            step_number: currentStep,
            prompt_id: phaseResult.nextPrompt.id,
            prompt_content: promptContent,
            prompt_source: 'generated',
            agent_phase: 'developer',
            status: 'running',
            started_at: new Date().toISOString(),
            retry_count: 0,
          }).select().single();
          stepRowId = stepRow?.id ?? null;
        } catch { /* non-blocking */ }

        const stepStartMs = Date.now();
        const executeArgs: BuildExecutePromptArgs = {
          prompt: promptContent,
          projectPath,
          timeout: timeoutPerStep,
          context: `Developer Agent loop ${agentLoopCount}`,
          isFirstPrompt: false,
          retryCount: 0,
          isRetry: false,
          supabaseClient: supabase,
          userId: row.user_id,
          buildId,
          model,
          cursorApiKey,
          promptId: phaseResult.nextPrompt.id,
        };
        if (githubAuth) {
          if (githubAuth.gitHubToken) executeArgs.gitHubToken = githubAuth.gitHubToken;
          if (githubAuth.gitUserName) executeArgs.gitUserName = githubAuth.gitUserName;
          if (githubAuth.gitUserEmail) executeArgs.gitUserEmail = githubAuth.gitUserEmail;
        }

        const rawResult = await executePromptFn(executeArgs);
        const execResult = parseMcpResult(rawResult);

        if (stepRowId) {
          try {
            await supabase.from('build_steps').update({
              status: execResult.success ? 'completed' : 'failed',
              completed_at: new Date().toISOString(),
              duration_ms: Date.now() - stepStartMs,
              files_changed: execResult.filesChanged ?? [],
              error_message: execResult.error ?? null,
            }).eq('id', stepRowId);
          } catch { /* non-blocking */ }
        }

        await appendLog(`Agent loop prompt ${execResult.success ? 'completed' : 'failed'}`);
        const progress = Math.round((currentStep / totalSteps) * 100);
        await updateStatus('running', Math.min(progress, 89), currentStep);
      } else {
        const shouldRetry =
          phaseResult.shouldRetry === true ||
          (phaseResult.completionPct < COMPLETION_THRESHOLD);

        if (shouldRetry && noPromptRetries < MAX_NO_PROMPT_RETRIES) {
          noPromptRetries++;
          const errorDetail = phaseResult.error ? ` (${phaseResult.error})` : '';
          await appendLog(
            `No prompt generated${errorDetail}. Retrying (${noPromptRetries}/${MAX_NO_PROMPT_RETRIES})...`
          );
          await new Promise(r => setTimeout(r, NO_PROMPT_RETRY_DELAY_MS));
          continue;
        }

        await appendLog('No more prompts could be generated after retries. Ending developer loop.');
        break;
      }
    }

    }

    // ══════ AGENT PIPELINE ORCHESTRATION ══════

    const phaseOrder = ['developer', 'scope-check', 'design', 'debug'] as const;
    const startIndex = phaseOrder.indexOf(currentAgentPhase as (typeof phaseOrder)[number]);
    const normalizedStartIndex = startIndex === -1 ? 0 : startIndex;

    const agentOptions = {
      supabase,
      buildId,
      projectId,
      projectPath,
      executePromptFn,
      model,
      cursorApiKey,
      githubAuth,
      userId: row.user_id,
    };

    // Phase 2: Scope-Check Agent
    if (normalizedStartIndex <= 1) {
      try {
        await appendLog('Starting Scope-Check Agent phase...');
        await runScopeCheckAgent(agentOptions);
        await appendLog('Scope-Check Agent phase completed.');
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        await appendLog(`Scope-Check Agent failed: ${msg}`, 'error');
      }
    } else {
      await appendLog(`Skipping Scope-Check Agent (current phase: ${currentAgentPhase})`);
    }

    // Phase 3: Design Agent
    if (normalizedStartIndex <= 2) {
      try {
        await appendLog('Starting Design Agent phase...');
        await runDesignAgent(agentOptions);
        await appendLog('Design Agent phase completed.');
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        await appendLog(`Design Agent failed: ${msg}`, 'error');
      }
    } else {
      await appendLog(`Skipping Design Agent (current phase: ${currentAgentPhase})`);
    }

    // Phase 4: Debug Agent
    if (normalizedStartIndex <= 3) {
      try {
        await appendLog('Starting Debug Agent phase...');
        await runDebugAgent(agentOptions);
        await appendLog('Debug Agent phase completed.');
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        await appendLog(`Debug Agent failed: ${msg}`, 'error');
      }
    } else {
      await appendLog(`Skipping Debug Agent (current phase: ${currentAgentPhase})`);
    }

    // ══════ ALL PHASES COMPLETE ══════
    await updateStatus('completed', 100);
    await appendLog('All agent phases completed. Build is MVP-ready.');

    if (activeBuildTracker) {
      activeBuildTracker.delete(buildId);
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    log(`Build failed: ${message}`, 'error');
    await appendLog(`Build failed: ${message}`, 'error');
    await updateStatus('failed');
    if (activeBuildTracker) {
      activeBuildTracker.delete(buildId);
    }
  } finally {
    if (heartbeatTimer) {
      clearInterval(heartbeatTimer);
    }
  }
}

/**
 * End-to-end build entrypoint: validate user, load build row + GitHub auth,
 * then run the build loop with config overrides.
 */
export async function runBuildFromPayload(options: RunBuildFromPayloadOptions): Promise<void> {
  const { buildId, supabaseUrl, accessToken, anonKey, supabaseServiceRoleKey, createProjectFn, executePromptFn, activeBuildTracker } = options;

  const supabaseUser: SupabaseClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
  });

  const { data: { user }, error: userError } = await supabaseUser.auth.getUser(accessToken);
  if (userError || !user) {
    console.error('[BuildRunner] Build start: invalid user', userError?.message ?? 'no user');
    return;
  }

  const { data: buildRow, error: buildError } = await supabaseUser
    .from('automated_builds')
    .select('*')
    .eq('id', buildId)
    .single();

  if (buildError || !buildRow) {
    console.error('[BuildRunner] Build start: build not found', buildId, buildError?.message);
    return;
  }

  const configuration = (buildRow as AutomatedBuildRow).configuration;
  const cursorConfig = configuration && typeof configuration === 'object' && 'cursorConfig' in configuration
    ? (configuration as { cursorConfig?: unknown }).cursorConfig
    : undefined;

  if (!configuration || !cursorConfig) {
    console.error('[BuildRunner] Build start: configuration or cursorConfig missing', buildId);
    return;
  }

  let githubAuth: { gitHubToken?: string; gitUserName?: string; gitUserEmail?: string } | undefined;
  try {
    console.log(`[BuildRunner] 🔍 Fetching GitHub auth for user_id: ${user.id}`);
    const { data: ghRow, error: ghError } = await supabaseUser
      .from('github_auth')
      .select('access_token')
      .eq('user_id', user.id)
      .maybeSingle();
    
    if (ghError) {
      console.warn(`[BuildRunner] ⚠️ Error fetching GitHub auth: ${ghError.message}`);
    } else if (ghRow && typeof ghRow === 'object') {
      const row = ghRow as { access_token?: string };
      githubAuth = {
        gitHubToken: row.access_token,
        // Note: login and email columns don't exist in github_auth table
        gitUserName: undefined,
        gitUserEmail: undefined,
      };
      if (githubAuth.gitHubToken) {
        console.log(`[BuildRunner] ✅ GitHub auth found for user (token: ${githubAuth.gitHubToken.slice(0, 4)}...)`);
      } else {
        console.warn(`[BuildRunner] ⚠️ GitHub auth row found but access_token is empty`);
      }
    } else {
      console.warn(`[BuildRunner] ⚠️ No GitHub auth found for user_id: ${user.id}`);
    }
  } catch (error) {
    console.warn(`[BuildRunner] ⚠️ Exception fetching GitHub auth:`, error instanceof Error ? error.message : 'Unknown error');
  }

  // Use service role client for build loop (avoids JWT expiry during long builds).
  // Falls back to user-token client when service role key is not available.
  const supabaseForBuild: SupabaseClient = supabaseServiceRoleKey
    ? createClient(supabaseUrl, supabaseServiceRoleKey, {
        auth: { autoRefreshToken: false, persistSession: false },
      })
    : supabaseUser;
  if (supabaseServiceRoleKey) {
    console.log('[BuildRunner] ✅ Using service role key for build DB operations (JWT expiry safe)');
  }

  // ──── Fetch Cursor API key once per build (per-user quota isolation) ────
  let cursorApiKey: string | undefined;
  try {
    const dbClient = supabaseServiceRoleKey
      ? createClient(supabaseUrl, supabaseServiceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } })
      : supabaseUser;
    console.log(`[BuildRunner] 🔍 Fetching Cursor API key for user_id: ${user.id}`);
    const { data: keyRow, error: keyError } = await dbClient
      .from('cursor_api_keys')
      .select('api_key_ciphertext, revoked_at')
      .eq('user_id', user.id)
      .maybeSingle();

    if (keyError) {
      console.warn(`[BuildRunner] ⚠️ Error fetching Cursor API key: ${keyError.message}`);
    } else if (keyRow && typeof keyRow === 'object') {
      const row = keyRow as { api_key_ciphertext?: string; revoked_at?: string | null };
      if (row.revoked_at) {
        console.warn('[BuildRunner] ⚠️ Cursor API key has been revoked');
      } else if (row.api_key_ciphertext) {
        // NOTE: If using server-side encryption, decrypt here using CURSOR_KEYS_ENCRYPTION_SECRET.
        // For now, we assume the ciphertext is the plaintext key (or decrypt with your chosen method).
        cursorApiKey = row.api_key_ciphertext;
        console.log('[BuildRunner] ✅ Cursor API key loaded for user');

        // Update last_used_at
        try {
          await dbClient.from('cursor_api_keys').update({ last_used_at: new Date().toISOString() }).eq('user_id', user.id);
        } catch { /* non-blocking */ }
      } else {
        console.warn('[BuildRunner] ⚠️ Cursor API key row found but api_key_ciphertext is empty');
      }
    } else {
      console.warn(`[BuildRunner] ⚠️ No Cursor API key found for user_id: ${user.id}`);
    }
  } catch (error) {
    console.warn('[BuildRunner] ⚠️ Exception fetching Cursor API key:', error instanceof Error ? error.message : 'Unknown error');
  }

  // If no key and enforcement is enabled, fail the build early
  if (!cursorApiKey && process.env.MCP_REQUIRE_CURSOR_API_KEY === 'true') {
    console.error('[BuildRunner] Cursor API key not configured for this user. Build cannot proceed.');
    try {
      await supabaseForBuild.from('automated_builds').update({ status: 'failed', updated_at: new Date().toISOString() }).eq('id', buildId);
      await supabaseForBuild.from('build_logs').insert({
        build_id: buildId,
        log_type: 'build_log',
        message: 'Cursor API key not configured for this user. Please add your API key in Settings.',
        created_at: new Date().toISOString(),
      });
    } catch { /* non-blocking */ }
    return;
  }

  await runBuildLoop(supabaseForBuild, buildId, {
    createProjectFn,
    executePromptFn,
    githubAuth,
    configOverrides: {
      supabaseUrl,
      supabaseAnonKey: anonKey,
    },
    activeBuildTracker,
    cursorApiKey,
  });
}
