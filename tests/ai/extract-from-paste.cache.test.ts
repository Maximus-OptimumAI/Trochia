/**
 * Cache verification — `extractFromPaste` StablePrefix byte-stability + cache_control
 * placement (Phase 2 / KNW-02a, ticket XC-06).
 *
 * Structural unit test, NO live Anthropic call. The goal: prove three things
 * about the extractor's wiring that the prompt-cache contract depends on. If
 * any of them regress, the live-Sonnet cache-hit metric in Plan 02-05's eval
 * harness will silently turn into 0% — which is why we guard them here, where
 * the failure is obvious instead of subtle.
 *
 *   1. StablePrefix is byte-stable across two invocations. The `system` blocks
 *      sent to Anthropic on call N must deep-equal those sent on call N+1,
 *      regardless of how different the two pastes are. (Without this,
 *      Anthropic's cache key changes per call and `cache_read_input_tokens`
 *      stays at 0 forever.)
 *
 *   2. `cache_control: { type: 'ephemeral' }` sits on the LAST block of the
 *      `system` array. `client.ts::buildSystemBlocks` places it there
 *      deliberately — one breakpoint at the tail caches the entire prefix up
 *      to it. A reorder of the StablePrefix block construction (system →
 *      toolDefs → corpus → businessMemory) would silently break this; the
 *      assertion below would fail loudly.
 *
 *   3. The paste lands in `variableSuffix` (the user message body), NEVER in
 *      `stablePrefix.system`. Defense-in-depth check: each call's paste
 *      contains a unique marker; the captured `system` array must not contain
 *      either marker, the user message for call N must contain marker N.
 *
 * Plus two propagation checks — model stays Sonnet 4.6 across both calls (per
 * `pickModel('draft')` in `ai/router.ts`), and the mocked
 * `cache_read_input_tokens` value flows from the Anthropic response →
 * `client.ts::trace.update({ metadata: { cacheRead } })` → the spied Langfuse
 * client. The Langfuse-RECEIVED-the-number assertion proves the wire is in
 * place; the live-Sonnet end-to-end cache hit verification (real
 * `cache_read_input_tokens > 0` in a real Langfuse trace) lives in Plan 02-05
 * (eval harness, Week 4) — the plan-checker explicitly allowed this deferral
 * to keep the unit test hermetic.
 *
 * Mocking strategy mirrors `tests/ai/client.test.ts`:
 *   - MSW `http.post` intercepts `https://api.anthropic.com/v1/messages` and
 *     captures the body actually sent by `@anthropic-ai/sdk`. The body's
 *     `system` field is the `Anthropic.Messages.TextBlockParam[]` array — the
 *     same shape `buildSystemBlocks()` returns.
 *   - `vi.mock('@/lib/langfuse', ...)` installs a spy whose `trace().update()`
 *     captures every call's metadata.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';

import { http, HttpResponse } from 'msw';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { server } from '../setup';

const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';

// ────────────────────────────────────────────────────────────────────────────
// Fixtures — two real Trochia fixtures, each augmented with a unique marker
// that is impossible to confuse with the stable-prefix content.
// ────────────────────────────────────────────────────────────────────────────

const FIXTURES_DIR = path.join(__dirname, 'fixtures');
const PASTE_1_MARKER = 'UNIQUE-MARKER-PASTE-1-acme-fintech';
const PASTE_2_MARKER = 'UNIQUE-MARKER-PASTE-2-helix-saas';

/** Read a fixture from disk and prepend a uniquely-identifiable marker. */
function buildMarkedPaste(filename: string, marker: string): string {
  const raw = readFileSync(path.join(FIXTURES_DIR, filename), 'utf8');
  return `${marker}\n\n${raw}`;
}

// ────────────────────────────────────────────────────────────────────────────
// Synthetic Anthropic response — a valid `BusinessMemoryDraft` tool_use block
// so `runAgent`'s Zod re-parse on `businessMemoryDraftSchema` succeeds and the
// repair-retry path is NOT triggered (which would double the captured calls).
// ────────────────────────────────────────────────────────────────────────────

/**
 * Synthetic draft satisfying `businessMemoryDraftSchema`. The schema requires
 * `provenance` and at minimum one entry; everything else is optional. We emit
 * a populated companyName + matching provenance so the per-field invariant
 * (every populated scalar has a matching provenance key) holds.
 */
function syntheticDraft() {
  const nowIso = new Date().toISOString();
  return {
    companyName: 'TestCo',
    sector: 'Fintech',
    provenance: {
      companyName: {
        source_snippet: 'TestCo is a fintech building things.',
        confidence: 0.9,
        extracted_at: nowIso,
        last_updated: nowIso,
        snooze_until: null,
      },
      sector: {
        source_snippet: 'TestCo is a fintech building things.',
        confidence: 0.85,
        extracted_at: nowIso,
        last_updated: nowIso,
        snooze_until: null,
      },
    },
  };
}

/** Build a fake Anthropic `messages.create` HTTP response payload. */
function anthropicToolResponse(opts: { cacheWrite?: number; cacheRead?: number } = {}) {
  return {
    id: 'msg_test',
    type: 'message',
    role: 'assistant',
    model: 'claude-sonnet-4-6',
    content: [
      { type: 'tool_use', id: 'tu_1', name: 'emit_result', input: syntheticDraft() },
    ],
    stop_reason: 'tool_use',
    stop_sequence: null,
    usage: {
      input_tokens: 200,
      output_tokens: 50,
      cache_creation_input_tokens: opts.cacheWrite ?? 100,
      cache_read_input_tokens: opts.cacheRead ?? 50,
    },
  };
}

// ────────────────────────────────────────────────────────────────────────────
// Langfuse spy — exposes the `traceUpdate` mock so the test can read the
// metadata payloads `client.ts::trace.update({ metadata: { cacheRead, ... } })`
// pushes through on each call.
// ────────────────────────────────────────────────────────────────────────────

function makeSpyLangfuse() {
  const traceUpdate = vi.fn();
  const trace = vi.fn(() => ({ update: traceUpdate }));
  return { client: { trace }, trace, traceUpdate };
}

let langfuseSpy: ReturnType<typeof makeSpyLangfuse> | null = null;

vi.mock('@/lib/langfuse', () => ({
  isLangfuseConfigured: () => langfuseSpy !== null,
  getLangfuseClient: () => (langfuseSpy ? langfuseSpy.client : null),
}));

// ────────────────────────────────────────────────────────────────────────────
// Captured HTTP request bodies — populated by the MSW handler below. Reset
// per-test in `beforeEach`.
// ────────────────────────────────────────────────────────────────────────────

interface CapturedCall {
  model: string;
  system: Array<{ type: string; text: string; cache_control?: { type: string } }>;
  messages: Array<{ role: string; content: string }>;
}

let capturedCalls: CapturedCall[] = [];

beforeEach(() => {
  capturedCalls = [];
  langfuseSpy = makeSpyLangfuse();
  process.env.ANTHROPIC_API_KEY = 'sk-test';
  // The Anthropic SDK retries on transient errors — install a handler that
  // captures every request and replies with a valid tool_use response so the
  // 2nd call's response can carry a synthetic cache_read_input_tokens > 0.
  server.use(
    http.post(ANTHROPIC_URL, async ({ request }) => {
      const body = (await request.json()) as CapturedCall;
      capturedCalls.push(body);
      // First call: cold cache (write). Second+: warm cache (read).
      const isSecondCall = capturedCalls.length >= 2;
      return HttpResponse.json(
        anthropicToolResponse(
          isSecondCall ? { cacheWrite: 0, cacheRead: 1200 } : { cacheWrite: 100, cacheRead: 0 },
        ),
      );
    }),
  );
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ────────────────────────────────────────────────────────────────────────────
// Tests
// ────────────────────────────────────────────────────────────────────────────

describe('extractFromPaste — StablePrefix byte-stability + cache_control wiring (XC-06)', () => {
  it('places cache_control on the LAST block of system, none on the user message', async () => {
    const { extractFromPaste } = await import('@/ai/agents/extract-from-paste.agent');
    const paste = buildMarkedPaste('paste-acme-fintech.txt', PASTE_1_MARKER);

    await extractFromPaste({ accountId: 'account-1', paste, founderEmail: 'test-founder-cache@example.com' });

    expect(capturedCalls).toHaveLength(1);
    const [call] = capturedCalls;

    // The system field must be a non-empty TextBlockParam[] (one block per
    // stable section: system + corpus). The extractor builds 2 blocks today.
    expect(Array.isArray(call.system)).toBe(true);
    expect(call.system.length).toBeGreaterThanOrEqual(2);

    // cache_control: { type: 'ephemeral' } sits on the LAST block — that is
    // the breakpoint placement `client.ts::buildSystemBlocks` makes. A
    // regression that reorders / drops the last-block assignment would fail
    // this assertion immediately.
    const lastBlock = call.system[call.system.length - 1];
    expect(lastBlock.cache_control).toEqual({ type: 'ephemeral' });

    // The volatile user message must carry NO cache_control. (If a future
    // edit accidentally caches the per-call paste, the prompt cache becomes
    // worthless because every paste rewrites the key.)
    expect(JSON.stringify(call.messages[0])).not.toContain('cache_control');
  });

  it('emits a byte-stable system across two invocations with different pastes', async () => {
    const { extractFromPaste } = await import('@/ai/agents/extract-from-paste.agent');
    const paste1 = buildMarkedPaste('paste-acme-fintech.txt', PASTE_1_MARKER);
    const paste2 = buildMarkedPaste('paste-helix-saas.txt', PASTE_2_MARKER);

    await extractFromPaste({ accountId: 'account-1', paste: paste1, founderEmail: 'test-founder-cache@example.com' });
    await extractFromPaste({ accountId: 'account-1', paste: paste2, founderEmail: 'test-founder-cache@example.com' });

    expect(capturedCalls).toHaveLength(2);
    const [c1, c2] = capturedCalls;

    // The full `system` array must deep-equal across the two calls. This is
    // the precondition for Anthropic's prompt cache to hit on call 2 — the
    // cache key is hashed over the bytes of the prefix.
    expect(c1.system).toEqual(c2.system);

    // Spot-check at the text level too (clearer diagnostics on regression):
    const systemTextsC1 = c1.system.map((b) => b.text);
    const systemTextsC2 = c2.system.map((b) => b.text);
    expect(systemTextsC1).toEqual(systemTextsC2);
  });

  it('routes both calls to Sonnet 4.6 (the draft task class)', async () => {
    const { extractFromPaste } = await import('@/ai/agents/extract-from-paste.agent');
    const paste1 = buildMarkedPaste('paste-acme-fintech.txt', PASTE_1_MARKER);
    const paste2 = buildMarkedPaste('paste-helix-saas.txt', PASTE_2_MARKER);

    await extractFromPaste({ accountId: 'account-1', paste: paste1, founderEmail: 'test-founder-cache@example.com' });
    await extractFromPaste({ accountId: 'account-1', paste: paste2, founderEmail: 'test-founder-cache@example.com' });

    expect(capturedCalls).toHaveLength(2);
    // Per `pickModel('draft')` in src/ai/router.ts: SONNET_MODEL = 'claude-sonnet-4-6'.
    // A regression that bumps the router or changes the extractor's task
    // class fails here.
    expect(capturedCalls[0].model).toBe('claude-sonnet-4-6');
    expect(capturedCalls[1].model).toBe('claude-sonnet-4-6');
  });

  it('keeps the paste OUT of stablePrefix.system and IN the user message — both calls', async () => {
    const { extractFromPaste } = await import('@/ai/agents/extract-from-paste.agent');
    const paste1 = buildMarkedPaste('paste-acme-fintech.txt', PASTE_1_MARKER);
    const paste2 = buildMarkedPaste('paste-helix-saas.txt', PASTE_2_MARKER);

    await extractFromPaste({ accountId: 'account-1', paste: paste1, founderEmail: 'test-founder-cache@example.com' });
    await extractFromPaste({ accountId: 'account-1', paste: paste2, founderEmail: 'test-founder-cache@example.com' });

    expect(capturedCalls).toHaveLength(2);
    const [c1, c2] = capturedCalls;

    // Concatenate all system block text for each call. NEITHER paste's
    // marker should appear in either call's system blocks — the stable
    // prefix is paste-independent.
    const systemTextC1 = c1.system.map((b) => b.text).join(' ');
    const systemTextC2 = c2.system.map((b) => b.text).join(' ');
    expect(systemTextC1).not.toContain(PASTE_1_MARKER);
    expect(systemTextC1).not.toContain(PASTE_2_MARKER);
    expect(systemTextC2).not.toContain(PASTE_1_MARKER);
    expect(systemTextC2).not.toContain(PASTE_2_MARKER);

    // The paste MUST be in the user message body for its own call. The body
    // is a JSON-stringified `{ now, paste: <delimited paste> }` per the
    // extractor's variableSuffix construction.
    expect(c1.messages[0].content).toContain(PASTE_1_MARKER);
    expect(c2.messages[0].content).toContain(PASTE_2_MARKER);

    // And the variableSuffix must differ between calls (different paste →
    // different user message → cache MISS on the volatile suffix, which is
    // correct: only the prefix caches).
    expect(c1.messages[0].content).not.toEqual(c2.messages[0].content);
  });

  it('propagates cache_read_input_tokens from the Anthropic response to the Langfuse trace metadata', async () => {
    const { extractFromPaste } = await import('@/ai/agents/extract-from-paste.agent');
    const paste1 = buildMarkedPaste('paste-acme-fintech.txt', PASTE_1_MARKER);
    const paste2 = buildMarkedPaste('paste-helix-saas.txt', PASTE_2_MARKER);

    await extractFromPaste({ accountId: 'account-1', paste: paste1, founderEmail: 'test-founder-cache@example.com' });
    await extractFromPaste({ accountId: 'account-1', paste: paste2, founderEmail: 'test-founder-cache@example.com' });

    expect(langfuseSpy).not.toBeNull();
    // trace() called at least once per runAgent invocation.
    expect(langfuseSpy!.trace).toHaveBeenCalled();
    // Pull every metadata-bearing update payload.
    const metaUpdates = langfuseSpy!.traceUpdate.mock.calls
      .map((c) => c[0] as { metadata?: Record<string, unknown> })
      .filter((p) => p.metadata !== undefined);
    expect(metaUpdates.length).toBeGreaterThanOrEqual(2);

    // The SECOND call's mock returns cache_read_input_tokens = 1200 and
    // cache_creation_input_tokens = 0. The first call returns the inverse.
    // Both must appear in the Langfuse metadata stream — that proves the
    // cache-token wire from the SDK response → `trace.update({ metadata })`
    // is intact.
    const seenCacheReads = metaUpdates.map((u) => u.metadata?.cacheRead);
    const seenCacheWrites = metaUpdates.map((u) => u.metadata?.cacheWrite);
    expect(seenCacheReads).toContain(0);
    expect(seenCacheReads).toContain(1200);
    expect(seenCacheWrites).toContain(100);
    expect(seenCacheWrites).toContain(0);

    // Belt + braces: at least one update reports model = sonnet — proves the
    // metadata stream isn't from a stale Phase-1 test fixture.
    const sonnetUpdate = metaUpdates.find((u) => u.metadata?.model === 'claude-sonnet-4-6');
    expect(sonnetUpdate).toBeDefined();
  });

  it('captures latency on every invocation (wiring proof; live p50 < 30s lives in Plan 02-05)', async () => {
    const { extractFromPaste } = await import('@/ai/agents/extract-from-paste.agent');
    const paste = buildMarkedPaste('paste-acme-fintech.txt', PASTE_1_MARKER);

    const result = await extractFromPaste({ accountId: 'account-1', paste, founderEmail: 'test-founder-cache@example.com' });

    // Latency capture works (the value is `Date.now()`-deltas around the
    // runAgent call; under MSW it's near-instant but the field MUST be a
    // finite number). The real-Sonnet p50 < 30s assertion against a live
    // Anthropic call lives in Plan 02-05 (eval harness).
    expect(typeof result.latencyMs).toBe('number');
    expect(Number.isFinite(result.latencyMs)).toBe(true);
    expect(result.latencyMs).toBeGreaterThanOrEqual(0);
    // The Phase-1 Langfuse stub returns null trace ids; the agent surfaces
    // that contract forward-compatibly.
    expect(result.langfuseTraceId).toBeNull();
  });
});
