/**
 * Read-only aggregate-spend accounting for the eval run (EVAL-TOLERANCE-01,
 * tightening 3).
 *
 * Reads the SETTLED micro-USD total from `ai_usage_daily` for the synthetic eval
 * tenant and today's UTC day, so the nightly reports the run's MEASURED spend
 * against the $5/user/day cap instead of an estimate. This turns the retry cost
 * from a guess into a number on the first nightly.
 *
 * READ-ONLY: it never reserves, settles, or mutates the ledger, and it does NOT
 * touch src/ai/cost/cap.ts. The write side (reserve/settle) is unchanged; this
 * only SELECTs the running total.
 *
 * ## Why the guards
 *
 *   - `getServiceClient` is required: `ai_usage_daily` is RLS default-deny for the
 *     request client (the cost meter reads/writes it ONLY via the service client
 *     with an explicit account_id; see src/ai/cost/cap.ts). This is a new, narrow,
 *     READ-ONLY audited caller of getServiceClient scoped to the synthetic eval
 *     tenant.
 *   - It is imported LAZILY (deferred `await import`) so `server-only` stays off
 *     the module-eval chain under the tsx eval runtime AND vitest, exactly as
 *     src/ai/cost/cap.ts does it.
 *   - It runs ONLY on a live run (EVAL_LIVE_REQUIRED==='1'); everywhere else it
 *     returns null (reported as "n/a") without importing the db client, so PR /
 *     local / unit runs stay hermetic.
 *   - Best-effort: ANY failure (no DB, missing table, unavailable creds) resolves
 *     to null so cost visibility can NEVER red the gate.
 *
 * ## Prod safety
 *
 * The read targets the synthetic EVAL_ACCOUNT_ID only (XC-01 synthetic tenant).
 * The upstream eval-seed prod-ref guard (scripts/seed-eval-corpus.ts) HARD-refuses
 * a prod DATABASE_URL (and VERCEL_ENV/NODE_ENV production) BEFORE the runner ever
 * executes, so this read cannot touch production.
 */
import { sql } from 'drizzle-orm';

import { EVAL_ACCOUNT_ID } from './fixtures/eval-corpus';

/** The UTC calendar day (ISO YYYY-MM-DD) for now. Mirrors cap.ts's usageDate key. */
function utcDay(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * The settled micro-USD spend for the eval tenant on today's UTC day, or null when
 * it cannot be read (not a live run, no DB, missing table, or any error). The
 * value is the running total in `ai_usage_daily` for (EVAL_ACCOUNT_ID, today);
 * on a fresh nightly day that is this run's spend (seed embeds + the two metered
 * checks). It is cumulative per UTC day, so a same-day re-run adds to it.
 */
export async function readEvalSpendMicroUsd(): Promise<number | null> {
  // Only a live run has a real DB + provider calls to account. Off the live path
  // return null WITHOUT importing the db client, keeping PR/local/unit hermetic.
  if (process.env.EVAL_LIVE_REQUIRED !== '1') return null;

  try {
    // Deferred import: @/db/client does `import 'server-only'`, which throws at
    // module-eval under tsx/vitest. Loading it lazily keeps it off the static chain
    // (same pattern as src/ai/cost/cap.ts). vitest's vi.mock('@/db/client') applies
    // to this dynamic import exactly as to a static one.
    const { getServiceClient } = await import('@/db/client');
    const db = getServiceClient();
    const rows = await db.execute<{ micro_usd_spent: number | string }>(sql`
      SELECT micro_usd_spent FROM ai_usage_daily
      WHERE account_id = ${EVAL_ACCOUNT_ID} AND usage_date = ${utcDay()}
      LIMIT 1
    `);
    const raw = rows[0]?.micro_usd_spent;
    // No row yet today means zero settled spend, not an error.
    if (raw === undefined || raw === null) return 0;
    return typeof raw === 'string' ? Number(raw) : raw;
  } catch {
    // Best-effort accounting: never throw, never red the gate on a read failure.
    return null;
  }
}

/** Format a micro-USD amount (or null) as a USD string for the summary line. */
export function formatSpendUsd(microUsd: number | null): string {
  if (microUsd === null) return 'n/a';
  return `$${(microUsd / 1_000_000).toFixed(4)}`;
}
