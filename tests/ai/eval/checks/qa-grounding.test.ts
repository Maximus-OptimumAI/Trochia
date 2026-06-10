/**
 * qa-grounding eval-check tests (Plan 02-07 / T03).
 *
 * The qa-rag agent (@/ai/agents/qa-rag.agent) is MOCKED — NO live askQa /
 * hybridRetrieve / runAgent fires (guardrail #6; the env-gate keys on PRESENCE,
 * and tests/setup.ts loads a possibly-invalid key from .env.local, so the live
 * path must be mocked to stay hermetic — the 02-05 env-gate-keys-on-presence
 * lesson). The db client is also mocked so getRequestClientFromClaims never
 * opens a real postgres connection.
 *
 * Covers <behavior>:
 *   - zero-dropped fixtures + out-of-scope grounded:false → 'pass'
 *   - P2-D PROVE-IT-CAN-FAIL: a turn with debug.droppedCitationCount > 0 → 'fail'
 *   - an out-of-scope Q that returns grounded:true → 'fail' (criterion 6)
 *   - ANTHROPIC_API_KEY absent → 'skip' AND askQa NOT called
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const askQa = vi.fn();

vi.mock('@/ai/agents/qa-rag.agent', () => ({
  askQa: (...args: unknown[]) => askQa(...args),
}));

// Mock the db client so getRequestClientFromClaims never opens a real postgres
// connection — the check builds an rls runner per fixture, but askQa is mocked
// so the runner is never actually invoked.
vi.mock('@/db/client', () => ({
  getRequestClientFromClaims: () => ({ rls: vi.fn(), db: {} }),
}));

import { qaGrounding } from '@/ai/eval/checks/qa-grounding';
import { QA_GROUNDING_FIXTURE_PATHS, loadQaGroundingFixtures } from '@/ai/eval/fixtures';
import type { AskQaResult } from '@/ai/schemas/qa-answer.zod';

const ORIGINAL_KEY = process.env.ANTHROPIC_API_KEY;

// Drive the mock by FIXTURE SCOPE, not by call count, so growing the fixture set
// (qa-robustness T1/T4) never re-breaks these tests. Loaded the SAME way the check
// loads them, so in/out-of-scope partitioning matches the run exactly.
const FIXTURES = loadQaGroundingFixtures(QA_GROUNDING_FIXTURE_PATHS);
const IN_SCOPE = FIXTURES.filter((f) => !f.isOutOfScope);
const IN_SCOPE_COUNT = IN_SCOPE.length;
const OUT_OF_SCOPE_QUESTIONS = new Set(FIXTURES.filter((f) => f.isOutOfScope).map((f) => f.question));

/** Build an AskQaResult for a grounded, zero-drop answer. */
function grounded(dropped = 0): AskQaResult {
  return {
    answer: { answer: 'an answer', citations: [{ sourceType: 'memory', sourceId: 'm1', chunkIdx: 0 }], grounded: true },
    debug: {
      droppedCitationCount: dropped,
      maxVectorScore: 0.8,
      retrievedKeys: ['m1|0'],
      topHit: { sourceId: 'm1', chunkIdx: 0, vectorScore: 0.8 },
    },
  };
}

/** Build an AskQaResult for an "I don't know" (out-of-scope) answer. */
function iDontKnow(): AskQaResult {
  return {
    answer: { answer: "I don't have that…", citations: [], grounded: false },
    debug: { droppedCitationCount: 0, maxVectorScore: 0.2, retrievedKeys: [], topHit: null },
  };
}

/**
 * A scope-driven mock impl: in-scope queries → grounded(0), out-of-scope → "I don't
 * know". `over(query)` may return a per-question override (else null falls through).
 * Count-independent — adding fixtures cannot exhaust a queue.
 */
function byScope(over: (q: string) => AskQaResult | null = () => null) {
  return ({ query }: { query: string }): AskQaResult =>
    over(query) ?? (OUT_OF_SCOPE_QUESTIONS.has(query) ? iDontKnow() : grounded(0));
}

beforeEach(() => {
  askQa.mockReset();
  // Ensure the env-gate passes by default (the fixture-driven path runs).
  process.env.ANTHROPIC_API_KEY = 'test-key-present';
});

afterEach(() => {
  vi.clearAllMocks();
  if (ORIGINAL_KEY === undefined) delete process.env.ANTHROPIC_API_KEY;
  else process.env.ANTHROPIC_API_KEY = ORIGINAL_KEY;
});

describe('qaGrounding.run', () => {
  it('every in-scope drop===0 + out-of-scope grounded:false → pass, metric 0', async () => {
    // In-scope → grounded (zero drop, maxVS 0.8), out-of-scope → "I don't know"
    // (maxVS 0.2) → clean cosine separation (0.8 > 0.2).
    askQa.mockImplementation(byScope());

    const r = await qaGrounding.run();
    expect(r.status).toBe('pass');
    expect(r.metric).toBe(0);
    expect(r.threshold).toBe(0);
  });

  it('P2-D — a turn with droppedCitationCount > 0 makes the eval FAIL', async () => {
    // One in-scope Q fabricates a citation → debug.droppedCitationCount = 1.
    const fabricated = IN_SCOPE[0].question;
    askQa.mockImplementation(byScope((q) => (q === fabricated ? grounded(1) : null)));

    const r = await qaGrounding.run();
    expect(r.status).toBe('fail');
    expect(r.metric).toBe(1);
  });

  it('an out-of-scope Q returning grounded:true → fail (criterion 6)', async () => {
    // One out-of-scope Q comes back grounded:true (the miss) instead of "I don't know".
    const oos = FIXTURES.find((f) => f.isOutOfScope)!.question;
    askQa.mockImplementation(byScope((q) => (q === oos ? grounded(0) : null)));

    const r = await qaGrounding.run();
    expect(r.status).toBe('fail');
    // dropped total is still 0; the fail is from the out-of-scope miss.
    expect(r.metric).toBe(0);
  });

  it('codex#5 — an in-scope Q that returns grounded:false (or 0 citations) makes the eval FAIL (verify grounding, not just absence of fabrication)', async () => {
    // All in-scope Qs have droppedCitationCount===0 (no fabrication), but the
    // first in-scope Q comes back as an "I don't know" (grounded:false, 0
    // citations). Pre-codex#5 this passed vacuously; now it FAILS because the
    // in-scope answer was not actually grounded + cited.
    const miss = IN_SCOPE[0].question; // in-scope but returns "I don't know"
    askQa.mockImplementation(byScope((q) => (q === miss ? iDontKnow() : null)));

    const r = await qaGrounding.run();
    expect(r.status).toBe('fail');
    // dropped total is still 0 — the fail is from the in-scope grounding miss.
    expect(r.metric).toBe(0);
    expect(r.reason).toContain(`in-scope grounded+cited ${IN_SCOPE_COUNT - 1}/${IN_SCOPE_COUNT}`);
  });

  it('ANTHROPIC_API_KEY absent → skip, askQa NOT called', async () => {
    delete process.env.ANTHROPIC_API_KEY;
    const r = await qaGrounding.run();
    expect(r.status).toBe('skip');
    expect(r.reason).toContain('ANTHROPIC_API_KEY');
    expect(askQa).toHaveBeenCalledTimes(0);
  });

  it('reason carries only counts — no question/answer/chunk text', async () => {
    askQa.mockImplementation(byScope());
    const r = await qaGrounding.run();
    expect(r.reason).toContain('dropped citations');
    expect(r.reason).not.toContain('MRR');
    expect(r.reason).not.toContain('Apple');
  });
});
