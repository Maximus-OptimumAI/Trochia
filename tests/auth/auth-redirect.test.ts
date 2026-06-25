/**
 * Unit tests for the auth redirect origin derivation (fix/preview-auth-01).
 *
 * The bug: Vercel PREVIEW deployments built the OAuth `redirectTo` from the
 * pinned `APP_URL` (prod host) on every scope, so the PKCE cookie set on the
 * preview's `*.vercel.app` host was never seen by the callback running on the
 * prod host → `exchangeCodeForSession` failed.
 *
 * The contract these tests pin:
 *   - prod / dev / any non-`*.vercel.app` host → the pinned `appUrl` (UNCHANGED)
 *   - a `*.vercel.app` preview host            → that preview's own origin
 *   - the callback path is ALWAYS the fixed `/auth/callback` (no open redirect)
 *
 * The origin derivation is pure; these call it directly with explicit inputs,
 * so they're independent of the ambient env.
 */
import { describe, expect, it } from 'vitest';

import {
  AUTH_CALLBACK_PATH,
  buildAuthCallbackUrl,
  resolveRedirectOrigin,
} from '@/lib/auth-redirect';

const APP_URL = 'https://trochia.asranest.com';

describe('resolveRedirectOrigin', () => {
  it('prod canonical host → APP_URL (unchanged behavior)', () => {
    // The browser is already ON the prod host; we still resolve to APP_URL.
    expect(resolveRedirectOrigin('https://trochia.asranest.com', APP_URL)).toBe(APP_URL);
  });

  it('future prod host (trochia.ai) → APP_URL (still the pinned host, not the browser host)', () => {
    expect(resolveRedirectOrigin('https://trochia.ai', APP_URL)).toBe(APP_URL);
  });

  it('Vercel branch preview host → that preview origin (the fix)', () => {
    expect(
      resolveRedirectOrigin('https://trochia-git-fix-preview-auth-01.vercel.app', APP_URL),
    ).toBe('https://trochia-git-fix-preview-auth-01.vercel.app');
  });

  it('preview origin with a non-default port is preserved in the origin', () => {
    // (Default :443 is normalized away by URL; use a non-default port to prove
    // the full origin, including the port, is what we return.)
    expect(resolveRedirectOrigin('https://trochia-abc123.vercel.app:8443', APP_URL)).toBe(
      'https://trochia-abc123.vercel.app:8443',
    );
  });

  it('localhost dev host → APP_URL (not a preview; unchanged)', () => {
    expect(resolveRedirectOrigin('http://localhost:3000', APP_URL)).toBe(APP_URL);
  });

  it('null / undefined / empty origin → APP_URL (safe fallback)', () => {
    expect(resolveRedirectOrigin(null, APP_URL)).toBe(APP_URL);
    expect(resolveRedirectOrigin(undefined, APP_URL)).toBe(APP_URL);
    expect(resolveRedirectOrigin('', APP_URL)).toBe(APP_URL);
  });

  it('malformed origin → APP_URL (never throws)', () => {
    expect(resolveRedirectOrigin('not a url', APP_URL)).toBe(APP_URL);
  });

  it('look-alike host that only ends in "vercel.app" without the dot → APP_URL (not treated as preview)', () => {
    // `attackervercel.app` ends with "vercel.app" but NOT ".vercel.app".
    expect(resolveRedirectOrigin('https://attackervercel.app', APP_URL)).toBe(APP_URL);
  });

  it('attacker host that merely contains "vercel.app" as a non-suffix → APP_URL', () => {
    // `vercel.app.attacker.com` does not end with ".vercel.app".
    expect(resolveRedirectOrigin('https://x.vercel.app.attacker.com', APP_URL)).toBe(APP_URL);
  });
});

describe('buildAuthCallbackUrl', () => {
  it('prod → APP_URL + the fixed /auth/callback path', () => {
    expect(buildAuthCallbackUrl('https://trochia.asranest.com', APP_URL)).toBe(
      'https://trochia.asranest.com/auth/callback',
    );
  });

  it('preview → preview origin + the SAME fixed /auth/callback path', () => {
    expect(buildAuthCallbackUrl('https://trochia-git-foo.vercel.app', APP_URL)).toBe(
      'https://trochia-git-foo.vercel.app/auth/callback',
    );
  });

  it('the callback path is always the fixed AUTH_CALLBACK_PATH (no user-controlled segment)', () => {
    expect(AUTH_CALLBACK_PATH).toBe('/auth/callback');
    for (const origin of [
      'https://trochia.asranest.com',
      'https://trochia-git-foo.vercel.app',
      'http://localhost:3000',
      null,
    ]) {
      expect(buildAuthCallbackUrl(origin, APP_URL).endsWith(AUTH_CALLBACK_PATH)).toBe(true);
    }
  });
});
