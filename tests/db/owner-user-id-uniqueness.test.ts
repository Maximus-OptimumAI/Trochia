/**
 * Regression for /codex 01-07 review [P1] finding:
 * "Enforce one account per owner_user_id" (migration 0003 + schema +
 *  src/app/auth/callback/route.ts).
 *
 * The partial unique index `accounts_owner_user_id_uniq` on
 * `accounts(owner_user_id) WHERE deleted_at IS NULL` enforces D-03's
 * "one business per account" invariant at the database layer. Without it,
 * two concurrent first-login callbacks could each pass a read-then-insert
 * check and produce two live accounts for one user — the Custom Access
 * Token Auth Hook's `LIMIT 1` would then pick nondeterministically across
 * requests, and `src/server/context.ts` could resolve a different tenant.
 *
 * This suite asserts:
 *   1. Concurrent INSERT ... ON CONFLICT DO NOTHING (the auth/callback
 *      pattern) results in exactly one live row, not two.
 *   2. Soft-deleting the live row and INSERTing a fresh one succeeds —
 *      the partial predicate keeps the constraint compatible with the
 *      30-day soft-delete + restore-or-re-onboard flow.
 *   3. A second live INSERT while a live row already exists is a benign
 *      no-op (matches the auth/callback DO-NOTHING + select-back pattern).
 *
 * Skips cleanly when `TEST_DATABASE_URL` is unset (CI sets the secret).
 */
import { randomUUID } from 'node:crypto';

import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import * as schema from '@/db/schema';
import {
  HAS_TEST_DB,
  cleanup,
  closeTestDb,
  getServiceClientForTests,
  migrateTestDb,
} from './test-db';

const d = HAS_TEST_DB ? describe : describe.skip;

d('accounts.owner_user_id partial-unique invariant (PR-1)', () => {
  beforeAll(async () => {
    await migrateTestDb();
    await cleanup();
  });

  afterAll(async () => {
    await cleanup();
    await closeTestDb();
  });

  beforeEach(async () => {
    await cleanup();
  });

  /**
   * Mirror of src/app/auth/callback/route.ts upsert: atomic insert that
   * is a no-op if a live row already exists for owner_user_id. Raw SQL
   * because Drizzle 0.44's `onConflictDoNothing` lacks the partial-index
   * predicate clause that Postgres requires for index inference.
   * (PR-4 / drizzle 0.45 upgrade can replace this with the typed builder.)
   */
  async function insertLiveAccount(userId: string): Promise<Array<{ id: string }>> {
    const db = getServiceClientForTests();
    return db.execute<{ id: string }>(sql`
      insert into public.accounts (owner_user_id, region, subscription_status)
      values (${userId}, 'us', 'none')
      on conflict (owner_user_id) where deleted_at is null do nothing
      returning id
    `);
  }

  async function seedUser(): Promise<string> {
    const db = getServiceClientForTests();
    const userId = randomUUID();
    await db.execute(
      sql`insert into auth.users (id, email) values (${userId}, ${`${userId}@test.local`}) on conflict do nothing`,
    );
    await db
      .insert(schema.users)
      .values({ id: userId, email: `${userId}@test.local` })
      .onConflictDoNothing();
    return userId;
  }

  it('concurrent first-login callbacks for one user create exactly one live account', async () => {
    const userId = await seedUser();

    // Race the same insert N ways — Promise.all under the hood serialises only
    // network roundtrips, but the unique-index conflict resolution happens
    // server-side, so this exercises the actual race that two regional edge
    // requests would hit.
    const RACE_WIDTH = 8;
    const results = await Promise.all(
      Array.from({ length: RACE_WIDTH }, () => insertLiveAccount(userId)),
    );

    // At most one caller's RETURNING set is non-empty (the winner).
    const winners = results.filter((r) => r.length === 1);
    expect(winners.length).toBe(1);

    // The database state matches: exactly one live row.
    const db = getServiceClientForTests();
    const liveRows = await db.execute<{ count: string }>(
      sql`select count(*)::text as count from public.accounts where owner_user_id = ${userId} and deleted_at is null`,
    );
    expect(Number(liveRows[0].count)).toBe(1);
  });

  it('a second live-insert while a live row exists is a benign no-op', async () => {
    const userId = await seedUser();

    const first = await insertLiveAccount(userId);
    expect(first.length).toBe(1);

    // The second call should hit ON CONFLICT DO NOTHING and return zero rows.
    const second = await insertLiveAccount(userId);
    expect(second.length).toBe(0);

    const db = getServiceClientForTests();
    const liveRows = await db.execute<{ count: string }>(
      sql`select count(*)::text as count from public.accounts where owner_user_id = ${userId} and deleted_at is null`,
    );
    expect(Number(liveRows[0].count)).toBe(1);
  });

  it('soft-delete + re-onboard creates a fresh live row (partial predicate works)', async () => {
    const userId = await seedUser();
    const db = getServiceClientForTests();

    const [first] = await insertLiveAccount(userId);
    expect(first.id).toBeTruthy();

    // Soft-delete (the same call site src/modules/data-rights/delete-account.ts
    // makes via the service client).
    await db.execute(
      sql`update public.accounts set deleted_at = now() where id = ${first.id}`,
    );

    // Now a fresh live-insert must succeed — the partial predicate excludes
    // the deleted row from the unique constraint.
    const [second] = await insertLiveAccount(userId);
    expect(second.id).toBeTruthy();
    expect(second.id).not.toBe(first.id);

    // Exactly one LIVE row, plus the deleted one (total two rows for this user).
    const totalRows = await db.execute<{ live: string; total: string }>(
      sql`select
            count(*) filter (where deleted_at is null)::text as live,
            count(*)::text as total
          from public.accounts where owner_user_id = ${userId}`,
    );
    expect(Number(totalRows[0].live)).toBe(1);
    expect(Number(totalRows[0].total)).toBe(2);
  });

  it('the partial-unique index is named accounts_owner_user_id_uniq and exists in pg_indexes', async () => {
    const db = getServiceClientForTests();
    const idx = await db.execute<{ indexdef: string }>(
      sql`select indexdef from pg_indexes where schemaname = 'public' and indexname = 'accounts_owner_user_id_uniq'`,
    );
    expect(idx.length).toBe(1);
    expect(idx[0].indexdef.toLowerCase()).toContain('unique');
    expect(idx[0].indexdef.toLowerCase()).toContain('owner_user_id');
    expect(idx[0].indexdef.toLowerCase()).toContain('deleted_at is null');
  });
});
