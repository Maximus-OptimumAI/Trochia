# Eval fixtures

This directory holds the **re-export seam**, not fixture data. The eval checks
reuse the canonical fixtures already committed at `tests/ai/fixtures/` via
`src/ai/eval/fixtures/index.ts` — nothing is duplicated here.

## What lives here

- **`index.ts`** — the re-export seam. Exports:
  - `PASTE_FIXTURE_PATHS` — absolute paths to the 5 paste fixtures at
    `tests/ai/fixtures/paste-*.txt`, anchored at `process.cwd()` so they resolve
    under both `npm run eval:run` (tsx) and `vitest`.
  - `loadFixtureText(path)` — reads a fixture's UTF-8 text.
- **`README.md`** — this file.

No fixture bodies are stored in this directory. The paste fixtures are the
single source of truth at `tests/ai/fixtures/` and are imported, not copied.

## How the checks use it

- **extraction-floor:** loads the 5 paste fixtures via `PASTE_FIXTURE_PATHS` +
  `loadFixtureText`, runs the real `extractFromPaste` agent on each, counts
  populated field groups via `countPopulatedFields`, and asserts the mean ≥ 8.
- **cache-hit:** uses no committed fixture — it reads live Anthropic
  prompt-cache metrics from Langfuse trace metadata over a bounded window.
- **qa-grounding:** stays `'pending'` until Plan 02-07's qa-rag agent lands
  (50-Q sample corpus + expected citation set).

## What stays out of this directory

- Any fixture body — reuse `tests/ai/fixtures/**`, never duplicate.
- Any tenant or founder data — fixtures are public-safe synthetic content only.
- The injection + PII fixtures (`tests/ai/fixtures/{injection-payloads,pii-fixtures}.json`)
  — those feed the DEFERRED sanitizer eval (FOLLOWUP-SANITIZER-EVAL-01, founder
  ruling 2026-05-31), a direct eval over `promptInjectionSanitizer` +
  `redactUnrelatedPartyPII`, NOT the paste seam. No path export for them lives
  in `index.ts`.
