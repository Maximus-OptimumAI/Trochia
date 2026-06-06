/**
 * Extraction-floor check (Phase 2 exit gate criterion 3).
 *
 * Scores the REAL `extractFromPaste` agent against the 5 committed paste
 * fixtures (`tests/ai/fixtures/paste-*.txt`, reached via the fixtures re-export
 * seam — NOT duplicated) and asserts a mean populated-field floor of ≥ 8.
 *
 * Field count reuses the EXISTING `countPopulatedFields` helper from
 * `@/ai/schemas/business-memory.zod` (C1-M2 + plan-checker Finding 2). NOTE its
 * semantics are SHALLOW: each structured group (team / traction / narrative)
 * counts when `Object.keys(group).length > 0` — it does NOT verify leaves are
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
import { PASTE_FIXTURE_PATHS, loadFixtureText } from '../fixtures';
import type { EvalCheck } from '../types';

/** Mean populated-field floor (Phase 2 exit gate criterion 3). */
const FIELD_FLOOR = 8;

/**
 * Fixed eval-only tenant id. Never persisted — extractFromPaste logs it at info
 * level and never sends it to the LLM. A constant keeps eval runs comparable.
 */
const EVAL_ACCOUNT_ID = 'eval-extraction-floor';

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
          'ANTHROPIC_API_KEY not set — live extraction skipped (env-unavailable, non-blocking)',
      };
    }

    // Score the real agent against each fixture; count populated field groups.
    const counts: number[] = [];
    for (const path of PASTE_FIXTURE_PATHS) {
      const paste = loadFixtureText(path);
      const result = await extractFromPaste({
        accountId: EVAL_ACCOUNT_ID,
        paste,
        founderEmail: '',
      });
      counts.push(countPopulatedFields(result.draft));
    }

    const mean = counts.reduce((sum, n) => sum + n, 0) / counts.length;
    const status = mean >= FIELD_FLOOR ? ('pass' as const) : ('fail' as const);

    // reason carries ONLY counts — no draft / paste / snippet content.
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
