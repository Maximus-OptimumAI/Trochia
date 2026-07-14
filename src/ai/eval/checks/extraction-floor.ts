/**
 * Extraction-floor check (Phase 2 exit gate criterion 3).
 *
 * Scores the REAL `extractFromPaste` agent against the 5 committed paste
 * fixtures (`tests/ai/fixtures/paste-*.txt`, reached via the fixtures re-export
 * seam - NOT duplicated) and asserts a mean populated-field floor of ≥ 8.
 *
 * Field count reuses the EXISTING `countPopulatedFields` helper from
 * `@/ai/schemas/business-memory.zod` (C1-M2 + plan-checker Finding 2). NOTE its
 * semantics are SHALLOW: each structured group (team / traction / narrative)
 * counts when `Object.keys(group).length > 0` - it does NOT verify leaves are
 * non-empty. The metric is this shallow count averaged over the 5 fixtures.
 * Deeper leaf-emptiness checking is OUT OF SCOPE here.
 *
 * Status model (OD-A):
 *   - ANTHROPIC_API_KEY absent → 'skip' (env-unavailable; the agent is NEVER
 *     called). Non-blocking on PR/local; the runner promotes it to a FAILURE
 *     when EVAL_LIVE_REQUIRED==='1' (nightly / manual live runs).
 *   - mean ≥ 8 → 'pass'; else 'fail'. metric = mean, threshold = 8.
 *
 * Privacy: `reason` carries ONLY counts (the mean + per-fixture field counts).
 * Draft content, paste content, and source_snippet text NEVER reach `reason`
 * or any log. Anthropic is touched ONLY via extractFromPaste → runAgent →
 * src/ai/client.ts (the chokepoint); this file imports NO Anthropic SDK.
 */
import { extractFromPaste } from '@/ai/agents/extract-from-paste.agent';
import { countPopulatedFields } from '@/ai/schemas/business-memory.zod';
import { isAppError } from '@/lib/errors';
import { logger } from '@/lib/logger';
import { PASTE_FIXTURE_PATHS, loadFixtureText } from '../fixtures';
import { EVAL_ACCOUNT_ID } from '../fixtures/eval-corpus';
import type { EvalCheck } from '../types';

/** Mean populated-field floor (Phase 2 exit gate criterion 3). LOCKED, not moved. */
const FIELD_FLOOR = 8;

/**
 * Bounded FRESH re-attempts per fixture (EVAL-TOLERANCE-01, tightening 1). Each
 * attempt is a brand NEW extractFromPaste call: a fresh conversation with its own
 * internal attempt-plus-repair AND its own reserve/settle cycle, NOT a
 * continuation of the poisoned turn that runAgent already re-prompts once (the
 * "one repair retry"). This absorbs the STOCHASTIC structured-output miss
 * (EVAL-ANTHROPIC-FAIL-01) without softening the gate: after this many fresh
 * attempts the fixture STILL hard-fails (the last error rethrows), so a genuinely
 * broken extractor still reds the nightly.
 */
const MAX_FRESH_ATTEMPTS = 3;

/**
 * The ONLY error code that triggers a fresh re-attempt. Everything else
 * (AI_DAILY_CAP_EXCEEDED, AI_COST_METER_UNAVAILABLE, DB, network, anything)
 * propagates IMMEDIATELY with no retry. Cap-exceeded in particular must NEVER be
 * retried: retrying it would only reserve more budget against a hard wall.
 */
const RETRYABLE_ERROR_CODE = 'AI_STRUCTURED_OUTPUT_INVALID';

/**
 * Run extractFromPaste for one fixture with up to MAX_FRESH_ATTEMPTS fresh calls,
 * retrying ONLY on AI_STRUCTURED_OUTPUT_INVALID. Any other error propagates at
 * once (no retry). If every fresh attempt raises the structured-output error, the
 * LAST error is rethrown so the fixture HARD-FAILS the check (it is never skipped,
 * never excluded from the mean). Content-blind: logs only the attempt index,
 * never paste or draft content.
 */
async function extractWithFreshRetries(
  paste: string,
): Promise<Awaited<ReturnType<typeof extractFromPaste>>> {
  let lastErr: unknown;
  for (let attempt = 1; attempt <= MAX_FRESH_ATTEMPTS; attempt++) {
    try {
      return await extractFromPaste({ accountId: EVAL_ACCOUNT_ID, paste, founderEmail: '' });
    } catch (err) {
      // Retry ONLY the stochastic structured-output miss; propagate everything else.
      if (!(isAppError(err) && err.code === RETRYABLE_ERROR_CODE)) throw err;
      lastErr = err;
      logger.warn('ai/eval/extraction-floor: structured-output miss, fresh re-attempt', {
        attempt,
        maxAttempts: MAX_FRESH_ATTEMPTS,
      });
    }
  }
  // Exhausted every fresh attempt on the retryable error: hard-fail (tightening 1).
  throw lastErr;
}

// The eval tenant id is the REAL seeded UUID `EVAL_ACCOUNT_ID` (fixtures/eval-corpus.ts),
// NOT a bare string. extractFromPaste → runAgent meters the call through the cost cap,
// which INSERTs `account_id` into `ai_usage_daily` (a `uuid` column with an FK to the
// seeded `accounts` row). A non-UUID literal there fails Postgres `22P02` (invalid uuid),
// masked as "cost meter unavailable" (EVAL-CHECK-ACCTID-01). The seed creates this tenant's
// accounts row before the runner, so the FK is satisfied.

export const extractionFloor: EvalCheck = {
  id: 'extraction-floor',
  description:
    'extractFromPaste auto-fills ≥8 fields from a 1,500-word paste fixture (Phase 2 exit gate criterion 3)',
  async run() {
    // Env-gate: no ANTHROPIC_API_KEY → skip (env-unavailable). The agent is
    // NOT called. The runner treats this skip as non-blocking on PR/local and
    // as a RED gate when EVAL_LIVE_REQUIRED==='1'.
    if (!process.env.ANTHROPIC_API_KEY) {
      return {
        id: this.id,
        description: this.description,
        status: 'skip' as const,
        reason:
          'ANTHROPIC_API_KEY not set - live extraction skipped (env-unavailable, non-blocking)',
      };
    }

    // Score the real agent against each fixture; count populated field groups.
    // Each call gets bounded FRESH re-attempts on the stochastic structured-output
    // miss (tightening 1). The mean is still computed over ALL 5 fixtures; only the
    // number of attempts per fixture changes. A fixture that exhausts its attempts
    // throws out of this loop (hard-fail), exactly as a single call did before.
    const counts: number[] = [];
    for (const path of PASTE_FIXTURE_PATHS) {
      const paste = loadFixtureText(path);
      const result = await extractWithFreshRetries(paste);
      counts.push(countPopulatedFields(result.draft));
    }

    const mean = counts.reduce((sum, n) => sum + n, 0) / counts.length;
    const status = mean >= FIELD_FLOOR ? ('pass' as const) : ('fail' as const);

    // reason carries ONLY counts - no draft / paste / snippet content.
    return {
      id: this.id,
      description: this.description,
      status,
      metric: mean,
      threshold: FIELD_FLOOR,
      reason: `mean populated fields ${mean.toFixed(2)} across ${counts.length} fixtures (per-fixture: [${counts.join(', ')}]); floor ${FIELD_FLOOR}`,
    };
  },
};
