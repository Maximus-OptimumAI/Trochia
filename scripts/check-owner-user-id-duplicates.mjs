#!/usr/bin/env node
/**
 * Pre-migration safety check for PR-1 (migration 0003 — partial UNIQUE on
 * accounts.owner_user_id WHERE deleted_at IS NULL).
 *
 * Run this BEFORE applying 0003 to any environment that holds live data
 * (trochia-prod, trochia-test-ci). The migration will FAIL outright if a
 * duplicate live row exists for any owner_user_id — postgres refuses to
 * create the unique index against a table that already violates it.
 *
 * Usage:
 *   DIRECT_URL=postgres://... node scripts/check-owner-user-id-duplicates.mjs
 *
 * Exit codes:
 *   0 — no duplicates; migration safe to apply.
 *   1 — duplicates found; the script prints the offending (owner_user_id, count)
 *       pairs and the full live-row contents. Manual remediation required
 *       (consolidate or soft-delete the older row) BEFORE applying 0003.
 *   2 — bad invocation / connection failure.
 */
import postgres from 'postgres';

const url = process.env.DIRECT_URL ?? process.env.DATABASE_URL ?? '';
if (!url) {
  console.error('FATAL: DIRECT_URL (or DATABASE_URL) is not set.');
  process.exit(2);
}

const sql = postgres(url, { prepare: false, max: 1 });

try {
  const dupes = await sql`
    select owner_user_id, count(*)::int as live_count
    from public.accounts
    where deleted_at is null
    group by owner_user_id
    having count(*) > 1
    order by count(*) desc, owner_user_id
  `;

  if (dupes.length === 0) {
    const total = await sql`select count(*)::int as n from public.accounts where deleted_at is null`;
    console.log(`OK — 0 duplicates across ${total[0].n} live accounts. Safe to apply migration 0003.`);
    process.exit(0);
  }

  console.error(`DUPLICATES FOUND — ${dupes.length} owner_user_id values each have multiple live accounts:`);
  console.error('');
  for (const row of dupes) {
    console.error(`  owner_user_id=${row.owner_user_id}  live_count=${row.live_count}`);
    const rows = await sql`
      select id, region, subscription_status, tier, stripe_customer_id, created_at, updated_at
      from public.accounts
      where owner_user_id = ${row.owner_user_id} and deleted_at is null
      order by created_at
    `;
    for (const r of rows) {
      console.error(`    - id=${r.id}  status=${r.subscription_status}  tier=${r.tier ?? '∅'}  stripe=${r.stripe_customer_id ?? '∅'}  created=${r.created_at.toISOString()}`);
    }
  }
  console.error('');
  console.error('Remediation: pick the canonical row to keep (usually the earliest created_at OR the one with stripe_customer_id),');
  console.error('then soft-delete the others via:');
  console.error(`  UPDATE public.accounts SET deleted_at = now() WHERE id IN ('<the-other-ids>');`);
  console.error('Re-run this script until it reports 0 duplicates, then apply migration 0003.');
  process.exit(1);
} catch (err) {
  console.error('FATAL: query failed:', err.message);
  process.exit(2);
} finally {
  await sql.end({ timeout: 5 });
}
