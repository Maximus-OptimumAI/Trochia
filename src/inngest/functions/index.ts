/**
 * Barrel of all Inngest functions registered on the `/api/inngest` serve() endpoint.
 *
 * `serve({ client: inngest, functions: allFunctions })` — adding a new function means
 * exporting it from here.
 */
import { aiHealthCheckFn } from './ai-health-check';
import { purgeSoftDeletedFn } from './purge-soft-deleted';
import { reconcileStripeFn } from './reconcile-stripe';
import {
  briefEnrichFn,
  deckParseFn,
  embedFn,
  esignWebhookFn,
  remindersFn,
  transcribeFn,
} from './stubs';

export const allFunctions = [
  aiHealthCheckFn,
  reconcileStripeFn,
  purgeSoftDeletedFn,
  deckParseFn,
  embedFn,
  transcribeFn,
  briefEnrichFn,
  esignWebhookFn,
  remindersFn,
];
