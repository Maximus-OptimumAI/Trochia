/**
 * Eval harness types (EVAL-01a - Plan 02-04, Task 7).
 *
 * Three must-not-fail checks from Phase 2 exit gate (criteria 3, 4, 7):
 *   - extraction-floor: extractFromPaste auto-fills ≥8 fields from a 1,500-word paste
 *   - qa-grounding:     qa-rag agent emits zero fabricated citations on 50-Q sample
 *   - cache-hit:        Anthropic prompt-cache hit rate non-zero in Langfuse
 *
 * At Plan 02-04 close all three are stubs returning `'pending'` (fail-open).
 * The runner contract - `exit 0 on all-pending|all-pass`, `exit 1 on any-fail` -
 * is codified now and exercised in Plan 02-05 when the stubs flip to real
 * implementations (fail-closed at that point).
 */

/**
 * Eval check status model (OD-A + C1-H1).
 *
 *   - 'pending' = NOT-YET-IMPLEMENTED. The check has no real body yet. Only
 *                 `qa-grounding` may carry it (runner allowlists it via
 *                 PENDING_ALLOWED); any other 'pending' fails the run.
 *   - 'pass'    = the check ran and met its threshold.
 *   - 'fail'    = the check ran and missed its threshold (fail-CLOSED → exit 1).
 *   - 'skip'    = ENV-UNAVAILABLE. The check could not reach its live dependency
 *                 (e.g. ANTHROPIC_API_KEY / Langfuse creds absent). Fail-OPEN in
 *                 NON-live contexts (PR / local CI) - never blocks. BUT when the
 *                 runner sees `EVAL_LIVE_REQUIRED === '1'` (nightly / manual live
 *                 runs), a 'skip' becomes a FAILURE (exit 1): a run that was
 *                 SUPPOSED to reach its dependency and could not is a RED gate,
 *                 not a silent pass.
 *
 * 'skip' (env-unavailable) and 'pending' (not-yet-implemented) are deliberately
 * distinct: a flipped check computes pass/fail/skip from a variable and never
 * carries the literal 'pending'.
 */
export type EvalStatus = 'pending' | 'pass' | 'fail' | 'skip';

/**
 * Why a check 'skip'ped (LANGFUSE-TRACING-01). The runner treats these differently
 * under EVAL_LIVE_REQUIRED:
 *   - 'env-unavailable'  = a live dependency (creds: ANTHROPIC / Langfuse) was absent.
 *                          A live run that was SUPPOSED to reach it and could not is a
 *                          RED gate (the original C1-H1 intent) → promoted to FAIL.
 *   - 'data-unavailable' = the dependency was reached but had no data yet (no agent:*
 *                          traces in the window, or Langfuse ingestion lag). NOT a
 *                          regression → tolerated even on a live run.
 */
export type SkipKind = 'env-unavailable' | 'data-unavailable';

export type EvalCheckResult = {
  id: string;
  description: string;
  status: EvalStatus;
  reason: string;          // human-readable; in 'pending'/'skip' it explains why
  metric?: number;         // optional numeric value (e.g. p50 latency, FP rate)
  threshold?: number;      // optional comparison threshold
  skipKind?: SkipKind;     // only meaningful when status === 'skip' (LANGFUSE-TRACING-01)
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
