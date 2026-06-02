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

// ────────────────────────────────────────────────────────────────────────────
// qa-grounding fixtures (Plan 02-07 / T03)
// ────────────────────────────────────────────────────────────────────────────

/**
 * Repo-root-anchored directory holding the qa-grounding fixture Q-set. Unlike
 * the paste fixtures (which live under tests/), these are co-located with the
 * eval module (they are the eval's own Q-set, not shared test inputs).
 */
const QA_GROUNDING_FIXTURE_DIR = join(
  process.cwd(),
  'src',
  'ai',
  'eval',
  'fixtures',
  'qa-grounding',
);

/** The qa-grounding fixture filenames (starter set — expand per FOLLOWUP). */
const QA_GROUNDING_FIXTURE_FILES = ['in-scope.json', 'out-of-scope.json'] as const;

/**
 * Absolute paths to the qa-grounding fixture files. The qa-grounding check loads
 * each via `loadQaGroundingFixtures` and runs the REAL askQa over the Q-set,
 * asserting `debug.droppedCitationCount === 0` (criterion 7) + out-of-scope Qs
 * return grounded:false (criterion 6).
 *
 * The 50-Q / 10-out-of-scope full set grows against design-partner data
 * (FOLLOWUP-QA-GROUNDING-FIXTURE-EXPAND) — the SHAPE + a representative subset
 * are pinned here so the gate is real now.
 */
export const QA_GROUNDING_FIXTURE_PATHS: readonly string[] =
  QA_GROUNDING_FIXTURE_FILES.map((file) => join(QA_GROUNDING_FIXTURE_DIR, file));

/** One qa-grounding fixture entry (shape pinned in 02-07-PLAN T03 / F-6). */
export type QaGroundingFixture = {
  /** The founder's question to run through the real askQa. */
  question: string;
  /** Whether a grounded, cited answer is expected (in-scope) or "I don't know". */
  expectedGrounded: boolean;
  /** Deliberately out-of-scope Q — must return grounded:false (criterion 6). */
  isOutOfScope: boolean;
  /** The eval tenant id the question runs under. */
  accountId: string;
  /** A sourceId/marker the in-scope Qs should retrieve (confirms a real hit). */
  expectedRetrievableMarker: string;
};

/**
 * Load + parse all qa-grounding fixture entries from `QA_GROUNDING_FIXTURE_PATHS`.
 * Each file is a JSON array of `QaGroundingFixture`; the arrays are concatenated.
 * Throws (loudly) if a path is missing or a file is not a JSON array.
 */
export function loadQaGroundingFixtures(
  paths: readonly string[] = QA_GROUNDING_FIXTURE_PATHS,
): QaGroundingFixture[] {
  const all: QaGroundingFixture[] = [];
  for (const path of paths) {
    const parsed = JSON.parse(readFileSync(path, 'utf8')) as unknown;
    if (!Array.isArray(parsed)) {
      throw new Error(`qa-grounding fixture ${path} is not a JSON array`);
    }
    all.push(...(parsed as QaGroundingFixture[]));
  }
  return all;
}
