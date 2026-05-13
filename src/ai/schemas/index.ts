/**
 * Shared Zod structured-output schemas for `ai/client.ts` forced-tool-use calls.
 *
 * Mostly empty in Phase 1 — each later phase that needs a structured AI output
 * (deck-review issues, brief sections, scorecards, …) adds its schema here (or
 * co-located with the feature and re-exported). The one schema Phase 1 needs is
 * the trivial health-check shape.
 */
import { z } from 'zod';

/** The deploy-time Haiku health-check output: `{ ok: true }`. */
export const HealthCheckSchema = z.object({
  ok: z.boolean(),
});
export type HealthCheck = z.infer<typeof HealthCheckSchema>;
