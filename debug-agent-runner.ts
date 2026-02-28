import { exec, spawn } from 'child_process';
import { promisify } from 'util';
import * as http from 'http';
import { SupabaseClient } from '@supabase/supabase-js';
import type { ExecutePromptFn, BuildExecutePromptArgs, BuildProvider } from './build-runner.js';

const execAsync = promisify(exec);

const MAX_DEBUG_CYCLES = 5;
const MAX_ISSUES_PER_PROMPT = 30;
const BUILD_TIMEOUT_MS = 120_000;
const TSC_TIMEOUT_MS = 120_000;
const ESLINT_TIMEOUT_MS = 120_000;
const DEV_SERVER_PORT = 4999;
const DEV_SERVER_STARTUP_TIMEOUT_MS = 60_000;
const RUNTIME_CHECK_TIMEOUT_MS = 30_000;

const RUNTIME_ERROR_PATTERNS = [
  /TypeError:\s*.+is not a function/,
  /TypeError:\s*Cannot read propert/,
  /TypeError:\s*.+is not iterable/,
  /TypeError:\s*undefined is not an object/,
  /TypeError:\s*null is not an object/,
  /ReferenceError:\s*.+is not defined/,
  /Uncaught\s+(TypeError|ReferenceError|RangeError)/,
  /Unhandled Runtime Error/,
  /\.(?:map|filter|reduce|forEach|find|some|every)\s+is not a function/,
];

interface DebugAgentOptions {
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

interface FoundIssue {
  issue_type: string;
  severity: string;
  file_path?: string;
  line_number?: number;
  error_message: string;
}

function httpGet(url: string, timeoutMs = 10_000): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const req = http.get(url, { timeout: timeoutMs }, (res) => {
      let body = '';
      res.on('data', (chunk: Buffer) => { body += chunk.toString(); });
      res.on('end', () => resolve({ status: res.statusCode ?? 0, body }));
    });
    req.on('timeout', () => { req.destroy(); reject(new Error('Request timed out')); });
    req.on('error', reject);
  });
}

function extractRoutesFromHtml(body: string): string[] {
  const routes = new Set<string>(['/']);
  const hrefPattern = /(?:href|to)=["'](\/([\w-]+(?:\/[\w-:]+)*)?)["']/g;
  let match: RegExpExecArray | null;
  while ((match = hrefPattern.exec(body)) !== null) {
    const route = match[1];
    if (route && !route.startsWith('//') && !route.includes('.') && route.length < 100) {
      routes.add(route);
    }
  }
  return Array.from(routes);
}

async function runRuntimeSmokeTest(
  projectPath: string,
  log: (msg: string) => void,
): Promise<FoundIssue[]> {
  const issues: FoundIssue[] = [];
  const baseUrl = `http://localhost:${DEV_SERVER_PORT}`;

  let devProcess: ReturnType<typeof spawn> | null = null;
  const collectedErrors: string[] = [];

  try {
    devProcess = spawn('npx', ['vite', '--port', String(DEV_SERVER_PORT), '--strictPort'], {
      cwd: projectPath,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, BROWSER: 'none', PORT: String(DEV_SERVER_PORT) },
      shell: true,
    });

    let serverReady = false;

    devProcess.stderr?.on('data', (data: Buffer) => {
      const text = data.toString();
      for (const pattern of RUNTIME_ERROR_PATTERNS) {
        if (pattern.test(text)) {
          collectedErrors.push(text.trim().slice(0, 500));
        }
      }
    });

    devProcess.stdout?.on('data', (data: Buffer) => {
      const text = data.toString();
      if (text.includes('Local:') || text.includes('ready in') || text.includes('VITE')) {
        serverReady = true;
      }
      for (const pattern of RUNTIME_ERROR_PATTERNS) {
        if (pattern.test(text)) {
          collectedErrors.push(text.trim().slice(0, 500));
        }
      }
    });

    const startTime = Date.now();
    while (!serverReady && Date.now() - startTime < DEV_SERVER_STARTUP_TIMEOUT_MS) {
      await new Promise(r => setTimeout(r, 1000));
      if (!serverReady) {
        try {
          await httpGet(baseUrl, 3000);
          serverReady = true;
        } catch { /* server not ready yet */ }
      }
    }

    if (!serverReady) {
      log('Runtime smoke test: dev server failed to start within timeout. Skipping.');
      return issues;
    }

    log('Runtime smoke test: dev server ready. Crawling pages...');

    let routesToCheck = ['/'];
    try {
      const indexResult = await httpGet(baseUrl, 10_000);
      if (indexResult.status === 200) {
        routesToCheck = extractRoutesFromHtml(indexResult.body).slice(0, 15);
        log(`Runtime smoke test: discovered ${routesToCheck.length} routes to check`);
      }
    } catch (err) {
      log(`Runtime smoke test: failed to fetch index page — ${err instanceof Error ? err.message : String(err)}`);
    }

    const checkStart = Date.now();
    for (const route of routesToCheck) {
      if (Date.now() - checkStart > RUNTIME_CHECK_TIMEOUT_MS) break;
      try {
        const result = await httpGet(`${baseUrl}${route}`, 8_000);
        if (result.status >= 500) {
          issues.push({
            issue_type: 'runtime_error',
            severity: 'critical',
            file_path: route,
            error_message: `Route ${route} returned HTTP ${result.status}`,
          });
        }
        const errorMarkers = [
          'Unexpected Application Error',
          'is not a function',
          'Cannot read propert',
          'is not defined',
          'is not iterable',
        ];
        for (const marker of errorMarkers) {
          if (result.body.includes(marker)) {
            const contextStart = result.body.indexOf(marker);
            const snippet = result.body.slice(
              Math.max(0, contextStart - 50),
              contextStart + 200,
            ).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
            issues.push({
              issue_type: 'runtime_error',
              severity: 'critical',
              file_path: route,
              error_message: `Runtime error on ${route}: ${snippet.slice(0, 300)}`,
            });
            break;
          }
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (!msg.includes('timed out')) {
          issues.push({
            issue_type: 'runtime_error',
            severity: 'high',
            file_path: route,
            error_message: `Failed to load ${route}: ${msg}`,
          });
        }
      }
      await new Promise(r => setTimeout(r, 500));
    }

    for (const errText of collectedErrors) {
      const fileMatch = errText.match(/(src\/[^\s:]+)/);
      const alreadyReported = issues.some(i => i.error_message.includes(errText.slice(0, 80)));
      if (!alreadyReported) {
        issues.push({
          issue_type: 'runtime_error',
          severity: 'critical',
          file_path: fileMatch?.[1],
          error_message: errText.slice(0, 500),
        });
      }
    }

    log(`Runtime smoke test: found ${issues.length} runtime issues`);
  } catch (err) {
    log(`Runtime smoke test error: ${err instanceof Error ? err.message : String(err)}`);
  } finally {
    if (devProcess && !devProcess.killed) {
      devProcess.kill('SIGTERM');
      await new Promise(r => setTimeout(r, 2000));
      if (!devProcess.killed) {
        devProcess.kill('SIGKILL');
      }
    }
  }

  return issues;
}

export async function runDebugAgent(options: DebugAgentOptions): Promise<void> {
  const {
    supabase, buildId, projectId, projectPath,
    executePromptFn, model, cursorApiKey, provider, githubAuth, userId, shouldStop,
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

  const stopIfRequested = (context: string): boolean => {
    if (!shouldStop?.()) return false;
    log(`Stop requested; exiting debug phase (${context}).`);
    return true;
  };

  if (stopIfRequested('startup')) return;

  if (stopIfRequested('finalize')) return;

  await supabase.from('automated_builds').update({
    current_agent_phase: 'debug',
  }).eq('id', buildId);

  let cycle = 0;
  let totalFound = 0;
  let totalFixed = 0;

  while (cycle < MAX_DEBUG_CYCLES) {
    if (stopIfRequested('cycle loop')) return;
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

    // ── 4. Runtime smoke test ──
    if (stopIfRequested('pre-runtime-check')) return;
    const staticIssueCount = issues.length;
    if (staticIssueCount === 0) {
      log('Static checks passed. Running runtime smoke test...');
      const runtimeIssues = await runRuntimeSmokeTest(projectPath, log);
      issues.push(...runtimeIssues);
    } else {
      log(`Skipping runtime smoke test (${staticIssueCount} static issues to fix first)`);
    }

    // ── 5. Check if clean ──
    if (issues.length === 0) {
      log('All validations passed (including runtime)! Debug cycle complete.');
      break;
    }

    totalFound += issues.length;

    // ── 6. Store issues ──
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

    // ── 7. Generate consolidated fix prompt ──
    const issuesSummary = issues.slice(0, MAX_ISSUES_PER_PROMPT).map(i => {
      let line = `[${i.issue_type}]`;
      if (i.file_path) line += ` ${i.file_path}`;
      if (i.line_number) line += `:${i.line_number}`;
      line += ` — ${i.error_message}`;
      return line;
    }).join('\n');

    const fixPrompt = `Fix the following ${issues.length} errors found in this project:\n\n${issuesSummary}\n\nRules:\n- Fix each error\n- Do not introduce new errors\n- Install any missing dependencies with npm\n- Ensure npm run build passes after fixes\n\nRuntime Safety (apply to ALL fixes):\n- All array operations (.map, .filter, .reduce, .forEach, .find, .some, .every) MUST be guarded: use (value ?? []).map(...) or Array.isArray(value) checks\n- All Supabase query results MUST use \`data ?? []\` — Supabase returns null, not [] for empty results\n- All React useState hooks for arrays MUST be initialized with []: useState<Type[]>([])\n- All API/fetch response data MUST be validated before calling array methods: const items = Array.isArray(res?.data) ? res.data : []\n- Use optional chaining (?.) for nested object access from DB or API responses\n- Destructure with defaults: const { items = [], count = 0 } = response ?? {}`;

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
      provider,
      supabaseClient: supabase,
      userId,
      buildId,
    };
    if (githubAuth?.gitHubToken) args.gitHubToken = githubAuth.gitHubToken;
    if (githubAuth?.gitUserName) args.gitUserName = githubAuth.gitUserName;
    if (githubAuth?.gitUserEmail) args.gitUserEmail = githubAuth.gitUserEmail;

    await executePromptFn(args);

    if (stopIfRequested('post-fix')) return;

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
