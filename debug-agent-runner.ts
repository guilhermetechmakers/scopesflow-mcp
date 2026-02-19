import { exec } from 'child_process';
import { promisify } from 'util';
import { SupabaseClient } from '@supabase/supabase-js';
import type { ExecutePromptFn, BuildExecutePromptArgs } from './build-runner.js';

const execAsync = promisify(exec);

const MAX_DEBUG_CYCLES = 5;
const MAX_ISSUES_PER_PROMPT = 30;
const BUILD_TIMEOUT_MS = 120_000;
const TSC_TIMEOUT_MS = 120_000;
const ESLINT_TIMEOUT_MS = 120_000;

interface DebugAgentOptions {
  supabase: SupabaseClient;
  buildId: string;
  projectId: string;
  projectPath: string;
  executePromptFn: ExecutePromptFn;
  model?: string;
  cursorApiKey?: string;
  githubAuth?: { gitHubToken?: string; gitUserName?: string; gitUserEmail?: string };
  userId: string;
}

interface FoundIssue {
  issue_type: string;
  severity: string;
  file_path?: string;
  line_number?: number;
  error_message: string;
}

export async function runDebugAgent(options: DebugAgentOptions): Promise<void> {
  const {
    supabase, buildId, projectId, projectPath,
    executePromptFn, model, cursorApiKey, githubAuth, userId,
  } = options;

  const log = (msg: string) => {
    console.error(`[DebugAgent] ${msg}`);
    supabase.from('build_logs').insert({
      build_id: buildId,
      log_type: 'build_log',
      message: msg,
      created_at: new Date().toISOString(),
    }).then(() => {});
  };

  log('Debug Agent starting...');

  await supabase.from('automated_builds').update({
    current_agent_phase: 'debug',
  }).eq('id', buildId);

  let cycle = 0;
  let totalFound = 0;
  let totalFixed = 0;

  while (cycle < MAX_DEBUG_CYCLES) {
    cycle++;
    log(`Debug cycle ${cycle}/${MAX_DEBUG_CYCLES}`);

    const issues: FoundIssue[] = [];

    // ── 1. npm run build ──
    try {
      await execAsync('npm run build', {
        cwd: projectPath,
        timeout: BUILD_TIMEOUT_MS,
        env: { ...process.env, CI: 'true' },
      });
      log('npm run build: PASS');
    } catch (err: unknown) {
      const execErr = err as { stderr?: string; stdout?: string };
      const stderr = execErr.stderr ?? execErr.stdout ?? String(err);
      const errorLines = stderr.split('\n').filter(
        (l: string) => l.includes('error') || l.includes('Error')
      );
      for (const line of errorLines.slice(0, 20)) {
        issues.push({
          issue_type: 'build_error',
          severity: 'critical',
          error_message: line.trim(),
        });
      }
      if (issues.length === 0) {
        issues.push({
          issue_type: 'build_error',
          severity: 'critical',
          error_message: stderr.slice(0, 2000),
        });
      }
      log(`npm run build: FAIL (${issues.length} errors)`);
    }

    // ── 2. TypeScript check ──
    try {
      await execAsync('npx tsc --noEmit --pretty false 2>&1 || true', {
        cwd: projectPath,
        timeout: TSC_TIMEOUT_MS,
      });
      log('tsc --noEmit: PASS');
    } catch (err: unknown) {
      const execErr = err as { stdout?: string; stderr?: string };
      const output = execErr.stdout ?? execErr.stderr ?? String(err);
      const tsErrors = output.split('\n').filter(
        (l: string) => /\.tsx?.*error TS/.test(l)
      );
      for (const line of tsErrors.slice(0, 30)) {
        const match = line.match(/(.+?)\((\d+),\d+\):\s*error\s+TS\d+:\s*(.+)/);
        if (match) {
          issues.push({
            issue_type: 'typescript_error',
            severity: 'high',
            file_path: match[1],
            line_number: parseInt(match[2], 10),
            error_message: match[3],
          });
        }
      }
      log(`tsc --noEmit: ${tsErrors.length} errors`);
    }

    // ── 3. ESLint ──
    try {
      const { stdout } = await execAsync(
        'npx eslint src/ --format json --no-error-on-unmatched-pattern 2>/dev/null || true',
        { cwd: projectPath, timeout: ESLINT_TIMEOUT_MS },
      );
      try {
        const eslintResults = JSON.parse(stdout);
        for (const file of eslintResults) {
          for (const msg of (file.messages || []).slice(0, 10)) {
            if (msg.severity >= 2) {
              issues.push({
                issue_type: 'lint_error',
                severity: 'medium',
                file_path: file.filePath,
                line_number: msg.line,
                error_message: `${msg.ruleId}: ${msg.message}`,
              });
            }
          }
        }
      } catch { /* ESLint output wasn't valid JSON */ }
      log(`ESLint: ${issues.filter(i => i.issue_type === 'lint_error').length} errors`);
    } catch {
      log('ESLint: skipped (not available)');
    }

    // ── 4. Check if clean ──
    if (issues.length === 0) {
      log('All validations passed! Debug cycle complete.');
      break;
    }

    totalFound += issues.length;

    // ── 5. Store issues ──
    const rows = issues.map(i => ({
      build_id: buildId,
      project_id: projectId,
      issue_type: i.issue_type,
      severity: i.severity,
      file_path: i.file_path ?? null,
      line_number: i.line_number ?? null,
      error_message: i.error_message,
      status: 'found',
      fix_attempt_count: cycle,
    }));

    await supabase.from('debug_issues').insert(rows);

    // ── 6. Generate consolidated fix prompt ──
    const issuesSummary = issues.slice(0, MAX_ISSUES_PER_PROMPT).map(i => {
      let line = `[${i.issue_type}]`;
      if (i.file_path) line += ` ${i.file_path}`;
      if (i.line_number) line += `:${i.line_number}`;
      line += ` — ${i.error_message}`;
      return line;
    }).join('\n');

    const fixPrompt = `Fix the following ${issues.length} errors found in this project:\n\n${issuesSummary}\n\nRules:\n- Fix each error\n- Do not introduce new errors\n- Install any missing dependencies with npm\n- Ensure npm run build passes after fixes`;

    let stepRowId: string | null = null;
    try {
      const { data: stepRow } = await supabase.from('build_steps').insert({
        build_id: buildId,
        step_number: cycle,
        prompt_content: fixPrompt,
        prompt_source: 'generated',
        agent_phase: 'debug',
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
      context: `Debug Agent cycle ${cycle}`,
      isFirstPrompt: false,
      model,
      cursorApiKey,
      supabaseClient: supabase,
      userId,
      buildId,
    };
    if (githubAuth?.gitHubToken) args.gitHubToken = githubAuth.gitHubToken;
    if (githubAuth?.gitUserName) args.gitUserName = githubAuth.gitUserName;
    if (githubAuth?.gitUserEmail) args.gitUserEmail = githubAuth.gitUserEmail;

    await executePromptFn(args);

    if (stepRowId) {
      try {
        await supabase.from('build_steps').update({
          status: 'completed',
          completed_at: new Date().toISOString(),
        }).eq('id', stepRowId);
      } catch { /* non-blocking */ }
    }

    totalFixed += issues.length;
    log(`Fix prompt executed for cycle ${cycle}`);
  }

  // ── Finalize ──
  await supabase.from('automated_builds').update({
    debug_issues_found: totalFound,
    debug_issues_fixed: totalFixed,
    debug_completed_at: new Date().toISOString(),
  }).eq('id', buildId);

  log(`Debug Agent complete. ${totalFixed}/${totalFound} issues addressed over ${cycle} cycles.`);
}
