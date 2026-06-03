/**
 * The $5/user/day HARD cost cap — ATOMIC RESERVE-then-SETTLE (Plan 02-07 / T01 /
 * OBS-COST-01 / OD-1/2/3/4/8).
 *
 * REAL enforcement, not tracking (guardrail #1). Before each metered provider call, the
 * caller RESERVES an UPPER-BOUND cost estimate of the WHOLE invocation; over-cap the
 * reserve is REFUNDED and a typed `AI_DAILY_CAP_EXCEEDED` is thrown (HARD block, OD-8 —
 * NOT a soft-throttle). After the call, the caller SETTLES the (actual − reserved) ≤ 0
 * delta, or REFUNDS the whole reserve on a pre-call throw.
 *
 * ## Concurrency (F-1 fix, OD-2)
 *
 * The RESERVE is a SINGLE atomic upsert under the (account_id, usage_date) row lock:
 *
 *   INSERT ... ON CONFLICT (account_id, usage_date)
 *     DO UPDATE SET micro_usd_spent = ai_usage_daily.micro_usd_spent + EXCLUDED.micro_usd_spent,
 *                   updated_at = now()
 *   RETURNING micro_usd_spent
 *
 * Two concurrent calls cannot both read under-cap and both proceed — the second sees the
 * first's reservation in its RETURNING value. The worst-case overshoot is AT MOST ONE
 * in-flight reservation (each reservation is a true upper bound, so SETTLE only ever
 * decrements).
 *
 * ## Reservation token + the reserved UTC day (P2-C)
 *
 * `reserveWithinDailyCap` CAPTURES the UTC `usageDate` ONCE and RETURNS it inside the
 * `Reservation` token. `settleSpend` / `refundReservation` TAKE that token and write to
 * `token.usageDate`'s row — NEVER a recomputed `CURRENT_DATE`/'today'. A call that crosses
 * UTC midnight between reserve and settle therefore adjusts the ORIGINAL day's row, with
 * no orphaned residue on either day.
 *
 * ## Store access (OD-3)
 *
 * Uses `getServiceClient()` (RLS-bypassing) with an EXPLICIT `account_id` on EVERY
 * read+write, so it works identically from the request path (qa-rag query embed +
 * synthesis) AND the Inngest path (embed-memory document embed). The explicit predicate —
 * not RLS — is the load-bearing isolation control for the meter. This is a NEW audited
 * caller of `getServiceClient` (see the allowlist comment in src/db/client.ts).
 *
 * ## Fail-CLOSED (OD-2)
 *
 * A financial guard must not fail-open. When the meter store itself is unavailable the
 * RESERVE throws `AI_COST_METER_UNAVAILABLE` (503) — the call is BLOCKED, not allowed.
 *
 * ## Privacy
 *
 * NO query/answer/chunk text ever enters this module. Throws are static typed AppErrors
 * with no provider payload (the 02-06 Sentry-unscrubbed lesson).
 */
import { sql } from 'drizzle-orm';

import { AppError } from '@/lib/errors';

/**
 * Lazy accessor for the RLS-bypassing service client (OD-3).
 *
 * `@/db/client` does `import 'server-only'`, which throws at MODULE-EVAL under the
 * `tsx` runtime (`npm run eval:run`). cap.ts is in the static import graph of
 * `src/ai/client.ts` (runAgent → cost cap), which the eval runner pulls in via the
 * extraction-floor check — so a TOP-LEVEL `import { getServiceClient }` would crash
 * `eval:run` at load even though no metered call ever fires on the no-key skip path.
 * Deferring the import behind this async accessor keeps `server-only` off the
 * module-eval chain; it loads only when a cost function actually executes (the Next.js
 * server runtime, where `server-only` is satisfied). vitest's `vi.mock('@/db/client')`
 * applies to this dynamic import exactly as to a static one.
 */
let _getServiceClient: typeof import('@/db/client').getServiceClient | undefined;
async function serviceClient() {
  if (!_getServiceClient) {
    ({ getServiceClient: _getServiceClient } = await import('@/db/client'));
  }
  return _getServiceClient();
}

/** $5.00 expressed in micro-USD (1 USD = 1_000_000 micro-USD). Documented TUNABLE constant. */
export const CAP_MICRO_USD = 5_000_000;

/**
 * The token returned by `reserveWithinDailyCap` and consumed by `settleSpend` /
 * `refundReservation`. `usageDate` is the UTC calendar day captured AT RESERVE TIME
 * (P2-C) — settle/refund key on it, never a recomputed 'today'.
 */
export interface Reservation {
  accountId: string;
  /** The reserved UTC day, ISO `YYYY-MM-DD`. */
  usageDate: string;
  reservedMicroUsd: number;
}

/** The UTC calendar day (ISO `YYYY-MM-DD`) for `now`. Captured ONCE per reserve (P2-C). */
function utcDay(now: Date = new Date()): string {
  return now.toISOString().slice(0, 10);
}

/** Number out of a postgres-js RETURNING row, tolerant of bigint-as-string. */
function toNum(v: unknown): number {
  return typeof v === 'string' ? Number(v) : (v as number);
}

/**
 * ATOMIC RESERVE: add `estMicroUsd` (the upper-bound cost of the whole invocation) to the
 * running total for `(accountId, usageDate)`, read back the new total. If the new total
 * exceeds `CAP_MICRO_USD`, atomically REFUND the estimate and throw `AI_DAILY_CAP_EXCEEDED`.
 * Returns a `Reservation` token carrying the reserved UTC day (P2-C).
 *
 * @throws AppError `AI_DAILY_CAP_EXCEEDED` (429) over-cap; `AI_COST_METER_UNAVAILABLE` (503)
 *         on store error (fail-CLOSED).
 */
export async function reserveWithinDailyCap(
  accountId: string,
  estMicroUsd: number,
): Promise<Reservation> {
  const usageDate = utcDay();
  // `micro_usd_spent` is a bigint column — store integer micro-USD. CEIL the reserve so it
  // stays a true upper bound (rounding UP can only over-reserve, never under-reserve).
  const reserved = Math.ceil(estMicroUsd);

  let newTotal: number;
  try {
    // codex#7 — fail-closed includes client acquisition: serviceClient() must be
    // INSIDE the try so a DB-init/import failure is wrapped as the typed
    // AI_COST_METER_UNAVAILABLE (503), never a raw operational message.
    const db = await serviceClient();
    const rows = await db.execute<{ micro_usd_spent: number | string }>(sql`
      INSERT INTO ai_usage_daily (account_id, usage_date, micro_usd_spent)
      VALUES (${accountId}, ${usageDate}, ${reserved})
      ON CONFLICT (account_id, usage_date) DO UPDATE
        SET micro_usd_spent = ai_usage_daily.micro_usd_spent + EXCLUDED.micro_usd_spent,
            updated_at = now()
      RETURNING micro_usd_spent
    `);
    newTotal = toNum(rows[0]?.micro_usd_spent);
  } catch {
    // fail-CLOSED — never leak the underlying store error (no query/account payload).
    throw new AppError('cost meter unavailable', {
      code: 'AI_COST_METER_UNAVAILABLE',
      status: 503,
    });
  }

  if (newTotal > CAP_MICRO_USD) {
    // Over cap — atomically REFUND the estimate we just reserved (compensating decrement
    // against the SAME reserved day), then HARD-block (OD-8). The refund keeps the ledger
    // honest so a burst of over-cap calls leaves zero residue.
    await decrement({ accountId, usageDate, reservedMicroUsd: reserved });
    throw new AppError('daily AI spend limit reached', {
      code: 'AI_DAILY_CAP_EXCEEDED',
      status: 429,
    });
  }

  return { accountId, usageDate, reservedMicroUsd: reserved };
}

/**
 * SETTLE: after a successful provider call, apply the `(actualMicroUsd − reservedMicroUsd)`
 * delta to `token.usageDate`'s row (NEVER 'today'). The delta is ≤ 0 because the reserve is
 * an upper bound; the floor is clamped at 0 defensively.
 */
export async function settleSpend(token: Reservation, actualMicroUsd: number): Promise<void> {
  // CEIL the actual to an integer micro-USD. Since actual ≤ reserved and reserved is an
  // integer, ceil(actual) ≤ reserved still holds — the settle delta stays ≤ 0.
  const delta = Math.ceil(actualMicroUsd) - token.reservedMicroUsd;
  if (delta === 0) return;
  await applyDelta(token.accountId, token.usageDate, delta);
}

/**
 * REFUND: the pre-call-throw full-refund path (P2-C) — decrement `token.reservedMicroUsd`
 * from `token.usageDate`'s row (clamp floor at 0). No provider spend happened.
 */
export async function refundReservation(token: Reservation): Promise<void> {
  await decrement(token);
}

/** Decrement the reserved amount from the token's reserved-day row (clamp floor 0). */
async function decrement(token: Reservation): Promise<void> {
  await applyDelta(token.accountId, token.usageDate, -token.reservedMicroUsd);
}

/**
 * Apply a signed micro-USD `delta` to `(accountId, usageDate)`'s running total, clamping
 * the floor at 0 (GREATEST(... , 0)). Explicit account_id + the reserved usageDate on
 * every write — never 'today'. Same atomic-upsert shape as RESERVE so it is concurrency-safe.
 */
async function applyDelta(accountId: string, usageDate: string, delta: number): Promise<void> {
  try {
    // codex#7 — fail-closed includes client acquisition: serviceClient() inside
    // the try so a DB-init failure surfaces as the typed AI_COST_METER_UNAVAILABLE.
    const db = await serviceClient();
    await db.execute(sql`
      INSERT INTO ai_usage_daily (account_id, usage_date, micro_usd_spent)
      VALUES (${accountId}, ${usageDate}, GREATEST(${delta}, 0))
      ON CONFLICT (account_id, usage_date) DO UPDATE
        SET micro_usd_spent = GREATEST(ai_usage_daily.micro_usd_spent + ${delta}, 0),
            updated_at = now()
    `);
  } catch {
    throw new AppError('cost meter unavailable', {
      code: 'AI_COST_METER_UNAVAILABLE',
      status: 503,
    });
  }
}
