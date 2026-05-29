// tests/integration/embed-pipeline-rls.test.ts
// Phase 2 / Plan 02-04 / KNW-04a — embed-pipeline RLS additions
//
// SCOPE: 2 genuinely-new schema-contract cases against Test-CI. The other 4 cases
// originally drafted here are NOT duplicated; they live in tests/integration/rls-memory.test.ts
// (Plan 02-01 Phase-2 RLS suite; 8 cases / 272 lines). Cross-reference map:
//
//   Tenant isolation (5 Phase-2 tables, including embeddings)        → rls-memory.test.ts case #1
//   Embeddings dedup-index rejection of duplicate upsert             → rls-memory.test.ts case #2
//   Embeddings rolling model_version coexistence                     → rls-memory.test.ts case #3
//   Embeddings 768-dim rejection                                     → rls-memory.test.ts case #4
//
// What's NEW here:
//   (NEW-1) corpus per-tenant SCHEMA support — assert two tenants can each hold the
//           same logical corpus chunk (same source_type='corpus' + same source_id +
//           same chunk_idx + same embedding_model_version) under the dedup unique
//           index, because account_id is part of the key. This is the schema-level
//           guarantee that the corpus-sync FAN-OUT (deferred to FOLLOWUP-CORPUS-SYNC-01
//           in cycle-7 scope-reduce) will depend on. Pinning it here keeps the contract
//           locked at THIS plan close even though no production code writes corpus
//           embeddings yet. Corpus-sync LOGIC (cron trigger, batching, idempotency
//           across runs) lives in the FOLLOWUP plan.
//   (NEW-2) 1024-dim positive — assert a vector(1024) inserts cleanly. rls-memory
//           only proves 768-dim REJECTION; this pins the positive side so a future
//           pgvector upgrade that drops 1024-dim acceptance breaks loudly here.
//
// Embed-memory function LOGIC (TOCTOU re-read, DELETE-then-INSERT, retry caps, Sentry
// breadcrumb emission) lives in tests/inngest/functions/embed-memory.test.ts (T04).
// This file is intentionally narrow: it pins SCHEMA contracts that the pipeline depends
// on, not pipeline LOGIC.
//
// Skips cleanly when TEST_DATABASE_URL is unset (auto-loaded from .env.local by
// tests/setup.ts via `dotenv.config({ path: '.env.local' })`; CI sets the secret).

import { randomUUID } from 'node:crypto';
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
  type TestTenant,
} from '../db/test-db';

const d = HAS_TEST_DB ? describe : describe.skip;

d('Plan 02-04 / KNW-04a — embed-pipeline RLS (2 new cases)', () => {
  let A: TestTenant;
  let B: TestTenant;

  beforeAll(async () => {
    await migrateTestDb();
    await cleanup();
    A = await createTenant('us');
    B = await createTenant('us');
  });

  afterAll(async () => {
    await cleanup();
    await closeTestDb();
  });

  // ────────────────────────────────────────────────────────────────────
  // NEW-1 — Corpus per-tenant SCHEMA support
  // ────────────────────────────────────────────────────────────────────
  //
  // Per src/db/schema/embeddings.ts header §"Tenancy model": corpus embedding
  // rows are stored per-tenant (not shared) so RLS stays single-policy and so
  // retrieval can fuse corpus + memory hits in one HNSW scan. The dedup
  // unique index includes account_id, which means the SAME logical corpus
  // chunk (same source_type/source_id/chunk_idx/model_version) inserted for
  // two different tenants must coexist as two rows. This test pins that
  // guarantee — it's what will make the future corpus-sync fan-out safe (deferred to FOLLOWUP-CORPUS-SYNC-01).

  it('NEW-1 — corpus per-tenant SCHEMA support: same (source_type, source_id, chunk_idx, model_version) row coexists across two tenants', async () => {
    const adb = getServiceClientForTests();
    const corpusSourceId = randomUUID(); // deterministic per-doc UUID would be corpusSourceUuid(slug) at runtime — implemented in FOLLOWUP-CORPUS-SYNC-01
    const sharedRowShape = {
      sourceType: 'corpus' as const,
      sourceId: corpusSourceId,
      chunkText: 'A SAFE is a Simple Agreement for Future Equity used in pre-seed and seed rounds.',
      chunkIdx: 0,
      embedding: new Array(1024).fill(0.1) as number[],
      embeddingModelVersion: 'voyage-3-large',
      tokenCount: 19,
    };

    // Insert the SAME chunk for both tenants (different account_id).
    // Dedup unique index permits this because account_id is part of the key.
    const [rowA] = await adb
      .insert(schema.embeddings)
      .values({ ...sharedRowShape, accountId: A.accountId })
      .returning({ id: schema.embeddings.id, accountId: schema.embeddings.accountId });
    const [rowB] = await adb
      .insert(schema.embeddings)
      .values({ ...sharedRowShape, accountId: B.accountId })
      .returning({ id: schema.embeddings.id, accountId: schema.embeddings.accountId });

    expect(rowA.id).toBeDefined();
    expect(rowB.id).toBeDefined();
    expect(rowA.accountId).toBe(A.accountId);
    expect(rowB.accountId).toBe(B.accountId);

    // Each tenant owns ONLY its own corpus row at the schema level (RLS
    // surface is proven by rls-memory.test.ts case #1; this is the
    // service-client schema assertion).
    const countsBySource = await adb.execute<{ account_id: string; n: string }>(sql`
      select account_id, count(*)::text as n
      from public.embeddings
      where source_type = 'corpus' and source_id = ${corpusSourceId}
      group by account_id
    `);
    const byAccount = new Map(countsBySource.map((r) => [r.account_id, Number(r.n)]));
    expect(byAccount.get(A.accountId)).toBe(1);
    expect(byAccount.get(B.accountId)).toBe(1);
  });

  // ────────────────────────────────────────────────────────────────────
  // NEW-2 — 1024-dim positive (vector dim lock, accept side)
  // ────────────────────────────────────────────────────────────────────
  //
  // rls-memory.test.ts case #4 proves the REJECTION side (768-dim throws).
  // This pins the ACCEPT side so a future pgvector upgrade that drops
  // 1024-dim support breaks loudly here, not silently in T04 production.

  it('NEW-2 — 1024-dim vector inserts cleanly into embeddings.embedding', async () => {
    const adb = getServiceClientForTests();
    const [row] = await adb
      .insert(schema.embeddings)
      .values({
        accountId: A.accountId,
        sourceType: 'memory',
        sourceId: A.accountId, // FK-by-convention only; matches rls-memory.test.ts pattern
        chunkText: '1024-dim positive insert',
        chunkIdx: 42, // unique chunk_idx to avoid dedup collision with rls-memory.test.ts seed
        embedding: new Array(1024).fill(0.7) as number[],
        embeddingModelVersion: 'voyage-3-large',
      })
      .returning({ id: schema.embeddings.id });
    expect(row.id).toBeDefined();
  });
});
