/**
 * Redacting logger (XC-03 / D-06b).
 *
 * Thin wrapper around `console` that deep-redacts values whose key matches a
 * known sensitive field name before anything is emitted. `SENSITIVE_FIELDS` is
 * exported as the single source of truth — Sentry's `beforeSend` reuses this
 * exact set in Plan 05.
 *
 * Raw `console.*` is lint-banned in `src/**` (this file is the one exception);
 * everything that needs to log goes through `logger`.
 */

/**
 * Sensitive field names. Small now — grows in Phase 8/9 when cap-table figures
 * and audio data exist. Matching is case-insensitive and substring-aware
 * (`valuationCap`, `priceCap`, etc. all match `cap`-ish entries below by exact
 * key; see `isSensitiveKey`).
 */
export const SENSITIVE_FIELDS: ReadonlySet<string> = new Set([
  'amount',
  'valuationCap',
  'capTable',
  'audio',
  'financialFigure',
  'cardNumber',
  'ssn',
  'accreditation',
  'password',
  'token',
  'secret',
  'apiKey',
  // PR-5 / /codex 01-07 [P2] finding #5: user emails are PII under GDPR.
  // The substring matcher catches `email`, `customerEmail`, `ownerEmail`,
  // `accountEmail`, etc. We DELIBERATELY do NOT add the short keys `to`
  // or `recipient` — those substring-match too aggressively (`to` would
  // hit `tomorrow`, `accountToken`, etc.). The fix at call sites is to
  // not pass raw emails as `to:` in log payloads — see src/lib/email/client.ts.
  'email',
]);

const REDACTED = '[redacted]';

const SENSITIVE_LOWER = new Set(
  Array.from(SENSITIVE_FIELDS, (f) => f.toLowerCase()),
);

function isSensitiveKey(key: string): boolean {
  const lower = key.toLowerCase();
  if (SENSITIVE_LOWER.has(lower)) return true;
  // also catch obvious compound keys like "userPassword", "stripeSecret"
  for (const f of SENSITIVE_LOWER) {
    if (lower.includes(f)) return true;
  }
  return false;
}

function redact(value: unknown, seen: WeakSet<object> = new WeakSet()): unknown {
  if (value === null || typeof value !== 'object') return value;
  if (seen.has(value as object)) return '[circular]';
  seen.add(value as object);

  if (Array.isArray(value)) {
    return value.map((v) => redact(v, seen));
  }

  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    out[k] = isSensitiveKey(k) ? REDACTED : redact(v, seen);
  }
  return out;
}

function redactArgs(args: unknown[]): unknown[] {
  return args.map((a) => redact(a));
}

// (no-console is disabled for this file in eslint.config.mjs — this is the wrapper)
export const logger = {
  debug: (...args: unknown[]): void => console.debug(...redactArgs(args)),
  info: (...args: unknown[]): void => console.info(...redactArgs(args)),
  warn: (...args: unknown[]): void => console.warn(...redactArgs(args)),
  error: (...args: unknown[]): void => console.error(...redactArgs(args)),
};

/** Exposed for reuse by Sentry's `beforeSend` (Plan 05) and tests. */
export const redactSensitive = (value: unknown): unknown => redact(value);
