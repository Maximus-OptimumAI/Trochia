/**
 * AI chokepoint health-check — a ~10-token Haiku ping through `runAgent`.
 *
 * Invoked by the `ai-health-check` Inngest function (on deploy + manually). Its job
 * is to exercise `ai/client.ts` end-to-end so Langfuse captures a real trace per
 * deploy — cache-hit-rate, token counts, latency, cost — confirming the prompt-caching
 * + instrumentation path works BEFORE Phase 2 builds the memory spine on it (XC-06).
 * Until Plan 05 provisions the Langfuse keys, the trace path is a safe no-op.
 */
import { runAgent } from './client';
import { HealthCheckSchema, type HealthCheck } from './schemas';

/** Run the deploy-time Haiku ping. Returns `{ ok: true }` when the chokepoint is healthy. */
export async function aiHealthCheck(): Promise<HealthCheck> {
  return runAgent({
    taskClass: 'classify',
    stablePrefix: {
      system: 'You are a health-check probe. Call the emit_result tool with { "ok": true }.',
    },
    variableSuffix: 'ping',
    schema: HealthCheckSchema,
    maxTokens: 64,
  });
}
