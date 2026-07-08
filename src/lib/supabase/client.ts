'use client';

/**
 * Supabase browser-side client (Plan 01-07, FND-04).
 *
 * `createBrowserSupabaseClient()` builds a `@supabase/ssr` browser client.
 * Used from Client Components for `signInWithOAuth` (Google), `signOut`, etc.
 * Session cookies (HttpOnly+Secure) are managed by `@supabase/ssr`; the
 * browser client only sees the JWT for client-side `auth.*` calls.
 */
import { createBrowserClient } from '@supabase/ssr';

import { env } from '@/lib/env';

/**
 * Options for the browser client.
 *
 * `detectSessionInUrl` (default true, matching the SDK) auto-parses auth params
 * (`?code=`, access tokens) from the current URL on client init. The reset-password
 * page MUST pass `false`: it lands on `/reset-password?...`, and with the default
 * true an old-template `?code=` PKCE link would be auto-consumed on init (burning
 * the one-time code and possibly establishing a silent recovery session) before
 * the page can route it to the invalid-link state. The token_hash recovery flow
 * uses an explicit `verifyOtp`, which does NOT depend on this flag.
 */
export interface BrowserSupabaseClientOptions {
  detectSessionInUrl?: boolean;
}

export function createBrowserSupabaseClient(options?: BrowserSupabaseClientOptions) {
  // Default callers (Google OAuth, sign-out) get the SDK's cached singleton with
  // its default auth config, UNCHANGED (third arg undefined).
  if (options?.detectSessionInUrl === undefined) {
    return createBrowserClient(
      env.NEXT_PUBLIC_SUPABASE_URL ?? '',
      env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? '',
    );
  }
  // A caller passing detectSessionInUrl (the reset page, passing false) needs an
  // ISOLATED client. `@supabase/ssr` caches a browser-client singleton by default:
  // with the default (isSingleton absent), it RETURNS the already-cached client
  // and IGNORES these options, and otherwise CACHES this client for later default
  // callers. `isSingleton: false` opts this one call out of both the cache read
  // and the cache write, so detectSessionInUrl is always honored here and never
  // leaks to (or is overridden by) other callers.
  return createBrowserClient(
    env.NEXT_PUBLIC_SUPABASE_URL ?? '',
    env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? '',
    { isSingleton: false, auth: { detectSessionInUrl: options.detectSessionInUrl } },
  );
}
