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
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      exclude: ['**/*.config.*', '**/.next/**', 'e2e/**', 'tests/**'],
    },
  },
});
