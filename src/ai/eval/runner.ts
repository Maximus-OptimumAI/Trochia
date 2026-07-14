/**
 * Eval harness runner (EVAL-01a - Plan 02-04, Task 7).
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
import { readEvalSpendMicroUsd, formatSpendUsd } from './spend';
import { CAP_MICRO_USD } from '@/ai/cost/cap';
import type { EvalCheck, EvalCheckResult, EvalStatus, EvalSuiteResult } from './types';
import { writeFileSync, appendFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

const CHECKS: EvalCheck[] = [extractionFloor, qaGrounding, cacheHit];

// Runtime allowlist of check ids permitted to return 'pending'
// (FOLLOWUP-EVAL-PENDING-RUNTIME-GATE-01, C1-M1). Plan 02-07 / T03 flipped
// qa-grounding to a REAL check (the last 'pending' stub), so the allowlist is
// now EMPTY - the eval gate is fully active: ANY 'pending' fails the run.
// A `Set<string>` (not a literal-tuple) so `.has(r.id)` typechecks against
// `r.id: string` without a const-assertion narrowing.
const PENDING_ALLOWED = new Set<string>([]);

export async function runEvalSuite(): Promise<EvalSuiteResult> {
  // Each check is isolated: a thrown check becomes a sanitized 'fail' result
  // rather than rejecting Promise.all (which would skip the report write and
  // leave the PR-comment step reading a stale/absent eval-report.json). The
  // error message is truncated and carries no stack/secret/PII (/codex P2 +
  // /cso). A thrown check is fail-CLOSED - it can never pass silently.
  const results = await Promise.all(
    CHECKS.map(async (c): Promise<EvalCheckResult> => {
      try {
        return await c.run();
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return {
          id: c.id,
          description: c.description,
          status: 'fail',
          reason: `check threw: ${msg.slice(0, 120)}`,
        };
      }
    }),
  );

  // When EVAL_LIVE_REQUIRED==='1' (nightly / manual live runs), ANY surviving 'skip'
  // is promoted to a FAILURE - a run that was supposed to reach its dependency and did
  // not is a RED gate, not a silent pass (C1-H1). This INCLUDES a data-unavailable skip
  // (codex P1 #3, LANGFUSE-TRACING-01): the flush fix in this change makes the live eval
  // produce AND deliver its own agent:* traces, so zero traces after the cache-hit
  // check's bounded ingestion-lag retry means DELIVERY is broken - exactly what the
  // gate must catch. `skipKind` is now a DIAGNOSTIC ONLY (it shapes the failure reason:
  // "flush/ingestion suspect" vs "creds missing"), never a tolerance switch.
  const liveRequired = process.env.EVAL_LIVE_REQUIRED === '1';

  const anyFail = results.some((r) => r.status === 'fail');
  const disallowedPending = results.some(
    (r) => r.status === 'pending' && !PENDING_ALLOWED.has(r.id),
  );
  const liveSkipFail = liveRequired && results.some((r) => r.status === 'skip');
  const exitCode: 0 | 1 = anyFail || disallowedPending || liveSkipFail ? 1 : 0;

  // Tightening 3 (EVAL-TOLERANCE-01): report the MEASURED aggregate spend for the
  // run against the $5/user/day cap, so the bounded retries above cost a known
  // number rather than an estimate. READ-ONLY: this reads the settled ledger total
  // and does NOT change reserve/settle or cap.ts. Best-effort (null -> "n/a" off a
  // live run or on any read failure); it NEVER affects exitCode.
  const spendMicroUsd = await readEvalSpendMicroUsd();
  const spendLine = `**Aggregate metered spend (eval tenant, today UTC):** ${formatSpendUsd(spendMicroUsd)} of ${formatSpendUsd(CAP_MICRO_USD)}/user/day cap`;

  const summary = [
    '## Trochia eval harness',
    '',
    '| Check | Status | Reason |',
    '|---|---|---|',
    ...results.map((r) => `| \`${r.id}\` | ${badge(r.status)} | ${r.reason} |`),
    '',
    spendLine,
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
