/**
 * Sentry — browser SDK init (FND-07 / D-13).
 *
 * Runs on the client. Modest sample rates for Phase 1 (errors always captured;
 * performance traces and session replay sampled low). `beforeSend` /
 * `beforeBreadcrumb` route through `src/lib/sentry-scrub.ts`, which reuses the
 * redacting logger's shared `SENSITIVE_FIELDS` set — PII / financials never
 * leave the browser via Sentry (XC-03).
 *
 * The DSN comes from `NEXT_PUBLIC_SENTRY_DSN` (a public-by-design value); when
 * it is unset (dev / pre-provisioning), `Sentry.init` is a no-op.
 */
import * as Sentry from '@sentry/nextjs';

import { scrubBreadcrumb, scrubEvent } from '@/lib/sentry-scrub';

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  enabled: Boolean(process.env.NEXT_PUBLIC_SENTRY_DSN),
  environment: process.env.NODE_ENV,
  // Phase 1: low performance sampling — bump per route once we know hot paths.
  tracesSampleRate: 0.1,
  // Session replay: off by default, sample errors only.
  replaysSessionSampleRate: 0,
  replaysOnErrorSampleRate: 0.1,
  beforeSend: scrubEvent,
  beforeBreadcrumb: scrubBreadcrumb,
});
