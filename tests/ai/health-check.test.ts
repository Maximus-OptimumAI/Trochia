/**
 * AI health-check integration test (FND-09 / XC-06).
 *
 * Proves the deploy-time Haiku ping exercises `ai/client.ts` and emits a Langfuse
 * trace carrying the cache metrics — so "cache hit rate is instrumented, not assumed"
 * has an automated guard. The matching MANUAL check (verify the trace actually
 * appeared in the Langfuse dashboard post-deploy, once Plan 05's keys are live) is
 * recorded in VALIDATION.md's Manual-Only table.
 */
import { http, HttpResponse } from 'msw';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { server } from '../setup';

const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';

function makeSpyLangfuse() {
  const traceUpdate = vi.fn();
  const trace = vi.fn(() => ({ update: traceUpdate }));
  return { client: { trace }, trace, traceUpdate };
}

let langfuseSpy: ReturnType<typeof makeSpyLangfuse> | null = null;
const seenModels: string[] = [];

vi.mock('@/lib/langfuse', () => ({
  isLangfuseConfigured: () => langfuseSpy !== null,
  getLangfuseClient: () => (langfuseSpy ? langfuseSpy.client : null),
}));

beforeEach(() => {
  langfuseSpy = null;
  seenModels.length = 0;
  process.env.ANTHROPIC_API_KEY = 'sk-test';
  process.env.AI_FALLBACK_ENABLED = 'false';
  vi.resetModules();
  server.use(
    http.post(ANTHROPIC_URL, async ({ request }) => {
      const body = (await request.json()) as { model: string };
      seenModels.push(body.model);
      return HttpResponse.json({
        id: 'msg_hc',
        type: 'message',
        role: 'assistant',
        model: body.model,
        content: [{ type: 'tool_use', id: 'tu', name: 'emit_result', input: { ok: true } }],
        stop_reason: 'tool_use',
        stop_sequence: null,
        usage: {
          input_tokens: 12,
          output_tokens: 5,
          cache_creation_input_tokens: 80,
          cache_read_input_tokens: 40,
        },
      });
    }),
  );
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('aiHealthCheck', () => {
  it('returns { ok: true } and routes through Haiku (taskClass classify)', async () => {
    const { aiHealthCheck } = await import('@/ai/health-check');
    const out = await aiHealthCheck();
    expect(out).toEqual({ ok: true });
    expect(seenModels[0]).toMatch(/haiku/);
  });

  it('emits a Langfuse trace with cache-metric metadata when a client is configured', async () => {
    langfuseSpy = makeSpyLangfuse();
    const { aiHealthCheck } = await import('@/ai/health-check');
    await aiHealthCheck();
    expect(langfuseSpy.trace).toHaveBeenCalled();
    const metaCall = langfuseSpy.traceUpdate.mock.calls.find(
      (c) => (c[0] as { metadata?: Record<string, unknown> }).metadata?.cacheWrite !== undefined,
    );
    expect(metaCall).toBeDefined();
    const meta = (metaCall![0] as { metadata: Record<string, unknown> }).metadata;
    expect(meta).toMatchObject({ cacheWrite: 80, cacheRead: 40, inputTokens: 12, outputTokens: 5 });
    expect(meta.model).toMatch(/haiku/);
  });

  it('returns { ok: true } without crashing when getLangfuseClient() is null (the Phase-1 stub state)', async () => {
    langfuseSpy = null;
    const { aiHealthCheck } = await import('@/ai/health-check');
    const out = await aiHealthCheck();
    expect(out).toEqual({ ok: true });
  });
});
