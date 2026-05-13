/**
 * Sentry — server (Node.js) SDK init (FND-07 / D-13).
 *
 * Runs in the Node.js runtime (route handlers, server actions, RSC). `beforeSend`
 * deep-scrubs the shared `SENSITIVE_FIELDS` set (single source in `src/lib/logger.ts`)
 * so financial figures / deck text / transcript bodies never reach Sentry even
 * if they slip into an error context (XC-03). `beforeBreadcrumb` drops console
 * breadcrumbs (the redacting logger is the only logger).
 *
 * DSN from `SENTRY_DSN` (server-only); when unset, `Sentry.init` is a no-op.
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
