/**
 * QA-grounding check (Phase 2 exit gate criterion 7).
 *
 * Target: the qa-rag agent emits zero fabricated citations on a 50-question
 * sample corpus. "Fabricated" = citation whose chunk_id is not present in the
 * retrieved set for that turn. Real implementation depends on Plan 02-07's
 * qa-rag agent + the 50-Q sample set landing.
 *
 * Stub status: returns `'pending'` at Plan 02-04 close. Plan 02-05 keeps this
 * as pending (qa-rag doesn't exist yet); flipped to real eval in the plan that
 * lands qa-rag.
 */
import type { EvalCheck } from '../types';

export const qaGrounding: EvalCheck = {
  id: 'qa-grounding',
  description:
    'qa-rag agent emits zero fabricated citations on 50-Q sample corpus (Phase 2 exit gate criterion 7)',
  async run() {
    return {
      id: this.id,
      description: this.description,
      status: 'pending' as const,
      reason:
        'Stub at plan 02-04 close; depends on Plan 02-07 qa-rag agent — flipped to real eval when qa-rag lands',
    };
  },
};
