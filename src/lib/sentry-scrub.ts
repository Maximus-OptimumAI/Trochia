/**
 * Sentry PII/financials scrub (XC-03).
 *
 * `beforeSend` for all three `Sentry.init` calls (client/server/edge) routes
 * the outgoing event through here so that any value whose key matches the
 * shared `SENSITIVE_FIELDS` set (single source of truth in `src/lib/logger.ts`)
 * is replaced with `'[redacted]'` — financial figures, deck text, transcript
 * bodies, tokens, etc. never reach Sentry even if they slip into an error
 * context (`event.extra`, `event.contexts`, `event.request.data`, breadcrumb
 * data, ...).
 *
 * It also drops `console` breadcrumbs (the redacting logger is the only logger;
 * raw `console.*` is lint-banned in `src/**`).
 */
import type { ErrorEvent, Breadcrumb } from '@sentry/nextjs';

import { redactSensitive } from '@/lib/logger';

/** Deep-scrub an arbitrary value, returning a structurally-identical copy. */
function scrub<T>(value: T): T {
  return redactSensitive(value) as T;
}

/** `beforeSend` — scrub the sensitive surfaces of the outgoing event. */
export function scrubEvent(event: ErrorEvent): ErrorEvent {
  if (event.extra) event.extra = scrub(event.extra);
  if (event.contexts) event.contexts = scrub(event.contexts);
  if (event.request?.data !== undefined) event.request.data = scrub(event.request.data);
  if (event.request?.headers) event.request.headers = scrub(event.request.headers);
  if (event.request?.cookies) event.request.cookies = scrub(event.request.cookies);
  if (event.user) event.user = scrub(event.user);
  if (event.tags) event.tags = scrub(event.tags);
  if (Array.isArray(event.breadcrumbs)) {
    event.breadcrumbs = event.breadcrumbs.map((b) =>
      b.data ? { ...b, data: scrub(b.data) } : b,
    );
  }
  return event;
}

/** `beforeBreadcrumb` — drop console breadcrumbs, scrub the rest. */
export function scrubBreadcrumb(breadcrumb: Breadcrumb): Breadcrumb | null {
  if (breadcrumb.category === 'console') return null;
  if (breadcrumb.data) breadcrumb.data = scrub(breadcrumb.data);
  return breadcrumb;
}
