/**
 * Hybrid retriever unit tests (Plan 02-06 / T02 / KNW-05a).
 *
 * The unit under test is `hybridRetrieve` in `src/ai/rag/retrieve.ts`. EVERY live
 * dependency is mocked — NO live Voyage call, NO live Postgres:
 *
 *   - `@/ai/integrations/voyage.adapter` is `vi.mock`'d so `voyage.embed` resolves
 *     a fixed 1024-dim vector and records its call args. A present-but-invalid
 *     `VOYAGE_API_KEY` in `.env.local` therefore CANNOT fire a real fetch — the
 *     mock IS the active impl (env-gate-keys-on-credential-presence lesson,
 *     lessons.md 2026-06-01). Case (f) proves the mock is the active impl.
 *   - `ctx.rls` is supplied by the test with a fake `tx` that (a) builds the REAL
 *     vector drizzle query so we can `.toSQL()`-inspect its predicate + LIMIT, (b)
 *     captures the raw FTS `sql`` fragment so we can serialize it via `PgDialect`
 *     and inspect ITS predicate + LIMIT, and (c) returns hand-built fixture rows
 *     for the fusion-logic cases through a SEPARATE mocked executor.
 *
 * PER-SIDE PREDICATE ASSERTION (F-1 + C-F2): the embed-memory.test.ts "ignore
 * `_pred` / assume the only matching row" fake is INSUFFICIENT here and is NOT
 * copied — it would make cases (c)/(d) pass vacuously and silently void the
 * cross-tenant mitigation's own proof. Instead we serialize the actual query the
 * executor will issue (`.toSQL()` for the vector side; `PgDialect().sqlToQuery()`
 * for the raw FTS fragment) and assert `account_id` / `source_type` /
 * `embedding_model_version` appear as bound params on BOTH queries, and that the
 * serialized LIMIT is the clamped `effTopK * CANDIDATE_POOL_FACTOR`.
 *
 * Cases:
 *   (a) RRF math: a doc at vector rank #1 + fts rank #3 scores 1/(60+1)+1/(60+3)
 *       — pins RRF_K=60 + 1-based positions.
 *   (b) vector-only-hit + fts-only-hit docs both surface in the fused result.
 *   (c) account_id = <passed accountId> bound on BOTH the vector + FTS queries.
 *   (d) source_type IN ('memory','corpus') + embedding_model_version on BOTH.
 *   (e) both sides empty → [] (no throw).
 *   (f) voyage.embed called exactly once with inputType:'query' + sourceType:'query'
 *       + texts:[query] (single-chokepoint + mock-is-active-impl pin).
 *   (g) the query string never appears in any voyage trace arg nor any logger call.
 *   (h) result.length <= effTopK for a fixture larger than topK.
 *   (i) WEAK path (F-3): FTS empty + vector low-similarity rows → non-empty,
 *       ftsScore:null on every candidate, length <= effTopK.
 *   (j) topK normalization (C-F1): 0 / -5 / 3.7 / 9999 each clamp to effTopK
 *       ∈ [1,50]; the serialized LIMIT param is the clamped integer * pool factor.
 */
import { PgDialect } from 'drizzle-orm/pg-core';
import { drizzle } from 'drizzle-orm/postgres-js';
import type { SQL } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import * as schema from '@/db/schema';

// ── Mocks must be declared BEFORE the module-under-test import (Vitest hoists). ──

const { voyageEmbedMock, FIXED_QUERY_VEC } = vi.hoisted(() => ({
  voyageEmbedMock: vi.fn(),
  // A fixed, deterministic 1024-dim query vector. The fusion cases assert on
  // RANK position (RRF), not on cosine magnitude, so the exact values don't
  // matter — only that it is a real 1024-vector the drizzle cosineDistance
  // helper accepts.
  FIXED_QUERY_VEC: new Array(1024).fill(0.1),
}));

vi.mock('@/ai/integrations/voyage.adapter', () => ({
  voyage: {
    model: 'voyage-3-large' as const,
    dim: 1024,
    embed: voyageEmbedMock,
  },
}));

// ── Now safe to import the module under test ─────────────────────────────────
import {
  hybridRetrieve,
  CANDIDATE_POOL_FACTOR,
  MAX_TOP_K,
  RRF_K,
  EMBEDDING_MODEL_VERSION,
  type Candidate,
  type HybridRetrieveCtx,
} from '@/ai/rag/retrieve';

// ── Test harness ─────────────────────────────────────────────────────────────

const dialect = new PgDialect();

/** A real drizzle.mock instance — builds genuine query objects (with `.toSQL()`)
 *  WITHOUT a connection. Used to construct the vector-side query the executor
 *  would run so we can serialize + inspect its predicate. */
const mockDb = drizzle.mock({ schema });

type VectorFixtureRow = {
  id: string;
  sourceType: string;
  sourceId: string;
  chunkIdx: number;
  chunkText: string;
  dist: number;
};

type FtsFixtureRow = {
  id: string;
  source_type: string;
  source_id: string;
  chunk_idx: number;
  chunk_text: string;
  rank: number;
};

type Captured = {
  /** Serialized { sql, params } of the vector-side drizzle query. */
  vectorQuery: { sql: string; params: unknown[] } | null;
  /** Serialized { sql, params } of the raw FTS sql`` fragment. */
  ftsQuery: { sql: string; params: unknown[] } | null;
};

/**
 * Build a fake `ctx.rls` runner. The fake `tx` it passes to retrieve.ts:
 *   - `tx.select(proj)` delegates query CONSTRUCTION to the real `mockDb` so the
 *     built object is a genuine drizzle query with `.toSQL()`. We capture that
 *     serialization, then return a thenable that resolves the supplied vector
 *     fixture rows (a SEPARATE executor — the real query is never run).
 *   - `tx.execute(frag)` captures the raw FTS `sql`` fragment (serialized via
 *     PgDialect) and resolves the supplied FTS fixture rows.
 *
 * This proves the REAL query the executor will issue carries the predicate +
 * clamped LIMIT, without poking a fragile private mock shape (C-F2).
 */
function makeCtx(opts: {
  vectorRows: VectorFixtureRow[];
  ftsRows: FtsFixtureRow[];
}): { ctx: HybridRetrieveCtx; captured: Captured } {
  const captured: Captured = { vectorQuery: null, ftsQuery: null };

  // A thenable wrapper: drizzle query builders are themselves thenable, so once
  // retrieve.ts `await`s the builder it would execute. We intercept by making
  // the FINAL builder method (.limit) return an object that (1) records the
  // serialized query and (2) is a thenable resolving the fixture rows.
  function wrapVectorBuilder(realBuilder: { toSQL: () => { sql: string; params: unknown[] } }) {
    const proxy = {
      from: (table: unknown) => wrapVectorBuilder((realBuilder as unknown as { from: (t: unknown) => typeof realBuilder }).from(table)),
      where: (pred: unknown) => wrapVectorBuilder((realBuilder as unknown as { where: (p: unknown) => typeof realBuilder }).where(pred)),
      orderBy: (...args: unknown[]) =>
        wrapVectorBuilder((realBuilder as unknown as { orderBy: (...a: unknown[]) => typeof realBuilder }).orderBy(...args)),
      limit: (n: number) => {
        const built = (realBuilder as unknown as { limit: (x: number) => typeof realBuilder }).limit(n);
        captured.vectorQuery = built.toSQL();
        // Return a thenable that resolves the fixture rows — the real query is
        // NEVER executed (no connection on the mock db).
        return {
          then: (resolve: (rows: VectorFixtureRow[]) => unknown) => resolve(opts.vectorRows),
        };
      },
    };
    return proxy;
  }

  const tx = {
    select: (proj?: unknown) => wrapVectorBuilder(mockDb.select(proj as never) as never),
    execute: async (frag: SQL) => {
      captured.ftsQuery = dialect.sqlToQuery(frag);
      return opts.ftsRows as unknown;
    },
  };

  // The fake `tx` is a structural stub, not a real PgTransaction — cast the
  // runner to the public ctx type so the call sites stay type-clean. The whole
  // point of T02 is that the stub stands in for the real tx without a live DB.
  const rls = (async <T>(fn: (tx: unknown) => Promise<T>): Promise<T> => fn(tx)) as HybridRetrieveCtx['rls'];

  return { ctx: { rls }, captured };
}

/** Default voyage.embed impl: resolves the fixed 1024-dim vector. */
function installVoyageMock() {
  voyageEmbedMock.mockImplementation(async ({ texts }: { texts: string[] }) => ({
    embeddings: texts.map(() => FIXED_QUERY_VEC),
    tokenCount: 5,
    modelVersion: 'voyage-3-large' as const,
    latencyMs: 3,
  }));
}

const ACCOUNT_ID = '00000000-0000-0000-0000-000000000a01';
const QUERY = 'how much runway do we have';

// Fixture row builders ───────────────────────────────────────────────────────

function vec(id: string, dist: number, over?: Partial<VectorFixtureRow>): VectorFixtureRow {
  return {
    id,
    sourceType: 'memory',
    sourceId: `src-${id}`,
    chunkIdx: 0,
    chunkText: `chunk for ${id}`,
    dist,
    ...over,
  };
}

function fts(id: string, rank: number, over?: Partial<FtsFixtureRow>): FtsFixtureRow {
  return {
    id,
    source_type: 'memory',
    source_id: `src-${id}`,
    chunk_idx: 0,
    chunk_text: `chunk for ${id}`,
    rank,
    ...over,
  };
}

// ── Suite ────────────────────────────────────────────────────────────────────

describe('hybridRetrieve (Plan 02-06 / KNW-05a)', () => {
  beforeEach(() => {
    voyageEmbedMock.mockReset();
    installVoyageMock();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ──────────────────────────────────────────────────────────────────────────
  // Case (a) — RRF math: vector rank #1 + fts rank #3 → 1/(60+1) + 1/(60+3)
  // ──────────────────────────────────────────────────────────────────────────
  it('(a) RRF math correct on a two-list fixture — a doc at vector #1 + fts #3 scores 1/(60+1)+1/(60+3)', async () => {
    // doc-A appears at vector position 1 AND fts position 3 → fused score is the
    // sum of both rank contributions. Filler rows occupy the other positions.
    const vectorRows = [vec('doc-A', 0.1), vec('v2', 0.2), vec('v3', 0.3)];
    const ftsRows = [fts('f1', 9), fts('f2', 8), fts('doc-A', 7)];

    const { ctx } = makeCtx({ vectorRows, ftsRows });
    const result = await hybridRetrieve({ accountId: ACCOUNT_ID, query: QUERY }, ctx);

    const docA = result.find((c) => c.sourceId === 'src-doc-A');
    expect(docA).toBeDefined();
    const expected = 1 / (RRF_K + 1) + 1 / (RRF_K + 3);
    expect(docA!.rrfScore).toBeCloseTo(expected, 10);
    // doc-A carries BOTH scores (vector similarity + fts rank).
    expect(docA!.vectorScore).toBeCloseTo(1 - 0.1, 10);
    expect(docA!.ftsScore).toBe(7);
    // A vector-only filler (v2 at position 2) scores from one list only.
    const v2 = result.find((c) => c.sourceId === 'src-v2');
    expect(v2!.rrfScore).toBeCloseTo(1 / (RRF_K + 2), 10);
    expect(v2!.ftsScore).toBeNull();
  });

  // ──────────────────────────────────────────────────────────────────────────
  // Case (b) — vector-only-hit + fts-only-hit docs both surface fused
  // ──────────────────────────────────────────────────────────────────────────
  it('(b) a vector-only-hit doc and an fts-only-hit doc both appear in the fused result', async () => {
    const vectorRows = [vec('only-vec', 0.15)];
    const ftsRows = [fts('only-fts', 5)];

    const { ctx } = makeCtx({ vectorRows, ftsRows });
    const result = await hybridRetrieve({ accountId: ACCOUNT_ID, query: QUERY }, ctx);

    const onlyVec = result.find((c) => c.sourceId === 'src-only-vec');
    const onlyFts = result.find((c) => c.sourceId === 'src-only-fts');
    expect(onlyVec).toBeDefined();
    expect(onlyFts).toBeDefined();
    // vector-only hit → ftsScore null; fts-only hit → vectorScore null.
    expect(onlyVec!.vectorScore).toBeCloseTo(1 - 0.15, 10);
    expect(onlyVec!.ftsScore).toBeNull();
    expect(onlyFts!.vectorScore).toBeNull();
    expect(onlyFts!.ftsScore).toBe(5);
  });

  // ──────────────────────────────────────────────────────────────────────────
  // Case (c) — account_id = <passed accountId> bound on BOTH queries
  // ──────────────────────────────────────────────────────────────────────────
  it('(c) the tenant predicate account_id = <passed accountId> is bound on BOTH the vector and FTS queries', async () => {
    const { ctx, captured } = makeCtx({ vectorRows: [vec('x', 0.1)], ftsRows: [fts('y', 1)] });
    await hybridRetrieve({ accountId: ACCOUNT_ID, query: QUERY }, ctx);

    // VECTOR side — serialized via the real drizzle .toSQL().
    expect(captured.vectorQuery).not.toBeNull();
    expect(captured.vectorQuery!.sql).toContain('"account_id"');
    expect(captured.vectorQuery!.params).toContain(ACCOUNT_ID);

    // FTS side — serialized via PgDialect from the raw sql`` fragment.
    expect(captured.ftsQuery).not.toBeNull();
    expect(captured.ftsQuery!.sql).toContain('"account_id"');
    expect(captured.ftsQuery!.params).toContain(ACCOUNT_ID);
  });

  // ──────────────────────────────────────────────────────────────────────────
  // Case (d) — source_type IN ('memory','corpus') + model-version on BOTH
  // ──────────────────────────────────────────────────────────────────────────
  it('(d) source_type IN (memory,corpus) and embedding_model_version are bound on BOTH queries', async () => {
    const { ctx, captured } = makeCtx({ vectorRows: [vec('x', 0.1)], ftsRows: [fts('y', 1)] });
    await hybridRetrieve({ accountId: ACCOUNT_ID, query: QUERY }, ctx);

    for (const q of [captured.vectorQuery, captured.ftsQuery]) {
      expect(q).not.toBeNull();
      expect(q!.sql).toContain('"source_type"');
      expect(q!.sql).toContain('"embedding_model_version"');
      // The source types + model version arrive as BOUND PARAMS (never
      // string-concatenated — T-02-06-03).
      expect(q!.params).toContain('memory');
      expect(q!.params).toContain('corpus');
      expect(q!.params).toContain(EMBEDDING_MODEL_VERSION);
    }
  });

  // ──────────────────────────────────────────────────────────────────────────
  // Case (e) — both sides empty → [] (no throw)
  // ──────────────────────────────────────────────────────────────────────────
  it('(e) both sides empty → returns [] and does not throw', async () => {
    const { ctx } = makeCtx({ vectorRows: [], ftsRows: [] });
    const result = await hybridRetrieve({ accountId: ACCOUNT_ID, query: QUERY }, ctx);
    expect(result).toEqual([]);
  });

  // ──────────────────────────────────────────────────────────────────────────
  // Case (f) — voyage.embed called exactly once with the query-trace shape
  // ──────────────────────────────────────────────────────────────────────────
  it('(f) voyage.embed is called exactly once with inputType:query + sourceType:query + texts:[query] (mock is the active impl)', async () => {
    const { ctx } = makeCtx({ vectorRows: [vec('x', 0.1)], ftsRows: [] });
    await hybridRetrieve({ accountId: ACCOUNT_ID, query: QUERY }, ctx);

    expect(voyageEmbedMock).toHaveBeenCalledTimes(1);
    const arg = voyageEmbedMock.mock.calls[0][0];
    expect(arg.texts).toEqual([QUERY]);
    expect(arg.inputType).toBe('query');
    expect(arg.trace).toMatchObject({ accountId: ACCOUNT_ID, sourceType: 'query' });
    // OD-4: the query text must NOT be reused as the correlation sourceId.
    expect(arg.trace.sourceId).not.toBe(QUERY);
    expect(typeof arg.trace.sourceId).toBe('string');
  });

  // ──────────────────────────────────────────────────────────────────────────
  // Case (g) — the query string never appears in any trace/logger arg
  // ──────────────────────────────────────────────────────────────────────────
  it('(g) the query text never appears in any recorded voyage trace arg', async () => {
    const SENSITIVE_QUERY = 'CONFIDENTIAL-QUERY-SENTINEL-runway-and-burn';
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const { ctx } = makeCtx({ vectorRows: [vec('x', 0.1)], ftsRows: [] });
    await hybridRetrieve({ accountId: ACCOUNT_ID, query: SENSITIVE_QUERY }, ctx);

    // The ONLY surface the query is allowed to reach is voyage.embed's `texts`.
    // The TRACE arg (privacy surface) must NEVER carry the query text.
    const traceArg = JSON.stringify(voyageEmbedMock.mock.calls[0][0].trace);
    expect(traceArg).not.toContain(SENSITIVE_QUERY);

    // No logger call may carry the query text either.
    for (const spy of [logSpy, errSpy, warnSpy]) {
      for (const call of spy.mock.calls) {
        expect(JSON.stringify(call)).not.toContain(SENSITIVE_QUERY);
      }
    }
  });

  // ──────────────────────────────────────────────────────────────────────────
  // Case (h) — result.length <= effTopK for a fixture larger than topK
  // ──────────────────────────────────────────────────────────────────────────
  it('(h) result length never exceeds effTopK for a fixture larger than topK', async () => {
    const vectorRows = Array.from({ length: 20 }, (_, i) => vec(`v${i}`, 0.1 + i * 0.01));
    const ftsRows = Array.from({ length: 20 }, (_, i) => fts(`f${i}`, 20 - i));

    const { ctx } = makeCtx({ vectorRows, ftsRows });
    const result = await hybridRetrieve({ accountId: ACCOUNT_ID, query: QUERY, topK: 5 }, ctx);
    expect(result.length).toBeLessThanOrEqual(5);
    expect(result.length).toBe(5);
  });

  // ──────────────────────────────────────────────────────────────────────────
  // Case (i) — WEAK path (F-3): FTS empty + vector low-similarity rows
  // ──────────────────────────────────────────────────────────────────────────
  it('(i) WEAK path: FTS empty + vector returns low-similarity (far) rows → non-empty, ftsScore null on every candidate', async () => {
    // Far rows: high cosine DISTANCE (≈ 1.6 → similarity ≈ -0.6). retrieve.ts
    // must STILL return them — the grounding/"I don't know" cutoff is 02-07's
    // call against these scores, never a vector-side distance filter here (OD-5).
    const vectorRows = [vec('far-1', 1.6), vec('far-2', 1.7), vec('far-3', 1.8)];
    const ftsRows: FtsFixtureRow[] = [];

    const { ctx } = makeCtx({ vectorRows, ftsRows });
    const result = await hybridRetrieve({ accountId: ACCOUNT_ID, query: QUERY, topK: 8 }, ctx);

    expect(result.length).toBeGreaterThan(0);
    expect(result.length).toBeLessThanOrEqual(8);
    // Every candidate is a vector-only hit → ftsScore null, vectorScore present.
    for (const c of result) {
      expect(c.ftsScore).toBeNull();
      expect(c.vectorScore).not.toBeNull();
    }
    // rrfScore comes from the vector rank only (1/(60+position)).
    const sorted = [...result].sort((a, b) => b.rrfScore - a.rrfScore);
    expect(sorted[0].rrfScore).toBeCloseTo(1 / (RRF_K + 1), 10);
  });

  // ──────────────────────────────────────────────────────────────────────────
  // Case (j) — topK normalization (C-F1): clamp to [1, MAX_TOP_K]
  // ──────────────────────────────────────────────────────────────────────────
  it('(j) topK is normalized to effTopK ∈ [1, MAX_TOP_K] BEFORE any SQL — the serialized LIMIT is the clamped pool', async () => {
    const cases: Array<{ topK: number; expectedEffTopK: number }> = [
      { topK: 0, expectedEffTopK: 1 }, // clamp up to 1
      { topK: -5, expectedEffTopK: 1 }, // negative → 1
      { topK: 3.7, expectedEffTopK: 3 }, // trunc → 3
      { topK: 9999, expectedEffTopK: MAX_TOP_K }, // clamp down to 50
    ];

    for (const { topK, expectedEffTopK } of cases) {
      const { ctx, captured } = makeCtx({ vectorRows: [], ftsRows: [] });
      const result = await hybridRetrieve({ accountId: ACCOUNT_ID, query: QUERY, topK }, ctx);

      const expectedPool = expectedEffTopK * CANDIDATE_POOL_FACTOR;
      // The serialized LIMIT param on BOTH sides is the clamped integer pool —
      // a NaN / negative / oversized topK can NEVER reach the SQL LIMIT.
      expect(captured.vectorQuery!.params).toContain(expectedPool);
      expect(captured.ftsQuery!.params).toContain(expectedPool);
      // Empty fixture → [] regardless of topK; the LIMIT proof is the assertion.
      expect(result).toEqual([]);
    }
  });

  // ──────────────────────────────────────────────────────────────────────────
  // Sanity — the returned Candidate shape carries all three scores.
  // ──────────────────────────────────────────────────────────────────────────
  it('Candidate shape carries sourceType/sourceId/chunkIdx/chunkText/vectorScore/ftsScore/rrfScore', async () => {
    const { ctx } = makeCtx({ vectorRows: [vec('shape', 0.2)], ftsRows: [fts('shape', 4)] });
    const [c] = await hybridRetrieve({ accountId: ACCOUNT_ID, query: QUERY }, ctx);
    const keys = Object.keys(c).sort();
    expect(keys).toEqual(
      (['chunkIdx', 'chunkText', 'ftsScore', 'rrfScore', 'sourceId', 'sourceType', 'vectorScore'] satisfies (keyof Candidate)[]).sort(),
    );
  });
});
