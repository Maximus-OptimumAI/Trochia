// Load .env.local BEFORE any other import that reads process.env (e.g. modules
// importing `@/lib/env` at module init). Explicit path — not the `dotenv/config`
// shorthand, which would load `.env` (doesn't exist in this repo). Not
// dotenv-flow either — explicit-over-magic; avoids the NODE_ENV cascade
// footgun. See tasks/lessons.md "Sibling plan-checker rules" entry.
import { config as loadEnv } from 'dotenv';
loadEnv({ path: '.env.local' });

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
