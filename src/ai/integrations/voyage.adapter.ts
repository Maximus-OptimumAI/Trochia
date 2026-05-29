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
    sourceType: 'memory' | 'corpus' | 'interaction';
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
      throw new AppError(
        err instanceof Error ? err.message.slice(0, 200) : 'unknown',
        { code: 'VOYAGE_NETWORK_FAILED', cause: err },
      );
    } finally {
      clearTimeout(timeout);
    }

    if (!response.ok) {
      const body = (await response.text().catch(() => '')).slice(0, 200);
      throw new AppError(
        `voyage ${response.status}: ${body}`,
        { code: 'VOYAGE_BATCH_FAILED' },
      );
    }

    const json = (await response.json()) as {
      data: Array<{ embedding: number[]; index: number }>;
      usage: { total_tokens: number };
    };

    // Re-order by `index` to match input order (Voyage returns by index;
    // defensive sort — Case 2 in the test suite reverses indices and pins
    // this behavior).
    const ordered = [...json.data].sort((a, b) => a.index - b.index);
    const embeddingsOut = ordered.map((e) => e.embedding);

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
