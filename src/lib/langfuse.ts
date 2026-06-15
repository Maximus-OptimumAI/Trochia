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
import { logger } from '@/lib/logger';

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

/**
 * Deliver any buffered Langfuse events before a serverless freeze or a short-lived
 * script (the eval harness, the deploy health-check) exits. The langfuse Node SDK
 * batches events and flushes on a timer, so without an explicit flush the process
 * exits before delivery and traces are silently lost (LANGFUSE-TRACING-01).
 *
 * Null-safe and never throws: with no creds `getLangfuseClient()` is `null` and this
 * is a no-op; a flush failure is logged, not thrown, so tracing never breaks a real
 * request. Called from the `ai/client.ts` `runAgent` `finally` (the chokepoint) so it
 * covers every Anthropic call — including the eval's own `runAgent` calls, which is
 * what lets the `cache-hit` check read real traces.
 */
export async function flushTracing(): Promise<void> {
  const client = getLangfuseClient();
  if (!client) return;
  try {
    await client.flushAsync();
  } catch (err) {
    logger.warn('langfuse: flushAsync failed (non-fatal — tracing only)', { err });
  }
}
