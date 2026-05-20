/**
 * Phase-2 memory / timeline / embeddings integration test.
 *
 * The schema-scan (`tests/rls/schema-scan.test.ts`) proves every Phase 2 table
 * has RLS + a policy; the two-user isolation test (`tests/rls/two-user-isolation.
 * test.ts`) proves no cross-tenant reads. This file goes deeper — it locks the
 * Phase 2 schema contracts that the rest of the phase depends on:
 *
 *   (1) Two-user isolation across all five new tables (sanity restated locally;
 *       the broader two-user test iterates dynamically from `pg_class`, but
 *       this version uses each table's own Drizzle ORM signatures so a future
 *       column drift surfaces here even if the dynamic scan would gloss over it).
 *
 *   (2) Embeddings idempotency — the `embeddings_dedup_idx` unique key on
 *       (account_id, source_type, source_id, chunk_idx, embedding_model_version)
 *       MUST reject a duplicate upsert. This is the rebuild-safety guarantee
 *       for the Inngest embed pipeline (Plan 02-04 / KNW-04b).
 *
 *   (3) Vector dimension lock — the `embedding vector(1024)` column MUST reject
 *       a wrong-dim array. Pgvector enforces this at write; we prove it here so
 *       a future "let's parameterize the dimension" refactor breaks loudly.
 *
 *   (4) RLS default-deny with NO claim — a session lacking the `tenant_id`
 *       JWT claim returns zero rows from every Phase 2 table. This is the
 *       primary security guarantee.
 *
 *   (5) Enum rejection — `timeline_source_module_t` rejects values not in the
 *       7-value pre-seeded list. Catches the case where a downstream phase
 *       silently uses a typo'd module name.
 *
 *   (6) Provenance default — `business_memory.provenance` defaults to `{}::jsonb`
 *       so the Inngest extractor (Plan 02-02) can insert a partial row without
 *       a separate INSERT/UPDATE branch.
 *
 * Skips cleanly when `TEST_DATABASE_URL` is unset (CI sets the secret). Runs
 * against the same test DB the Phase 1 RLS suites use.
 */
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import * as schema from '@/db/schema';
import {
  HAS_TEST_DB,
  cleanup,
  closeTestDb,
  createTenant,
  getServiceClientForTests,
  migrateTestDb,
  tenantClient,
  type TestTenant,
} from '../db/test-db';

const d = HAS_TEST_DB ? describe : describe.skip;

d('Phase-2 memory + timeline + embeddings integration', () => {
  let A: TestTenant;
  let B: TestTenant;

  beforeAll(async () => {
    await migrateTestDb();
    await cleanup();
    A = await createTenant('us');
    B = await createTenant('us');

    const adb = getServiceClientForTests();
    const seed = async (t: TestTenant) => {
      await adb.insert(schema.businessMemory).values({
        accountId: t.accountId,
        companyName: `tenant-${t.accountId.slice(0, 8)}`,
        oneLiner: 'a synthetic test row',
      });
      await adb.insert(schema.pipelineEntry).values({
        accountId: t.accountId,
        investorName: 'Test Capital',
      });
      await adb.insert(schema.interaction).values({
        accountId: t.accountId,
        userId: t.userId,
        kind: 'qa_sidebar',
        query: 'what is my MRR',
        answer: 'I do not have that information yet.',
      });
      await adb.insert(schema.timelineEvent).values({
        accountId: t.accountId,
        sourceModule: 'memory',
        sourceId: t.accountId,
        eventType: 'memory_confirmed',
        summary: 'business memory confirmed',
      });
      await adb.insert(schema.embeddings).values({
        accountId: t.accountId,
        sourceType: 'memory',
        sourceId: t.accountId,
        chunkText: 'synthetic chunk for isolation test',
        chunkIdx: 0,
        embedding: new Array(1024).fill(0.01) as number[],
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

  // ────────────────────────────────────────────────────────────────────────
  // (1) Two-user isolation across all five Phase 2 tables
  // ────────────────────────────────────────────────────────────────────────

  it("tenant B sees zero of tenant A's rows across all five Phase 2 tables", async () => {
    const b = tenantClient(B.claims);
    await b.rls(async (tx) => {
      for (const tbl of [
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
        const bOwn = await tx.execute<{ n: string }>(
          sql`select count(*)::text as n from public.${sql.raw(tbl)} where account_id = ${B.accountId}`,
        );
        expect(Number(bOwn[0].n), `B cannot see its own rows in ${tbl}`).toBeGreaterThanOrEqual(1);
      }
    });
  });

  // ────────────────────────────────────────────────────────────────────────
  // (2) Embeddings idempotency — dedup unique index rejects duplicate insert
  // ────────────────────────────────────────────────────────────────────────

  it('embeddings dedup index rejects a duplicate (account_id, source_type, source_id, chunk_idx, model_version) upsert', async () => {
    const adb = getServiceClientForTests();
    await expect(
      adb.insert(schema.embeddings).values({
        accountId: A.accountId,
        sourceType: 'memory',
        sourceId: A.accountId,
        chunkText: 'second insert — same dedup key',
        chunkIdx: 0,
        embedding: new Array(1024).fill(0.02) as number[],
        embeddingModelVersion: 'voyage-3-large',
      }),
    ).rejects.toThrow();
  });

  it('embeddings dedup index PERMITS a new model_version row (rolling re-embed)', async () => {
    // Same (account_id, source_type, source_id, chunk_idx) but a NEW model
    // version → permitted. Lets a rolling re-embed insert new vectors
    // alongside old ones; the retrieval service filters by current version.
    const adb = getServiceClientForTests();
    const [row] = await adb
      .insert(schema.embeddings)
      .values({
        accountId: A.accountId,
        sourceType: 'memory',
        sourceId: A.accountId,
        chunkText: 'same chunk, new model',
        chunkIdx: 0,
        embedding: new Array(1024).fill(0.03) as number[],
        embeddingModelVersion: 'voyage-3.5-large-future',
      })
      .returning({ id: schema.embeddings.id });
    expect(row.id).toBeDefined();
  });

  // ────────────────────────────────────────────────────────────────────────
  // (3) Vector dimension lock — wrong-dim array rejected
  // ────────────────────────────────────────────────────────────────────────

  it('embeddings.embedding rejects a 768-dim array (1024 only)', async () => {
    const adb = getServiceClientForTests();
    await expect(
      adb.insert(schema.embeddings).values({
        accountId: A.accountId,
        sourceType: 'memory',
        sourceId: A.accountId,
        chunkText: 'wrong-dim attempt',
        chunkIdx: 99,
        embedding: new Array(768).fill(0) as number[],
        embeddingModelVersion: 'voyage-3-large',
      }),
    ).rejects.toThrow();
  });

  // ────────────────────────────────────────────────────────────────────────
  // (4) RLS default-deny with no claim — anonymous session sees nothing
  // ────────────────────────────────────────────────────────────────────────

  it('an authenticated session with NO tenant_id claim sees zero rows from every Phase 2 table', async () => {
    // Subject UUID with no tenant_id — the default-deny path the proxy
    // catches at the request boundary, but we want the database layer
    // itself to be the second line. The tenant_isolation policy's USING
    // predicate (`account_id = (auth.jwt() ->> 'tenant_id')::uuid`) yields
    // NULL when the claim is absent, and NULL ≠ <anything> → policy denies.
    const noClaimSession = tenantClient({ sub: A.userId, role: 'authenticated' });

    await noClaimSession.rls(async (tx) => {
      for (const tbl of [
        'business_memory',
        'pipeline_entry',
        'interaction',
        'timeline_event',
        'embeddings',
      ]) {
        const rows = await tx.execute<{ n: string }>(
          sql`select count(*)::text as n from public.${sql.raw(tbl)}`,
        );
        expect(Number(rows[0].n), `default-deny failed on ${tbl}`).toBe(0);
      }
    });
  });

  // ────────────────────────────────────────────────────────────────────────
  // (5) Enum rejection — timeline_source_module_t rejects unknown values
  // ────────────────────────────────────────────────────────────────────────

  it('timeline_event.source_module rejects an unknown enum value', async () => {
    const adb = getServiceClientForTests();
    // Use raw SQL because Drizzle's type system would catch this at
    // compile time — we want the runtime DB-level rejection here.
    await expect(
      adb.execute(sql`
        insert into public.timeline_event
          (account_id, source_module, source_id, event_type, summary)
        values
          (${A.accountId}, 'unknown_module', ${A.accountId}, 'test', 'should fail')
      `),
    ).rejects.toThrow();
  });

  // ────────────────────────────────────────────────────────────────────────
  // (6) Provenance default — partial inserts get '{}' automatically
  // ────────────────────────────────────────────────────────────────────────

  it('business_memory.provenance defaults to empty object when omitted on insert', async () => {
    const newTenant = await createTenant('us');
    const adb = getServiceClientForTests();
    const [row] = await adb
      .insert(schema.businessMemory)
      .values({
        accountId: newTenant.accountId,
        companyName: 'partial insert tenant',
        // provenance OMITTED — must default to '{}'.
      })
      .returning({ provenance: schema.businessMemory.provenance });
    expect(row.provenance).toEqual({});
  });

  // ────────────────────────────────────────────────────────────────────────
  // Bonus: business_memory enforces one-row-per-tenant
  // ────────────────────────────────────────────────────────────────────────

  it('business_memory_account_id_uniq rejects a second row for the same tenant', async () => {
    const adb = getServiceClientForTests();
    // A already has one row (seeded). A second insert with the same account_id
    // must violate `business_memory_account_id_uniq`.
    await expect(
      adb.insert(schema.businessMemory).values({
        accountId: A.accountId,
        companyName: 'duplicate row — should fail',
      }),
    ).rejects.toThrow();
  });
});
