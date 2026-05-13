/**
 * The single Inngest serve() endpoint (D-07 / FND-11).
 *
 * All Inngest functions (the AI health-check, the reconcile-stripe + purge-soft-deleted
 * crons, and the stub functions for the future workloads) are served from here. The
 * Vercel↔Inngest integration auto-wires the signing/event keys + this endpoint on
 * deploy. `maxDuration` can go to 800 on Vercel Pro — 300 is plenty for Phase 1
 * (keep individual `step.run` units small; long work is split across steps).
 */
import { serve } from 'inngest/next';

import { env } from '@/lib/env';

import { inngest } from '@/inngest/client';
import { allFunctions } from '@/inngest/functions';

export const maxDuration = 300;

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: allFunctions,
  ...(env.INNGEST_SIGNING_KEY ? { signingKey: env.INNGEST_SIGNING_KEY } : {}),
});
