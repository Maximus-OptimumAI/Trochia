/**
 * Eval harness runner (EVAL-01a — Plan 02-04, Task 7).
 *
 * Iterates the 3 must-not-fail checks (extraction-floor, qa-grounding, cache-hit),
 * collects results, emits a CI-friendly JSON report to stdout AND a markdown
 * summary to `GITHUB_STEP_SUMMARY` when set, writes `eval-report.json` locally,
 * and exits with:
 *   - 0 on all-pending or all-pass
 *   - 1 on any-fail
 *
 * At Plan 02-04 close all three checks return `'pending'`, so the runner exits
 * 0 by default. The fail-CLOSED contract (`anyFail → exit 1`) is codified here
 * and exercised by `tests/ai/eval/runner.test.ts` Case 2. Plan 02-05 flips the
 * extraction-floor + cache-hit stubs to real implementations; qa-grounding
 * flips when Plan 02-07's qa-rag agent lands.
 *
 * Entry points:
 *   - `runEvalSuite()` programmatic API (used by tests)
 *   - `npm run eval:run` CLI (added to package.json in this same task)
 */
import { extractionFloor } from './checks/extraction-floor';
import { qaGrounding } from './checks/qa-grounding';
import { cacheHit } from './checks/cache-hit';
import type { EvalCheck, EvalStatus, EvalSuiteResult } from './types';
import { writeFileSync, appendFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

const CHECKS: EvalCheck[] = [extractionFloor, qaGrounding, cacheHit];

// Runtime allowlist of check ids permitted to return 'pending'
// (FOLLOWUP-EVAL-PENDING-RUNTIME-GATE-01, C1-M1). qa-grounding stays 'pending'
// until Plan 02-07's qa-rag agent lands; any OTHER 'pending' fails the run.
// A `Set<string>` (not a literal-tuple) so `.has(r.id)` typechecks against
// `r.id: string` without a const-assertion narrowing.
const PENDING_ALLOWED = new Set<string>(['qa-grounding']);

export async function runEvalSuite(): Promise<EvalSuiteResult> {
  const results = await Promise.all(CHECKS.map((c) => c.run()));

  // When EVAL_LIVE_REQUIRED==='1' (nightly / manual live runs), a 'skip'
  // (env-unavailable) is promoted to a FAILURE — a run that was supposed to
  // reach its dependency and could not is a RED gate, not a silent pass (C1-H1).
  const liveRequired = process.env.EVAL_LIVE_REQUIRED === '1';

  const anyFail = results.some((r) => r.status === 'fail');
  const disallowedPending = results.some(
    (r) => r.status === 'pending' && !PENDING_ALLOWED.has(r.id),
  );
  const liveSkipFail = liveRequired && results.some((r) => r.status === 'skip');
  const exitCode: 0 | 1 = anyFail || disallowedPending || liveSkipFail ? 1 : 0;

  const summary = [
    '## Trochia eval harness',
    '',
    '| Check | Status | Reason |',
    '|---|---|---|',
    ...results.map((r) => `| \`${r.id}\` | ${badge(r.status)} | ${r.reason} |`),
    '',
    `**Exit code:** ${exitCode}`,
  ].join('\n');

  // CI-friendly JSON to stdout
  process.stdout.write(JSON.stringify({ checks: results, exitCode }, null, 2) + '\n');

  // Markdown summary to GITHUB_STEP_SUMMARY when running in CI
  if (process.env.GITHUB_STEP_SUMMARY) {
    appendFileSync(process.env.GITHUB_STEP_SUMMARY, summary + '\n');
  }

  // Local JSON artifact
  writeFileSync('eval-report.json', JSON.stringify({ checks: results, exitCode }, null, 2));

  return { checks: results, exitCode, summary };
}

// Param widened to EvalStatus (plan-checker Note B): the compiler flags any
// future status member the badge forgets to render.
function badge(s: EvalStatus): string {
  switch (s) {
    case 'pass':
      return '✅ pass';
    case 'fail':
      return '❌ fail';
    case 'skip':
      return '⏭️ skip';
    case 'pending':
      return '⏳ pending';
  }
}

// CLI entrypoint. ESM-safe equivalent of `require.main === module`:
// fires when this file is the script tsx executes (npm run eval:run).
// We compare the resolved script path to process.argv[1] (tsx sets argv[1]
// to the entry script path).
const isCliEntry = (() => {
  if (!process.argv[1]) return false;
  try {
    const thisFile = fileURLToPath(import.meta.url);
    const entryFile = resolve(process.argv[1]);
    return thisFile === entryFile;
  } catch {
    return false;
  }
})();

if (isCliEntry) {
  runEvalSuite().then((r) => process.exit(r.exitCode));
}
