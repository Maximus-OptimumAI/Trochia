/**
 * cache-hit eval-check tests (Plan 02-05 / T03).
 *
 * The Langfuse seam (@/lib/langfuse) is MOCKED — NO live Langfuse call fires.
 * (tests/setup.ts loads .env.local, so an unmocked configured path would hit the
 * network; the mock keeps this a pure unit test.) We drive the cache ratio by
 * returning controlled trace `metadata` bags and assert pass/fail/skip + the
 * fetchTraces query signature.
 *
 * Covers <behavior>:
 *   - metadata sums cacheRead=1200, inputTokens=4000 → ratio 0.3 → 'pass', threshold 0
 *   - cacheRead=0 across all traces → ratio 0 → 'fail'
 *   - isLangfuseConfigured() === false → 'skip' AND fetchTraces NOT called
 *   - fetchTraces invoked with fields including 'io' and a fromTimestamp Date
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const fetchTraces = vi.fn();
const isLangfuseConfigured = vi.fn();
const getLangfuseClient = vi.fn();

vi.mock('@/lib/langfuse', () => ({
  isLangfuseConfigured: () => isLangfuseConfigured(),
  getLangfuseClient: () => getLangfuseClient(),
}));

import { cacheHit } from '@/ai/eval/checks/cache-hit';

/** A trace shape with only the fields the check reads (name + metadata). */
function trace(name: string, metadata: Record<string, unknown>) {
  return { name, metadata };
}

beforeEach(() => {
  fetchTraces.mockReset();
  isLangfuseConfigured.mockReset();
  getLangfuseClient.mockReset();
  // Default: configured + a client whose fetchTraces returns whatever a case sets.
  isLangfuseConfigured.mockReturnValue(true);
  getLangfuseClient.mockReturnValue({ fetchTraces });
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('cacheHit.run', () => {
  it('cacheRead=1200, inputTokens=4000 → ratio 0.3 → pass, threshold 0', async () => {
    fetchTraces.mockResolvedValueOnce({
      data: [
        trace('agent:extract-from-paste', { cacheRead: 800, inputTokens: 2500 }),
        trace('agent:extract-from-paste', { cacheRead: 400, inputTokens: 1500 }),
      ],
    });
    const r = await cacheHit.run();
    expect(r.status).toBe('pass');
    expect(r.metric).toBeCloseTo(0.3, 5);
    expect(r.threshold).toBe(0);
  });

  it('cacheRead=0 across all traces → ratio 0 → fail', async () => {
    fetchTraces.mockResolvedValueOnce({
      data: [
        trace('agent:extract-from-paste', { cacheRead: 0, inputTokens: 2000 }),
        trace('agent:qa-rag', { cacheRead: 0, inputTokens: 1000 }),
      ],
    });
    const r = await cacheHit.run();
    expect(r.status).toBe('fail');
    expect(r.metric).toBe(0);
  });

  it('isLangfuseConfigured() === false → skip, fetchTraces NOT called', async () => {
    isLangfuseConfigured.mockReturnValue(false);
    const r = await cacheHit.run();
    expect(r.status).toBe('skip');
    expect(r.reason).toContain('Langfuse');
    expect(fetchTraces).toHaveBeenCalledTimes(0);
    expect(getLangfuseClient).toHaveBeenCalledTimes(0);
  });

  it('fetchTraces is called with fields including io and a fromTimestamp Date (signature pin)', async () => {
    fetchTraces.mockResolvedValueOnce({ data: [] });
    await cacheHit.run();
    expect(fetchTraces).toHaveBeenCalledTimes(1);
    const query = fetchTraces.mock.calls[0][0];
    expect(query.fields).toContain('io');
    expect(query.fromTimestamp).toBeInstanceOf(Date);
  });

  it('non-agent traces are excluded from the ratio (name-prefix filter)', async () => {
    fetchTraces.mockResolvedValueOnce({
      data: [
        trace('agent:extract-from-paste', { cacheRead: 600, inputTokens: 2000 }),
        // A non-agent trace with cacheRead must NOT contribute.
        trace('healthcheck', { cacheRead: 9999, inputTokens: 9999 }),
      ],
    });
    const r = await cacheHit.run();
    expect(r.metric).toBeCloseTo(0.3, 5);
    expect(r.status).toBe('pass');
  });

  it('reason carries only the ratio + trace count — no trace body leaks', async () => {
    fetchTraces.mockResolvedValueOnce({
      data: [trace('agent:extract-from-paste', { cacheRead: 600, inputTokens: 2000 })],
    });
    const r = await cacheHit.run();
    expect(r.reason).toContain('ratio');
    expect(r.reason).toContain('traces');
  });

  it('zero agent:* traces in the window → skip (insufficient data, NOT fail)', async () => {
    // /codex P1 + /cso: an empty/low-volume window is data-unavailable, not a
    // cache failure. Only non-agent traces present → counted 0 → skip.
    fetchTraces.mockResolvedValueOnce({
      data: [trace('healthcheck', { cacheRead: 5, inputTokens: 5 })],
    });
    const r = await cacheHit.run();
    expect(r.status).toBe('skip');
    expect(r.reason).toContain('insufficient data');
  });

  it('non-array res.data (e.g. a swallowed 401) → skip, never a throw', async () => {
    // The Array.isArray(res.data) guard treats a malformed response as zero
    // traces → counted 0 → skip (fail-OPEN on PR/local, RED under EVAL_LIVE_REQUIRED).
    fetchTraces.mockResolvedValueOnce({ data: undefined });
    const r = await cacheHit.run();
    expect(r.status).toBe('skip');
  });

  it('fetchTraces rejection propagates (the runner, not this check, converts it to fail)', async () => {
    fetchTraces.mockRejectedValueOnce(new Error('langfuse 500'));
    await expect(cacheHit.run()).rejects.toThrow('langfuse 500');
  });
});
