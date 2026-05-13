/**
 * RLS conventions for the Trochia schema (FND-03 — "RLS default-deny on every table").
 *
 * ## How tenant isolation works (Open Question Q1 — RESOLVED)
 *
 * Approach (a) from RESEARCH.md: a custom `tenant_id` JWT claim, injected by a
 * Supabase **Custom Access Token Auth Hook** (`public.custom_access_token_hook`,
 * shipped in the `0001_*` migration). One business per account in Phase 1 (D-03),
 * so the mapping `auth.users.id → accounts.id` is 1:1 and the hook can resolve it
 * cheaply. The hook runs server-side on token issuance — a client cannot forge the
 * claim (the JWT is signed by Supabase Auth).
 *
 * Request-scoped queries run as the Postgres `authenticated` role with that JWT in
 * `request.jwt.claims` (see `getRequestClient` in src/db/client.ts — it wraps every
 * statement in a transaction that does `SET LOCAL role` + `SET LOCAL request.jwt.claims`).
 * Every tenant-scoped table therefore carries a `tenant_isolation` policy:
 *
 *   USING (<tenant key column> = (auth.jwt() ->> 'tenant_id')::uuid)
 *   WITH CHECK (same)
 *
 * — for `accounts` the tenant key is `id`; for every child table it is `account_id`.
 * `users` is special: a user reads/updates only their own row (`id = auth.uid()`).
 *
 * Default-deny: a table with RLS enabled and only these policies returns **zero rows**
 * to any session whose JWT lacks the matching claim. The `jobs` system rows
 * (`account_id IS NULL`) match no `authenticated` policy → only `getServiceClient()`
 * (RLS-bypassing) can read them. That is the default-deny working as intended.
 *
 * ## The schema-scan allowlist
 *
 * `NON_TENANT_TABLES` is the allowlist consumed by `tests/rls/schema-scan.test.ts`:
 * every `public` base table NOT in this list MUST have `relrowsecurity = true` AND at
 * least one policy, or CI fails. Adding a table here is a deliberate, reviewed act.
 */
import { sql } from 'drizzle-orm';
import type { AnyPgColumn } from 'drizzle-orm/pg-core';
import { pgPolicy } from 'drizzle-orm/pg-core';
import { authenticatedRole, authUid } from 'drizzle-orm/supabase';

/**
 * Tables that are intentionally NOT tenant-scoped and therefore exempt from the
 * RLS-default-deny CI check.
 *
 * - `corpus` — the global, curated, read-only knowledge corpus. Lands in Phase 2.
 * - `__drizzle_migrations` — drizzle-kit's own bookkeeping table.
 *
 * Plan 07 (Stripe webhooks) adds `processed_stripe_events` here (a system idempotency
 * ledger written only by the service-role client). That is a one-line local edit to
 * this constant — NOT an edit to the schema-scan test.
 */
export const NON_TENANT_TABLES = [
  'corpus',
  '__drizzle_migrations',
  // Plan 07: Stripe webhook idempotency ledger. Written only by getServiceClient
  // (the webhook has no user session) and not scoped to a single tenant — it
  // dedupes on Stripe's event.id, which is global to our Stripe account.
  'processed_stripe_events',
] as const;

/**
 * The `tenant_isolation` policy applied to every tenant-scoped table, keyed on the
 * column that holds the owning `accounts.id` (i.e. `accounts.id` itself, or
 * `<table>.account_id` on a child table).
 *
 * `for: 'all'` + `to: authenticatedRole` (the `drizzle-orm/supabase` helper) +
 * `using`/`withCheck` on the JWT `tenant_id` claim. The migration that creates the
 * table also runs `ALTER TABLE ... ENABLE ROW LEVEL SECURITY` (drizzle-kit emits the
 * ENABLE line whenever a `pgPolicy` is attached).
 */
export function tenantIsolationPolicy(tenantKey: AnyPgColumn) {
  return pgPolicy('tenant_isolation', {
    for: 'all',
    to: authenticatedRole,
    using: sql`${tenantKey} = (auth.jwt() ->> 'tenant_id')::uuid`,
    withCheck: sql`${tenantKey} = (auth.jwt() ->> 'tenant_id')::uuid`,
  });
}

/**
 * The policy on `public.users`: a user may read/update only their own mirror row.
 * Keyed on `auth.uid()` (the `drizzle-orm/supabase` `authUid` helper) — there is no
 * `tenant_id` indirection here because the row IS the user.
 */
export function ownUserRowPolicy(idColumn: AnyPgColumn) {
  return pgPolicy('users_self_access', {
    for: 'all',
    to: authenticatedRole,
    using: sql`${idColumn} = ${authUid}`,
    withCheck: sql`${idColumn} = ${authUid}`,
  });
}
