/**
 * Eval harness runner tests (EVAL-01a — Plan 02-04, Task 7; hardened in 02-05 T01).
 *
 * Codifies the runner contract, now a RUNTIME gate (Plan 02-05 T01):
 *
 *   exit 0 on all-pass, or 'skip' (env-unavailable) when EVAL_LIVE_REQUIRED unset,
 *           with qa-grounding 'pending' allowlisted (PENDING_ALLOWED).
 *   exit 1 on any-fail, any non-allowlisted 'pending', OR any 'skip' when
 *           EVAL_LIVE_REQUIRED==='1'.
 *
 * 8 cases:
 *   1. live checks 'skip' + qa-grounding 'pending' (EVAL_LIVE_REQUIRED unset)
 *      → exit 0 (the real PR/local CI baseline)
 *   2. any-fail → exit 1 (stub extractionFloor.run → { status: 'fail' })
 *   3. all-pass → exit 0 (stub all three → { status: 'pass' })
 *   4. every check id in result — assert sorted ids deepEqual the canonical 3
 *   5. Markdown summary shape — header + all 3 check ids present
 *   6. non-qa-grounding 'pending' → exit 1 (pins the PENDING_ALLOWED runtime gate)
 *   7. 'skip' + EVAL_LIVE_REQUIRED unset → exit 0 (skip is non-failing on PR/local)
 *   8. 'skip' + EVAL_LIVE_REQUIRED='1' → exit 1 (C1-H1 live-required gate)
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { runEvalSuite } from '@/ai/eval/runner';
import { extractionFloor } from '@/ai/eval/checks/extraction-floor';
import { qaGrounding } from '@/ai/eval/checks/qa-grounding';
import { cacheHit } from '@/ai/eval/checks/cache-hit';

describe('runEvalSuite', () => {
  const originalLiveRequired = process.env.EVAL_LIVE_REQUIRED;

  afterEach(() => {
    vi.restoreAllMocks();
    // Restore EVAL_LIVE_REQUIRED to its pre-test value (Case 8 sets it).
    if (originalLiveRequired === undefined) {
      delete process.env.EVAL_LIVE_REQUIRED;
    } else {
      process.env.EVAL_LIVE_REQUIRED = originalLiveRequired;
    }
  });

  it('Case 1 — exit 0 when live checks skip + qa-grounding pending (EVAL_LIVE_REQUIRED unset)', async () => {
    // With the runtime gate live, the real PR/local baseline is: extraction-floor
    // + cache-hit return 'skip' (env-absent, no creds in CI) and qa-grounding stays
    // 'pending' (allowlisted). EVAL_LIVE_REQUIRED unset → skip is non-failing.
    delete process.env.EVAL_LIVE_REQUIRED;
    vi.spyOn(extractionFloor, 'run').mockResolvedValueOnce({
      id: 'extraction-floor',
      description: extractionFloor.description,
      status: 'skip',
      reason: 'test-stub: env-unavailable',
    });
    vi.spyOn(cacheHit, 'run').mockResolvedValueOnce({
      id: 'cache-hit',
      description: cacheHit.description,
      status: 'skip',
      reason: 'test-stub: env-unavailable',
    });
    const result = await runEvalSuite();
    expect(result.exitCode).toBe(0);
    expect(result.checks).toHaveLength(3);
    expect(result.checks.find((c) => c.id === 'extraction-floor')?.status).toBe('skip');
    expect(result.checks.find((c) => c.id === 'cache-hit')?.status).toBe('skip');
    expect(result.checks.find((c) => c.id === 'qa-grounding')?.status).toBe('pending');
  });

  it('Case 2 — exit 1 on any-fail (extractionFloor returns fail)', async () => {
    vi.spyOn(extractionFloor, 'run').mockResolvedValueOnce({
      id: 'extraction-floor',
      description: extractionFloor.description,
      status: 'fail',
      reason: 'test-stub: forced failure',
    });
    const result = await runEvalSuite();
    expect(result.exitCode).toBe(1);
    expect(result.checks.find((c) => c.id === 'extraction-floor')?.status).toBe('fail');
  });

  it('Case 3 — exit 0 on all-pass', async () => {
    vi.spyOn(extractionFloor, 'run').mockResolvedValueOnce({
      id: 'extraction-floor',
      description: extractionFloor.description,
      status: 'pass',
      reason: 'test-stub: pass',
    });
    vi.spyOn(qaGrounding, 'run').mockResolvedValueOnce({
      id: 'qa-grounding',
      description: qaGrounding.description,
      status: 'pass',
      reason: 'test-stub: pass',
    });
    vi.spyOn(cacheHit, 'run').mockResolvedValueOnce({
      id: 'cache-hit',
      description: cacheHit.description,
      status: 'pass',
      reason: 'test-stub: pass',
    });
    const result = await runEvalSuite();
    expect(result.exitCode).toBe(0);
    expect(result.checks.every((c) => c.status === 'pass')).toBe(true);
  });

  // Cases 4 + 5 call runEvalSuite() to assert structural shape (ids + summary).
  // They do NOT exercise any check's body. Since Plan 02-05 T02 flipped
  // extraction-floor to a LIVE check (it fires the real extractFromPaste agent
  // whenever ANTHROPIC_API_KEY is present — and tests/setup.ts loads a key from
  // .env.local), these cases now MUST stub the live checks to keep them from
  // making real network calls. Stubbing to 'skip' mirrors the env-absent baseline
  // and leaves the assertions (id membership / summary shape) unchanged.
  it('Case 4 — every canonical check id is present in the result', async () => {
    vi.spyOn(extractionFloor, 'run').mockResolvedValueOnce({
      id: 'extraction-floor',
      description: extractionFloor.description,
      status: 'skip',
      reason: 'test-stub: env-unavailable',
    });
    vi.spyOn(cacheHit, 'run').mockResolvedValueOnce({
      id: 'cache-hit',
      description: cacheHit.description,
      status: 'skip',
      reason: 'test-stub: env-unavailable',
    });
    const result = await runEvalSuite();
    const ids = result.checks.map((c) => c.id).sort();
    expect(ids).toEqual(['cache-hit', 'extraction-floor', 'qa-grounding']);
  });

  it('Case 5 — Markdown summary shape', async () => {
    vi.spyOn(extractionFloor, 'run').mockResolvedValueOnce({
      id: 'extraction-floor',
      description: extractionFloor.description,
      status: 'skip',
      reason: 'test-stub: env-unavailable',
    });
    vi.spyOn(cacheHit, 'run').mockResolvedValueOnce({
      id: 'cache-hit',
      description: cacheHit.description,
      status: 'skip',
      reason: 'test-stub: env-unavailable',
    });
    const result = await runEvalSuite();
    expect(result.summary).toContain('## Trochia eval harness');
    expect(result.summary).toContain('extraction-floor');
    expect(result.summary).toContain('qa-grounding');
    expect(result.summary).toContain('cache-hit');
  });

  it('Case 6 — exit 1 on a non-allowlisted pending (extractionFloor pending)', async () => {
    // PENDING_ALLOWED contains exactly 'qa-grounding'; a 'pending' from any other
    // check id forces exitCode 1 (FOLLOWUP-EVAL-PENDING-RUNTIME-GATE-01).
    delete process.env.EVAL_LIVE_REQUIRED;
    vi.spyOn(extractionFloor, 'run').mockResolvedValueOnce({
      id: 'extraction-floor',
      description: extractionFloor.description,
      status: 'pending',
      reason: 'test-stub: non-allowlisted pending',
    });
    // Mock cache-hit → 'skip' so the exit 1 is attributable to the extraction-floor
    // pending under test, not the unmocked cache-hit stub (also non-allowlisted).
    vi.spyOn(cacheHit, 'run').mockResolvedValueOnce({
      id: 'cache-hit',
      description: cacheHit.description,
      status: 'skip',
      reason: 'test-stub: env-unavailable',
    });
    const result = await runEvalSuite();
    expect(result.exitCode).toBe(1);
    expect(result.checks.find((c) => c.id === 'extraction-floor')?.status).toBe('pending');
  });

  it('Case 7 — exit 0 on skip when EVAL_LIVE_REQUIRED is unset', async () => {
    delete process.env.EVAL_LIVE_REQUIRED;
    vi.spyOn(extractionFloor, 'run').mockResolvedValueOnce({
      id: 'extraction-floor',
      description: extractionFloor.description,
      status: 'skip',
      reason: 'test-stub: env-unavailable',
    });
    // Mock cache-hit → 'skip' so the unmocked cache-hit 'pending' stub
    // (non-allowlisted) does not itself force exit 1 and mask the skip path.
    vi.spyOn(cacheHit, 'run').mockResolvedValueOnce({
      id: 'cache-hit',
      description: cacheHit.description,
      status: 'skip',
      reason: 'test-stub: env-unavailable',
    });
    const result = await runEvalSuite();
    expect(result.exitCode).toBe(0);
    expect(result.checks.find((c) => c.id === 'extraction-floor')?.status).toBe('skip');
  });

  it('Case 8 — exit 1 on skip when EVAL_LIVE_REQUIRED=1 (C1-H1 live-required gate)', async () => {
    process.env.EVAL_LIVE_REQUIRED = '1';
    vi.spyOn(extractionFloor, 'run').mockResolvedValueOnce({
      id: 'extraction-floor',
      description: extractionFloor.description,
      status: 'skip',
      reason: 'test-stub: env-unavailable on a live-required run',
    });
    // Mock cache-hit → 'skip' too: under EVAL_LIVE_REQUIRED=1 the extraction-floor
    // skip alone is the RED gate under test; this keeps the unmocked cache-hit
    // pending stub from being the (different) reason for exit 1.
    vi.spyOn(cacheHit, 'run').mockResolvedValueOnce({
      id: 'cache-hit',
      description: cacheHit.description,
      status: 'skip',
      reason: 'test-stub: env-unavailable',
    });
    const result = await runEvalSuite();
    expect(result.exitCode).toBe(1);
    expect(result.checks.find((c) => c.id === 'extraction-floor')?.status).toBe('skip');
  });
});
