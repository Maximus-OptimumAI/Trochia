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
 * Exits 0 (pass) on a clean tree OR when no prod build output exists yet (a bare
 * step that didn't build has nothing to leak); exits 1 (fail) listing every
 * offending file when any `.map` is present.
 */
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

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

if (!existsSync(CHUNKS_DIR)) {
  console.log(
    `assert-no-public-sourcemaps: ${CHUNKS_DIR} not found — no production build output to check (pass).`,
  );
  process.exit(0);
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
