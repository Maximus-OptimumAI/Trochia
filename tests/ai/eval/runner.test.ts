/**
 * Eval harness runner tests (EVAL-01a — Plan 02-04, Task 7).
 *
 * Codifies the runner contract that Plan 02-05 will exercise when the 3 stub
 * checks flip to real implementations:
 *
 *   exit 0 on all-pending or all-pass
 *   exit 1 on any-fail
 *
 * 5 cases:
 *   1. all-pending → exit 0 (the baseline at Plan 02-04 close)
 *   2. any-fail → exit 1 (stub extractionFloor.run to return { status: 'fail' })
 *   3. all-pass → exit 0 (stub all three to return { status: 'pass' })
 *   4. every check id in result — assert sorted ids deepEqual the canonical 3
 *   5. Markdown summary shape — header + all 3 check ids present
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { runEvalSuite } from '@/ai/eval/runner';
import { extractionFloor } from '@/ai/eval/checks/extraction-floor';
import { qaGrounding } from '@/ai/eval/checks/qa-grounding';
import { cacheHit } from '@/ai/eval/checks/cache-hit';

describe('runEvalSuite', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('Case 1 — exit 0 on all-pending', async () => {
    // No mocks: the 3 stubs all return { status: 'pending' } at Plan 02-04 close.
    const result = await runEvalSuite();
    expect(result.exitCode).toBe(0);
    expect(result.checks).toHaveLength(3);
    expect(result.checks.every((c) => c.status === 'pending')).toBe(true);
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

  it('Case 4 — every canonical check id is present in the result', async () => {
    const result = await runEvalSuite();
    const ids = result.checks.map((c) => c.id).sort();
    expect(ids).toEqual(['cache-hit', 'extraction-floor', 'qa-grounding']);
  });

  it('Case 5 — Markdown summary shape', async () => {
    const result = await runEvalSuite();
    expect(result.summary).toContain('## Trochia eval harness');
    expect(result.summary).toContain('extraction-floor');
    expect(result.summary).toContain('qa-grounding');
    expect(result.summary).toContain('cache-hit');
  });
});
