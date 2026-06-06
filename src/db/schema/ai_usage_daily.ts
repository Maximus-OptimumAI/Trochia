/**
 * ai_usage_daily — the durable per-(tenant, UTC-day) AI-spend counter (Plan 02-07 / T01 /
 * OBS-COST-01 / OD-1 Option A).
 *
 * ## What this is
 *
 * The atomic store behind the $5/user/day HARD cost cap (OD-8). The cost meter
 * (`src/ai/cost/cap.ts`) does a SINGLE atomic upsert against `(account_id, usage_date)`:
 *
 *   INSERT INTO ai_usage_daily (account_id, usage_date, micro_usd_spent)
 *   VALUES (...)
 *   ON CONFLICT (account_id, usage_date) DO UPDATE
 *     SET micro_usd_spent = ai_usage_daily.micro_usd_spent + EXCLUDED.micro_usd_spent,
 *         updated_at = now()
 *   RETURNING micro_usd_spent
 *
 * — RESERVE the upper-bound estimate up front, read back the running total, and over-cap
 * REFUND + throw. The single statement under the row lock closes the F-1 TOCTOU window
 * (two concurrent calls cannot both read under-cap; the second sees the first's reserve).
 *
 * ## SCHEMA-LOCK FORK (OD-1 — FOUNDER-RATIFIED 2026-06-01)
 *
 * This is the FIRST `src/db/schema` change since the 29228e8 byte-lock. It is a deliberate,
 * founder-ratified break: adding this file + `0007_ai_usage_daily.sql` intentionally makes
 * `git diff --quiet 29228e8 -- src/db/schema/` EXIT NON-ZERO. The schema-lock is NOT
 * removed — it RE-ANCHORS to the post-0007 HEAD; the guard for subsequent plans becomes
 * `git diff --quiet <post-0007 HEAD> -- src/db/schema/`. Activates FOLLOWUP-DBDIFF-01.
 *
 * ## P2-C reservation-reclaim limitation (FOLLOWUP-COST-RESERVATION-RECLAIM-01)
 *
 * The single `micro_usd_spent` column CANNOT distinguish a pending reservation from a
 * settled spend. A precise sweeper that reclaims a reservation stranded by a hard crash
 * (no `finally` ran) needs a future `reserved`/`settled` or `expires_at` column. Under
 * this minimal store, a stranded reserve is BOUNDED (one upper-bound reservation) and
 * self-heals at UTC-day rollover (fail-toward-blocking, never fail-open). Tracked as
 * FOLLOWUP-COST-RESERVATION-RECLAIM-01.
 *
 * ## Tenancy
 *
 * Tenant-scoped — `tenantIsolationPolicy(account_id)`, same shape as `embeddings.ts`. The
 * cost meter reaches this table via `getServiceClient()` (RLS-bypassing, the dual-context
 * request+Inngest path) and re-asserts an EXPLICIT `account_id` on EVERY read+write, so
 * the explicit predicate — not RLS — is the load-bearing isolation control for the meter.
 */
import { bigint, date, pgTable, primaryKey, timestamp, uuid } from 'drizzle-orm/pg-core';

import { tenantIsolationPolicy } from '@/db/rls';
import { accounts } from '@/db/schema/tenancy';

export const aiUsageDaily = pgTable(
  'ai_usage_daily',
  {
    accountId: uuid('account_id')
      .notNull()
      .references(() => accounts.id, { onDelete: 'cascade' }),
    /** The UTC calendar day this running total is scoped to (the reservation token's usageDate). */
    usageDate: date('usage_date').notNull(),
    /**
     * Running micro-USD spend for (account, day). bigint (stored as a string by
     * postgres-js `mode: 'number'` keeps it a JS number for the modest daily caps here —
     * $5/day = 5_000_000 micro-USD is far below Number.MAX_SAFE_INTEGER). Reserve adds the
     * upper-bound estimate; settle applies the (actual − reserved) ≤ 0 delta; refund
     * decrements. Floored at 0 by the meter.
     */
    microUsdSpent: bigint('micro_usd_spent', { mode: 'number' }).notNull().default(0),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.accountId, t.usageDate] }),
    tenantIsolationPolicy(t.accountId),
  ],
);

export type AiUsageDailyRow = typeof aiUsageDaily.$inferSelect;
export type AiUsageDailyInsert = typeof aiUsageDaily.$inferInsert;
