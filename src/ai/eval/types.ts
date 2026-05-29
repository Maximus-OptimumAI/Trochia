/**
 * Eval harness types (EVAL-01a — Plan 02-04, Task 7).
 *
 * Three must-not-fail checks from Phase 2 exit gate (criteria 3, 4, 7):
 *   - extraction-floor: extractFromPaste auto-fills ≥8 fields from a 1,500-word paste
 *   - qa-grounding:     qa-rag agent emits zero fabricated citations on 50-Q sample
 *   - cache-hit:        Anthropic prompt-cache hit rate non-zero in Langfuse
 *
 * At Plan 02-04 close all three are stubs returning `'pending'` (fail-open).
 * The runner contract — `exit 0 on all-pending|all-pass`, `exit 1 on any-fail` —
 * is codified now and exercised in Plan 02-05 when the stubs flip to real
 * implementations (fail-closed at that point).
 */

export type EvalStatus = 'pending' | 'pass' | 'fail';

export type EvalCheckResult = {
  id: string;
  description: string;
  status: EvalStatus;
  reason: string;          // human-readable; in 'pending' it explains why
  metric?: number;         // optional numeric value (e.g. p50 latency, FP rate)
  threshold?: number;      // optional comparison threshold
};

export type EvalCheck = {
  id: string;
  description: string;
  run: () => Promise<EvalCheckResult>;
};

export type EvalSuiteResult = {
  checks: EvalCheckResult[];
  exitCode: 0 | 1;
  summary: string;         // Markdown
};
