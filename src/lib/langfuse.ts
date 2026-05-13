/**
 * Langfuse seam — STUB until Plan 05.
 *
 * `src/ai/client.ts` consumes `getLangfuseClient()` + `isLangfuseConfigured()`
 * from THIS file. That is deliberate: Plan 05 (observability + email) provisions
 * the Langfuse account/keys and fills in the real implementation HERE — it does
 * NOT touch `src/ai/client.ts`. Do NOT move the `new Langfuse(...)` construction
 * back into `ai/client.ts`; the indirection is the whole point.
 *
 * Until Plan 05:
 *   - `isLangfuseConfigured()` → false
 *   - `getLangfuseClient()`    → null
 * `ai/client.ts` does `const langfuse = getLangfuseClient()` and `langfuse?.trace(...)`
 * so the trace path is a safe no-op in Phase 1 and "just works" once Plan 05 lands.
 */
import type { Langfuse } from 'langfuse';

/**
 * True iff the Langfuse credentials are configured.
 *
 * TODO(Plan 05): return `Boolean(env.LANGFUSE_PUBLIC_KEY && env.LANGFUSE_SECRET_KEY && env.LANGFUSE_HOST)`.
 */
export function isLangfuseConfigured(): boolean {
  return false;
}

/**
 * The memoized Langfuse client, or `null` when unconfigured.
 *
 * TODO(Plan 05): when `isLangfuseConfigured()`, return a memoized singleton
 * `new Langfuse({ publicKey: env.LANGFUSE_PUBLIC_KEY, secretKey: env.LANGFUSE_SECRET_KEY, baseUrl: env.LANGFUSE_HOST })`.
 */
export function getLangfuseClient(): Langfuse | null {
  return null;
}
