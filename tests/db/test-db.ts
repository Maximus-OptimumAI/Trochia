/**
 * RLS integration-test harness.
 *
 * Runs against a TEST Postgres given by `TEST_DATABASE_URL` (a throwaway Supabase
 * project, a local Postgres, or a scratch database). If that env var is absent the
 * RLS suites `describe.skip` with a note — local devs opt in, CI sets the secret
 * (`TEST_DATABASE_URL` — a required GitHub Actions secret; see 01-03-SUMMARY.md).
 *
 * The harness:
 *  - applies the Drizzle migrations to the test DB (so it has the schema + the RLS
 *    policies + the `custom_access_token_hook`),
 *  - `createTenant(region)` — inserts an `accounts` row (+ a backing `users`/`auth.users`
 *    row) via the service client and returns `{ accountId, claims }` where `claims` is
 *    the JWT-claims object the auth hook would mint (`{ sub, role: 'authenticated',
 *    tenant_id }`),
 *  - `tenantClient(claims)` — a Drizzle client running as `authenticated` with those
 *    claims set (via `getRequestClientFromClaims`),
 *  - `cleanup()` — truncates the Phase-1 tables.
 *
 * Tenant-scoped table list is derived from a live `pg_class`/`pg_policy` scan minus
 * `NON_TENANT_TABLES`, so a future table is automatically picked up by the isolation test.
 */
import { randomUUID } from 'node:crypto';

import { sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';

import { getRequestClientFromClaims } from '@/db/client';
import { NON_TENANT_TABLES } from '@/db/rls';
import * as schema from '@/db/schema';

export const TEST_DB_URL = process.env.TEST_DATABASE_URL ?? '';
export const HAS_TEST_DB = TEST_DB_URL.length > 0;

/** Lazily-initialised admin (RLS-bypassing) connection to the test DB. */
let adminPg: ReturnType<typeof postgres> | undefined;
let adminDb: ReturnType<typeof drizzle<typeof schema>> | undefined;

function admin() {
  if (!HAS_TEST_DB) throw new Error('TEST_DATABASE_URL is not set');
  if (!adminDb) {
    adminPg = postgres(TEST_DB_URL, { prepare: false, max: 4 });
    adminDb = drizzle(adminPg, { schema });
  }
  return adminDb;
}

/** The RLS-bypassing admin client for the TEST DB — used by tests to seed fixture rows. */
export function getServiceClientForTests() {
  return admin();
}

/** Apply the Drizzle migrations to the test DB. Call once in `beforeAll`. */
export async function migrateTestDb(): Promise<void> {
  await migrate(admin(), { migrationsFolder: 'src/db/migrations' });
}

export interface TestTenant {
  accountId: string;
  userId: string;
  /** The JWT-claims object the Custom Access Token Auth Hook would mint for this user. */
  claims: { sub: string; role: 'authenticated'; tenant_id: string };
}

/** Insert a `users` row + an `accounts` row (region `region`) via the admin client. */
export async function createTenant(region: 'us' | 'in' = 'us'): Promise<TestTenant> {
  const db = admin();
  const userId = randomUUID();
  // `public.users` FKs `auth.users` — insert a matching auth.users row first.
  await db.execute(
    sql`insert into auth.users (id, email) values (${userId}, ${`${userId}@test.local`}) on conflict do nothing`,
  );
  await db
    .insert(schema.users)
    .values({ id: userId, email: `${userId}@test.local` })
    .onConflictDoNothing();
  const [acct] = await db
    .insert(schema.accounts)
    .values({ ownerUserId: userId, region })
    .returning({ id: schema.accounts.id });
  return {
    accountId: acct.id,
    userId,
    claims: { sub: userId, role: 'authenticated', tenant_id: acct.id },
  };
}

/** A Drizzle client that runs as `authenticated` with `claims` set (RLS applies). */
export function tenantClient(claims: Record<string, unknown>) {
  return getRequestClientFromClaims(claims, TEST_DB_URL);
}

/** The list of tenant-scoped base tables in `public` (the schema-scan list minus the allowlist). */
export async function tenantScopedTables(): Promise<string[]> {
  const rows = await admin().execute<{ relname: string }>(sql`
    select c.relname
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'r'
  `);
  const allowlist = new Set<string>(NON_TENANT_TABLES);
  return rows
    .map((r) => r.relname)
    .filter((name) => !allowlist.has(name))
    .sort();
}

/** Run the Pattern-2 RLS scan. Returns one row per `public` base table. */
export async function rlsScan(): Promise<
  { table_name: string; rls_enabled: boolean; policy_count: number }[]
> {
  const rows = await admin().execute<{
    table_name: string;
    rls_enabled: boolean;
    policy_count: string | number;
  }>(sql`
    select c.relname as table_name,
           c.relrowsecurity as rls_enabled,
           count(p.polname) as policy_count
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    left join pg_policy p on p.polrelid = c.oid
    where n.nspname = 'public' and c.relkind = 'r'
    group by c.relname, c.relrowsecurity
  `);
  return rows.map((r) => ({
    table_name: r.table_name,
    rls_enabled: r.rls_enabled,
    policy_count: Number(r.policy_count),
  }));
}

/** Truncate the Phase-1 tables (+ the auth.users rows we created). Call in `afterAll`. */
export async function cleanup(): Promise<void> {
  if (!HAS_TEST_DB) return;
  const db = admin();
  await db.execute(
    sql`truncate table public.legal_acceptances, public.subscriptions, public.jobs, public.sessions, public.accounts, public.users restart identity cascade`,
  );
  await db.execute(sql`delete from auth.users where email like '%@test.local'`);
}

/** Close the admin connection. Call in `afterAll` (after `cleanup`). */
export async function closeTestDb(): Promise<void> {
  if (adminPg) {
    await adminPg.end({ timeout: 5 });
    adminPg = undefined;
    adminDb = undefined;
  }
}

/** Use as the suite's `describe` so it skips cleanly when there is no test DB. */
export function rlsDescribe() {
  if (!HAS_TEST_DB) {
    console.warn('[rls tests] TEST_DATABASE_URL not set — skipping RLS integration tests');
  }
  return HAS_TEST_DB;
}
