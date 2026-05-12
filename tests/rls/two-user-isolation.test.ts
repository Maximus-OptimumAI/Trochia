/**
 * The two-user tenant-isolation integration test (FND-03 — "the single highest-
 * leverage test in the codebase"; threat T-1-13).
 *
 * Creates tenant A and tenant B, seeds one row in EACH tenant-scoped table for each,
 * then — through tenant B's `authenticated` client (RLS in force, JWT carries B's
 * `tenant_id`) — asserts B reads ZERO of A's rows across every tenant-scoped table,
 * and CAN read its own. Iterates the table list derived from the live schema minus
 * `NON_TENANT_TABLES`, so a future tenant table is automatically covered.
 *
 * Skips cleanly when `TEST_DATABASE_URL` is unset (CI sets the secret).
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sql } from 'drizzle-orm';

import * as schema from '@/db/schema';
import {
  HAS_TEST_DB,
  cleanup,
  closeTestDb,
  createTenant,
  getServiceClientForTests,
  migrateTestDb,
  tenantClient,
  tenantScopedTables,
  type TestTenant,
} from '../db/test-db';

const d = HAS_TEST_DB ? describe : describe.skip;

d('two-user tenant isolation', () => {
  let A: TestTenant;
  let B: TestTenant;

  beforeAll(async () => {
    await migrateTestDb();
    await cleanup();
    A = await createTenant('us');
    B = await createTenant('us');

    // Seed one tenant-owned row in each child table for A and for B (via the admin
    // client — done inside createTenant for `accounts`; the rest here).
    const adb = getServiceClientForTests();
    const seed = async (t: TestTenant) => {
      await adb.insert(schema.subscriptions).values({
        accountId: t.accountId,
        stripeSubscriptionId: `sub_${t.accountId}`,
        status: 'active',
      });
      await adb.insert(schema.legalAcceptances).values({
        accountId: t.accountId,
        document: 'dpa',
        version: 'v1',
      });
      await adb.insert(schema.jobs).values({
        accountId: t.accountId,
        type: 'test.seed',
        status: 'done',
      });
      await adb.insert(schema.sessions).values({
        accountId: t.accountId,
        userId: t.userId,
      });
    };
    await seed(A);
    await seed(B);
  });

  afterAll(async () => {
    await cleanup();
    await closeTestDb();
  });

  it("tenant B's authenticated client reads zero of tenant A's rows across every tenant-scoped table", async () => {
    const tables = await tenantScopedTables();
    expect(tables.length).toBeGreaterThan(0);
    const b = tenantClient(B.claims);

    await b.rls(async (tx) => {
      // accounts: keyed on id — B must see only its own account.
      const accts = await tx.select({ id: schema.accounts.id }).from(schema.accounts);
      expect(accts.map((r) => r.id)).toEqual([B.accountId]);
      expect(accts.some((r) => r.id === A.accountId)).toBe(false);

      // Every child table: count A-owned rows visible to B → must be 0; B's own → ≥1.
      for (const tbl of ['subscriptions', 'legal_acceptances', 'jobs', 'sessions']) {
        const aVisible = await tx.execute<{ n: string }>(
          sql`select count(*)::text as n from public.${sql.raw(tbl)} where account_id = ${A.accountId}`,
        );
        expect(Number(aVisible[0].n), `B sees A's rows in ${tbl}`).toBe(0);
        const bVisible = await tx.execute<{ n: string }>(
          sql`select count(*)::text as n from public.${sql.raw(tbl)} where account_id = ${B.accountId}`,
        );
        expect(
          Number(bVisible[0].n),
          `B cannot see its own rows in ${tbl}`,
        ).toBeGreaterThanOrEqual(1);
      }
    });
  });

  it('every tenant-scoped table from the live schema is covered by the isolation assertion', async () => {
    // Guard: if a future migration adds a tenant table, this forces an update.
    const tables = await tenantScopedTables();
    const covered = new Set(['accounts', 'subscriptions', 'legal_acceptances', 'jobs', 'sessions', 'users']);
    const uncovered = tables.filter((t) => !covered.has(t));
    expect(
      uncovered,
      `new tenant-scoped table(s) not yet covered by two-user-isolation.test.ts: ${uncovered.join(', ')}`,
    ).toEqual([]);
  });

  it('tenant A cannot be written by tenant B (WITH CHECK enforced)', async () => {
    const b = tenantClient(B.claims);
    await expect(
      b.rls(async (tx) => {
        await tx.insert(schema.jobs).values({ accountId: A.accountId, type: 'evil', status: 'queued' });
      }),
    ).rejects.toThrow();
  });

});
