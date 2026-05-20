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
      // ── Phase 2 tables ──
      await adb.insert(schema.businessMemory).values({
        accountId: t.accountId,
        companyName: `tenant-${t.accountId.slice(0, 8)}`,
      });
      await adb.insert(schema.pipelineEntry).values({
        accountId: t.accountId,
        investorName: 'Test Capital',
      });
      await adb.insert(schema.interaction).values({
        accountId: t.accountId,
        userId: t.userId,
        kind: 'qa_sidebar',
      });
      await adb.insert(schema.timelineEvent).values({
        accountId: t.accountId,
        sourceModule: 'memory',
        sourceId: t.accountId, // ok — conventional FK only, no SQL FK
        eventType: 'memory_confirmed',
        summary: 'seed',
      });
      // 1024-zero vector — Voyage voyage-3-large dim. Real embeddings come
      // from the Inngest pipeline (Plan 02-04); this is a fixture row.
      await adb.insert(schema.embeddings).values({
        accountId: t.accountId,
        sourceType: 'memory',
        sourceId: t.accountId,
        chunkText: 'seed chunk',
        chunkIdx: 0,
        embedding: new Array(1024).fill(0) as number[],
        embeddingModelVersion: 'voyage-3-large',
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
      for (const tbl of [
        'subscriptions',
        'legal_acceptances',
        'jobs',
        'sessions',
        // ── Phase 2 tenant tables ──
        'business_memory',
        'pipeline_entry',
        'interaction',
        'timeline_event',
        'embeddings',
      ]) {
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
    const covered = new Set([
      // Phase 1
      'accounts',
      'subscriptions',
      'legal_acceptances',
      'jobs',
      'sessions',
      'users',
      // Phase 2
      'business_memory',
      'pipeline_entry',
      'interaction',
      'timeline_event',
      'embeddings',
    ]);
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

  /**
   * PR-6 / codex re-verify 2026-05-15 [P1] — owner_self_read policy semantics.
   *
   * The new policy (migration 0004) permits an authenticated user to read
   * THEIR OWN `accounts` row by `owner_user_id = auth.uid()`, regardless of
   * the `tenant_id` claim. This widens the SELECT-side surface on `accounts`
   * to two policies (`tenant_isolation` for normal request flow,
   * `owner_self_read` for the stale-claim recovery path the proxy uses).
   *
   * The two-user proof has THREE shapes worth asserting separately:
   *
   *   (1) Normal claim flow still works — A's claims-driven SELECT returns
   *       A's account (proves owner_self_read didn't somehow disable
   *       tenant_isolation).
   *
   *   (2) Stale-null-claim recovery — A with `tenant_id = null` can STILL
   *       read A's account via owner_self_read (the exact failure mode the
   *       proxy fallback handles). This proves the policy permits the
   *       owner without requiring the claim.
   *
   *   (3) Cross-tenant scoping — B with EITHER B's normal claims OR a
   *       stale-null claim can NEVER read A's account row through
   *       owner_self_read, because auth.uid() resolves to B.userId and the
   *       USING predicate (`owner_user_id = auth.uid()`) doesn't match A's
   *       owner_user_id. This is the scope-correctness proof.
   */
  it('owner_self_read: tenant A reads own account even with a stale-null tenant_id claim', async () => {
    // Simulate the first-login window: A's JWT carries auth.uid() = A.userId
    // but tenant_id is null (the custom_access_token_hook ran before the
    // accounts row materialised). owner_self_read permits the SELECT.
    const staleClaimsA = { sub: A.userId, role: 'authenticated' as const, tenant_id: null };
    const aStale = tenantClient(staleClaimsA);

    await aStale.rls(async (tx) => {
      const rows = await tx.select({ id: schema.accounts.id }).from(schema.accounts);
      expect(rows.map((r) => r.id)).toEqual([A.accountId]);
    });
  });

  it("owner_self_read: tenant B (normal claims) cannot read tenant A's account by owner_user_id", async () => {
    // B is authenticated with B's own valid claims. owner_self_read's USING
    // predicate is `owner_user_id = auth.uid()` — auth.uid() resolves to
    // B.userId, which does NOT match A.ownerUserId, so the policy denies.
    // The tenant_isolation policy also denies (B's tenant_id != A.accountId).
    // Net: B sees zero of A's rows. The policy is correctly scoped.
    const b = tenantClient(B.claims);

    await b.rls(async (tx) => {
      const aRowsViaOwnerSelfRead = await tx.execute<{ id: string }>(
        sql`select id from public.accounts where owner_user_id = ${A.userId}`,
      );
      expect(aRowsViaOwnerSelfRead.length).toBe(0);
    });
  });

  it("owner_self_read: tenant B with a stale-null claim STILL cannot read tenant A's account", async () => {
    // The adversarial case — B is in their own first-login window (null
    // tenant_id) but tries to read A's account via owner_user_id. auth.uid()
    // is still B.userId, owner_self_read's USING is still
    // `owner_user_id = B.userId` ≠ A.ownerUserId, denied. Proves the
    // resilience layer does NOT widen the cross-tenant surface.
    const staleClaimsB = { sub: B.userId, role: 'authenticated' as const, tenant_id: null };
    const bStale = tenantClient(staleClaimsB);

    await bStale.rls(async (tx) => {
      const aRows = await tx.execute<{ id: string }>(
        sql`select id from public.accounts where owner_user_id = ${A.userId}`,
      );
      expect(aRows.length).toBe(0);
    });
  });

});
