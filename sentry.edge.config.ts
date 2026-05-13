/**
 * Sentry — edge runtime SDK init (FND-07 / D-13).
 *
 * Runs in the Edge runtime (middleware, edge route handlers). Same scrub
 * discipline as the server config — `beforeSend` reuses the shared
 * `SENSITIVE_FIELDS` set (single source in `src/lib/logger.ts`); `beforeBreadcrumb`
 * drops console breadcrumbs (XC-03).
 *
 * DSN from `SENTRY_DSN`; when unset, `Sentry.init` is a no-op.
 */
import * as Sentry from '@sentry/nextjs';

import { scrubBreadcrumb, scrubEvent } from '@/lib/sentry-scrub';

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  enabled: Boolean(process.env.SENTRY_DSN),
  environment: process.env.NODE_ENV,
  tracesSampleRate: 0.1,
  beforeSend: scrubEvent,
  beforeBreadcrumb: scrubBreadcrumb,
});
