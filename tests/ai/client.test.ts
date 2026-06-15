import { http, HttpResponse } from 'msw';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

import { server } from '../setup';

const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';
const OPENAI_URL = 'https://api.openai.com/v1/chat/completions';

const TestSchema = z.object({ label: z.string() });

/** Build a fake Anthropic `messages.create` response with a forced tool-use block. */
function anthropicToolResponse(input: unknown, opts: { cacheWrite?: number; cacheRead?: number } = {}) {
  return {
    id: 'msg_test',
    type: 'message',
    role: 'assistant',
    model: 'claude-haiku-4-5',
    content: [{ type: 'tool_use', id: 'tu_1', name: 'emit_result', input }],
    stop_reason: 'tool_use',
    stop_sequence: null,
    usage: {
      input_tokens: 42,
      output_tokens: 7,
      cache_creation_input_tokens: opts.cacheWrite ?? 100,
      cache_read_input_tokens: opts.cacheRead ?? 0,
    },
  };
}

/** Spy Langfuse client (matches the subset of the API client.ts touches). */
function makeSpyLangfuse() {
  const traceUpdate = vi.fn();
  const generationEnd = vi.fn();
  const generationUpdate = vi.fn();
  // trace.generation(body) → a handle with .end(usage) / .update(); client.ts calls
  // trace.generation({ model, ... }).end({ usageDetails }) (LANGFUSE-TRACING-01).
  const generation = vi.fn(() => ({ end: generationEnd, update: generationUpdate }));
  const trace = vi.fn(() => ({ update: traceUpdate, generation }));
  return { client: { trace }, trace, traceUpdate, generation, generationEnd, generationUpdate };
}

let langfuseSpy: ReturnType<typeof makeSpyLangfuse> | null = null;

vi.mock('@/lib/langfuse', () => ({
  isLangfuseConfigured: () => langfuseSpy !== null,
  getLangfuseClient: () => (langfuseSpy ? langfuseSpy.client : null),
  // client.ts now flushes in its finally (LANGFUSE-TRACING-01); a spy so a test can
  // assert it ran. Always resolves regardless of langfuseSpy (null-safe in real code).
  flushTracing: vi.fn(() => Promise.resolve()),
}));

// The metered path (costContext present) reserves against the $5/day ledger before
// the call — mock the store to a no-op so the userId/metered test never hits a DB.
// Existing tests pass no costContext (metered=false) so this mock is simply unused.
vi.mock('@/ai/cost/cap', () => ({
  CAP_MICRO_USD: 5_000_000,
  reserveWithinDailyCap: vi.fn(async (accountId: string, estMicroUsd: number) => ({
    accountId,
    usageDate: '2026-06-15',
    reservedMicroUsd: estMicroUsd,
  })),
  settleSpend: vi.fn(async () => undefined),
  refundReservation: vi.fn(async () => undefined),
}));

/** Fresh import of `runAgent` after setting env (env.ts parses process.env at module load). */
async function importRunAgent(env: Record<string, string | undefined>) {
  vi.resetModules();
  for (const [k, v] of Object.entries(env)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  const mod = await import('@/ai/client');
  return mod.runAgent;
}

beforeEach(() => {
  langfuseSpy = null;
  process.env.ANTHROPIC_API_KEY = 'sk-test';
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('runAgent — model routing', () => {
  it('routes classify→Haiku, draft→Sonnet, reason→Opus', async () => {
    const seenModels: string[] = [];
    server.use(
      http.post(ANTHROPIC_URL, async ({ request }) => {
        const body = (await request.json()) as { model: string };
        seenModels.push(body.model);
        return HttpResponse.json(anthropicToolResponse({ label: 'ok' }));
      }),
    );
    const runAgent = await importRunAgent({ AI_FALLBACK_ENABLED: 'false' });
    await runAgent({ taskClass: 'classify', stablePrefix: { system: 's' }, variableSuffix: 'x', schema: TestSchema });
    await runAgent({ taskClass: 'draft', stablePrefix: { system: 's' }, variableSuffix: 'x', schema: TestSchema });
    await runAgent({ taskClass: 'reason', stablePrefix: { system: 's' }, variableSuffix: 'x', schema: TestSchema });
    expect(seenModels[0]).toMatch(/haiku/);
    expect(seenModels[1]).toMatch(/sonnet/);
    expect(seenModels[2]).toMatch(/opus/);
  });
});

describe('runAgent — prompt caching breakpoints', () => {
  it('places cache_control on the stable-prefix system blocks, none on the volatile message', async () => {
    let captured: { system: unknown[]; messages: { content: unknown }[] } | null = null;
    server.use(
      http.post(ANTHROPIC_URL, async ({ request }) => {
        captured = (await request.json()) as typeof captured;
        return HttpResponse.json(anthropicToolResponse({ label: 'ok' }));
      }),
    );
    const runAgent = await importRunAgent({ AI_FALLBACK_ENABLED: 'false' });
    await runAgent({
      taskClass: 'classify',
      stablePrefix: { system: 'sys', toolDefs: 'tools', corpus: 'corpus', businessMemory: 'mem' },
      variableSuffix: 'this deck',
      schema: TestSchema,
    });
    expect(captured).not.toBeNull();
    const system = (captured!.system as Array<{ cache_control?: unknown }>);
    // at least one stable block carries cache_control: { type: 'ephemeral' }
    expect(system.some((b) => b.cache_control && (b.cache_control as { type: string }).type === 'ephemeral')).toBe(true);
    // the volatile user message carries no cache_control
    const userMsg = captured!.messages[0];
    expect(JSON.stringify(userMsg)).not.toContain('cache_control');
  });
});

describe('runAgent — structured output', () => {
  it('returns the parsed object on a valid tool-use response', async () => {
    server.use(http.post(ANTHROPIC_URL, () => HttpResponse.json(anthropicToolResponse({ label: 'hello' }))));
    const runAgent = await importRunAgent({ AI_FALLBACK_ENABLED: 'false' });
    const out = await runAgent({ taskClass: 'classify', stablePrefix: { system: 's' }, variableSuffix: 'x', schema: TestSchema });
    expect(out).toEqual({ label: 'hello' });
  });

  it('retries once on a first-failure-then-success', async () => {
    let n = 0;
    server.use(
      http.post(ANTHROPIC_URL, () => {
        n += 1;
        return HttpResponse.json(
          n === 1 ? anthropicToolResponse({ wrong: true }) : anthropicToolResponse({ label: 'recovered' }),
        );
      }),
    );
    const runAgent = await importRunAgent({ AI_FALLBACK_ENABLED: 'false' });
    const out = await runAgent({ taskClass: 'classify', stablePrefix: { system: 's' }, variableSuffix: 'x', schema: TestSchema });
    expect(n).toBe(2);
    expect(out).toEqual({ label: 'recovered' });
  });

  it('throws when validation keeps failing and the fallback flag is off', async () => {
    server.use(http.post(ANTHROPIC_URL, () => HttpResponse.json(anthropicToolResponse({ wrong: true }))));
    const runAgent = await importRunAgent({ AI_FALLBACK_ENABLED: 'false', OPENAI_API_KEY: undefined });
    await expect(
      runAgent({ taskClass: 'classify', stablePrefix: { system: 's' }, variableSuffix: 'x', schema: TestSchema }),
    ).rejects.toThrow(/validation/i);
  });

  it('calls the OpenAI fallback when validation keeps failing and the flag is on', async () => {
    let openaiHit = false;
    server.use(
      http.post(ANTHROPIC_URL, () => HttpResponse.json(anthropicToolResponse({ wrong: true }))),
      http.post(OPENAI_URL, () => {
        openaiHit = true;
        return HttpResponse.json({
          id: 'cmpl_test',
          choices: [{ index: 0, message: { role: 'assistant', content: JSON.stringify({ label: 'from-openai' }) }, finish_reason: 'stop' }],
        });
      }),
    );
    const runAgent = await importRunAgent({ AI_FALLBACK_ENABLED: 'true', OPENAI_API_KEY: 'sk-openai' });
    const out = await runAgent({ taskClass: 'classify', stablePrefix: { system: 's' }, variableSuffix: 'x', schema: TestSchema });
    expect(openaiHit).toBe(true);
    expect(out).toEqual({ label: 'from-openai' });
  });
});

describe('runAgent — Langfuse tracing', () => {
  it('emits a trace with cache-metric metadata when a client is configured', async () => {
    langfuseSpy = makeSpyLangfuse();
    server.use(
      http.post(ANTHROPIC_URL, () => HttpResponse.json(anthropicToolResponse({ label: 'ok' }, { cacheWrite: 250, cacheRead: 30 }))),
    );
    const runAgent = await importRunAgent({ AI_FALLBACK_ENABLED: 'false' });
    await runAgent({ taskClass: 'classify', stablePrefix: { system: 's' }, variableSuffix: 'x', schema: TestSchema });
    expect(langfuseSpy.trace).toHaveBeenCalled();
    expect(langfuseSpy.traceUpdate).toHaveBeenCalled();
    const metaCall = langfuseSpy.traceUpdate.mock.calls.find(
      (c) => (c[0] as { metadata?: Record<string, unknown> }).metadata?.cacheWrite !== undefined,
    );
    expect(metaCall).toBeDefined();
    const meta = (metaCall![0] as { metadata: Record<string, unknown> }).metadata;
    expect(meta).toMatchObject({ cacheWrite: 250, cacheRead: 30, inputTokens: 42, outputTokens: 7 });
    expect(meta.model).toMatch(/haiku/);

    // ADDITIVE generation observation: model + usageDetails for Langfuse auto-cost.
    // The trace-level cache metadata above is UNCHANGED (cache-hit reads it).
    expect(langfuseSpy!.generation).toHaveBeenCalledWith(
      expect.objectContaining({ model: expect.stringMatching(/haiku/) }),
    );
    expect(langfuseSpy!.generationEnd).toHaveBeenCalledWith(
      expect.objectContaining({
        usageDetails: expect.objectContaining({
          input: 42,
          output: 7,
          cache_read_input_tokens: 30,
          cache_creation_input_tokens: 250,
        }),
      }),
    );
  });

  it('sets the trace userId to the costContext accountId (metered path)', async () => {
    langfuseSpy = makeSpyLangfuse();
    server.use(http.post(ANTHROPIC_URL, () => HttpResponse.json(anthropicToolResponse({ label: 'ok' }))));
    const runAgent = await importRunAgent({ AI_FALLBACK_ENABLED: 'false' });
    await runAgent({
      taskClass: 'classify',
      stablePrefix: { system: 's' },
      variableSuffix: 'x',
      schema: TestSchema,
      costContext: { accountId: 'acct_123' },
    });
    expect(langfuseSpy.trace).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'acct_123' }),
    );
  });

  it('flushes tracing in the finally (delivery in serverless / eval contexts)', async () => {
    langfuseSpy = makeSpyLangfuse();
    server.use(http.post(ANTHROPIC_URL, () => HttpResponse.json(anthropicToolResponse({ label: 'ok' }))));
    const runAgent = await importRunAgent({ AI_FALLBACK_ENABLED: 'false' });
    await runAgent({ taskClass: 'classify', stablePrefix: { system: 's' }, variableSuffix: 'x', schema: TestSchema });
    const { flushTracing } = await import('@/lib/langfuse');
    expect(flushTracing).toHaveBeenCalled();
  });

  it('A / codex#2 / CSO-H1 — on an Anthropic error the trace statusMessage is STATIC (provider status only), never the provider message/body', async () => {
    // The provider 400 body ECHOES request content (a QA synthesis carries the
    // query + retrieved chunks in variableSuffix). The ERROR trace must record a
    // static string with the numeric status only — never the message/body.
    const SENSITIVE = 'CONFIDENTIAL-QUERY-AND-CHUNK-SENTINEL-mrr-42000';
    langfuseSpy = makeSpyLangfuse();
    server.use(
      http.post(ANTHROPIC_URL, () =>
        new HttpResponse(`{"error":{"message":"bad request echoing ${SENSITIVE}"}}`, {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        }),
      ),
    );
    const runAgent = await importRunAgent({ AI_FALLBACK_ENABLED: 'false', OPENAI_API_KEY: undefined });

    const thrown = await runAgent({
      taskClass: 'reason',
      stablePrefix: { system: 's' },
      variableSuffix: SENSITIVE,
      schema: TestSchema,
    }).catch((e: unknown) => e);

    // R1 (codex re-gate P1): the THROWN error is a STATIC AppError — the raw
    // provider error (which echoes SENSITIVE) is NOT re-thrown, so a forwarding
    // caller (the paste router) cannot leak it to tRPC/Sentry.
    const err = thrown as { message?: string; cause?: unknown; code?: string };
    expect(err.message).toBe('anthropic request failed');
    expect(err.code).toBe('AI_PROVIDER_ERROR');
    expect(JSON.stringify({ m: err.message, c: err.cause })).not.toContain(SENSITIVE);

    // The ERROR-level trace.update must carry the static, status-only message.
    const errorCall = langfuseSpy.traceUpdate.mock.calls.find(
      (c) => (c[0] as { level?: string }).level === 'ERROR',
    );
    expect(errorCall).toBeDefined();
    const statusMessage = (errorCall![0] as { statusMessage: string }).statusMessage;
    expect(statusMessage).toBe('anthropic request failed (status 400)');
    // The provider message/body NEVER reaches the trace OR the generation —
    // sweep trace-open, trace.update, generation(), and generation.end() args.
    const allTraceArgs = JSON.stringify([
      langfuseSpy.trace.mock.calls,
      langfuseSpy.traceUpdate.mock.calls,
      langfuseSpy.generation.mock.calls,
      langfuseSpy.generationEnd.mock.calls,
    ]);
    expect(allTraceArgs).not.toContain(SENSITIVE);
  });

  it('does not crash when getLangfuseClient() returns null (the Phase-1 stub state)', async () => {
    langfuseSpy = null; // stub state
    server.use(http.post(ANTHROPIC_URL, () => HttpResponse.json(anthropicToolResponse({ label: 'ok' }))));
    const runAgent = await importRunAgent({ AI_FALLBACK_ENABLED: 'false' });
    const out = await runAgent({ taskClass: 'classify', stablePrefix: { system: 's' }, variableSuffix: 'x', schema: TestSchema });
    expect(out).toEqual({ label: 'ok' });
  });
});
