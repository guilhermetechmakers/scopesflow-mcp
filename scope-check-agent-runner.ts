import { SupabaseClient } from '@supabase/supabase-js';
import type { ExecutePromptFn, BuildExecutePromptArgs, BuildProvider } from './build-runner.js';

interface ScopeCheckAgentOptions {
  supabase: SupabaseClient;
  buildId: string;
  projectId: string;
  projectPath: string;
  executePromptFn: ExecutePromptFn;
  model?: string;
  cursorApiKey?: string;
  provider?: BuildProvider;
  githubAuth?: { gitHubToken?: string; gitUserName?: string; gitUserEmail?: string };
  userId: string;
  shouldStop?: () => boolean;
}

interface GeneratePagePromptResponse {
  success: boolean;
  promptNode?: { id: string; title?: string; prompt_content?: string };
  skipped?: boolean;
  error?: string;
  pageTitle?: string;
  featuresCount?: number;
  apisCount?: number;
}

export async function runScopeCheckAgent(options: ScopeCheckAgentOptions): Promise<void> {
  const {
    supabase, buildId, projectId, projectPath,
    executePromptFn, model, cursorApiKey, provider, githubAuth, userId, shouldStop,
  } = options;

  const log = (msg: string, level: 'info' | 'warn' | 'error' = 'info') => {
    console.error(`[ScopeCheckAgent] ${msg}`);
    supabase.from('build_logs').insert({
      build_id: buildId,
      log_type: 'build_log',
      source: 'scope-check',
      level,
      message: msg,
      created_at: new Date().toISOString(),
    }).then(() => {});
  };

  log('Scope-Check Agent starting...');

  if (shouldStop?.()) {
    log('Stop requested; exiting scope-check phase.');
    return;
  }

  await supabase.from('automated_builds').update({
    current_agent_phase: 'scope-check',
  }).eq('id', buildId);

  const { data: pages } = await supabase
    .from('flowchart_items')
    .select('id, title, description, page_type, elements')
    .eq('project_id', projectId)
    .eq('type', 'page')
    .order('sequence_order', { ascending: true });

  if (!pages || pages.length === 0) {
    log('No pages in scope. Skipping scope-check phase.');
    await supabase.from('automated_builds').update({
      scope_check_completed_at: new Date().toISOString(),
      scope_check_pages_total: 0,
      scope_check_pages_completed: 0,
    }).eq('id', buildId);
    return;
  }

  await supabase.from('automated_builds').update({
    scope_check_pages_total: pages.length,
  }).eq('id', buildId);

  log(`Found ${pages.length} pages in scope.`);

  let completedPages = 0;

  for (const page of pages) {
    if (shouldStop?.()) {
      log('Stop requested; exiting scope-check phase.');
      return;
    }
    const { data: buildCheck } = await supabase
      .from('automated_builds')
      .select('status')
      .eq('id', buildId)
      .single();

    if (buildCheck?.status === 'cancelled') {
      log('Build cancelled, exiting scope-check loop.');
      break;
    }

    log(`Processing page: ${page.title}`);

    const { data: promptResult, error: promptErr } = await supabase.functions.invoke(
      'generate-page-prompt',
      { body: { projectId, pageId: page.id, buildId } },
    );

    if (promptErr || !promptResult?.success) {
      log(`Failed to generate prompt for ${page.title}: ${promptErr?.message ?? promptResult?.error ?? 'unknown error'}`, 'error');
      continue;
    }

    const typedPromptResult = promptResult as GeneratePagePromptResponse;

    if (typedPromptResult.skipped) {
      log(`Skipped ${page.title} - prompt already exists and is unimplemented.`);
      completedPages++;
      await supabase.from('automated_builds').update({
        scope_check_pages_completed: completedPages,
      }).eq('id', buildId);
      continue;
    }

    const promptContent = typedPromptResult.promptNode?.prompt_content ?? '';
    const promptId = typedPromptResult.promptNode?.id ?? null;

    if (!promptContent || !promptId) {
      log(`Prompt generation returned empty content for ${page.title}. Skipping.`, 'warn');
      continue;
    }

    let stepRowId: string | null = null;
    try {
      const { data: stepRow } = await supabase.from('build_steps').insert({
        build_id: buildId,
        step_number: completedPages + 1,
        prompt_id: promptId,
        prompt_content: promptContent,
        prompt_source: 'generated',
        agent_phase: 'scope-check',
        status: 'running',
        started_at: new Date().toISOString(),
      }).select().single();
      stepRowId = stepRow?.id ?? null;
    } catch { /* non-blocking */ }

    const args: BuildExecutePromptArgs = {
      prompt: promptContent,
      projectPath,
      timeout: 300000,
      context: `Scope-Check: ${page.title}`,
      isFirstPrompt: false,
      model,
      cursorApiKey,
      provider,
      supabaseClient: supabase,
      userId,
      buildId,
      promptId,
    };
    if (githubAuth?.gitHubToken) args.gitHubToken = githubAuth.gitHubToken;
    if (githubAuth?.gitUserName) args.gitUserName = githubAuth.gitUserName;
    if (githubAuth?.gitUserEmail) args.gitUserEmail = githubAuth.gitUserEmail;

    const result = await executePromptFn(args);

    if (result) {
      await supabase.from('flowchart_items')
        .update({ is_implemented: true, implementation_verified: false })
        .eq('id', promptId);
    }

    if (stepRowId) {
      await supabase.from('build_steps').update({
        status: result ? 'completed' : 'failed',
        completed_at: new Date().toISOString(),
      }).eq('id', stepRowId);
    }

    completedPages++;
    await supabase.from('automated_builds').update({
      scope_check_pages_completed: completedPages,
    }).eq('id', buildId);

    log(`${page.title}: ${result ? 'completed' : 'failed'} (${completedPages}/${pages.length})`);
  }

  if (shouldStop?.()) {
    log('Stop requested; exiting scope-check phase.');
    return;
  }

  await supabase.from('automated_builds').update({
    scope_check_completed_at: new Date().toISOString(),
    scope_check_pages_completed: completedPages,
  }).eq('id', buildId);

  log(`Scope-Check Agent complete. ${completedPages}/${pages.length} pages processed.`);
}


