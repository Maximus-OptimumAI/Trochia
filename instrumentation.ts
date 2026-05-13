/**
 * Next.js instrumentation hook (Next 16) — Sentry server/edge init + the
 * request-error capture (FND-07 / D-13).
 *
 * `register()` loads the runtime-appropriate Sentry config (server vs edge);
 * `onRequestError` forwards uncaught request errors to Sentry. The browser SDK
 * is initialized separately by `sentry.client.config.ts` (loaded automatically
 * by `@sentry/nextjs`).
 */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    await import('./sentry.server.config');
  }
  if (process.env.NEXT_RUNTIME === 'edge') {
    await import('./sentry.edge.config');
  }
}

export { captureRequestError as onRequestError } from '@sentry/nextjs';
