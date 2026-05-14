import { defineConfig } from 'vitest/config';
import path from 'node:path';

/**
 * Vitest config.
 *
 * Default environment is `node`. Component tests that need a DOM opt in with a
 * per-file docblock: `// @vitest-environment jsdom` (a React plugin / Testing
 * Library wiring is added by the plan that introduces the first component test).
 *
 * E2E (`e2e/**`) is owned by Playwright and excluded here.
 */
export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      // `server-only` is a Next build-time guard; under vitest (no `react-server`
      // export condition) its default entry throws — alias it to the no-op shim so
      // server modules under test (db/, server/) import cleanly.
      'server-only': path.resolve(__dirname, './node_modules/server-only/empty.js'),
    },
  },
  test: {
    environment: 'node',
    setupFiles: ['./tests/setup.ts'],
    include: ['tests/**/*.test.{ts,tsx}', 'src/**/*.test.{ts,tsx}'],
    exclude: ['e2e/**', 'node_modules/**', '.next/**'],
    // Run test files SERIALLY. The RLS-suite integration tests
    // (`tests/rls/*` + `tests/db/owner-user-id-uniqueness.test.ts`) all
    // connect to the same `TEST_DATABASE_URL` and call
    // `tests/db/test-db.ts:cleanup()` which does `TRUNCATE ... CASCADE` on
    // shared tables. With the default parallel-file pool, file A's cleanup
    // TRUNCATEs the seed data file B just inserted — FK violations land
    // mid-test from a perfectly correct seed sequence (auth.users →
    // public.users → accounts → jobs). Surfaced by PR-1 CI failures at
    // c188bf3 (FK violations on owner-user-id-uniqueness.test.ts:79 and
    // two-user-isolation.test.ts:55).
    //
    // Trade-off: ~16s parallel → ~50s serial for the current Phase-1 suite.
    // Acceptable for now (one minute is the agreed CI budget); revisit
    // before Phase 4 if the suite grows past ~2 minutes — at that point,
    // refactor `cleanup()` to delete by scoped predicate (per-suite tag
    // column) instead of `TRUNCATE ... CASCADE`, then re-enable parallelism.
    fileParallelism: false,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      exclude: ['**/*.config.*', '**/.next/**', 'e2e/**', 'tests/**'],
    },
  },
});
