/**
 * The single Inngest app.
 *
 * Trochia uses ONE Inngest app served from ONE `serve()` endpoint at `/api/inngest`
 * (D-07). The Vercel↔Inngest integration auto-injects `INNGEST_SIGNING_KEY` /
 * `INNGEST_EVENT_KEY` in production; in dev they may be absent (the Inngest Dev
 * Server doesn't require them) — env.ts keeps them `.optional()` (Plan 07 owns
 * tightening them).
 */
import { Inngest } from 'inngest';

import { env } from '@/lib/env';

export const inngest = new Inngest({
  id: 'trochia',
  ...(env.INNGEST_EVENT_KEY ? { eventKey: env.INNGEST_EVENT_KEY } : {}),
});
