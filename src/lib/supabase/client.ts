'use client';

/**
 * Supabase browser-side client (Plan 01-07, FND-04).
 *
 * `createBrowserSupabaseClient()` builds a `@supabase/ssr` browser client.
 * Used from Client Components for `signInWithOAuth` (Google), `signOut`, etc.
 * Session cookies (HttpOnly+Secure) are managed by `@supabase/ssr` — the
 * browser client only sees the JWT for client-side `auth.*` calls.
 */
import { createBrowserClient } from '@supabase/ssr';

import { env } from '@/lib/env';

export function createBrowserSupabaseClient() {
  return createBrowserClient(
    env.NEXT_PUBLIC_SUPABASE_URL ?? '',
    env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? '',
  );
}
