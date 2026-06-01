/**
 * Hybrid retriever — the read path for the Knowledge Layer (Plan 02-06 / KNW-05a).
 *
 * `hybridRetrieve` embeds a founder's query through the Voyage adapter, runs a
 * pgvector cosine search AND a Postgres full-text search over the per-tenant
 * `embeddings` rows the 02-04 pipeline wrote, fuses the two candidate lists by
 * Reciprocal Rank Fusion (RRF), and RANKS the result with the raw vector + FTS
 * scores attached.
 *
 * ## What this module does — and does NOT do
 *
 * RETRIEVAL ONLY. It retrieves, ranks, fuses, scopes, and filters. It performs
 * NO Anthropic synthesis, assembles NO citations, and makes NO "I don't know"
 * decision — those belong to Plan 02-07's qa-rag agent (KNW-05c). This module
 * returns the EVIDENCE (ranked `Candidate[]` with `vectorScore`/`ftsScore`/
 * `rrfScore`); 02-07 applies the 0.6-cosine grounding floor against those scores
 * WITHOUT re-querying (02-CONTEXT.md). A weak query (vector returns far rows, FTS
 * empty) returns vector-only candidates with `ftsScore: null` — the grounding
 * call is 02-07's, never a vector-side cutoff here.
 *
 * ## Tenant isolation
 *
 * Every query runs inside the request-scoped tenant runner (`ctx.rls(fn)` from
 * `getRequestClient(accessToken)` — RLS default-deny enforces
 * `account_id = jwt.tenant_id`) AND carries an explicit `account_id = <accountId>`
 * WHERE predicate (belt-and-suspenders). There is NO `getServiceClient()` /
 * RLS-bypass path here — that escape hatch is for Inngest jobs only.
 *
 * ## AI egress
 *
 * The query embed is a NEW read-path Voyage-token egress. It fires at EXACTLY ONE
 * call site (the single `voyage.embed` below) so Plan 02-07's $5/user/day cap
 * (PULL-OBS-COST-01-FORWARD / OBS-COST-01) has one read-side meter point. This
 * module adds NO cost cap; 02-07 owns that. The query embed traces honestly as
 * `source_type:'query'` (OD-4) and the query text NEVER enters a trace, a log, or
 * the returned metadata beyond the chunk_text actually retrieved.
 *
 * ## Schema lock (OD-1 Option A — FOUNDER-CONFIRMED)
 *
 * The FTS `to_tsvector('english', chunk_text)` is computed at QUERY TIME — NO
 * stored GENERATED column, NO GIN index. `src/db/schema/**` is untouched; zero
 * migrations. At Phase-2 / design-partner scale the tenant filter bounds the base
 * set to one founder's chunks (dozens–low hundreds), so a query-time tsvector is
 * sub-millisecond. The stored-column + GIN index is deferred to
 * FOLLOWUP-FTS-GIN-INDEX-01 (lands when per-tenant chunk counts reach thousands).
 */
import { and, cosineDistance, eq, inArray, sql } from 'drizzle-orm';
import type { PgTransaction } from 'drizzle-orm/pg-core';

import { voyage } from '@/ai/integrations/voyage.adapter';
import { embeddings } from '@/db/schema/embeddings';

// ────────────────────────────────────────────────────────────────────────────
// Constants (documented)
// ────────────────────────────────────────────────────────────────────────────

/** Per-side candidate LIMIT = effTopK * CANDIDATE_POOL_FACTOR — scales with the
 *  caller's topK so a larger ask widens both pools before fusion (F-6). */
export const CANDIDATE_POOL_FACTOR = 4;

/** Hard ceiling on topK — bounds the candidate scan + payload (T-02-06-04, C-F1). */
export const MAX_TOP_K = 50;

/** Reciprocal Rank Fusion constant — canonical k=60 (OD-2). Fusion is by RANK
 *  position, never by raw score, because cosine distance (0..2) and ts_rank_cd
 *  (unbounded) are on incomparable scales. */
export const RRF_K = 60;

/** Model-version filter on BOTH sides — honors the rolling re-embed contract from
 *  02-01 (cross-version rows coexist in the table but never co-rank). */
export const EMBEDDING_MODEL_VERSION = 'voyage-3-large';

/** The source types the read path retrieves over. Phase 2 writes 'memory' +
 *  'corpus'; 'interaction' is Phase 4. */
export const SOURCE_TYPES = ['memory', 'corpus'] as const;

// ────────────────────────────────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────────────────────────────────

export type HybridRetrieveArgs = {
  /** Owning tenant — the explicit belt-and-suspenders predicate alongside RLS. */
  accountId: string;
  /** The founder's question. Embedded once; never traced or logged. */
  query: string;
  /** How many ranked candidates to return (default 8; clamped to [1, MAX_TOP_K]). */
  topK?: number;
};

/**
 * One ranked retrieval candidate.
 *
 * - `vectorScore` is cosine SIMILARITY (= 1 - cosineDistance) ∈ [-1, 1], higher =
 *   better — NOT a distance. This is the scale 02-07's 0.6-cosine floor compares
 *   against directly. `null` when the candidate was an FTS-only hit (F-4).
 * - `ftsScore` is the raw `ts_rank_cd` value (unbounded, higher = better). `null`
 *   when the candidate was a vector-only hit.
 * - `rrfScore` is the fused Reciprocal Rank Fusion score the result is sorted by.
 */
export type Candidate = {
  sourceType: string;
  sourceId: string;
  chunkIdx: number;
  chunkText: string;
  vectorScore: number | null;
  ftsScore: number | null;
  rrfScore: number;
};

/** The request-scoped tenant runner the caller (02-07) supplies from
 *  `getRequestClient(accessToken)`. retrieve.ts NEVER constructs a service client. */
type RlsRunner = <T>(fn: (tx: PgTransaction<never, never, never>) => Promise<T>) => Promise<T>;

export type HybridRetrieveCtx = {
  rls: RlsRunner;
};

// ────────────────────────────────────────────────────────────────────────────
// Internal row shapes
// ────────────────────────────────────────────────────────────────────────────

type VectorRow = {
  id: string;
  sourceType: string;
  sourceId: string;
  chunkIdx: number;
  chunkText: string;
  dist: number;
};

type FtsRow = {
  id: string;
  source_type: string;
  source_id: string;
  chunk_idx: number;
  chunk_text: string;
  rank: number;
};

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(Math.max(n, lo), hi);
}

// ────────────────────────────────────────────────────────────────────────────
// hybridRetrieve
// ────────────────────────────────────────────────────────────────────────────

/**
 * Retrieves the top-`topK` tenant-scoped chunks for `query` by fusing a pgvector
 * cosine search and a Postgres FTS search with Reciprocal Rank Fusion.
 *
 * Returns a `Candidate[]` sorted by `rrfScore` descending and sliced to the
 * clamped `topK`. Returns `[]` when both sides retrieve nothing — it never throws
 * on an empty result. Retrieval only: no synthesis, no citations, no grounding
 * decision (those are 02-07).
 */
export async function hybridRetrieve(
  { accountId, query, topK = 8 }: HybridRetrieveArgs,
  ctx: HybridRetrieveCtx,
): Promise<Candidate[]> {
  // topK normalization FIRST (C-F1, T-02-06-04): a zero / negative / NaN /
  // non-integer / oversized topK can never reach the SQL LIMIT, force an
  // unbounded scan, or produce an oversized payload. Every LIMIT and the final
  // slice use effTopK.
  const effTopK = clamp(Math.trunc(topK ?? 8), 1, MAX_TOP_K);
  const pool = effTopK * CANDIDATE_POOL_FACTOR;

  // Embed the query through the SINGLE Voyage call site on the read path. This is
  // the read-path AI-token egress metered by 02-07's OBS-COST-01
  // (PULL-OBS-COST-01-FORWARD). OD-4: traces honestly as source_type:'query'
  // (NEVER a false 'memory'); the correlation UUID keeps the query text off the
  // privacy-contract trace.
  const { embeddings: queryEmbeddings } = await voyage.embed({
    texts: [query],
    inputType: 'query',
    trace: { accountId, sourceType: 'query', sourceId: crypto.randomUUID() },
  });
  const queryVec = queryEmbeddings[0];

  // Run BOTH queries inside ONE tenant transaction so the fused candidate lists
  // are read from a single consistent snapshot (F-5).
  const { vectorRows, ftsRows } = await ctx.rls(async (tx) => {
    // VECTOR side — cosine distance over the HNSW vector_cosine_ops index. The
    // WHERE is built with drizzle's typed builder so T02 can .toSQL()-inspect the
    // tenant + source_type + model-version predicate (F-1).
    const dist = cosineDistance(embeddings.embedding, queryVec);
    const vectorRows = (await tx
      .select({
        id: embeddings.id,
        sourceType: embeddings.sourceType,
        sourceId: embeddings.sourceId,
        chunkIdx: embeddings.chunkIdx,
        chunkText: embeddings.chunkText,
        dist: sql<number>`${dist}`.as('dist'),
      })
      .from(embeddings)
      .where(
        and(
          eq(embeddings.accountId, accountId),
          inArray(embeddings.sourceType, [...SOURCE_TYPES]),
          eq(embeddings.embeddingModelVersion, EMBEDDING_MODEL_VERSION),
        ),
      )
      .orderBy(sql`dist asc`)
      .limit(pool)) as VectorRow[];

    // KEYWORD side — query-time FTS (OD-1 Option A, NO stored column). Every
    // runtime value is a bound parameter (websearch_to_tsquery safely parses
    // arbitrary user text and never errors on malformed input — T-02-06-03). The
    // tenant + source_type + model-version filters match the vector side exactly.
    const ftsResult = await tx.execute(sql`
      select
        ${embeddings.id} as id,
        ${embeddings.sourceType} as source_type,
        ${embeddings.sourceId} as source_id,
        ${embeddings.chunkIdx} as chunk_idx,
        ${embeddings.chunkText} as chunk_text,
        ts_rank_cd(to_tsvector('english', ${embeddings.chunkText}), q) as rank
      from ${embeddings}, websearch_to_tsquery('english', ${query}) q
      where ${embeddings.accountId} = ${accountId}
        and ${embeddings.sourceType} in (${sql.join(
          SOURCE_TYPES.map((s) => sql`${s}`),
          sql`, `,
        )})
        and ${embeddings.embeddingModelVersion} = ${EMBEDDING_MODEL_VERSION}
        and to_tsvector('english', ${embeddings.chunkText}) @@ q
      order by rank desc
      limit ${pool}
    `);
    const ftsRows = ftsResult as unknown as FtsRow[];

    return { vectorRows, ftsRows };
  });

  // RRF fuse keyed on embeddings.id. Position is 1-based; a doc present in only
  // one list scores from that one list (canonical RRF: score += 1/(k + rank)).
  const fused = new Map<string, Candidate>();

  vectorRows.forEach((row, i) => {
    const position = i + 1; // 1-based
    fused.set(row.id, {
      sourceType: row.sourceType,
      sourceId: row.sourceId,
      chunkIdx: row.chunkIdx,
      chunkText: row.chunkText,
      vectorScore: 1 - Number(row.dist), // cosine SIMILARITY ∈ [-1, 1] (F-4)
      ftsScore: null,
      rrfScore: 1 / (RRF_K + position),
    });
  });

  ftsRows.forEach((row, i) => {
    const position = i + 1; // 1-based
    const existing = fused.get(row.id);
    if (existing) {
      existing.ftsScore = Number(row.rank);
      existing.rrfScore += 1 / (RRF_K + position);
    } else {
      fused.set(row.id, {
        sourceType: row.source_type,
        sourceId: row.source_id,
        chunkIdx: row.chunk_idx,
        chunkText: row.chunk_text,
        vectorScore: null,
        ftsScore: Number(row.rank),
        rrfScore: 1 / (RRF_K + position),
      });
    }
  });

  return [...fused.values()]
    .sort((a, b) => b.rrfScore - a.rrfScore)
    .slice(0, effTopK);
}
