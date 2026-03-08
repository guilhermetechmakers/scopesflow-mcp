/**
 * UI Design Improvements Agent Runner
 *
 * Runs after the Design phase and before Debug. Actively improves UI quality
 * per design system tokens: contrast ratios (WCAG), spacing consistency,
 * typography scale, grid alignment, component density, visual rhythm.
 *
 * - Uses heuristics for safe auto-apply (e.g., hex → tokens)
 * - Calls ui-design-improvements-audit-file edge function for AI audit
 * - Generates fix prompts for non-auto-applicable improvements
 * - Idempotent: re-run does not duplicate nodes or break existing flow
 */

import * as path from 'path';
import * as fs from 'fs/promises';
import { SupabaseClient } from '@supabase/supabase-js';
import type { ExecutePromptFn, BuildExecutePromptArgs, BuildProvider } from './build-runner.js';

const MAX_FILES_TO_AUDIT = 100;
const MAX_IMPROVEMENT_FIX_PROMPTS = 30;

// Design system spacing scale (px) per Modern Design Best Practices
const SPACING_SCALE = [4, 8, 16, 24, 32, 48, 64];

// Safe auto-apply: replace hardcoded hex with design tokens (non-breaking)
const HEX_TO_TOKEN: Array<{ pattern: RegExp; replacement: string }> = [
  { pattern: /className="([^"]*?)text-\[#333\]([^"]*?)"/g, replacement: 'className="$1text-foreground$2"' },
  { pattern: /className="([^"]*?)text-\[#666\]([^"]*?)"/g, replacement: 'className="$1text-muted-foreground$2"' },
  { pattern: /className="([^"]*?)bg-\[#fff\]([^"]*?)"/g, replacement: 'className="$1bg-background$2"' },
  { pattern: /className="([^"]*?)bg-\[#ffffff\]([^"]*?)"/g, replacement: 'className="$1bg-background$2"' },
  { pattern: /className="([^"]*?)border-\[#e5e7eb\]([^"]*?)"/g, replacement: 'className="$1border-border$2"' },
];

interface UIDesignImprovementsAgentOptions {
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
  resolveModelForStep?: (baseModel: string | undefined) => Promise<string | undefined>;
}

export async function runUIDesignImprovementsAgent(options: UIDesignImprovementsAgentOptions): Promise<void> {
  const {
    supabase, buildId, projectId, projectPath,
    executePromptFn, model, cursorApiKey, provider, githubAuth, userId, shouldStop,
    resolveModelForStep,
  } = options;

  let effectiveModel = model;

  const log = (msg: string) => {
    console.error(`[UIDesignImprovementsAgent] ${msg}`);
    supabase.from('build_logs').insert({
      build_id: buildId,
      log_type: 'build_log',
      message: msg,
      created_at: new Date().toISOString(),
    }).then(() => {});
  };

  log('UI Design Improvements Agent starting...');

  const stopIfRequested = (context: string): boolean => {
    if (!shouldStop?.()) return false;
    log(`Stop requested; exiting UI design improvements phase (${context}).`);
    return true;
  };

  if (stopIfRequested('startup')) return;

  await supabase.from('automated_builds').update({
    current_agent_phase: 'ui-design-improvements',
  }).eq('id', buildId);

  const { data: project } = await supabase
    .from('projects')
    .select('ui_style_description')
    .eq('id', projectId)
    .single();

  const designSystem = project?.ui_style_description ?? '';
  const designTokens = 'Use: bg-background, text-foreground, text-muted-foreground, border-border, bg-card, shadow-sm/md/lg, rounded-lg/xl/2xl, p-4/6, gap-4/6';

  // Check for existing improvements (e.g. after pause/resume)
  const { data: existingIssues } = await supabase
    .from('ui_design_improvements_results')
    .select('id, build_id')
    .eq('project_id', projectId)
    .in('status', ['found', 'fixing']);

  const hasExistingIssues = (existingIssues?.length ?? 0) > 0;

  let totalIssues: number;

  if (hasExistingIssues) {
    totalIssues = existingIssues?.length ?? 0;
    log(`Resuming UI design improvements: ${totalIssues} existing issues, skipping audit.`);

    const staleIssueIds = (existingIssues ?? [])
      .filter((issue) => issue.build_id !== buildId)
      .map((issue) => issue.id);
    if (staleIssueIds.length > 0) {
      await supabase
        .from('ui_design_improvements_results')
        .update({ build_id: buildId })
        .in('id', staleIssueIds);
    }
  } else {
    // Phase 1: Safe auto-apply rules (heuristics)
    const filesToProcess: string[] = [];
    const srcPath = path.join(projectPath, 'src');

    async function crawl(dir: string): Promise<void> {
      try {
        const entries = await fs.readdir(dir, { withFileTypes: true });
        for (const entry of entries) {
          if (filesToProcess.length >= MAX_FILES_TO_AUDIT) return;
          const fullPath = path.join(dir, entry.name);
          if (entry.isDirectory()) {
            if (entry.name === 'node_modules' || entry.name === '.git') continue;
            await crawl(fullPath);
          } else if (/\.(tsx|jsx)$/.test(entry.name)) {
            filesToProcess.push(fullPath);
          }
        }
      } catch { /* directory may not exist */ }
    }

    await crawl(path.join(srcPath, 'pages'));
    await crawl(path.join(srcPath, 'components'));
    await crawl(path.join(srcPath, 'app'));

    let autoAppliedCount = 0;
    for (const filePath of filesToProcess) {
      if (stopIfRequested('auto-apply loop')) return;
      try {
        let content = await fs.readFile(filePath, 'utf-8');
        let modified = false;
        for (const { pattern, replacement } of HEX_TO_TOKEN) {
          const newContent = content.replace(pattern, replacement);
          if (newContent !== content) {
            content = newContent;
            modified = true;
          }
        }
        if (modified) {
          await fs.writeFile(filePath, content);
          autoAppliedCount++;
          const relativePath = path.relative(projectPath, filePath).replace(/\\/g, '/');
          log(`Auto-applied color token fixes in ${relativePath}`);
        }
      } catch (err) {
        log(`Failed to auto-apply in ${filePath}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    if (autoAppliedCount > 0) {
      log(`Auto-applied improvements in ${autoAppliedCount} files.`);
    }

    // Phase 2: AI audit via edge function
    totalIssues = 0;
    for (const filePath of filesToProcess) {
      if (stopIfRequested('audit loop')) return;
      const relativePath = path.relative(projectPath, filePath).replace(/\\/g, '/');

      const { count: existingForFile } = await supabase
        .from('ui_design_improvements_results')
        .select('*', { count: 'exact', head: true })
        .eq('project_id', projectId)
        .eq('file_path', relativePath)
        .in('status', ['found', 'fixing']);

      if ((existingForFile ?? 0) > 0) {
        log(`Skipping audit for ${relativePath} — existing issues tracked`);
        continue;
      }

      try {
        const content = await fs.readFile(filePath, 'utf-8');
        if (content.length < 50) continue;

        const { data, error } = await supabase.functions.invoke('ui-design-improvements-audit-file', {
          body: {
            buildId,
            projectId,
            filePath: relativePath,
            fileContent: content,
            projectDesignSystem: designSystem,
            designTokens,
          },
        });

        if (!error && data?.issues?.length > 0) {
          totalIssues += data.issues.length;
          log(`${relativePath}: ${data.issues.length} improvements found`);
        }
      } catch (err) {
        log(`Failed to audit ${relativePath}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    await supabase.from('automated_builds').update({
      ui_design_improvements_issues_found: totalIssues,
    }).eq('id', buildId);

    log(`UI design improvements audit complete. ${totalIssues} issues found.`);
  }

  if (hasExistingIssues) {
    await supabase.from('automated_builds').update({
      ui_design_improvements_issues_found: totalIssues,
    }).eq('id', buildId);
  }

  // Phase 3: Fix remaining issues via prompts
  const { data: issues } = await supabase
    .from('ui_design_improvements_results')
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
      if (fixPromptCount >= MAX_IMPROVEMENT_FIX_PROMPTS) break;
      fixPromptCount++;

      const issueList = fileIssues
        .map((i: { severity: string; improvement_category: string; issue_description: string; suggested_change?: string }) =>
          `- [${i.severity}] ${i.improvement_category}: ${i.issue_description}${i.suggested_change ? ` → ${i.suggested_change}` : ''}`)
        .join('\n');

      const fixPrompt = `Apply the following UI design improvements to ${filePath}:\n\n${issueList}\n\nRequirements:\n- Use design system tokens (bg-background, text-foreground, border-border, etc.) not hardcoded colors\n- Use spacing scale: 4, 8, 16, 24, 32, 48, 64 (p-4, gap-6, etc.)\n- Ensure WCAG AA contrast (4.5:1 for text)\n- Use shadow-sm/md/lg and rounded-lg/xl/2xl consistently\n- Add focus states (ring-2) for interactive elements`;

      const issueIds = fileIssues.map((i: { id: string }) => i.id);
      await supabase.from('ui_design_improvements_results')
        .update({ status: 'fixing' })
        .in('id', issueIds);

      if (resolveModelForStep) {
        effectiveModel = (await resolveModelForStep(effectiveModel)) ?? effectiveModel;
      }

      let stepRowId: string | null = null;
      try {
        const { data: stepRow } = await supabase.from('build_steps').insert({
          build_id: buildId,
          step_number: fixPromptCount,
          prompt_content: fixPrompt,
          prompt_source: 'generated',
          agent_phase: 'ui-design-improvements',
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
        context: 'UI Design Improvements Agent fix',
        isFirstPrompt: false,
        model: effectiveModel,
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
        await supabase.from('ui_design_improvements_results')
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

      log(`Fixed ${fileIssues.length} improvements in ${filePath}`);
    }
  }

  if (stopIfRequested('finalize')) return;

  await supabase.from('automated_builds').update({
    ui_design_improvements_issues_fixed: fixedCount,
    ui_design_improvements_completed_at: new Date().toISOString(),
  }).eq('id', buildId);

  log(`UI Design Improvements Agent complete. ${fixedCount}/${totalIssues} issues fixed.`);
}
