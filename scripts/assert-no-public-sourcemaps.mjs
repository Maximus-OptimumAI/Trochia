/**
 * Build-time guard (FOLLOWUP-SOURCEMAP-PROD-PUBLIC-HARDENING-01).
 *
 * Asserts that the production build emitted ZERO browser source maps under
 * `.next/static/chunks/` — a public `.map` served from there would leak original
 * source / IP. Runs as the first step of `postbuild`, so a regression fails the
 * build (and therefore the Vercel deploy) rather than shipping silently.
 *
 * `next.config.ts` sets `productionBrowserSourceMaps: false` (and Next's own
 * default is false); this script is the ENFORCEMENT that catches any future
 * change — a re-added `withSentryConfig` that forgets to hide/delete maps, a
 * stray `productionBrowserSourceMaps: true`, etc.
 *
 * Behavior: equivalent to asserting `glob('.next/static/chunks/**\/*.map') === []`.
 * FAIL-CLOSED (SRCMAP-FAILOPEN-01):
 *   - No `.next/` at all → genuine non-build context → exit 0 (pass).
 *   - `.next/` exists but `.next/static/chunks/` is missing → unexpected build
 *     layout (wrong CWD / changed Next output / missing artifact) → exit 1 (fail);
 *     a postbuild gate must never greenlight a deploy without inspecting chunks.
 *   - chunks present + clean → exit 0; any `.map` present → exit 1 listing each.
 */
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const BUILD_DIR = '.next';
const CHUNKS_DIR = join('.next', 'static', 'chunks');

/** Recursively collect every `.map` path under `dir`. */
function findSourceMaps(dir) {
  const found = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) found.push(...findSourceMaps(full));
    else if (entry.name.endsWith('.map')) found.push(full);
  }
  return found;
}

// FAIL-CLOSED (SRCMAP-FAILOPEN-01). As a postbuild deploy gate this must not green-light
// a deploy without actually inspecting the public chunks tree:
//   - No `.next/` at all → genuine non-build context (a bare lint/test step) → pass.
//   - `.next/` EXISTS but `.next/static/chunks/` is missing → unexpected build layout
//     (wrong CWD, changed Next output, missing artifact) → FAIL, do not greenlight.
if (!existsSync(BUILD_DIR)) {
  console.log(
    `assert-no-public-sourcemaps: ${BUILD_DIR} not found — no build context (pass).`,
  );
  process.exit(0);
}

if (!existsSync(CHUNKS_DIR)) {
  console.error(
    `assert-no-public-sourcemaps: FAIL — ${BUILD_DIR} exists but ${CHUNKS_DIR} is missing ` +
      `(unexpected build layout / wrong working directory). Refusing to pass the deploy gate ` +
      `without inspecting the public chunks tree.`,
  );
  process.exit(1);
}

const maps = findSourceMaps(CHUNKS_DIR);

if (maps.length > 0) {
  console.error(
    `assert-no-public-sourcemaps: FAIL — ${maps.length} public source map(s) under ${CHUNKS_DIR}:\n` +
      maps.map((m) => `  - ${m}`).join('\n') +
      `\n\nA browser .map under static/chunks/ leaks original source. Ensure next.config.ts keeps ` +
      `productionBrowserSourceMaps:false, and if withSentryConfig is restored, that it deletes/hides ` +
      `maps after upload (FOLLOWUP-SENTRY-BUILD-INTEGRATION-RESTORE-01).`,
  );
  process.exit(1);
}

console.log(`assert-no-public-sourcemaps: PASS — no .map under ${CHUNKS_DIR}.`);
process.exit(0);
