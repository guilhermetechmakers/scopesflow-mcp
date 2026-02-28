import * as path from 'path';
import * as fs from 'fs/promises';
import { SupabaseClient } from '@supabase/supabase-js';
import type { ExecutePromptFn, BuildExecutePromptArgs, BuildProvider } from './build-runner.js';

const MAX_FILES_TO_AUDIT = 100;
const MAX_DESIGN_FIX_PROMPTS = 30;

interface DesignAgentOptions {
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

export async function runDesignAgent(options: DesignAgentOptions): Promise<void> {
  const {
    supabase, buildId, projectId, projectPath,
    executePromptFn, model, cursorApiKey, provider, githubAuth, userId, shouldStop,
  } = options;

  const log = (msg: string) => {
    console.error(`[DesignAgent] ${msg}`);
    supabase.from('build_logs').insert({
      build_id: buildId,
      log_type: 'build_log',
      message: msg,
      created_at: new Date().toISOString(),
    }).then(() => {});
  };

  log('Design Agent starting...');

  const stopIfRequested = (context: string): boolean => {
    if (!shouldStop?.()) return false;
    log(`Stop requested; exiting design phase (${context}).`);
    return true;
  };

  if (stopIfRequested('startup')) return;

  await supabase.from('automated_builds').update({
    current_agent_phase: 'design',
  }).eq('id', buildId);

  const { data: project } = await supabase
    .from('projects')
    .select('ui_style_description')
    .eq('id', projectId)
    .single();

  const designSystem = project?.ui_style_description ?? '';

  // Check for existing design issues (e.g. after pause/resume) — skip audit and continue fixing
  const { data: existingIssues } = await supabase
    .from('design_audit_results')
    .select('id, build_id')
    .eq('project_id', projectId)
    .in('status', ['found', 'fixing']);

  const hasExistingIssues = (existingIssues?.length ?? 0) > 0;

  let totalIssues: number;

  if (hasExistingIssues) {
    totalIssues = existingIssues?.length ?? 0;
    log(`Resuming design phase: ${totalIssues} existing issues found, skipping audit.`);

    // Attach existing issues to this build for visibility in the dashboard
    const staleIssueIds = (existingIssues ?? [])
      .filter((issue) => issue.build_id !== buildId)
      .map((issue) => issue.id);
    if (staleIssueIds.length > 0) {
      await supabase
        .from('design_audit_results')
        .update({ build_id: buildId })
        .in('id', staleIssueIds);
    }
  } else {
    const filesToAudit: string[] = [];
    const srcPath = path.join(projectPath, 'src');

    async function crawl(dir: string): Promise<void> {
      try {
        const entries = await fs.readdir(dir, { withFileTypes: true });
        for (const entry of entries) {
          if (filesToAudit.length >= MAX_FILES_TO_AUDIT) return;
          const fullPath = path.join(dir, entry.name);
          if (entry.isDirectory()) {
            if (entry.name === 'node_modules' || entry.name === '.git') continue;
            await crawl(fullPath);
          } else if (/\.(tsx|jsx)$/.test(entry.name)) {
            filesToAudit.push(fullPath);
          }
        }
      } catch { /* directory may not exist */ }
    }

    await crawl(path.join(srcPath, 'pages'));
    await crawl(path.join(srcPath, 'components'));
    await crawl(path.join(srcPath, 'app'));

    log(`Found ${filesToAudit.length} files to audit`);

    totalIssues = 0;

    for (const filePath of filesToAudit) {
      if (stopIfRequested('audit loop')) return;
      const relativePath = path.relative(projectPath, filePath).replace(/\\/g, '/');

      const { count: existingForFile } = await supabase
        .from('design_audit_results')
        .select('*', { count: 'exact', head: true })
        .eq('project_id', projectId)
        .eq('file_path', relativePath)
        .in('status', ['found', 'fixing']);

      if ((existingForFile ?? 0) > 0) {
        log(`Skipping audit for ${relativePath} — existing issues already tracked`);
        continue;
      }

      try {
        const content = await fs.readFile(filePath, 'utf-8');
        if (content.length < 50) continue;

        const { data, error } = await supabase.functions.invoke('design-audit-file', {
          body: {
            buildId,
            projectId,
            filePath: relativePath,
            fileContent: content,
            projectDesignSystem: designSystem,
          },
        });

        if (!error && data?.issues?.length > 0) {
          totalIssues += data.issues.length;
          log(`${relativePath}: ${data.issues.length} issues found`);
        }
      } catch (err) {
        log(`Failed to audit ${relativePath}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    await supabase.from('automated_builds').update({
      design_issues_found: totalIssues,
    }).eq('id', buildId);

    log(`Design audit complete. ${totalIssues} issues found.`);
  }

  // When resuming, ensure design_issues_found is set (may have been set in a previous run)
  if (hasExistingIssues) {
    await supabase.from('automated_builds').update({
      design_issues_found: totalIssues,
    }).eq('id', buildId);
  }

  const { data: issues } = await supabase
    .from('design_audit_results')
    .select('*')
    .eq('project_id', projectId)
    .eq('status', 'found')
    .order('severity', { ascending: true });

  let fixedCount = 0;
  let fixPromptCount = 0;

  if (issues && issues.length > 0) {
    const byFile: Record<string, typeof issues> = {};
    for (const issue of issues) {
      const fp = issue.file_path;
      if (!byFile[fp]) byFile[fp] = [];
      byFile[fp].push(issue);
    }

    for (const [filePath, fileIssues] of Object.entries(byFile)) {
      if (stopIfRequested('fix loop')) return;
      if (fixPromptCount >= MAX_DESIGN_FIX_PROMPTS) break;
      fixPromptCount++;

      const issueList = fileIssues
        .map((i: { severity: string; audit_category: string; issue_description: string }) =>
          `- [${i.severity}] ${i.audit_category}: ${i.issue_description}`)
        .join('\n');

      const fixPrompt = `Fix the following design issues in ${filePath}:\n\n${issueList}\n\nRequirements:\n- Use shadcn/ui components\n- Use Lucide React icons\n- Follow Tailwind CSS best practices\n- Add empty states, loading states, and error states where missing\n- Ensure responsive design with mobile-first approach`;

      const issueIds = fileIssues.map((i: { id: string }) => i.id);
      await supabase.from('design_audit_results')
        .update({ status: 'fixing' })
        .in('id', issueIds);

      let stepRowId: string | null = null;
      try {
        const { data: stepRow } = await supabase.from('build_steps').insert({
          build_id: buildId,
          step_number: fixPromptCount,
          prompt_content: fixPrompt,
          prompt_source: 'generated',
          agent_phase: 'design',
          status: 'running',
          started_at: new Date().toISOString(),
          retry_count: 0,
        }).select().single();
        stepRowId = stepRow?.id ?? null;
      } catch { /* non-blocking */ }

      const args: BuildExecutePromptArgs = {
        prompt: fixPrompt,
        projectPath,
        timeout: 300000,
        context: 'Design Agent fix',
        isFirstPrompt: false,
        model,
        cursorApiKey,
        provider,
        supabaseClient: supabase,
        userId,
        buildId,
      };
      if (githubAuth?.gitHubToken) args.gitHubToken = githubAuth.gitHubToken;
      if (githubAuth?.gitUserName) args.gitUserName = githubAuth.gitUserName;
      if (githubAuth?.gitUserEmail) args.gitUserEmail = githubAuth.gitUserEmail;

      const result = await executePromptFn(args);

      if (result) {
        await supabase.from('design_audit_results')
          .update({ status: 'fixed', fixed_at: new Date().toISOString() })
          .in('id', issueIds);
        fixedCount += fileIssues.length;
      }

      if (stepRowId) {
        try {
          await supabase.from('build_steps').update({
            status: 'completed',
            completed_at: new Date().toISOString(),
          }).eq('id', stepRowId);
        } catch { /* non-blocking */ }
      }

      log(`Fixed ${fileIssues.length} issues in ${filePath}`);
    }
  }

  if (stopIfRequested('finalize')) return;

  await supabase.from('automated_builds').update({
    design_issues_fixed: fixedCount,
    design_completed_at: new Date().toISOString(),
  }).eq('id', buildId);

  log(`Design Agent complete. ${fixedCount}/${totalIssues} issues fixed.`);
}
