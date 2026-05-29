/**
 * Stub Inngest functions for the eventual workloads.
 *
 * These are REAL `inngest.createFunction` definitions (so the wiring — event names,
 * concurrency caps, retries, the serve() registration — is proven now) with no-op
 * bodies. Each later phase replaces the body with the real implementation:
 *
 *   - deck-parse      (event `deck/uploaded`)            — Phase 2/3 (LlamaParse → slide JSON)
 *   - transcribe      (event `transcript/uploaded`)      — Phase 4 (transcript parse + align)
 *   - brief-enrich    (event `brief/enrich.requested`)   — Phase 4 (pre-call brief enrichment)
 *   - esign-webhook   (event `esign/event.received`)     — Phase 9 (Dropbox Sign envelope events)
 *   - reminders       (cron `0 9 * * *`)                 — Phase 3 (application / follow-up reminders)
 *
 * The former `embed` stub (event `embedding/requested`) was REMOVED in Plan 02-04 /
 * T04 — replaced by the real `embedMemory` function at `./embed-memory.ts` which
 * triggers on `memory.confirmed` (per-tenant concurrency 3, retries 2).
 */
import { logger } from '@/lib/logger';

import { inngest } from '../client';

export const deckParseFn = inngest.createFunction(
  { id: 'deck-parse', retries: 4, concurrency: { limit: 5 }, triggers: [{ event: 'deck/uploaded' }] },
  async () => {
    logger.info('stub: deck-parse — implemented in Phase 2/3');
  },
);

export const transcribeFn = inngest.createFunction(
  { id: 'transcribe', retries: 4, concurrency: { limit: 3 }, triggers: [{ event: 'transcript/uploaded' }] },
  async () => {
    logger.info('stub: transcribe — implemented in Phase 4');
  },
);

export const briefEnrichFn = inngest.createFunction(
  { id: 'brief-enrich', retries: 4, concurrency: { limit: 5 }, triggers: [{ event: 'brief/enrich.requested' }] },
  async () => {
    logger.info('stub: brief-enrich — implemented in Phase 4');
  },
);

export const esignWebhookFn = inngest.createFunction(
  { id: 'esign-webhook', retries: 4, concurrency: { limit: 5 }, triggers: [{ event: 'esign/event.received' }] },
  async () => {
    logger.info('stub: esign-webhook — implemented in Phase 9');
  },
);

export const remindersFn = inngest.createFunction(
  { id: 'reminders', retries: 4, concurrency: { limit: 1 }, triggers: [{ cron: '0 9 * * *' }] },
  async () => {
    logger.info('stub: reminders — implemented in Phase 3');
  },
);
