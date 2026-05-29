# Eval fixtures

Placeholder. Real fixtures land in **Plan 02-05** (Phase 2 verification loop,
Week 4 → Week 5 hand-off).

## What lands here in Plan 02-05

- Anchor inputs for each must-not-fail check:
  - **extraction-floor:** the 5 paste fixtures already present at
    `tests/ai/fixtures/paste-*.txt` are the source for this check. Plan 02-05
    will either symlink them here or import them directly from `tests/ai/fixtures/`.
  - **qa-grounding:** 50-Q sample corpus + expected citation set (depends on
    Plan 02-07's qa-rag agent — until then the stub stays `'pending'`).
  - **cache-hit:** Langfuse trace-window definition (no committed fixture;
    the check pulls live cache metrics from Langfuse over a configurable window).

## What stays out of this directory

- Anything that overlaps with Vitest fixtures (`tests/ai/fixtures/**`) — reuse
  rather than duplicate. The eval harness imports from there.
- Anything that contains tenant or founder data — fixtures are public-safe
  synthetic content only.

## Why this is a placeholder at Plan 02-04 close

The eval runner scaffold + CI workflow ship in Plan 02-04 with all three checks
returning `'pending'` (fail-open) so the contract (`exit 0 on all-pending`,
`exit 1 on any-fail`) can be exercised by `tests/ai/eval/runner.test.ts` before
real evals exist. Plan 02-05 flips the first two stubs to real implementations
and adds the supporting fixtures here.
