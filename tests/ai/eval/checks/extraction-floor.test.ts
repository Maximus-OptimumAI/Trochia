/**
 * extraction-floor eval-check tests (Plan 02-05 / T02).
 *
 * The real extractFromPaste agent is MOCKED - NO live Anthropic call fires.
 * We drive the populated-field count by returning controlled `draft` objects
 * and letting the REAL `countPopulatedFields` (shallow Object.keys semantics)
 * count them, so the test exercises the exact metric the check ships.
 *
 * Covers <behavior>:
 *   - 9 fields across all 5 → 'pass', metric 9, threshold 8
 *   - 6 fields each → 'fail', metric 6
 *   - boundary means: [10,9,8,7,6] → 8.0 → 'pass'; [9,8,7,7,6] → 7.4 → 'fail'
 *   - ANTHROPIC_API_KEY absent → 'skip' AND extractFromPaste NOT called
 *   - the loader resolves exactly 5 paste paths (Gate 6 count pin)
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { BusinessMemoryDraft } from '@/ai/schemas/business-memory.zod';
import { AppError } from '@/lib/errors';

// Mock the agent module so no live Anthropic call fires.
vi.mock('@/ai/agents/extract-from-paste.agent', () => ({
  extractFromPaste: vi.fn(),
}));

import { extractFromPaste } from '@/ai/agents/extract-from-paste.agent';
import { extractionFloor } from '@/ai/eval/checks/extraction-floor';
import { PASTE_FIXTURE_PATHS } from '@/ai/eval/fixtures';

const mockExtract = vi.mocked(extractFromPaste);

/**
 * Build a BusinessMemoryDraft whose `countPopulatedFields` is exactly `n`
 * (1..10). The 7 scalars come first, then the 3 structured groups. Mirrors the
 * helper's shallow `Object.keys(group).length > 0` semantics.
 */
function draftWithFieldCount(n: number): BusinessMemoryDraft {
  const scalars = [
    'companyName',
    'oneLiner',
    'sector',
    'stage',
    'geography',
    'incorporationStatus',
    'foundingDate',
  ] as const;
  const draft: Record<string, unknown> = { provenance: {} };
  let remaining = n;
  for (const key of scalars) {
    if (remaining <= 0) break;
    draft[key] = key === 'foundingDate' ? '2024-09-01T00:00:00.000Z' : `v-${key}`;
    remaining--;
  }
  if (remaining > 0) {
    draft.team = { founders: [{ name: 'F', role: 'CEO' }] };
    remaining--;
  }
  if (remaining > 0) {
    draft.traction = { mrr: 1000 };
    remaining--;
  }
  if (remaining > 0) {
    draft.narrative = { problem: 'p' };
    remaining--;
  }
  return draft as unknown as BusinessMemoryDraft;
}

/** A full extractFromPaste resolved value whose draft has `n` populated fields. */
function resolved(n: number) {
  return {
    draft: draftWithFieldCount(n),
    langfuseTraceId: null,
    latencyMs: 1,
    // shape-only; the check never reads these
    injectionScreen: {
      flagged: false,
      severity: 'none',
      matches: [],
      sanitizedPaste: '',
    } as never,
    pii: { redactionsApplied: 0, byType: { email: 0, phone: 0, wallet: 0, ssn: 0 } },
  };
}

/** Make extractFromPaste return drafts with these per-call field counts. */
function mockCounts(counts: number[]): void {
  mockExtract.mockReset();
  for (const c of counts) {
    mockExtract.mockResolvedValueOnce(resolved(c));
  }
}

/** The structured-output miss the fresh-retry loop is allowed to retry. */
const soInvalid = () =>
  new AppError('AI structured output failed validation (after one repair retry).', {
    code: 'AI_STRUCTURED_OUTPUT_INVALID',
  });

/** A cap-exceeded error the retry loop must NOT retry. */
const capExceeded = () =>
  new AppError('daily AI spend limit reached', { code: 'AI_DAILY_CAP_EXCEEDED', status: 429 });

describe('extractionFloor.run', () => {
  const originalKey = process.env.ANTHROPIC_API_KEY;

  beforeEach(() => {
    // Default: key present (live path). Individual cases override.
    process.env.ANTHROPIC_API_KEY = 'test-key';
  });

  afterEach(() => {
    if (originalKey === undefined) {
      delete process.env.ANTHROPIC_API_KEY;
    } else {
      process.env.ANTHROPIC_API_KEY = originalKey;
    }
    vi.clearAllMocks();
  });

  it('the loader resolves exactly 5 paste fixture paths (Gate 6 count pin)', () => {
    expect(PASTE_FIXTURE_PATHS).toHaveLength(5);
  });

  it('9 populated fields across all 5 → pass, metric 9, threshold 8', async () => {
    mockCounts([9, 9, 9, 9, 9]);
    const r = await extractionFloor.run();
    expect(r.status).toBe('pass');
    expect(r.metric).toBe(9);
    expect(r.threshold).toBe(8);
    expect(mockExtract).toHaveBeenCalledTimes(5);
  });

  it('6 populated fields each → fail, metric 6', async () => {
    mockCounts([6, 6, 6, 6, 6]);
    const r = await extractionFloor.run();
    expect(r.status).toBe('fail');
    expect(r.metric).toBe(6);
  });

  it('mixed counts [10,9,8,7,6] → mean 8.0 → pass (boundary)', async () => {
    mockCounts([10, 9, 8, 7, 6]);
    const r = await extractionFloor.run();
    expect(r.metric).toBe(8);
    expect(r.status).toBe('pass');
  });

  it('mixed counts [9,8,7,7,6] → mean 7.4 → fail', async () => {
    mockCounts([9, 8, 7, 7, 6]);
    const r = await extractionFloor.run();
    expect(r.metric).toBeCloseTo(7.4, 5);
    expect(r.status).toBe('fail');
  });

  it('ANTHROPIC_API_KEY absent → skip, names the var, extractFromPaste NOT called', async () => {
    delete process.env.ANTHROPIC_API_KEY;
    mockExtract.mockReset();
    const r = await extractionFloor.run();
    expect(r.status).toBe('skip');
    expect(r.reason).toContain('ANTHROPIC_API_KEY');
    expect(mockExtract).toHaveBeenCalledTimes(0);
  });

  it('reason carries only counts - no draft/paste content leaks', async () => {
    mockCounts([9, 9, 9, 9, 9]);
    const r = await extractionFloor.run();
    expect(r.reason).toContain('mean populated fields');
    expect(r.reason).not.toContain('v-companyName');
  });

  it('AI_STRUCTURED_OUTPUT_INVALID twice then success → RECOVERS and passes (tightening 1: fresh re-attempts)', async () => {
    mockExtract.mockReset();
    // Fixture 1 misses twice, then the third fresh call is clean; every later call
    // (fixtures 2-5, first attempt) is clean too.
    mockExtract
      .mockRejectedValueOnce(soInvalid())
      .mockRejectedValueOnce(soInvalid())
      .mockResolvedValue(resolved(9));
    const r = await extractionFloor.run();
    expect(r.status).toBe('pass');
    expect(r.metric).toBe(9);
    // 3 calls for fixture 1 (2 misses + 1 success) + 4 clean calls for fixtures 2-5.
    expect(mockExtract).toHaveBeenCalledTimes(7);
  });

  it('AI_STRUCTURED_OUTPUT_INVALID on all 3 fresh attempts → HARD-FAILS, not excluded from the mean (tightening 1)', async () => {
    mockExtract.mockReset();
    mockExtract.mockRejectedValue(soInvalid()); // every attempt misses
    // The check throws (a broken extractor still reds the nightly); the runner
    // coerces this to a fail. It is NOT skipped and the mean is NOT computed over
    // the surviving fixtures.
    await expect(extractionFloor.run()).rejects.toThrow(/structured output/i);
    // Exactly 3 fresh attempts on fixture 1, then it throws (fixtures 2-5 unreached).
    expect(mockExtract).toHaveBeenCalledTimes(3);
  });

  it('AI_DAILY_CAP_EXCEEDED propagates immediately with NO retry (retry count 1)', async () => {
    mockExtract.mockReset();
    mockExtract.mockRejectedValueOnce(capExceeded());
    await expect(extractionFloor.run()).rejects.toMatchObject({ code: 'AI_DAILY_CAP_EXCEEDED' });
    // Cap-exceeded is never retried: exactly one call fired.
    expect(mockExtract).toHaveBeenCalledTimes(1);
  });
});
