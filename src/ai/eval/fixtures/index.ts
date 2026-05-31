/**
 * Eval fixture re-export seam (Plan 02-05 / T02).
 *
 * This module is the single place the eval checks reach for fixture INPUTS. It
 * holds NO fixture bodies — the canonical paste fixtures live at
 * `tests/ai/fixtures/paste-*.txt` (shipped with the extractFromPaste plan) and
 * are reused, never duplicated, per the README "import or re-export, do NOT
 * duplicate" contract.
 *
 * Resolution: paths are anchored at `process.cwd()` (the repo root) + the
 * canonical `tests/ai/fixtures/` directory. Both entry points run from the repo
 * root — `npm run eval:run` ("tsx src/ai/eval/runner.ts") and `vitest` (config
 * rooted at the repo) — so `process.cwd()` is the repo root under both. This
 * avoids the `@/*` alias (which maps to `./src`, NOT `tests/`) and the
 * `import.meta.url` walk-up (brittle across the tsx-vs-vitest module graph).
 *
 * The sanitizer eval (injection + PII fixtures) is DEFERRED to
 * FOLLOWUP-SANITIZER-EVAL-01 (founder ruling 2026-05-31, C1-H4/OD-1) — those
 * fixtures are evaluated by a DIRECT eval over promptInjectionSanitizer +
 * redactUnrelatedPartyPII, NOT via this paste seam, so no INJECTION_FIXTURE_PATH
 * / PII_FIXTURE_PATH export lives here.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/** Repo-root-anchored directory holding the canonical paste fixtures. */
const FIXTURE_DIR = join(process.cwd(), 'tests', 'ai', 'fixtures');

/** The 5 canonical paste fixture filenames (Gate 6 count pin — exactly 5). */
const PASTE_FIXTURE_FILES = [
  'paste-acme-fintech.txt',
  'paste-helix-saas.txt',
  'paste-mosaic-marketplace.txt',
  'paste-tributary-healthtech.txt',
  'paste-vanta-hardware.txt',
] as const;

/**
 * Absolute paths to the 5 canonical paste fixtures. The extraction-floor check
 * loads each via `loadFixtureText` and scores the real extractFromPaste agent
 * against it. The mean populated-field count across these 5 is the metric.
 */
export const PASTE_FIXTURE_PATHS: readonly string[] = PASTE_FIXTURE_FILES.map(
  (file) => join(FIXTURE_DIR, file),
);

/** Read a fixture's UTF-8 text. Throws (loudly) if the path is missing. */
export function loadFixtureText(path: string): string {
  return readFileSync(path, 'utf8');
}
