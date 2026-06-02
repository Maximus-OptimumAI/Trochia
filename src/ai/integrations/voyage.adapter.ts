/**
 * Voyage embeddings adapter (Plan 02-04 / KNW-04b).
 *
 * The ONLY surface that calls api.voyageai.com. Used by:
 *   - src/inngest/functions/embed-memory.ts  (business_memory chunks)
 *   - (future) src/inngest/functions/corpus-sync.ts   (curated corpus chunks — deferred to FOLLOWUP-CORPUS-SYNC-01)
 *   - (future) src/ai/rag/retrieve.ts        (query embedding side; Plan 02-06)
 *
 * Why a SEPARATE adapter (not routed through src/ai/client.ts):
 *   src/ai/client.ts is the Anthropic chokepoint and ESLint-fenced — see
 *   tasks/constraints.md "All Anthropic API calls via ai/client.ts chokepoint".
 *   Voyage is a different vendor with a different SDK shape, different auth,
 *   different rate-limits, and different observability needs. Routing it through
 *   client.ts would dilute the Anthropic-specific guarantees (model tiering,
 *   prompt caching, Langfuse trace shape). Adapter pattern keeps each vendor's
 *   concerns separate.
 *
 * Trace whitelist (privacy contract — Plan 02-04 §must_haves):
 *   Langfuse trace payload includes ONLY:
 *     { account_id, source_type, source_id, chunk_count, input_type,
 *       token_count, embedding_model_version, latency_ms }
 *   NEVER includes chunk_text, draft field values, or PII. Unit tests
 *   (voyage.adapter.test.ts Case 8 + 8b) pin this by sentinel-string
 *   assertion AND exact-key-set assertion (defense in depth).
 */
import {
  refundReservation,
  reserveWithinDailyCap,
  settleSpend,
  type Reservation,
} from '@/ai/cost/cap';
import { voyageMicroUsd, voyageReserveMicroUsd } from '@/ai/cost/rates';
import { env } from '@/lib/env';
import { AppError } from '@/lib/errors';
import { getLangfuseClient } from '@/lib/langfuse';

const VOYAGE_ENDPOINT = 'https://api.voyageai.com/v1/embeddings';
const VOYAGE_MODEL = 'voyage-3-large' as const;
const VOYAGE_DIM = 1024 as const;
const REQUEST_TIMEOUT_MS = 30_000;

export type VoyageInputType = 'document' | 'query';

/**
 * Cycle-1 fix MEDIUM (Langfuse whitelist type-pinned): the trace metadata keys
 * are derived from a const tuple so adding a key later requires updating BOTH
 * the tuple AND the type. Construction goes through `buildTraceMetadata` which
 * rejects extra keys at compile time. Test Case 8b also asserts the exact key
 * set at runtime — defense in depth.
 */
export const TRACE_METADATA_KEYS = [
  'account_id',
  'source_type',
  'source_id',
  'chunk_count',
  'input_type',
  'token_count',
  'embedding_model_version',
  'latency_ms',
] as const;

export type TraceMetadataKey = (typeof TRACE_METADATA_KEYS)[number];

export type TraceMetadata = {
  [K in TraceMetadataKey]?: string | number;
};

export type VoyageEmbedInput = {
  texts: string[];
  inputType: VoyageInputType;
  /** Trace metadata — required for the privacy-bounded Langfuse payload */
  trace: {
    accountId: string;
    // OD-4 (Plan 02-06): widened to include 'query' so the read-path query embed
    // (src/ai/rag/retrieve.ts) traces HONESTLY as source_type:'query' instead of a
    // false 'memory'. Additive union widening ONLY — TRACE_METADATA_KEYS and
    // buildTraceMetadata are UNCHANGED (Case 8b pins the exact KEY set, not the
    // value domain, so the existing adapter tests stay green).
    sourceType: 'memory' | 'corpus' | 'interaction' | 'query';
    sourceId: string;
  };
};

/**
 * Strip any keys not in TRACE_METADATA_KEYS (defensive — caller types already
 * prevent this, but a runtime strip protects against any future refactor that
 * loosens the type).
 */
function buildTraceMetadata(meta: TraceMetadata): TraceMetadata {
  const out: TraceMetadata = {};
  for (const key of TRACE_METADATA_KEYS) {
    if (meta[key] !== undefined) out[key] = meta[key];
  }
  return out;
}

export type VoyageEmbedResult = {
  embeddings: number[][]; // shape: [texts.length][1024]
  tokenCount: number;
  modelVersion: typeof VOYAGE_MODEL;
  latencyMs: number;
};

export const voyage = {
  model: VOYAGE_MODEL,
  dim: VOYAGE_DIM,

  async embed(input: VoyageEmbedInput): Promise<VoyageEmbedResult> {
    // Cycle-7 fix HIGH H3 (6 AppError sites in this function): src/lib/errors.ts
    // AppError signature is `(message: string, opts?: { status?, code?, cause? })`.
    // Plan drafts 1-5 had `('CODE', 'message')` — args flipped, type-error at all 6 sites.
    if (input.texts.length === 0) {
      throw new AppError('voyage.embed called with zero texts', { code: 'VOYAGE_INPUT_EMPTY' });
    }
    if (input.texts.length > 8) {
      // Hard cap for HNSW-warming latency tuning; bumped at Plan 02-06 if needed
      throw new AppError(
        `voyage.embed called with ${input.texts.length} texts; max 8 per call`,
        { code: 'VOYAGE_BATCH_OVERSIZED' },
      );
    }

    // Runtime guard for the env var: VOYAGE_API_KEY is `.optional()` in the
    // Zod env schema for THIS plan (T08 flips it to required-in-prod after the
    // prod env is populated). Module-load works without the key (so tests
    // importing the adapter don't crash); attempting an actual embed without
    // the key throws here.
    if (!env.VOYAGE_API_KEY) {
      throw new AppError('VOYAGE_API_KEY not set; voyage.embed cannot run', {
        code: 'VOYAGE_API_KEY_MISSING',
      });
    }

    // ── Cost cap (Plan 02-07 / OD-3 / OD-4 / P1-B / P2-C) ──
    // RESERVE the UPPER-BOUND cost of this embed batch BEFORE the fetch. The reserve is a
    // UTF-8 byte-length sum over the ACTUAL input.texts batch (≤8) — a token is ≥1 byte so
    // byte-length ≥ token-count ALWAYS (P1-B); never char/4, never a 1-query ceiling. Gates
    // BOTH inputType:'query' (read) AND 'document' (write) — the shared daily ledger (OD-4).
    // SETTLE-or-REFUND runs in a `finally` keyed on the reservation token's usageDate (P2-C):
    // success → settle to json.usage.total_tokens; a pre-fetch throw → full refund.
    const reservation: Reservation = await reserveWithinDailyCap(
      input.trace.accountId,
      voyageReserveMicroUsd(input.texts),
    );
    let settledTokens: number | undefined;

    try {
      return await this.embedAfterReserve(input, reservation, (tokens) => {
        settledTokens = tokens;
      });
    } finally {
      if (settledTokens === undefined) {
        await refundReservation(reservation);
      } else {
        await settleSpend(reservation, voyageMicroUsd(settledTokens));
      }
    }
  },

  /**
   * The fetch-onward body, fenced off so the RESERVE/SETTLE `finally` in `embed` wraps the
   * entire provider call. `onTokens(total_tokens)` reports the actual usage to the settle
   * path; if it is never called (a pre-settle throw) the reservation is fully refunded.
   */
  async embedAfterReserve(
    input: VoyageEmbedInput,
    _reservation: Reservation,
    onTokens: (totalTokens: number) => void,
  ): Promise<VoyageEmbedResult> {
    const t0 = Date.now();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    let response: Response;
    try {
      response = await fetch(VOYAGE_ENDPOINT, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${env.VOYAGE_API_KEY}`,
        },
        body: JSON.stringify({
          model: VOYAGE_MODEL,
          input: input.texts,
          input_type: input.inputType,
          truncation: false,
        }),
        signal: controller.signal,
      });
    } catch (err) {
      // CSO-H2 / codex P1-2: for a query embed, redact the error message AND drop
      // `cause` — both can carry the founder's CONFIDENTIAL query, which would reach
      // Sentry unscrubbed. Document embeds keep the network-error detail.
      const isQuery = input.inputType === 'query';
      throw new AppError(
        isQuery
          ? 'voyage query embed failed (network)'
          : err instanceof Error
            ? err.message.slice(0, 200)
            : 'unknown',
        isQuery ? { code: 'VOYAGE_NETWORK_FAILED' } : { code: 'VOYAGE_NETWORK_FAILED', cause: err },
      );
    } finally {
      clearTimeout(timeout);
    }

    if (!response.ok) {
      // CSO-H2 / codex P1-2: for a query embed, do NOT include the response body —
      // a provider 400/429 can echo the query text. Status is safe; body is only
      // surfaced for document embeds.
      const isQuery = input.inputType === 'query';
      const body = isQuery ? '' : (await response.text().catch(() => '')).slice(0, 200);
      throw new AppError(
        isQuery ? `voyage query embed failed (status ${response.status})` : `voyage ${response.status}: ${body}`,
        { code: 'VOYAGE_BATCH_FAILED' },
      );
    }

    const json = (await response.json()) as {
      data: Array<{ embedding: number[]; index: number }>;
      usage: { total_tokens: number };
    };

    // The provider has billed — report the ACTUAL usage so the cost-cap `finally` SETTLES
    // (rather than refunds) even if a downstream count/dim assertion throws below (the spend
    // already happened). P2-C: settle to actual on a post-call throw, never refund it.
    onTokens(json.usage.total_tokens);

    // Re-order by `index` to match input order (Voyage returns by index;
    // defensive sort — Case 2 in the test suite reverses indices and pins
    // this behavior).
    const ordered = [...json.data].sort((a, b) => a.index - b.index);
    const embeddingsOut = ordered.map((e) => e.embedding);

    // Count assertion (CSO-M2 / codex P2-2): one embedding per input, BEFORE use,
    // so an empty/short `data` 200 can't send `undefined` downstream (e.g. into
    // cosineDistance). The count is not sensitive — safe to surface for any embed.
    if (embeddingsOut.length !== input.texts.length) {
      throw new AppError(
        `expected ${input.texts.length} embeddings, got ${embeddingsOut.length}`,
        { code: 'VOYAGE_COUNT_MISMATCH' },
      );
    }

    // Dim assertion — surfaces config drift loudly
    for (const e of embeddingsOut) {
      if (e.length !== VOYAGE_DIM) {
        throw new AppError(
          `expected ${VOYAGE_DIM} dims, got ${e.length}`,
          { code: 'VOYAGE_DIM_MISMATCH' },
        );
      }
    }

    const latencyMs = Date.now() - t0;

    // Langfuse trace — privacy-bounded payload (no chunk_text). Both `input`
    // and `output` are constructed through buildTraceMetadata which strips
    // any key not in TRACE_METADATA_KEYS. Test Case 8 asserts sentinel
    // absence; Case 8b asserts the exact key set (review cycle 1 fix
    // MEDIUM Langfuse-whitelist type-pin). `getLangfuseClient()` returns
    // null when LANGFUSE_PUBLIC_KEY/SECRET_KEY/HOST are unset (preview-only
    // until prod env populated) — guard before calling .trace() (cycle-7
    // fix HIGH H1). Case 8c pins the null-Langfuse no-op backstop.
    const langfuse = getLangfuseClient();
    if (langfuse) {
      langfuse.trace({
        name: 'voyage.embed',
        input: buildTraceMetadata({
          account_id: input.trace.accountId,
          source_type: input.trace.sourceType,
          source_id: input.trace.sourceId,
          chunk_count: input.texts.length,
          input_type: input.inputType,
        }),
        output: buildTraceMetadata({
          token_count: json.usage.total_tokens,
          embedding_model_version: VOYAGE_MODEL,
          latency_ms: latencyMs,
        }),
      });
    }

    return {
      embeddings: embeddingsOut,
      tokenCount: json.usage.total_tokens,
      modelVersion: VOYAGE_MODEL,
      latencyMs,
    };
  },
};
