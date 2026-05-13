/**
 * Langfuse seam — WIRED (Plan 05).
 *
 * `src/ai/client.ts` (Plan 04) consumes `getLangfuseClient()` +
 * `isLangfuseConfigured()` from this file. The indirection is deliberate: the
 * Anthropic chokepoint never imports the Langfuse SDK directly, and this file
 * is the only place that constructs the client. Do NOT move the
 * `new Langfuse(...)` construction back into `ai/client.ts`.
 *
 * - `isLangfuseConfigured()` → true iff the 3 env vars are set.
 * - `getLangfuseClient()`    → memoized singleton when configured, else `null`.
 * Cache-hit-rate (XC-06) lands here via `ai/client.ts`'s `trace.update(...)`
 * calls — the deploy-time Haiku health-check produces the first real trace.
 */
import { Langfuse } from 'langfuse';

import { env } from '@/lib/env';

/** True iff the 3 Langfuse credentials are set. */
export function isLangfuseConfigured(): boolean {
  return Boolean(env.LANGFUSE_PUBLIC_KEY && env.LANGFUSE_SECRET_KEY && env.LANGFUSE_HOST);
}

let cached: Langfuse | null = null;

/** The memoized Langfuse client, or `null` when unconfigured. */
export function getLangfuseClient(): Langfuse | null {
  if (!isLangfuseConfigured()) return null;
  if (cached) return cached;
  cached = new Langfuse({
    publicKey: env.LANGFUSE_PUBLIC_KEY,
    secretKey: env.LANGFUSE_SECRET_KEY,
    baseUrl: env.LANGFUSE_HOST,
  });
  return cached;
}
