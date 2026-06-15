/**
 * Eval harness runner tests (EVAL-01a — Plan 02-04, Task 7; hardened in 02-05 T01).
 *
 * Codifies the runner contract, now a RUNTIME gate (Plan 02-05 T01; hardened in
 * 02-07 T03 — PENDING_ALLOWED is now EMPTY, so ANY 'pending' fails the run):
 *
 *   exit 0 on all-pass, or 'skip' (env-unavailable) when EVAL_LIVE_REQUIRED unset.
 *   exit 1 on any-fail, ANY 'pending' (the allowlist is empty), OR any 'skip'
 *           when EVAL_LIVE_REQUIRED==='1'.
 *
 * 9 cases:
 *   1. all three live checks 'skip' (EVAL_LIVE_REQUIRED unset)
 *      → exit 0 (the real PR/local CI baseline; qa-grounding is now a live check)
 *   2. any-fail → exit 1 (stub extractionFloor.run → { status: 'fail' })
 *   3. all-pass → exit 0 (stub all three → { status: 'pass' })
 *   4. every check id in result — assert sorted ids deepEqual the canonical 3
 *   5. Markdown summary shape — header + all 3 check ids present
 *   6. non-qa-grounding 'pending' → exit 1 (pins the PENDING_ALLOWED runtime gate)
 *   7. 'skip' + EVAL_LIVE_REQUIRED unset → exit 0 (skip is non-failing on PR/local)
 *   8. 'skip' + EVAL_LIVE_REQUIRED='1' → exit 1 (C1-H1 live-required gate)
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { runEvalSuite } from '@/ai/eval/runner';
import { extractionFloor } from '@/ai/eval/checks/extraction-floor';
import { qaGrounding } from '@/ai/eval/checks/qa-grounding';
import { cacheHit } from '@/ai/eval/checks/cache-hit';

describe('runEvalSuite', () => {
  const originalLiveRequired = process.env.EVAL_LIVE_REQUIRED;

  // 02-07 T03: qa-grounding is now a LIVE check that fires the real askQa →
  // hybridRetrieve + runAgent whenever ANTHROPIC_API_KEY is present (tests/setup
  // loads one from .env.local). Default it to 'skip' in EVERY case so the runner
  // suite stays hermetic; cases that need a different qa-grounding status set
  // their own mockResolvedValueOnce, which takes precedence over this default.
  beforeEach(() => {
    vi.spyOn(qaGrounding, 'run').mockResolvedValue({
      id: 'qa-grounding',
      description: qaGrounding.description,
      status: 'skip',
      reason: 'test-default: env-unavailable',
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    // Restore EVAL_LIVE_REQUIRED to its pre-test value (Case 8 sets it).
    if (originalLiveRequired === undefined) {
      delete process.env.EVAL_LIVE_REQUIRED;
    } else {
      process.env.EVAL_LIVE_REQUIRED = originalLiveRequired;
    }
  });

  it('Case 1 — exit 0 when all three live checks skip (EVAL_LIVE_REQUIRED unset)', async () => {
    // 02-07 T03 flipped qa-grounding to a LIVE check + emptied PENDING_ALLOWED.
    // The real PR/local baseline is now all three checks returning 'skip'
    // (env-absent, no creds in CI). EVAL_LIVE_REQUIRED unset → skip is non-failing.
    delete process.env.EVAL_LIVE_REQUIRED;
    vi.spyOn(extractionFloor, 'run').mockResolvedValueOnce({
      id: 'extraction-floor',
      description: extractionFloor.description,
      status: 'skip',
      reason: 'test-stub: env-unavailable',
    });
    vi.spyOn(qaGrounding, 'run').mockResolvedValueOnce({
      id: 'qa-grounding',
      description: qaGrounding.description,
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
    expect(result.checks.find((c) => c.id === 'qa-grounding')?.status).toBe('skip');
  });

  it('Case 1b — qa-grounding pending now FAILS the run (allowlist empty, 02-07 T03)', async () => {
    // The previously-allowlisted 'pending' for qa-grounding is no longer allowed:
    // PENDING_ALLOWED is empty, so ANY 'pending' forces exit 1. Mock the live
    // checks to 'skip' so the exit 1 is attributable solely to the qa-grounding
    // 'pending' under test.
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
    vi.spyOn(qaGrounding, 'run').mockResolvedValueOnce({
      id: 'qa-grounding',
      description: qaGrounding.description,
      status: 'pending',
      reason: 'test-stub: qa-grounding pending is no longer allowlisted',
    });
    const result = await runEvalSuite();
    expect(result.exitCode).toBe(1);
    expect(result.checks.find((c) => c.id === 'qa-grounding')?.status).toBe('pending');
  });

  it('Case 2 — exit 1 on any-fail (extractionFloor returns fail)', async () => {
    vi.spyOn(extractionFloor, 'run').mockResolvedValueOnce({
      id: 'extraction-floor',
      description: extractionFloor.description,
      status: 'fail',
      reason: 'test-stub: forced failure',
    });
    // cacheHit is now a LIVE check (Plan 02-05 T03); stub it so this runner unit
    // test stays hermetic — without this it fires a real fetchTraces against any
    // .env.local Langfuse creds. 'skip' is non-failing, so the asserted exit 1 is
    // attributable solely to extractionFloor's 'fail'.
    vi.spyOn(cacheHit, 'run').mockResolvedValueOnce({
      id: 'cache-hit',
      description: cacheHit.description,
      status: 'skip',
      reason: 'test-stub: env-unavailable',
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

  it('Case 8b — exit 0 on a DATA-unavailable skip under EVAL_LIVE_REQUIRED=1 (ingestion-lag tolerated, LANGFUSE-TRACING-01)', async () => {
    process.env.EVAL_LIVE_REQUIRED = '1';
    // A data-unavailable skip (no agent:* traces yet / Langfuse ingestion lag) is NOT
    // a regression → tolerated even on a live run. The other two checks pass so the
    // exit code reflects the cache-hit data-unavailable skip alone.
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
      status: 'skip',
      skipKind: 'data-unavailable',
      reason: 'test-stub: no agent:* traces in the window',
    });
    const result = await runEvalSuite();
    expect(result.exitCode).toBe(0);
    expect(result.checks.find((c) => c.id === 'cache-hit')?.skipKind).toBe('data-unavailable');
  });

  it('Case 8c — exit 1 on an ENV-unavailable skip under EVAL_LIVE_REQUIRED=1 (missing creds still RED the gate)', async () => {
    process.env.EVAL_LIVE_REQUIRED = '1';
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
      status: 'skip',
      skipKind: 'env-unavailable',
      reason: 'test-stub: Langfuse not configured',
    });
    const result = await runEvalSuite();
    expect(result.exitCode).toBe(1);
  });

  it('Case 9 — a thrown check becomes a sanitized fail (not a rejection), report still produced', async () => {
    // Per-check try/catch isolation (/codex P2 + /cso L3): a check that throws
    // must NOT reject Promise.all (which would skip the report write). It is
    // converted to a fail-CLOSED 'fail' result; the other checks + the summary
    // still resolve. Keep the live checks deterministic.
    delete process.env.EVAL_LIVE_REQUIRED;
    vi.spyOn(extractionFloor, 'run').mockRejectedValueOnce(
      new Error('boom: simulated check failure with sensitive-looking detail'),
    );
    vi.spyOn(cacheHit, 'run').mockResolvedValueOnce({
      id: 'cache-hit',
      description: cacheHit.description,
      status: 'skip',
      reason: 'test-stub: env-unavailable',
    });
    const result = await runEvalSuite();
    const ef = result.checks.find((c) => c.id === 'extraction-floor');
    expect(ef?.status).toBe('fail');
    expect(ef?.reason).toContain('check threw');
    expect(result.exitCode).toBe(1);
    // All three checks still present (no check dropped by the rejection).
    expect(result.checks).toHaveLength(3);
    expect(result.summary).toContain('## Trochia eval harness');
  });
});
