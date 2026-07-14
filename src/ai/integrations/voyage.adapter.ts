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
import { logger } from '@/lib/logger';

const VOYAGE_ENDPOINT = 'https://api.voyageai.com/v1/embeddings';
const VOYAGE_MODEL = 'voyage-3-large' as const;
const VOYAGE_DIM = 1024 as const;
const REQUEST_TIMEOUT_MS = 30_000;

// ── Retry policy (mirrors the Anthropic SDK client's retry pattern) ──────────
// The Anthropic client in src/ai/client.ts leans on the SDK's built-in retry
// (default maxRetries: 2 → up to 3 attempts) with exponential backoff + jitter,
// honoring Retry-After. Voyage is called through raw `fetch`, so it has no such
// built-in; this reproduces the same shape for the capacity-signal statuses.
//
// We retry ONLY on rate-limit / overload statuses (429 + the overload 5xx: 502
// Bad Gateway, 503 Unavailable, 529 Overloaded). A 4xx other than 429 is a
// caller/input error and is NOT retried; a network throw is NOT retried (it
// keeps the existing single-attempt VOYAGE_NETWORK_FAILED contract).
//
// PRIVACY (CSO-H2): the retry decision reads ONLY the numeric status and the
// Retry-After HEADER, never `response.text()`, whose body can echo the query or
// a document chunk. Same content-blind guarantee the throw paths already hold.
const MAX_RETRIES = 2; // → up to 3 total attempts, matching the Anthropic default
const RETRY_BASE_MS = 500;
const RETRY_MAX_MS = 8_000;
const RETRYABLE_STATUSES = new Set([429, 502, 503, 529]);

/**
 * Backoff for attempt N (0-indexed): exponential (`base·2^N`, capped) with full
 * jitter, floored to `Retry-After` when the server sent one. Content-blind: it
 * only ever sees the numeric attempt count and the Retry-After header value.
 *
 * Zeroed under Vitest (`process.env.VITEST`) so the unit suite exercises the
 * retry CONTROL FLOW with no real waits; the eval runner (tsx) and production
 * both leave VITEST unset and get the real backoff.
 */
function retryDelayMs(attempt: number, retryAfterHeader: string | null): number {
  if (process.env.VITEST) return 0;
  const expo = Math.min(RETRY_BASE_MS * 2 ** attempt, RETRY_MAX_MS);
  const jittered = expo * (0.5 + Math.random() * 0.5); // jitter in [0.5, 1.0]×
  const retryAfterMs = parseRetryAfterMs(retryAfterHeader);
  return Math.min(Math.max(jittered, retryAfterMs), RETRY_MAX_MS);
}

/** Parse a `Retry-After` header (delta-seconds or HTTP-date) to ms; 0 if absent/invalid. */
function parseRetryAfterMs(header: string | null): number {
  if (!header) return 0;
  const seconds = Number(header);
  if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000);
  const dateMs = Date.parse(header);
  if (Number.isFinite(dateMs)) return Math.max(0, dateMs - Date.now());
  return 0;
}

function sleep(ms: number): Promise<void> {
  return ms > 0 ? new Promise((resolve) => setTimeout(resolve, ms)) : Promise.resolve();
}

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

    // Retry loop (mirrors the Anthropic SDK client's pattern; see RETRY_* above):
    // up to MAX_RETRIES backoff retries on a capacity status (429 + overload 5xx).
    // A fresh AbortController + 30s timeout is minted PER attempt (an aborted
    // controller cannot be reused, and each attempt gets its own request budget).
    let response: Response;
    let attempt = 0;
    for (;;) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
      let attemptResponse: Response;
      try {
        attemptResponse = await fetch(VOYAGE_ENDPOINT, {
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
      } catch {
        // B / codex#3 / CSO-H2: redact for BOTH inputType. The 02-06 fix covered
        // query only; document embeds (write path) carry chunk text in input.texts,
        // and err.message/cause can echo it into Sentry unscrubbed. Static message,
        // NO message, NO cause, for both query + document. Network throws are NOT
        // retried (the 429/5xx backoff is the scoped change; the single-attempt
        // network contract is unchanged (Case 6 / Case 12).
        throw new AppError('voyage embed failed (network)', { code: 'VOYAGE_NETWORK_FAILED' });
      } finally {
        clearTimeout(timeout);
      }

      if (attemptResponse.ok) {
        response = attemptResponse;
        break;
      }

      // Non-2xx. Retry (backoff) on a capacity status while retries remain;
      // otherwise throw. CSO-H2: status + Retry-After HEADER only, body NEVER read.
      if (RETRYABLE_STATUSES.has(attemptResponse.status) && attempt < MAX_RETRIES) {
        const delayMs = retryDelayMs(attempt, attemptResponse.headers.get('retry-after'));
        // Content-blind log: numeric status + attempt + delay only (no body, no input).
        logger.warn('voyage.embed: retryable status, backing off', {
          status: attemptResponse.status,
          attempt: attempt + 1,
          maxRetries: MAX_RETRIES,
          delayMs,
        });
        attempt += 1;
        await sleep(delayMs);
        continue;
      }

      // B / codex#3 / CSO-H2: do NOT read response.text() for EITHER inputType —
      // a provider 400/429 can echo the query OR the document chunk text in the
      // body. Status only, no body, for both query + document.
      throw new AppError(`voyage embed failed (status ${attemptResponse.status})`, {
        code: 'VOYAGE_BATCH_FAILED',
      });
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
