/**
 * embed-memory Inngest function (Plan 02-04 / KNW-04b).
 *
 * Trigger: 'memory.confirmed' event emitted by src/server/routers/memory.ts
 * immediately after a successful confirmDraft mutation.
 *
 * Concurrency: per-tenant cap of 3 concurrent runs (Voyage rate-limit and
 * connection-pool friendly). The cap key is event.data.accountId.
 *
 * Retries: max 2 (Inngest default would be 4; tuned down because every retry
 * is a Voyage call cost). Final-failure path writes a Sentry breadcrumb and
 * exits cleanly — no throw past the step boundary.
 *
 * TOCTOU lock semantics (cycle-1 review fix HIGH #5 — explicit boundary):
 *   Inngest `step.run` boundaries do NOT participate in one shared DB transaction.
 *   Each `step.run` is independent; only the body of a given step.run can run inside
 *   a DB transaction. The atomic guarantee in this function is therefore narrow:
 *
 *     Step 1 (load-and-chunk)              — NO DB lock; ordinary SELECT
 *     Step 2 (voyage-embed-batch-*)         — NO DB lock; HTTP only
 *     Step 3 (upsert-embeddings)           — INSIDE a single DB transaction:
 *        3a. SELECT business_memory.lastUpdatedAt FOR SHARE — row-level read lock
 *        3b. Compare against event.data.lastUpdatedAt (captured at event-emit time)
 *        3c. If drifted → EMBED_TOCTOU_STALE breadcrumb + return 0 (newer
 *            memory.confirmed will re-trigger from scratch)
 *        3d. If match → DELETE existing embeddings rows for (account, memory,
 *            source_id, model_version) and INSERT freshly-computed chunks.
 *
 *   The atomicity invariant is "compare current lastUpdatedAt immediately before
 *   write," NOT "lock the row across the whole function." Between Steps 1 and 3,
 *   a concurrent confirmDraft CAN update business_memory.lastUpdatedAt; that's
 *   exactly the race the TOCTOU compare catches. Step 3's transaction holds the
 *   row read-locked from 3a through 3d, so the DELETE-then-INSERT happens against
 *   a stable lastUpdatedAt observation.
 *
 * Idempotency + stale-chunk replacement (review cycle 1 fix — CRITICAL #4):
 *   Inside the upsert-embeddings transaction, AFTER the lastUpdatedAt match,
 *   the function executes:
 *     1. DELETE FROM embeddings WHERE account_id=? AND source_type='memory'
 *        AND source_id=? AND embedding_model_version=?
 *     2. INSERT ... (the freshly computed chunks)
 *   This is necessary because re-confirmed business_memory with changed content
 *   under the same dedup key would otherwise leave stale chunk_text in place
 *   (ON CONFLICT DO NOTHING does NOT update). It also removes orphaned higher
 *   `chunk_idx` rows when new content has fewer chunks than the prior version.
 *   The DELETE scope is narrow: account_id + source_type='memory' + source_id +
 *   embedding_model_version — never touches corpus rows, never touches other
 *   tenants, never touches rows under a different model version (rolling
 *   re-embed contract from Plan 02-01 preserved).
 *
 * What gets embedded (memory-answerable T1 — DESIGN REVERSAL):
 *   `buildMemoryChunks(row)` emits one LABELED chunk per populated field —
 *   scalar facets (companyName, oneLiner, sector, stage, geography,
 *   incorporationStatus, foundingDate) PLUS the narrative beats and traction
 *   metrics. The earlier design embedded ONLY narrative.* + traction.{growth,
 *   runway} as a single concatenated blob and deliberately EXCLUDED the scalars
 *   ("FTS handles the relational side"). That was the root cause of the
 *   unanswerable Q&A: facet queries scored 0.42-0.49 cosine against the diluted
 *   blob (under the 0.6 floor), and the excluded scalars were absent from every
 *   chunk_text so the FTS side couldn't match them either. Labels now lift BOTH
 *   the vector score (short single-fact chunks) AND the FTS keyword match. See
 *   src/ai/chunking/memory-chunks.ts.
 */
import * as Sentry from '@sentry/nextjs';
import { and, eq } from 'drizzle-orm';

import { buildMemoryChunks } from '@/ai/chunking/memory-chunks';
import { voyage } from '@/ai/integrations/voyage.adapter';
// Canonical Inngest db pattern (cycle-6 fix HIGH H2): src/db/client.ts exports
// `getServiceClient(): DrizzleDb` — there is no `db` named export. Inngest job
// functions are documented legitimate callers of the RLS-bypassing service client
// (see src/db/client.ts header §"getServiceClient" callers list) because the job
// carries an explicit tenantId and re-asserts it in WHERE clauses. The reference
// implementation is src/inngest/functions/purge-soft-deleted.ts:44 which calls
// `getServiceClient()` inline inside `step.run`. We bind once at function-body
// top because the client is a memoized singleton (idempotent across calls) and
// multiple steps need it.
import { getServiceClient, type DrizzleDb } from '@/db/client';
import { embeddings } from '@/db/schema/embeddings';
import { businessMemory } from '@/db/schema/memory';

import { inngest } from '../client';

// Cycle-7 fix HIGH H1 — Inngest v4 createFunction is 2-arg form: (options, handler).
// The `triggers` field is embedded in the options object (see canonical pattern at
// src/inngest/functions/purge-soft-deleted.ts:40-47 and the SDK type at
// node_modules/inngest/components/Inngest.d.ts:518 — `(options, handler) =>`).
// Earlier drafts split trigger into a 3rd positional arg, which would not typecheck.
export const embedMemory = inngest.createFunction(
  {
    id: 'embed-memory',
    name: 'Embed confirmed business_memory into pgvector',
    concurrency: { limit: 3, key: 'event.data.accountId' },
    retries: 2,
    triggers: [{ event: 'memory.confirmed' }],
  },
  async ({ event, step }) => {
    const { accountId, businessMemoryId, lastUpdatedAt: emittedAt } = event.data as {
      accountId: string;
      businessMemoryId: string;
      lastUpdatedAt: string;
    };
    const db: DrizzleDb = getServiceClient(); // memoized; re-assert accountId in every WHERE below

    // Step 1 — load row + flatten + chunk
    const chunks = await step.run('load-and-chunk', async () => {
      const [row] = await db
        .select()
        .from(businessMemory)
        .where(and(eq(businessMemory.id, businessMemoryId), eq(businessMemory.accountId, accountId)));

      if (!row || !row.confirmedAt) {
        Sentry.addBreadcrumb({
          category: 'embed-memory',
          message: 'EMBED_ROW_MISSING_OR_UNCONFIRMED',
          level: 'warning',
          data: { accountId, businessMemoryId },
        });
        return [];
      }

      // Build field-aligned, LABELED chunks (memory-answerable T1 — replaces the
      // old single-blob flatten). The prior surface concatenated narrative.* +
      // traction.{growth,runway} into ONE string and embedded NO scalar facets
      // (sector/stage/companyName/geography) — so the narrative collapsed to a
      // single ~3200-char chunk (measured facet cosine 0.42-0.49, under the 0.6
      // grounding floor) AND "what sector/stage?" landed in no chunk_text, so the
      // FTS side (which reads chunk_text) couldn't match them either.
      // buildMemoryChunks now emits one LABELED chunk per populated field
      // ("Stage: Pre-seed", "What the company does: …"), long prose fields
      // sub-chunked + relabeled — so a short facet query aligns to a short
      // single-fact chunk on BOTH the vector and FTS sides. See
      // src/ai/chunking/memory-chunks.ts.
      // Drizzle types row.narrative/.traction as `unknown` (the `.$type<T>()`
      // schema annotation is deferred to FOLLOWUP-DRIZZLE-TYPE-ANNOTATION-01);
      // buildMemoryChunks casts at its own access sites so this compiles under
      // strict:true without touching the git-frozen schema.
      const all = buildMemoryChunks(row);

      if (all.length === 0) {
        Sentry.addBreadcrumb({
          category: 'embed-memory',
          message: 'EMBED_NOTHING_TO_EMBED',
          level: 'info',
          data: { accountId, businessMemoryId },
        });
        return [];
      }

      // Hard cap — defensive bound; flag overflow at observability boundary
      if (all.length > 64) {
        Sentry.addBreadcrumb({
          category: 'embed-memory',
          message: 'EMBED_CHUNK_OVERFLOW',
          level: 'warning',
          data: { accountId, businessMemoryId, chunkCount: all.length },
        });
      }

      return all.slice(0, 64);
    });

    if (chunks.length === 0) return { ok: true, chunks: 0 };

    // Step 2 — Voyage embed (batches of 8)
    const embedded: Array<{ idx: number; text: string; vector: number[]; tokenCount: number }> = [];
    for (let i = 0; i < chunks.length; i += 8) {
      const batch = chunks.slice(i, i + 8);
      const result = await step.run(`voyage-embed-batch-${i}`, async () => {
        try {
          return await voyage.embed({
            texts: batch.map((c) => c.text),
            inputType: 'document',
            trace: { accountId, sourceType: 'memory', sourceId: businessMemoryId },
          });
        } catch (err) {
          Sentry.addBreadcrumb({
            category: 'embed-memory',
            message: 'EMBED_VOYAGE_FAILED',
            level: 'error',
            data: {
              accountId,
              businessMemoryId,
              batchStart: i,
              // B / codex#3 / CSO-H2: log the Voyage AppError's TYPED code (content-
              // blind, e.g. VOYAGE_NETWORK_FAILED), never err.message — message could
              // carry chunk text and Sentry's key-based scrub does NOT redact
              // breadcrumb data strings.
              code: (err as { code?: string }).code ?? 'UNKNOWN',
            },
          });
          throw err; // let Inngest retry (max 2)
        }
      });

      batch.forEach((c, j) => {
        embedded.push({
          idx: c.idx,
          text: c.text,
          vector: result.embeddings[j],
          tokenCount: c.tokenCount,
        });
      });
    }

    // Step 3 — TOCTOU re-read + atomic upsert
    const written = await step.run('upsert-embeddings', async () => {
      return await db.transaction(async (tx) => {
        // TOCTOU re-read: get current lastUpdatedAt under FOR SHARE lock
        const [current] = await tx
          .select({ lastUpdatedAt: businessMemory.lastUpdatedAt })
          .from(businessMemory)
          .where(and(eq(businessMemory.id, businessMemoryId), eq(businessMemory.accountId, accountId)))
          .for('share');

        if (!current) {
          Sentry.addBreadcrumb({
            category: 'embed-memory',
            message: 'EMBED_ROW_GONE',
            level: 'warning',
            data: { accountId, businessMemoryId },
          });
          return 0;
        }

        if (current.lastUpdatedAt.getTime() !== new Date(emittedAt).getTime()) {
          Sentry.addBreadcrumb({
            category: 'embed-memory',
            message: 'EMBED_TOCTOU_STALE',
            level: 'info',
            data: {
              accountId,
              businessMemoryId,
              emittedAt: new Date(emittedAt).toISOString(),
              currentAt: current.lastUpdatedAt.toISOString(),
            },
          });
          return 0; // newer memory.confirmed will re-trigger
        }

        // Atomic DELETE-then-INSERT (cycle-1 review fix CRITICAL #4):
        // ON CONFLICT DO NOTHING cannot replace stale chunk_text under the same
        // dedup key. We delete the prior chunks for (account, source_type='memory',
        // source_id, embedding_model_version) and then insert fresh chunks. This
        // also drops orphaned higher chunk_idx rows when new content has fewer
        // chunks than the previous version. Both operations are inside the same
        // transaction with the FOR SHARE lock from the lastUpdatedAt re-read,
        // so the DELETE is safe against a concurrent re-confirm (the next
        // memory.confirmed would block until this tx commits or fail TOCTOU).

        await tx
          .delete(embeddings)
          .where(
            and(
              eq(embeddings.accountId, accountId),
              eq(embeddings.sourceType, 'memory'),
              eq(embeddings.sourceId, businessMemoryId),
              eq(embeddings.embeddingModelVersion, voyage.model),
            ),
          );

        await tx.insert(embeddings).values(
          embedded.map((e) => ({
            accountId,
            sourceType: 'memory' as const,
            sourceId: businessMemoryId,
            chunkText: e.text,
            chunkIdx: e.idx,
            embedding: e.vector,
            embeddingModelVersion: voyage.model,
            tokenCount: e.tokenCount,
          })),
        );

        return embedded.length;
      });
    });

    return { ok: true, chunks: written };
  },
);
