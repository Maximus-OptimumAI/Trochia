/**
 * Barrel of all Inngest functions registered on the `/api/inngest` serve() endpoint.
 *
 * `serve({ client: inngest, functions: allFunctions })` — adding a new function means
 * exporting it from here.
 */
import { aiHealthCheckFn } from './ai-health-check';
import { embedMemory } from './embed-memory';
import { purgeSoftDeletedFn } from './purge-soft-deleted';
import { reconcileStripeFn } from './reconcile-stripe';
import {
  briefEnrichFn,
  deckParseFn,
  // embedFn intentionally removed in Plan 02-04 / T04 — replaced by embedMemory above.
  esignWebhookFn,
  remindersFn,
  transcribeFn,
} from './stubs';

export const allFunctions = [
  aiHealthCheckFn,
  reconcileStripeFn,
  purgeSoftDeletedFn,
  deckParseFn,
  embedMemory, // <-- replaces the old `embedFn` stub (id 'embed') from ./stubs
  transcribeFn,
  briefEnrichFn,
  esignWebhookFn,
  remindersFn,
];
