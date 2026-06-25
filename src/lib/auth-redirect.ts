/**
 * Auth redirect origin resolution (fix/preview-auth-01).
 *
 * The OAuth round-trip must come back to the SAME host the browser started on,
 * or the PKCE code-verifier cookie (set host-only on the originating host) is
 * invisible to the callback and `exchangeCodeForSession` fails with
 * `?error=exchange_failed`.
 *
 * Production is served from the pinned canonical host (`APP_URL`), so prod keeps
 * resolving every auth URL against `APP_URL` exactly as before. UNCHANGED.
 * Vercel PREVIEW deployments are served from a per-branch `*.vercel.app` host
 * that `APP_URL` does NOT match; there we derive the origin from the browser's
 * own location (client) / the request's own origin (server) so the cookie, the
 * callback, and the post-exchange redirect all stay on one host.
 *
 * SECURITY (open redirect): the origin is taken ONLY from the caller's own
 * location/request origin (NEVER from a query param, form field, or other
 * user-controlled input), and the callback path is always the fixed
 * `AUTH_CALLBACK_PATH`. The destination host is therefore always either the
 * pinned `APP_URL` or the host the user is already on; an attacker cannot steer
 * it elsewhere.
 *
 * This module is pure (no `window`, no env reads; callers pass values in) so it
 * is safe to import on both the client and the server, and is unit-testable
 * directly.
 */

/** The fixed OAuth callback path. Never user-controlled. */
export const AUTH_CALLBACK_PATH = '/auth/callback';

/** Vercel preview deployments are served from a `*.vercel.app` host. */
function isPreviewHost(hostname: string): boolean {
  return hostname.endsWith('.vercel.app');
}

/**
 * Pick the origin every auth redirect resolves against.
 *   - prod / dev / any non-preview host → the pinned `appUrl` (unchanged)
 *   - a `*.vercel.app` preview host      → that preview's own origin
 *
 * `currentOrigin` is `window.location.origin` on the client or
 * `new URL(request.url).origin` on the server. A missing or malformed value
 * falls back to `appUrl`.
 */
export function resolveRedirectOrigin(
  currentOrigin: string | null | undefined,
  appUrl: string,
): string {
  if (currentOrigin) {
    try {
      const { origin, hostname } = new URL(currentOrigin);
      if (isPreviewHost(hostname)) {
        return origin;
      }
    } catch {
      // malformed origin → fall through to the pinned app URL
    }
  }
  return appUrl;
}

/**
 * Full `redirectTo` for `signInWithOAuth`: the resolved origin + the fixed
 * callback path. Used by the sign-in / sign-up client pages.
 */
export function buildAuthCallbackUrl(
  currentOrigin: string | null | undefined,
  appUrl: string,
): string {
  return `${resolveRedirectOrigin(currentOrigin, appUrl)}${AUTH_CALLBACK_PATH}`;
}
