/**
 * Cache-hit check (Phase 2 exit gate criterion 4).
 *
 * Target: Anthropic prompt-cache hit rate is non-zero in Langfuse over the eval
 * window. Real implementation queries Langfuse for the last N traces, sums
 * `cache_read_input_tokens` vs `input_tokens`, and asserts the ratio > 0.
 *
 * Stub status: returns `'pending'` at Plan 02-04 close. Plan 02-05 flips this
 * stub to a real eval once the Langfuse query path lands.
 */
import type { EvalCheck } from '../types';

export const cacheHit: EvalCheck = {
  id: 'cache-hit',
  description:
    'Anthropic prompt-cache hit rate non-zero in Langfuse (Phase 2 exit gate criterion 4)',
  async run() {
    return {
      id: this.id,
      description: this.description,
      status: 'pending' as const,
      reason:
        'Stub at plan 02-04 close; flipped to real eval in plan 02-05 (Langfuse cache-hit metric path)',
    };
  },
};
