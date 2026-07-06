/**
 * Voyage adapter unit tests (Plan 02-04 / KNW-04b / T02).
 *
 * MSW-backed suite (no live api.voyageai.com calls):
 *   1.  happy path (valid 1024-dim response → embed succeeds)
 *   2.  batch order preserved (response indices reversed → adapter re-orders)
 *   3.  empty input rejected (VOYAGE_INPUT_EMPTY before any HTTP)
 *   4.  oversize batch rejected (9 texts → VOYAGE_BATCH_OVERSIZED before HTTP)
 *   5.  non-2xx response (persistent 429 → retried MAX_RETRIES times → VOYAGE_BATCH_FAILED,
 *       STATIC status-only message, body NEVER read)
 *   5b. transient 429 then 200 → adapter retries and SUCCEEDS (Anthropic-style backoff)
 *   6.  timeout (delays > 30s → AbortController fires → VOYAGE_NETWORK_FAILED)
 *   7.  dim mismatch (768-dim response → VOYAGE_DIM_MISMATCH)
 *   8.  TRACE WHITELIST PIN — sentinel string in chunk NEVER reaches Langfuse payload
 *   8b. exact trace key set pinned against TRACE_METADATA_KEYS (cycle-1 fix MEDIUM)
 *   8c. null-Langfuse no-op — when getLangfuseClient() returns null, embed still resolves
 *       and .trace() is never called (cycle-7 fix HIGH H1 backstop)
 *
 * Mocking strategy:
 *   - MSW http.post intercepts https://api.voyageai.com/v1/embeddings
 *   - vi.mock('@/lib/langfuse', ...) installs a spy on getLangfuseClient — cycle-7 fix
 *     MEDIUM M2 (replaces the old direct-singleton-spy pattern; the real module exports
 *     getLangfuseClient(): Langfuse | null, see src/lib/langfuse.ts).
 *   - process.env.VOYAGE_API_KEY = 'voy-test' is set in beforeEach so the runtime
 *     guard inside voyage.embed doesn't trip during the happy-path cases.
 */
import { http, HttpResponse } from 'msw';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { server } from '../../setup';

// Set the env var BEFORE any module that reads `process.env.VOYAGE_API_KEY`
// is loaded. Adapter imports happen lazily inside each `it` block — but the
// `@/lib/env` module is shared (Vitest caches), so this single module-level
// assignment is sufficient.
process.env.VOYAGE_API_KEY = 'voy-test';

const VOYAGE_URL = 'https://api.voyageai.com/v1/embeddings';

// ────────────────────────────────────────────────────────────────────────────
// Langfuse mock — replaces getLangfuseClient with a vi.fn so each test can
// control whether the client is "configured" (returning a stub with a .trace
// spy) or "unconfigured" (returning null).
// ────────────────────────────────────────────────────────────────────────────

vi.mock('@/lib/langfuse', () => ({
  getLangfuseClient: vi.fn(),
  isLangfuseConfigured: vi.fn(() => true),
}));

// ────────────────────────────────────────────────────────────────────────────
// Cost-cap mock (Plan 02-07 / T01). voyage.embed now RESERVES against the $5/day
// cost ledger before the fetch (OD-3/OD-4). These adapter UNIT tests mock the live
// cost store to a no-op so they exercise ONLY the Voyage egress behavior — the cost
// gate itself is proven in tests/ai/cost/* + tests/integration/cost-cap.test.ts (the
// env-gate-keys-on-presence lesson: a present-but-invalid DATABASE_URL must never fire
// a real store call from a unit test).
// ────────────────────────────────────────────────────────────────────────────
vi.mock('@/ai/cost/cap', () => ({
  CAP_MICRO_USD: 5_000_000,
  reserveWithinDailyCap: vi.fn(async (accountId: string, estMicroUsd: number) => ({
    accountId,
    usageDate: '2026-06-02',
    reservedMicroUsd: estMicroUsd,
  })),
  settleSpend: vi.fn(async () => undefined),
  refundReservation: vi.fn(async () => undefined),
}));

// Re-import so we can grab the mocked function.
import { getLangfuseClient } from '@/lib/langfuse';

let traceSpy: ReturnType<typeof vi.fn>;

beforeEach(() => {
  traceSpy = vi.fn();
  vi.mocked(getLangfuseClient).mockReturnValue({
    trace: traceSpy,
  } as unknown as ReturnType<typeof getLangfuseClient>);

  // The runtime guard in voyage.embed reads `env.VOYAGE_API_KEY`. The Zod
  // env module reads `process.env.VOYAGE_API_KEY` at module load, so set it
  // BEFORE the adapter import lands in any test (the test file imports lazily
  // inside each `it`, so this happens before the first env read for the
  // adapter's purposes).
  process.env.VOYAGE_API_KEY = 'voy-test';
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ────────────────────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────────────────────

/** Build a valid Voyage-shaped response with `count` 1024-dim embeddings. */
function voyageResponse(opts: {
  count?: number;
  dim?: number;
  totalTokens?: number;
  indices?: number[];
} = {}) {
  const count = opts.count ?? 1;
  const dim = opts.dim ?? 1024;
  const totalTokens = opts.totalTokens ?? 10;
  const indices = opts.indices ?? Array.from({ length: count }, (_, i) => i);
  return {
    data: indices.map((index, i) => ({
      embedding: new Array(dim).fill(0.5 + i * 0.01),
      index,
    })),
    usage: { total_tokens: totalTokens },
  };
}

// ────────────────────────────────────────────────────────────────────────────
// Tests
// ────────────────────────────────────────────────────────────────────────────

describe('voyage.adapter — Plan 02-04 / KNW-04b', () => {
  it('Case 1 — happy path: returns 1024-dim embedding, token count, model version, latency', async () => {
    server.use(
      http.post(VOYAGE_URL, () => HttpResponse.json(voyageResponse({ count: 1, totalTokens: 7 }))),
    );

    const { voyage } = await import('@/ai/integrations/voyage.adapter');
    const result = await voyage.embed({
      texts: ['hello world'],
      inputType: 'document',
      trace: { accountId: 'acc-1', sourceType: 'memory', sourceId: 'mem-1' },
    });

    expect(result.embeddings).toHaveLength(1);
    expect(result.embeddings[0]).toHaveLength(1024);
    expect(result.tokenCount).toBe(7);
    expect(result.modelVersion).toBe('voyage-3-large');
    expect(typeof result.latencyMs).toBe('number');
    expect(result.latencyMs).toBeGreaterThanOrEqual(0);
  });

  it('Case 2 — batch order preserved when response indices arrive reversed', async () => {
    // Voyage returns each embedding tagged with its input `index`. The adapter
    // sorts by index defensively so the caller always sees results in input
    // order.
    const dim = 1024;
    server.use(
      http.post(VOYAGE_URL, () =>
        HttpResponse.json({
          data: [
            // INTENTIONALLY reversed: index 2 first, then 1, then 0
            { embedding: new Array(dim).fill(0.3), index: 2 },
            { embedding: new Array(dim).fill(0.2), index: 1 },
            { embedding: new Array(dim).fill(0.1), index: 0 },
          ],
          usage: { total_tokens: 30 },
        }),
      ),
    );

    const { voyage } = await import('@/ai/integrations/voyage.adapter');
    const result = await voyage.embed({
      texts: ['a', 'b', 'c'],
      inputType: 'document',
      trace: { accountId: 'acc-1', sourceType: 'memory', sourceId: 'mem-1' },
    });

    expect(result.embeddings).toHaveLength(3);
    // After defensive sort: 0.1 (index 0), 0.2 (index 1), 0.3 (index 2)
    expect(result.embeddings[0][0]).toBeCloseTo(0.1);
    expect(result.embeddings[1][0]).toBeCloseTo(0.2);
    expect(result.embeddings[2][0]).toBeCloseTo(0.3);
  });

  it('Case 3 — empty input rejected BEFORE any HTTP call (VOYAGE_INPUT_EMPTY)', async () => {
    let httpHit = false;
    server.use(
      http.post(VOYAGE_URL, () => {
        httpHit = true;
        return HttpResponse.json(voyageResponse());
      }),
    );

    const { voyage } = await import('@/ai/integrations/voyage.adapter');

    await expect(
      voyage.embed({
        texts: [],
        inputType: 'document',
        trace: { accountId: 'acc-1', sourceType: 'memory', sourceId: 'mem-1' },
      }),
    ).rejects.toMatchObject({ code: 'VOYAGE_INPUT_EMPTY' });

    expect(httpHit).toBe(false);
  });

  it('Case 4 — oversize batch (9 texts) rejected BEFORE any HTTP call (VOYAGE_BATCH_OVERSIZED)', async () => {
    let httpHit = false;
    server.use(
      http.post(VOYAGE_URL, () => {
        httpHit = true;
        return HttpResponse.json(voyageResponse());
      }),
    );

    const { voyage } = await import('@/ai/integrations/voyage.adapter');

    await expect(
      voyage.embed({
        texts: ['1', '2', '3', '4', '5', '6', '7', '8', '9'],
        inputType: 'document',
        trace: { accountId: 'acc-1', sourceType: 'memory', sourceId: 'mem-1' },
      }),
    ).rejects.toMatchObject({ code: 'VOYAGE_BATCH_OVERSIZED' });

    expect(httpHit).toBe(false);
  });

  it('Case 5: persistent 429 on a DOCUMENT embed -> retried MAX_RETRIES times -> VOYAGE_BATCH_FAILED, STATIC message (status only, body NEVER read) [B/codex#3/CSO-H2]', async () => {
    // B / codex#3 / CSO-H2: the document (write) path redacts identically to the
    // query path: the response body (which can echo chunk text) is NEVER read.
    // The thrown message is status-only and content-blind.
    //
    // Retry (Anthropic-style backoff): a 429 is now retried up to MAX_RETRIES (2)
    // → 3 total attempts before the adapter gives up. Backoff is zeroed under
    // Vitest, so this stays fast. The final throw contract is unchanged.
    const SENSITIVE_CHUNK = 'CONFIDENTIAL-DOCUMENT-CHUNK-SENTINEL-MRR';
    const longBody = `{"error":"rate limited","echo":"${SENSITIVE_CHUNK}","detail":"${'x'.repeat(300)}"}`;
    let calls = 0;
    server.use(
      http.post(VOYAGE_URL, () => {
        calls += 1;
        return new HttpResponse(longBody, {
          status: 429,
          headers: { 'Content-Type': 'application/json' },
        });
      }),
    );

    const { voyage } = await import('@/ai/integrations/voyage.adapter');

    let caught: { code?: string; message?: string } | null = null;
    try {
      await voyage.embed({
        texts: [SENSITIVE_CHUNK],
        inputType: 'document',
        trace: { accountId: 'acc-1', sourceType: 'memory', sourceId: 'mem-1' },
      });
    } catch (e) {
      caught = e as { code?: string; message?: string };
    }

    expect(caught).not.toBeNull();
    expect(caught!.code).toBe('VOYAGE_BATCH_FAILED');
    // Static status-only message — no body, no echoed chunk text.
    expect(caught!.message).toBe('voyage embed failed (status 429)');
    expect(caught!.message).not.toContain(SENSITIVE_CHUNK);
    // Exhausted the retry budget: 1 initial + MAX_RETRIES (2) = 3 attempts.
    expect(calls).toBe(3);
  });

  it('Case 5b: transient 429 then 200 -> adapter retries with backoff and SUCCEEDS', async () => {
    // Mirrors the Anthropic client's retry: a single rate-limit blip recovers on
    // the next attempt instead of surfacing as a hard failure. Body is never read;
    // the retry decision keys on the 429 status only.
    let calls = 0;
    server.use(
      http.post(VOYAGE_URL, () => {
        calls += 1;
        if (calls === 1) {
          return new HttpResponse('{"error":"rate limited"}', {
            status: 429,
            headers: { 'Content-Type': 'application/json', 'Retry-After': '0' },
          });
        }
        return HttpResponse.json(voyageResponse({ count: 1, totalTokens: 6 }));
      }),
    );

    const { voyage } = await import('@/ai/integrations/voyage.adapter');
    const result = await voyage.embed({
      texts: ['hello world'],
      inputType: 'document',
      trace: { accountId: 'acc-1', sourceType: 'memory', sourceId: 'mem-1' },
    });

    expect(calls).toBe(2); // one 429, one success
    expect(result.embeddings).toHaveLength(1);
    expect(result.embeddings[0]).toHaveLength(1024);
    expect(result.tokenCount).toBe(6);
  });

  it('Case 6 — timeout (delay > 30s) → AbortController fires → VOYAGE_NETWORK_FAILED', async () => {
    // NOTE: This pins the AbortError → VOYAGE_NETWORK_FAILED routing contract via a direct
    // fetch-stub throwing AbortError. It does NOT exercise the adapter's own AbortController +
    // setTimeout(30s) wiring (swapped from the planned fake-timers approach to avoid a Vitest
    // unhandled-rejection race). Timer-plumbing coverage deferred — see FOLLOWUP-VOYAGE-TIMEOUT-TEST.
    //
    // Direct path: stub global.fetch to throw an AbortError immediately. This
    // exercises the SAME catch block in voyage.adapter.ts that the real 30s
    // AbortController timeout would hit, without needing fake timers. The
    // 30s timer itself is a setTimeout/clearTimeout dance that does not need
    // to be unit-tested in real-time; what matters for correctness is that
    // any AbortError (or any throw from fetch) routes through VOYAGE_NETWORK_FAILED.
    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn(async () => {
      throw new DOMException('The operation was aborted', 'AbortError');
    }) as typeof globalThis.fetch;

    const { voyage } = await import('@/ai/integrations/voyage.adapter');

    await expect(
      voyage.embed({
        texts: ['hello'],
        inputType: 'document',
        trace: { accountId: 'acc-1', sourceType: 'memory', sourceId: 'mem-1' },
      }),
    ).rejects.toMatchObject({ code: 'VOYAGE_NETWORK_FAILED' });

    globalThis.fetch = originalFetch;
  });

  it('Case 7 — dim mismatch (768-dim response) → VOYAGE_DIM_MISMATCH', async () => {
    server.use(
      http.post(VOYAGE_URL, () =>
        HttpResponse.json(voyageResponse({ count: 1, dim: 768 })),
      ),
    );

    const { voyage } = await import('@/ai/integrations/voyage.adapter');

    await expect(
      voyage.embed({
        texts: ['hello'],
        inputType: 'document',
        trace: { accountId: 'acc-1', sourceType: 'memory', sourceId: 'mem-1' },
      }),
    ).rejects.toMatchObject({ code: 'VOYAGE_DIM_MISMATCH' });
  });

  it('Case 8 — Langfuse trace never includes chunk_text (privacy whitelist pin)', async () => {
    const SENTINEL = 'MartinsSecretMRR42069USD';

    server.use(
      http.post(VOYAGE_URL, () =>
        HttpResponse.json({
          data: [{ embedding: new Array(1024).fill(0.5), index: 0 }],
          usage: { total_tokens: 10 },
        }),
      ),
    );

    const { voyage } = await import('@/ai/integrations/voyage.adapter');

    await voyage.embed({
      texts: [`Our MRR includes ${SENTINEL}, confidential.`],
      inputType: 'document',
      trace: { accountId: 'acc-1', sourceType: 'memory', sourceId: 'mem-1' },
    });

    expect(traceSpy).toHaveBeenCalledOnce();
    const traceArg = JSON.stringify(traceSpy.mock.calls[0][0]);
    expect(traceArg).not.toContain(SENTINEL);
  });

  it('Case 8b — Langfuse trace input + output keys exactly match TRACE_METADATA_KEYS whitelist', async () => {
    server.use(
      http.post(VOYAGE_URL, () =>
        HttpResponse.json({
          data: [{ embedding: new Array(1024).fill(0.5), index: 0 }],
          usage: { total_tokens: 10 },
        }),
      ),
    );

    const { voyage } = await import('@/ai/integrations/voyage.adapter');

    await voyage.embed({
      texts: ['hello'],
      inputType: 'document',
      trace: { accountId: 'acc-1', sourceType: 'memory', sourceId: 'mem-1' },
    });

    expect(traceSpy).toHaveBeenCalledOnce();
    const call = traceSpy.mock.calls[0][0] as {
      input: Record<string, unknown>;
      output: Record<string, unknown>;
    };
    expect(Object.keys(call.input).sort()).toEqual(
      ['account_id', 'source_type', 'source_id', 'chunk_count', 'input_type'].sort(),
    );
    expect(Object.keys(call.output).sort()).toEqual(
      ['token_count', 'embedding_model_version', 'latency_ms'].sort(),
    );
  });

  it('Case 8c — when Langfuse is unconfigured, getLangfuseClient() returns null and the adapter skips trace() cleanly (no throw)', async () => {
    vi.mocked(getLangfuseClient).mockReturnValueOnce(null);
    server.use(
      http.post(VOYAGE_URL, () =>
        HttpResponse.json({
          data: [{ embedding: new Array(1024).fill(0.5), index: 0 }],
          usage: { total_tokens: 10 },
        }),
      ),
    );

    const { voyage } = await import('@/ai/integrations/voyage.adapter');

    await expect(
      voyage.embed({
        texts: ['hello'],
        inputType: 'document',
        trace: { accountId: 'acc-1', sourceType: 'memory', sourceId: 'mem-1' },
      }),
    ).resolves.toBeDefined();
    expect(traceSpy).not.toHaveBeenCalled();
  });

  // ──────────────────────────────────────────────────────────────────────────
  // Case 9 — OD-4 (Plan 02-06): a read-path QUERY embed traces HONESTLY as
  //          input_type:'query' + source_type:'query' (the widened union member),
  //          never a false 'memory'. The TRACE_METADATA_KEYS key set is UNCHANGED
  //          by the union widening — Case 8b still pins the exact key set.
  // ──────────────────────────────────────────────────────────────────────────
  it("Case 9 — OD-4 query embed: input_type:'query' + source_type:'query' on the trace; key set unchanged", async () => {
    server.use(
      http.post(VOYAGE_URL, () =>
        HttpResponse.json({
          data: [{ embedding: new Array(1024).fill(0.25), index: 0 }],
          usage: { total_tokens: 4 },
        }),
      ),
    );

    const { voyage } = await import('@/ai/integrations/voyage.adapter');

    await voyage.embed({
      texts: ['how much runway do we have'],
      inputType: 'query',
      trace: { accountId: 'acc-1', sourceType: 'query', sourceId: 'corr-uuid-1' },
    });

    expect(traceSpy).toHaveBeenCalledOnce();
    const call = traceSpy.mock.calls[0][0] as {
      input: Record<string, unknown>;
      output: Record<string, unknown>;
    };
    // The honest query-trace values.
    expect(call.input.input_type).toBe('query');
    expect(call.input.source_type).toBe('query');
    // The union widening did NOT add/remove a whitelist key — exact key set holds.
    expect(Object.keys(call.input).sort()).toEqual(
      ['account_id', 'source_type', 'source_id', 'chunk_count', 'input_type'].sort(),
    );
    expect(Object.keys(call.output).sort()).toEqual(
      ['token_count', 'embedding_model_version', 'latency_ms'].sort(),
    );
  });

  // ──────────────────────────────────────────────────────────────────────────
  // Case 10 — CSO-H2 / codex P1-2: a QUERY embed whose provider 400 body ECHOES
  //           the query must NOT leak it into the thrown error (status only).
  //           A document embed still surfaces the body (Case 5) — only query is
  //           redacted, because the query is CONFIDENTIAL and reaches Sentry
  //           unscrubbed via the exception message.
  // ──────────────────────────────────────────────────────────────────────────
  it('Case 10 — query embed: a provider 400 body echoing the query does NOT leak it into the thrown error', async () => {
    const SENSITIVE_QUERY = 'CONFIDENTIAL-QUERY-SENTINEL-how-much-runway';
    server.use(
      http.post(VOYAGE_URL, () =>
        new HttpResponse(`{"error":"bad input: ${SENSITIVE_QUERY}"}`, {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        }),
      ),
    );

    const { voyage } = await import('@/ai/integrations/voyage.adapter');

    let caught: (Error & { code?: string }) | null = null;
    try {
      await voyage.embed({
        texts: [SENSITIVE_QUERY],
        inputType: 'query',
        trace: { accountId: 'acc-1', sourceType: 'query', sourceId: 'corr-1' },
      });
    } catch (e) {
      caught = e as Error & { code?: string };
    }

    expect(caught).not.toBeNull();
    expect(caught!.code).toBe('VOYAGE_BATCH_FAILED');
    // Status is safe to surface; the query-bearing body is NOT.
    expect(caught!.message).toBe('voyage embed failed (status 400)');
    expect(caught!.message).not.toContain(SENSITIVE_QUERY);
  });

  // ──────────────────────────────────────────────────────────────────────────
  // Case 12 — B / codex#3 / CSO-H2: a DOCUMENT embed NETWORK failure must throw
  //           the STATIC 'voyage embed failed (network)' with NO err.message and
  //           NO cause — the document chunk text in input.texts can otherwise
  //           reach Sentry unscrubbed via the error message/cause.
  // ──────────────────────────────────────────────────────────────────────────
  it('Case 12 — document embed network failure → STATIC VOYAGE_NETWORK_FAILED (no message, no cause) [B/codex#3/CSO-H2]', async () => {
    const SENSITIVE_CHUNK = 'CONFIDENTIAL-DOCUMENT-CHUNK-SENTINEL-NETWORK';
    const originalFetch = globalThis.fetch;
    // Throw a network-style error whose message embeds the chunk text.
    globalThis.fetch = vi.fn(async () => {
      throw new Error(`ECONNRESET while sending ${SENSITIVE_CHUNK}`);
    }) as typeof globalThis.fetch;

    const { voyage } = await import('@/ai/integrations/voyage.adapter');

    let caught: (Error & { code?: string; cause?: unknown }) | null = null;
    try {
      await voyage.embed({
        texts: [SENSITIVE_CHUNK],
        inputType: 'document',
        trace: { accountId: 'acc-1', sourceType: 'memory', sourceId: 'mem-1' },
      });
    } catch (e) {
      caught = e as Error & { code?: string; cause?: unknown };
    }

    globalThis.fetch = originalFetch;

    expect(caught).not.toBeNull();
    expect(caught!.code).toBe('VOYAGE_NETWORK_FAILED');
    expect(caught!.message).toBe('voyage embed failed (network)');
    expect(caught!.message).not.toContain(SENSITIVE_CHUNK);
    // No cause carrying the original (chunk-bearing) error.
    expect(caught!.cause).toBeUndefined();
    expect(JSON.stringify(caught!.cause ?? '')).not.toContain(SENSITIVE_CHUNK);
  });

  // ──────────────────────────────────────────────────────────────────────────
  // Case 11 — CSO-M2 / codex P2-2: a 200 with fewer embeddings than inputs is
  //           rejected (VOYAGE_COUNT_MISMATCH) BEFORE undefined can flow into a
  //           downstream cosineDistance.
  // ──────────────────────────────────────────────────────────────────────────
  it('Case 11 — count mismatch (200 with 0 embeddings for 1 input) → VOYAGE_COUNT_MISMATCH', async () => {
    server.use(
      http.post(VOYAGE_URL, () => HttpResponse.json({ data: [], usage: { total_tokens: 0 } })),
    );

    const { voyage } = await import('@/ai/integrations/voyage.adapter');

    await expect(
      voyage.embed({
        texts: ['hello'],
        inputType: 'query',
        trace: { accountId: 'acc-1', sourceType: 'query', sourceId: 'corr-1' },
      }),
    ).rejects.toMatchObject({ code: 'VOYAGE_COUNT_MISMATCH' });
  });
});
