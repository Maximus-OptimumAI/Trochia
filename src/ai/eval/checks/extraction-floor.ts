/**
 * Extraction-floor check (Phase 2 exit gate criterion 3).
 *
 * Target (codified in Plan 02-05): given a 1,500-word paste fixture, the
 * `extractFromPaste` agent auto-fills ≥8 fields. Fixtures already exist at
 * `tests/ai/fixtures/paste-*.txt` (5 paste fixtures shipped with the Phase 2
 * extractFromPaste plan). The real implementation reads each, runs the agent,
 * counts non-null/non-empty output fields, and asserts the floor.
 *
 * Stub status: returns `'pending'` at Plan 02-04 close. The runner contract
 * treats pending as fail-open at this stage; Plan 02-05 flips this stub to a
 * real eval that returns `'pass'` or `'fail'` with a metric (mean field count
 * across the 5 fixtures) and a threshold (8).
 */
import type { EvalCheck } from '../types';

export const extractionFloor: EvalCheck = {
  id: 'extraction-floor',
  description:
    'extractFromPaste auto-fills ≥8 fields from a 1,500-word paste fixture (Phase 2 exit gate criterion 3)',
  async run() {
    return {
      id: this.id,
      description: this.description,
      status: 'pending' as const,
      reason:
        'Stub at plan 02-04 close; flipped to real eval in plan 02-05 (Week 4 verification loop step 5)',
    };
  },
};
