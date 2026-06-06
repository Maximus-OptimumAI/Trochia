/**
 * Vector embeddings (Phase 2 — KNW-04).
 *
 * The pgvector-backed retrieval index used by the hybrid RAG service
 * (`src/ai/rag/retrieve.ts`, lands Plan 02-06 / KNW-05a) and the ambient Q&A
 * sidebar (Plan 02-07 / KNW-05c). Embeddings are produced by the Inngest
 * `embed-memory` pipeline (Plan 02-04 / KNW-04b) using Voyage `voyage-3-large`
 * (1024-dim) — and ONLY by that pipeline; the request path never embeds.
 *
 * ## Tenancy model
 *
 * Tenant-scoped. Per the Phase 1 anticipation in `src/db/rls.ts`
 * (NON_TENANT_TABLES comment), the curated `corpus` table itself is global +
 * read-only, but the *embeddings* of corpus chunks live HERE — and we keep
 * one copy per tenant (the storage cost is trivial at expected scale: ~50
 * corpus docs × a few hundred chunks × ~5KB per row × N tenants).
 *
 * Why per-tenant copies of corpus embeddings (not a shared read policy):
 *
 *   1. Simpler RLS — one policy, default-deny, no per-row source_type branch.
 *   2. Eval fidelity — the Phase 2 exit gate measures retrieval quality
 *      against a specific tenant's data; co-located corpus + memory chunks
 *      in the same index makes hybrid retrieval and HNSW recall numbers
 *      compare apples-to-apples.
 *   3. Forward-compat — Phase 7 (data room) introduces per-tenant corpus
 *      extensions (the founder uploads their own deep-dive docs); per-tenant
 *      embeddings rows are the natural place for those.
 *
 * Optimization to revisit when tenant count exceeds ~50: a tenant-shared
 * `corpus_embeddings` table or a multi-policy RLS, whichever is cheaper. Out
 * of scope for Phase 2.
 *
 * ## Idempotency contract
 *
 * The dedup unique index on `(account_id, source_type, source_id, chunk_idx,
 * embedding_model_version)` is the rebuild-safety guarantee for the Inngest
 * pipeline: re-firing `memory.confirmed` for an already-embedded row is an
 * upsert, not a duplicate. The `embedding_model_version` is part of the key
 * so that rolling out a new embedding model (e.g. voyage-3.5-large) writes
 * new rows alongside the old ones — old + new coexist during the migration
 * window; the retrieval service queries by current version only.
 *
 * ## Vector dimension lock
 *
 * `vector('embedding', { dimensions: 1024 })` is HARD-PINNED to Voyage
 * `voyage-3-large` (1024 dims). Changing the embedding provider or model dim
 * is a SCHEMA CHANGE — a new plan, a new migration, and a re-embed of every
 * existing row. Do NOT parameterize the dimension here; the type system
 * leverages the literal `1024` for retrieval-side guarantees.
 *
 * ## HNSW index
 *
 * `embeddings_hnsw_idx` uses the `hnsw` access method with the
 * `vector_cosine_ops` operator class — cosine similarity is the standard
 * for Voyage embeddings per the CONTEXT.md "tech decisions (locked)" table.
 * If drizzle-kit's generate step misses the HNSW line, manually add it to
 * the migration SQL per Plan 02-01 Task 5 instructions.
 */
import { index, integer, pgEnum, pgTable, text, timestamp, uniqueIndex, uuid, vector } from 'drizzle-orm/pg-core';

import { tenantIsolationPolicy } from '@/db/rls';
import { accounts } from '@/db/schema/tenancy';

// ────────────────────────────────────────────────────────────────────────────
// Enums
// ────────────────────────────────────────────────────────────────────────────

/**
 * Where the chunk came from. Phase 2 writes `'memory'` and `'corpus'`;
 * `'interaction'` is reserved for Phase 4 (the Investor Pipeline embedding
 * of historical Q&A interactions to enable "what have I told investors
 * about X" semantic search).
 */
export const embeddingSourceTypeEnum = pgEnum('embedding_source_type_t', [
  'memory',
  'corpus',
  'interaction',
]);

// ────────────────────────────────────────────────────────────────────────────
// embeddings — pgvector-backed retrieval index (HNSW + cosine)
// ────────────────────────────────────────────────────────────────────────────

/**
 * `embeddings` — one row per (tenant, source row, chunk). Inserted only by
 * `src/inngest/functions/embed-memory.ts` (Plan 02-04 / KNW-04b); read by
 * `src/ai/rag/retrieve.ts` (Plan 02-06 / KNW-05a).
 *
 * Per the Phase 2 hybrid-retrieval contract (CONTEXT.md "Retrieval"):
 *
 *   - This table provides the pgvector cosine-similarity side.
 *   - The Postgres FTS (full-text search) side queries `chunk_text` via
 *     `to_tsvector('english', chunk_text)` — added as a GENERATED column
 *     + GIN index in the retrieval plan (Plan 02-06), NOT here. This
 *     keeps the schema-foundation plan focused; FTS lands when it's
 *     consumed.
 */
export const embeddings = pgTable(
  'embeddings',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    accountId: uuid('account_id')
      .notNull()
      .references(() => accounts.id, { onDelete: 'cascade' }),
    sourceType: embeddingSourceTypeEnum('source_type').notNull(),
    sourceId: uuid('source_id').notNull(), // FK by convention only — points at business_memory.id, corpus.id, interaction.id
    chunkText: text('chunk_text').notNull(),
    chunkIdx: integer('chunk_idx').notNull(), // 0-indexed position within source
    // 1024-dim — Voyage voyage-3-large. Schema-pinned (see file header).
    embedding: vector('embedding', { dimensions: 1024 }).notNull(),
    // Free-form text (NOT enum) so future model rollouts are a data change,
    // not an ALTER TYPE migration. Current values: 'voyage-3-large'.
    embeddingModelVersion: text('embedding_model_version').notNull(),
    tokenCount: integer('token_count'), // informational; helps cost tuning
    embeddedAt: timestamp('embedded_at', { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    tenantIsolationPolicy(t.accountId),
    // Idempotency / dedup key: re-firing the Inngest pipeline for the same
    // (source row, chunk, model) is an upsert, never a duplicate. Including
    // embedding_model_version lets a new model version coexist with the old
    // during a rolling re-embed; the retrieval service filters by the
    // current version at query time.
    uniqueIndex('embeddings_dedup_idx').on(
      t.accountId,
      t.sourceType,
      t.sourceId,
      t.chunkIdx,
      t.embeddingModelVersion,
    ),
    // The vector index. HNSW + cosine operator class per CONTEXT.md.
    // drizzle-kit emits: CREATE INDEX ... USING hnsw (embedding vector_cosine_ops).
    index('embeddings_hnsw_idx').using('hnsw', t.embedding.op('vector_cosine_ops')),
  ],
);

export type EmbeddingRow = typeof embeddings.$inferSelect;
export type EmbeddingInsert = typeof embeddings.$inferInsert;
