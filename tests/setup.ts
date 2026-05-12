/**
 * Global test setup.
 *
 * - Provides a minimal valid env so modules that `import { env } from '@/lib/env'`
 *   don't blow up at import time. Individual tests that want to exercise env
 *   validation failures override `process.env` and re-import with `vi.resetModules()`.
 * - Boots an MSW Node server shared by all tests. Later plans register handlers
 *   for Stripe / Anthropic / Amplitude etc. via `server.use(...)`.
 */
import { afterAll, afterEach, beforeAll } from 'vitest';
import { setupServer } from 'msw/node';

// Minimal env so `@/lib/env` parses during tests. (Real values come from CI/.env.local.)
process.env.NEXT_PUBLIC_SITE_URL ??= 'http://localhost:3000';
process.env.NEXT_PUBLIC_APP_URL ??= 'http://localhost:3000';

/** Shared MSW server. Tests add handlers with `server.use(...)`. */
export const server = setupServer();

beforeAll(() => server.listen({ onUnhandledRequest: 'warn' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());
