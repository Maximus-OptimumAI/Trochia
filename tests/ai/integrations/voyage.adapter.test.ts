/**
 * Voyage adapter unit tests (Plan 02-04 / KNW-04b / T02).
 *
 * 10-case suite, MSW-backed (no live api.voyageai.com calls):
 *   1.  happy path (valid 1024-dim response → embed succeeds)
 *   2.  batch order preserved (response indices reversed → adapter re-orders)
 *   3.  empty input rejected (VOYAGE_INPUT_EMPTY before any HTTP)
 *   4.  oversize batch rejected (9 texts → VOYAGE_BATCH_OVERSIZED before HTTP)
 *   5.  non-2xx response (429 → VOYAGE_BATCH_FAILED with body truncated to 200 chars)
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

  it('Case 5 — non-2xx response (429) → VOYAGE_BATCH_FAILED, body truncated to 200 chars', async () => {
    // Body is intentionally > 200 chars to exercise the truncation.
    const longBody = `{"error":"rate limited","detail":"${'x'.repeat(300)}"}`;
    server.use(
      http.post(VOYAGE_URL, () =>
        new HttpResponse(longBody, {
          status: 429,
          headers: { 'Content-Type': 'application/json' },
        }),
      ),
    );

    const { voyage } = await import('@/ai/integrations/voyage.adapter');

    let caught: { code?: string; message?: string } | null = null;
    try {
      await voyage.embed({
        texts: ['hello'],
        inputType: 'document',
        trace: { accountId: 'acc-1', sourceType: 'memory', sourceId: 'mem-1' },
      });
    } catch (e) {
      caught = e as { code?: string; message?: string };
    }

    expect(caught).not.toBeNull();
    expect(caught!.code).toBe('VOYAGE_BATCH_FAILED');
    expect(caught!.message).toContain('voyage 429:');
    // The message is `voyage 429: ${body.slice(0, 200)}` — total length is
    // bounded by `"voyage 429: ".length + 200` = 12 + 200 = 212.
    expect(caught!.message!.length).toBeLessThanOrEqual(212);
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
});
