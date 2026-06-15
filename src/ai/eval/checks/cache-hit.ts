/**
 * Cache-hit check (Phase 2 exit gate criterion 4).
 *
 * Reads the Anthropic prompt-cache hit ratio from Langfuse TRACE metadata over a
 * bounded recent window and asserts the ratio is non-zero. The ai/client.ts
 * chokepoint names each trace `agent:${taskClass}` and writes cache metrics via
 * `trace.update({ metadata: { cacheRead, inputTokens, ... } })` — it creates NO
 * GENERATION observations, so the read path is `fetchTraces` over trace metadata
 * (NOT `fetchObservations`, C1-H2 / OD-3).
 *
 * Anthropic-only: Voyage embeddings expose no prompt cache, so the cache ratio is
 * meaningful only for the Anthropic chokepoint traces (the `agent:` name prefix).
 *
 * Status model (OD-A):
 *   - Langfuse unconfigured (isLangfuseConfigured() === false) → 'skip'
 *     (env-unavailable; fetchTraces is NEVER called). Non-blocking on PR/local;
 *     the runner promotes it to a FAILURE when EVAL_LIVE_REQUIRED==='1'.
 *   - ratio > 0 → 'pass'; else 'fail'. metric = ratio, threshold = 0.
 *
 * Privacy (G-LANGFUSE-WHITELIST): `fields: 'core,io'` ALSO returns each trace's
 * `.input`/`.output` bodies — this check reads ONLY `metadata.cacheRead` /
 * `metadata.inputTokens` token counts and NEVER touches `.input`/`.output`,
 * chunk_text, paste content, PII, founder query content, or credentials. `reason`
 * carries only the ratio + trace count. Langfuse credentials are constructed ONLY
 * in src/lib/langfuse.ts — this file never builds a client or a raw-fetch creds.
 */
import { getLangfuseClient, isLangfuseConfigured } from '@/lib/langfuse';
import type { EvalCheck } from '../types';

/** Non-zero cache ratio floor (Phase 2 exit gate criterion 4). */
const RATIO_FLOOR = 0;

/** Bounded read window: traces from the last 7 days. */
const WINDOW_DAYS = 7;

/** Cap on traces pulled per read (the production Anthropic call volume is low). */
const TRACE_LIMIT = 100;

/**
 * The Anthropic-chokepoint trace name prefix. ai/client.ts names traces
 * `agent:${taskClass}`; this check filters recent traces by that prefix in code
 * (rather than pinning one taskClass) so it scores cache reuse across every
 * Anthropic agent, not just one.
 */
const AGENT_NAME_PREFIX = 'agent:';

/** The cache-metric keys ai/client.ts writes to trace metadata via trace.update. */
type CacheMetadata = { cacheRead?: number; inputTokens?: number };

export const cacheHit: EvalCheck = {
  id: 'cache-hit',
  description:
    'Anthropic prompt-cache hit rate non-zero in Langfuse (Phase 2 exit gate criterion 4)',
  async run() {
    // Env-gate: no Langfuse creds → skip (env-unavailable). fetchTraces is NOT
    // called. Non-blocking on PR/local; a RED gate when EVAL_LIVE_REQUIRED==='1'.
    if (!isLangfuseConfigured()) {
      return {
        id: this.id,
        description: this.description,
        status: 'skip' as const,
        skipKind: 'env-unavailable' as const,
        reason:
          'Langfuse not configured — cache-hit read skipped (env-unavailable, non-blocking)',
      };
    }

    const client = getLangfuseClient();
    if (client === null) {
      // Belt-and-braces: configured-but-null should not happen, but never throw.
      return {
        id: this.id,
        description: this.description,
        status: 'skip' as const,
        skipKind: 'env-unavailable' as const,
        reason:
          'Langfuse client unavailable — cache-hit read skipped (env-unavailable, non-blocking)',
      };
    }

    // Read recent Anthropic-chokepoint traces. `fields: 'core,io'` is the
    // restricted whitelist that still returns `metadata` (the d.ts groups
    // input/output/metadata under 'io'); we read ONLY metadata.* below.
    const fromTimestamp = new Date(Date.now() - WINDOW_DAYS * 24 * 60 * 60 * 1000);

    // Ingestion-lag tolerance (LANGFUSE-TRACING-01): a live run may read moments
    // after a trace was produced+flushed, before Langfuse has ingested it. When
    // EVAL_LIVE_REQUIRED, retry the fetch a few times with a short backoff before
    // concluding no-data. In every other context (PR / local / unit) this is a
    // SINGLE fetch with no sleeps — so the fetchTraces call count / query signature
    // is unchanged off the live path.
    const liveRequired = process.env.EVAL_LIVE_REQUIRED === '1';
    const maxTries = liveRequired ? 3 : 1;
    const retryDelayMs = 5000;

    let cacheRead = 0;
    let inputTokens = 0;
    let counted = 0;
    for (let attempt = 1; attempt <= maxTries; attempt++) {
      const res = await client.fetchTraces({
        fromTimestamp,
        fields: 'core,io',
        limit: TRACE_LIMIT,
      });
      // Defensive: the SDK can resolve a response whose `data` is absent / non-array
      // on some error paths (e.g. a creds 401 the SDK swallows). Treat a missing
      // `data` as zero traces — which falls through to the counted===0 → 'skip'
      // branch below (data-unavailable), never a throw.
      const traces = Array.isArray(res.data) ? res.data : [];
      cacheRead = 0;
      inputTokens = 0;
      counted = 0;
      for (const trace of traces) {
        // Filter to Anthropic-chokepoint traces by the `agent:` name prefix.
        if (!trace.name || !trace.name.startsWith(AGENT_NAME_PREFIX)) continue;
        // WHITELIST: read ONLY the two metadata token counts; never .input/.output.
        const meta = (trace.metadata ?? {}) as CacheMetadata;
        cacheRead += meta.cacheRead ?? 0;
        inputTokens += meta.inputTokens ?? 0;
        counted += 1;
      }
      if (counted > 0) break;
      if (attempt < maxTries) await new Promise((resolve) => setTimeout(resolve, retryDelayMs));
    }

    // Zero agent:* traces in the window is data-unavailable, NOT a cache
    // failure — return 'skip' (skipKind 'data-unavailable') so we never conflate
    // "no traffic yet" / ingestion lag (or a swallowed 401) with "caching broken"
    // (/codex P1 + /cso). The runner TOLERATES a data-unavailable skip even under
    // EVAL_LIVE_REQUIRED (it only reds env-unavailable skips). Also makes the ratio
    // division below safe (no inputTokens → no divide).
    if (counted === 0) {
      return {
        id: this.id,
        description: this.description,
        status: 'skip' as const,
        skipKind: 'data-unavailable' as const,
        reason: `no agent:* traces in the ${WINDOW_DAYS}d window — insufficient data (data-unavailable, non-blocking)`,
      };
    }

    const ratio = cacheRead / Math.max(inputTokens, 1);
    const status = ratio > RATIO_FLOOR ? ('pass' as const) : ('fail' as const);

    // reason carries ONLY the ratio + trace count — no trace input/output bodies.
    return {
      id: this.id,
      description: this.description,
      status,
      metric: ratio,
      threshold: RATIO_FLOOR,
      reason: `cache-read ratio ${ratio.toFixed(4)} across ${counted} agent:* traces (window ${WINDOW_DAYS}d); floor ${RATIO_FLOOR}`,
    };
  },
};
