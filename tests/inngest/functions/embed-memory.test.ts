/**
 * embed-memory Inngest function — unit tests (Plan 02-04 / T04 / KNW-04b).
 *
 * Strategy:
 *   - Mock the Voyage adapter (`@/ai/integrations/voyage.adapter`) via `vi.mock`
 *     so no HTTP request leaves the test runner. Path A per dispatch posture
 *     (deterministic, fast, no external dependency). Live-Voyage exercise is at
 *     T08 production redeploy, not T04 unit tests.
 *   - Mock the Drizzle service client (`@/db/client`) with an in-memory fake
 *     that records inserts/deletes and supports both transactional and
 *     non-transactional select/update flows. The schema-lock guard prevents us
 *     from modifying any src/db/schema/** file; the fake replicates the
 *     persistence semantics the function depends on.
 *   - Mock the chunk module ONLY when we need a controlled chunk count (Case 6
 *     overflow). The default tests use the real `chunkText` from
 *     `@/ai/chunking/chunk` (T03) — pure deterministic.
 *   - The Inngest function's handler is accessed via `(embedMemory as any).fn`
 *     and invoked directly with a synthetic `{ event, step }` argument. `step.run`
 *     is a passthrough that invokes the callback and records the step name.
 *
 * 10 cases per plan-doc lines 1373-1424 + Case 1 substring-content assertion
 * for the cycle-7 H2 silent-failure coverage hole the founder explicitly
 * flagged. Each case independently sets up the in-memory store, invokes the
 * handler, and asserts breadcrumbs / writes / config.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// ── Mocks must be declared BEFORE module-under-test imports (Vitest hoists). ──

const { voyageEmbedMock, voyageModel } = vi.hoisted(() => ({
  voyageEmbedMock: vi.fn(),
  voyageModel: 'voyage-3-large' as const,
}));

vi.mock('@/ai/integrations/voyage.adapter', () => ({
  voyage: {
    model: voyageModel,
    dim: 1024,
    embed: voyageEmbedMock,
  },
}));

const { sentryBreadcrumbs, sentryAddBreadcrumbMock } = vi.hoisted(() => ({
  sentryBreadcrumbs: [] as Array<{ category?: string; message?: string; level?: string; data?: unknown }>,
  sentryAddBreadcrumbMock: vi.fn(),
}));

vi.mock('@sentry/nextjs', () => ({
  addBreadcrumb: (b: { category?: string; message?: string; level?: string; data?: unknown }) => {
    sentryBreadcrumbs.push(b);
    sentryAddBreadcrumbMock(b);
  },
}));

// In-memory fake DB. The handler calls:
//   1. `db.select().from(businessMemory).where(...)`  — non-tx (Step 1)
//   2. `db.transaction(async (tx) => { ... })`        — Step 3 boundary
//        Inside the tx:
//          a. `tx.select({ lastUpdatedAt: ... }).from(businessMemory).where(...).for('share')`
//          b. `tx.delete(embeddings).where(...)`
//          c. `tx.insert(embeddings).values(rows)`
// The fake records every operation against an in-memory store that the test
// can prime + inspect.

type BusinessMemoryRow = {
  id: string;
  accountId: string;
  narrative: unknown;
  traction: unknown;
  confirmedAt: Date | null;
  lastUpdatedAt: Date;
};

type EmbeddingRow = {
  id: string;
  accountId: string;
  sourceType: 'memory' | 'corpus' | 'interaction';
  sourceId: string;
  chunkText: string;
  chunkIdx: number;
  embedding: number[];
  embeddingModelVersion: string;
  tokenCount: number | null;
};

const { store } = vi.hoisted(() => ({
  store: {
    businessMemory: [] as BusinessMemoryRow[],
    embeddings: [] as EmbeddingRow[],
    /** Hook for Case 3 — bumps lastUpdatedAt after the load-and-chunk step. */
    onBeforeUpsert: undefined as (() => void) | undefined,
  },
}));

// The handler builds .where(and(eq(col, valA), eq(col, valB))) — we cannot
// introspect drizzle expression trees easily, so the fake assumes "all
// SELECTs / DELETEs target the only row matching {accountId, id (when present)}".
// Test cases set up a single row each; this is sufficient.

function buildFakeDb() {
  const fakeTx = {
    select: (_proj?: unknown) => ({
      from: (_table: unknown) => ({
        where: (_pred: unknown) => ({
          // .for('share') chains off select-with-where
          for: (_strength: 'share' | 'update') => {
            // Return businessMemory row (the only table SELECTed inside tx).
            // Test runner sets up a single row; we return it.
            return Promise.resolve(
              store.businessMemory.length > 0
                ? [{ lastUpdatedAt: store.businessMemory[0].lastUpdatedAt }]
                : [],
            );
          },
          // Also support plain `.then(...)` if a test ever needs it. Not used here.
        }),
      }),
    }),
    delete: (_table: unknown) => ({
      where: (_pred: unknown) => {
        // Delete every embeddings row matching (memory, sourceId, modelVersion).
        // For our tests this is "the only memory row's embeddings for source_id".
        // We delete everything where sourceType==='memory' (single-row test fixture).
        store.embeddings = store.embeddings.filter((r) => r.sourceType !== 'memory');
        return Promise.resolve();
      },
    }),
    insert: (_table: unknown) => ({
      values: (rows: Omit<EmbeddingRow, 'id'>[]) => {
        for (const r of rows) {
          store.embeddings.push({ ...r, id: `mem-emb-${store.embeddings.length}` });
        }
        return Promise.resolve();
      },
    }),
  };

  return {
    // Non-transactional select (Step 1 — load-and-chunk)
    select: (_proj?: unknown) => ({
      from: (_table: unknown) => ({
        where: (_pred: unknown) => {
          return Promise.resolve(store.businessMemory.slice(0, 1));
        },
      }),
    }),
    // Transactional boundary (Step 3 — upsert-embeddings)
    transaction: async (cb: (tx: typeof fakeTx) => Promise<unknown>) => {
      // Test hook: Case 3 mutates store.businessMemory.lastUpdatedAt here BEFORE
      // the tx body runs (simulating a concurrent confirmDraft race).
      if (store.onBeforeUpsert) store.onBeforeUpsert();
      return cb(fakeTx);
    },
  };
}

vi.mock('@/db/client', () => ({
  getServiceClient: () => buildFakeDb(),
}));

// ── Now safe to import the module under test ─────────────────────────────────
import { embedMemory } from '@/inngest/functions/embed-memory';

// ── Test helpers ─────────────────────────────────────────────────────────────

/**
 * Pull the private handler off an InngestFunction. Inngest's
 * `InngestFunction` instance stores the user handler at `this.fn` (per
 * node_modules/inngest/components/InngestFunction.js:37). We cast through
 * `unknown` then invoke it directly with a synthetic ctx.
 */
function getHandler(fn: unknown): (ctx: { event: { data: Record<string, unknown> }; step: StepRunner }) => Promise<unknown> {
  return (fn as { fn: (ctx: { event: { data: Record<string, unknown> }; step: StepRunner }) => Promise<unknown> }).fn;
}

interface StepRunner {
  run: <T>(name: string, cb: () => Promise<T>) => Promise<T>;
}

/** A passthrough step.run that records names. */
function makeStep(): StepRunner & { stepNames: string[] } {
  const stepNames: string[] = [];
  const step = {
    run: async <T>(name: string, cb: () => Promise<T>): Promise<T> => {
      stepNames.push(name);
      return cb();
    },
    stepNames,
  };
  return step;
}

/** Invoke embedMemory's handler with a synthetic Inngest event. */
async function runEmbedMemory(data: { accountId: string; businessMemoryId: string; lastUpdatedAt: string }) {
  const handler = getHandler(embedMemory);
  const step = makeStep();
  const result = await handler({ event: { data }, step });
  return { result, stepNames: step.stepNames };
}

function resetStore() {
  store.businessMemory = [];
  store.embeddings = [];
  store.onBeforeUpsert = undefined;
}

// ── Suite ────────────────────────────────────────────────────────────────────

describe('embed-memory Inngest function (Plan 02-04 / T04)', () => {
  beforeEach(() => {
    resetStore();
    voyageEmbedMock.mockReset();
    sentryBreadcrumbs.length = 0;
    sentryAddBreadcrumbMock.mockClear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  const ACCOUNT_ID = '00000000-0000-0000-0000-000000000a01';
  const BUSINESS_MEMORY_ID = '00000000-0000-0000-0000-000000000b01';
  const T1 = new Date('2026-05-29T10:00:00.000Z');
  const T2 = new Date('2026-05-29T11:00:00.000Z');

  // ──────────────────────────────────────────────────────────────────────────
  // Case 1 — Happy path WITH content substring assertion (cycle-7 H2 silent-failure
  //         coverage; founder watch item #1).
  // ──────────────────────────────────────────────────────────────────────────
  it('Case 1 — happy path: inserts N embeddings AND the chunk_text values contain the actual narrative content (H2 coverage)', async () => {
    store.businessMemory = [
      {
        id: BUSINESS_MEMORY_ID,
        accountId: ACCOUNT_ID,
        narrative: {
          problem: 'PROBLEM-SENTINEL: founders waste hours on investor outreach.',
          solution: 'SOLUTION-SENTINEL: AI-driven outreach automation.',
          why_now: 'WHYNOW-SENTINEL: AI infra cheap enough at last.',
          why_us: 'WHYUS-SENTINEL: ex-founder team with three exits.',
        },
        traction: {
          growth: 'GROWTH-SENTINEL: 3x MoM growth across 12 months.',
          runway: 'RUNWAY-SENTINEL: 18 months at current burn.',
        },
        confirmedAt: T1,
        lastUpdatedAt: T1,
      },
    ];

    // Voyage returns 1024-dim zeros — the assertion is on chunk_text content, not vectors.
    voyageEmbedMock.mockImplementation(async ({ texts }: { texts: string[] }) => ({
      embeddings: texts.map(() => new Array(1024).fill(0)),
      tokenCount: 100,
      modelVersion: voyageModel,
      latencyMs: 12,
    }));

    const { result, stepNames } = await runEmbedMemory({
      accountId: ACCOUNT_ID,
      businessMemoryId: BUSINESS_MEMORY_ID,
      lastUpdatedAt: T1.toISOString(),
    });

    expect(result).toMatchObject({ ok: true });
    expect((result as { chunks: number }).chunks).toBeGreaterThan(0);
    expect(stepNames[0]).toBe('load-and-chunk');
    expect(stepNames.at(-1)).toBe('upsert-embeddings');

    // CRITICAL — H2 silent-failure coverage. The flatten path is the only place
    // narrative content reaches chunk_text. If row.narrative was cast wrong or
    // field names drifted, chunk_text would be empty / wrong, and the test
    // would still pass under a row-count-only assertion. We require substring
    // matches on ALL six narrative+traction sentinels.
    const allChunkText = store.embeddings.map((e) => e.chunkText).join('\n---\n');
    expect(allChunkText).toContain('PROBLEM-SENTINEL');
    expect(allChunkText).toContain('SOLUTION-SENTINEL');
    expect(allChunkText).toContain('WHYNOW-SENTINEL');
    expect(allChunkText).toContain('WHYUS-SENTINEL');
    expect(allChunkText).toContain('GROWTH-SENTINEL');
    expect(allChunkText).toContain('RUNWAY-SENTINEL');

    // Voyage was called at least once with document inputType
    expect(voyageEmbedMock).toHaveBeenCalled();
    expect(voyageEmbedMock.mock.calls[0][0]).toMatchObject({
      inputType: 'document',
      trace: { accountId: ACCOUNT_ID, sourceType: 'memory', sourceId: BUSINESS_MEMORY_ID },
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // Case 2 — Empty narrative skipped
  // ──────────────────────────────────────────────────────────────────────────
  it('Case 2 — empty narrative + traction skipped: returns chunks=0; EMBED_NOTHING_TO_EMBED breadcrumb fires', async () => {
    store.businessMemory = [
      {
        id: BUSINESS_MEMORY_ID,
        accountId: ACCOUNT_ID,
        narrative: {},
        traction: {},
        confirmedAt: T1,
        lastUpdatedAt: T1,
      },
    ];

    const { result } = await runEmbedMemory({
      accountId: ACCOUNT_ID,
      businessMemoryId: BUSINESS_MEMORY_ID,
      lastUpdatedAt: T1.toISOString(),
    });

    expect(result).toEqual({ ok: true, chunks: 0 });
    expect(sentryBreadcrumbs.some((b) => b.message === 'EMBED_NOTHING_TO_EMBED')).toBe(true);
    expect(voyageEmbedMock).not.toHaveBeenCalled();
    expect(store.embeddings).toHaveLength(0);
  });

  // ──────────────────────────────────────────────────────────────────────────
  // Case 3 — TOCTOU stale (founder watch item #3)
  // ──────────────────────────────────────────────────────────────────────────
  it('Case 3 — TOCTOU stale: lastUpdatedAt drifts between load and upsert → ZERO rows written, EMBED_TOCTOU_STALE breadcrumb', async () => {
    store.businessMemory = [
      {
        id: BUSINESS_MEMORY_ID,
        accountId: ACCOUNT_ID,
        narrative: { problem: 'Real problem text here so we get at least one chunk.' },
        traction: { growth: '2x MoM.' },
        confirmedAt: T1,
        lastUpdatedAt: T1,
      },
    ];

    // Voyage stub returns valid 1024-dim vectors.
    voyageEmbedMock.mockImplementation(async ({ texts }: { texts: string[] }) => ({
      embeddings: texts.map(() => new Array(1024).fill(0.1)),
      tokenCount: 50,
      modelVersion: voyageModel,
      latencyMs: 10,
    }));

    // Simulate a concurrent confirmDraft bumping lastUpdatedAt between
    // load-and-chunk and upsert-embeddings — the fakeDb runs this hook
    // BEFORE the tx body, which is precisely when the FOR SHARE re-read
    // would happen.
    store.onBeforeUpsert = () => {
      store.businessMemory[0].lastUpdatedAt = T2;
    };

    const { result } = await runEmbedMemory({
      accountId: ACCOUNT_ID,
      businessMemoryId: BUSINESS_MEMORY_ID,
      lastUpdatedAt: T1.toISOString(), // emittedAt is T1; current is now T2 → stale
    });

    expect((result as { chunks: number }).chunks).toBe(0);
    expect(sentryBreadcrumbs.some((b) => b.message === 'EMBED_TOCTOU_STALE')).toBe(true);
    // No rows written
    expect(store.embeddings).toHaveLength(0);
  });

  // ──────────────────────────────────────────────────────────────────────────
  // Case 4 — Idempotency under unchanged lastUpdatedAt (DELETE-then-INSERT)
  // ──────────────────────────────────────────────────────────────────────────
  it('Case 4 — re-fire SAME event: second run produces byte-identical chunk_text set (DELETE-then-INSERT)', async () => {
    store.businessMemory = [
      {
        id: BUSINESS_MEMORY_ID,
        accountId: ACCOUNT_ID,
        narrative: { problem: 'IDEMPOTENT-PROBLEM stable content for repeat runs.' },
        traction: { growth: 'IDEMPOTENT-GROWTH steady metrics.' },
        confirmedAt: T1,
        lastUpdatedAt: T1,
      },
    ];

    voyageEmbedMock.mockImplementation(async ({ texts }: { texts: string[] }) => ({
      embeddings: texts.map(() => new Array(1024).fill(0.42)),
      tokenCount: 50,
      modelVersion: voyageModel,
      latencyMs: 10,
    }));

    // Fire once
    await runEmbedMemory({
      accountId: ACCOUNT_ID,
      businessMemoryId: BUSINESS_MEMORY_ID,
      lastUpdatedAt: T1.toISOString(),
    });
    const first = store.embeddings.map((r) => ({ chunkText: r.chunkText, chunkIdx: r.chunkIdx })).slice();
    expect(first.length).toBeGreaterThan(0);

    // Fire again with the SAME event
    await runEmbedMemory({
      accountId: ACCOUNT_ID,
      businessMemoryId: BUSINESS_MEMORY_ID,
      lastUpdatedAt: T1.toISOString(),
    });
    const second = store.embeddings.map((r) => ({ chunkText: r.chunkText, chunkIdx: r.chunkIdx })).slice();

    // Same count, same chunk_text content per idx (PKs differ — DELETE-then-INSERT regenerates)
    expect(second.length).toBe(first.length);
    for (let i = 0; i < first.length; i++) {
      expect(second[i].chunkText).toBe(first[i].chunkText);
      expect(second[i].chunkIdx).toBe(first[i].chunkIdx);
    }
  });

  // ──────────────────────────────────────────────────────────────────────────
  // Case 5 — Voyage failure surfaces breadcrumb + retries
  // ──────────────────────────────────────────────────────────────────────────
  it('Case 5 — Voyage failure: EMBED_VOYAGE_FAILED breadcrumb fires; error rethrown for Inngest retry', async () => {
    store.businessMemory = [
      {
        id: BUSINESS_MEMORY_ID,
        accountId: ACCOUNT_ID,
        narrative: { problem: 'Real text so the Voyage call happens.' },
        traction: { growth: 'More text.' },
        confirmedAt: T1,
        lastUpdatedAt: T1,
      },
    ];

    voyageEmbedMock.mockImplementation(async () => {
      throw new Error('voyage 500: simulated upstream failure');
    });

    await expect(
      runEmbedMemory({
        accountId: ACCOUNT_ID,
        businessMemoryId: BUSINESS_MEMORY_ID,
        lastUpdatedAt: T1.toISOString(),
      }),
    ).rejects.toThrow(/voyage 500/);

    expect(sentryBreadcrumbs.some((b) => b.message === 'EMBED_VOYAGE_FAILED')).toBe(true);
    // Voyage failed BEFORE upsert ran — no rows written.
    expect(store.embeddings).toHaveLength(0);
  });

  // ──────────────────────────────────────────────────────────────────────────
  // Case 6 — Chunk overflow flagged + sliced
  // ──────────────────────────────────────────────────────────────────────────
  it('Case 6 — narrative producing >64 chunks: EMBED_CHUNK_OVERFLOW breadcrumb; only first 64 embedded', async () => {
    // Build a narrative that the deterministic chunker (800 token target, 200 overlap)
    // will split into well over 64 chunks. Each chunk targets ~3200 chars; effective
    // step ~2400 chars. 64 chunks needs ~64 * 2400 = ~153,600 chars of content.
    // Pad generously to push past 64 chunks safely.
    const longProblem = 'This is a long sentence about the problem space. '.repeat(20_000);

    store.businessMemory = [
      {
        id: BUSINESS_MEMORY_ID,
        accountId: ACCOUNT_ID,
        narrative: { problem: longProblem },
        traction: {},
        confirmedAt: T1,
        lastUpdatedAt: T1,
      },
    ];

    voyageEmbedMock.mockImplementation(async ({ texts }: { texts: string[] }) => ({
      embeddings: texts.map(() => new Array(1024).fill(0)),
      tokenCount: 100,
      modelVersion: voyageModel,
      latencyMs: 5,
    }));

    const { result } = await runEmbedMemory({
      accountId: ACCOUNT_ID,
      businessMemoryId: BUSINESS_MEMORY_ID,
      lastUpdatedAt: T1.toISOString(),
    });

    expect(sentryBreadcrumbs.some((b) => b.message === 'EMBED_CHUNK_OVERFLOW')).toBe(true);
    // Hard-capped at 64.
    expect((result as { chunks: number }).chunks).toBe(64);
    expect(store.embeddings).toHaveLength(64);
  });

  // ──────────────────────────────────────────────────────────────────────────
  // Case 7 — Concurrency cap pinned
  // ──────────────────────────────────────────────────────────────────────────
  it('Case 7 — concurrency cap: { limit: 3, key: "event.data.accountId" }', () => {
    const opts = (embedMemory as unknown as { opts: Record<string, unknown> }).opts;
    expect(opts.concurrency).toEqual({ limit: 3, key: 'event.data.accountId' });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // Case 8 — Retries pinned
  // ──────────────────────────────────────────────────────────────────────────
  it('Case 8 — retries pinned: 2', () => {
    const opts = (embedMemory as unknown as { opts: { retries?: number } }).opts;
    expect(opts.retries).toBe(2);
  });

  // ──────────────────────────────────────────────────────────────────────────
  // Case 9 — allFunctions registration drift pin (founder watch item #2)
  // ──────────────────────────────────────────────────────────────────────────
  it('Case 9 — allFunctions has exactly one embed function and it is embed-memory', async () => {
    const { allFunctions } = await import('@/inngest/functions');
    function fnId(f: unknown): string {
      const x = f as { id?: string | (() => string) };
      return typeof x.id === 'function' ? x.id() : (x.id as string);
    }

    const embedFns = allFunctions.filter((f) => /embed/i.test(fnId(f) ?? ''));
    expect(embedFns).toHaveLength(1);
    expect(fnId(embedFns[0])).toBe('embed-memory');
    // Defensive: also confirm the old 'embed' id is GONE
    expect(allFunctions.some((f) => fnId(f) === 'embed')).toBe(false);
  });

  // ──────────────────────────────────────────────────────────────────────────
  // Case 10 — Re-confirm with CHANGED content REWRITES rows (CRITICAL #4 pin)
  // ──────────────────────────────────────────────────────────────────────────
  it('Case 10 — re-fire with new narrative + bumped lastUpdatedAt: old chunks deleted, new ones inserted', async () => {
    // First confirm — long narrative producing multiple chunks.
    store.businessMemory = [
      {
        id: BUSINESS_MEMORY_ID,
        accountId: ACCOUNT_ID,
        narrative: {
          problem: 'ORIGINAL-PROBLEM ' + 'Long descriptive text. '.repeat(500),
          solution: 'ORIGINAL-SOLUTION ' + 'Long descriptive text. '.repeat(500),
        },
        traction: {},
        confirmedAt: T1,
        lastUpdatedAt: T1,
      },
    ];

    voyageEmbedMock.mockImplementation(async ({ texts }: { texts: string[] }) => ({
      embeddings: texts.map(() => new Array(1024).fill(0.1)),
      tokenCount: 100,
      modelVersion: voyageModel,
      latencyMs: 10,
    }));

    await runEmbedMemory({
      accountId: ACCOUNT_ID,
      businessMemoryId: BUSINESS_MEMORY_ID,
      lastUpdatedAt: T1.toISOString(),
    });
    const before = store.embeddings.slice();
    expect(before.length).toBeGreaterThan(0);
    // T1 invariant (ORDER-INDEPENDENT — do NOT assume chunk_idx 0): the Problem
    // field is embedded as its OWN "Problem:"-labeled chunk carrying the field
    // content, never folded into a different field's chunk.
    const beforeProblem = before.find((r) => r.chunkText.startsWith('Problem:'));
    expect(beforeProblem, 'Problem field must have its own labeled chunk').toBeDefined();
    expect(beforeProblem?.chunkText).toContain('ORIGINAL-PROBLEM');

    // Bump narrative to MUCH SHORTER content + bump lastUpdatedAt.
    store.businessMemory[0].narrative = { problem: 'New shorter problem only.' };
    store.businessMemory[0].lastUpdatedAt = T2;

    // Re-fire with t2.
    await runEmbedMemory({
      accountId: ACCOUNT_ID,
      businessMemoryId: BUSINESS_MEMORY_ID,
      lastUpdatedAt: T2.toISOString(),
    });
    const after = store.embeddings.slice();

    // Fewer chunks because content is shorter.
    expect(after.length).toBeLessThan(before.length);
    expect(after.length).toBeGreaterThan(0);
    // The Problem field is STILL its own labeled chunk after re-fire, and the
    // DELETE-then-INSERT actually replaced it — same label, new content, and the
    // prior long Problem chunk text is gone (order-independent).
    const afterProblem = after.find((r) => r.chunkText.startsWith('Problem:'));
    expect(afterProblem, 'Problem field must still be embedded after re-fire').toBeDefined();
    expect(afterProblem?.chunkText).toContain('New shorter problem');
    expect(afterProblem?.chunkText).not.toBe(beforeProblem?.chunkText);
    // ORIGINAL-* sentinels are GONE across ALL rows (clean replace, no orphans).
    expect(after.every((r) => !r.chunkText.includes('ORIGINAL-PROBLEM'))).toBe(true);
    expect(after.every((r) => !r.chunkText.includes('ORIGINAL-SOLUTION'))).toBe(true);
  });
});
