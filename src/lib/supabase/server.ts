/**
 * Supabase server-side client (Plan 01-07, FND-04).
 *
 * `createServerSupabaseClient()` builds a `@supabase/ssr` server client bound to
 * Next 16's cookies API. Use this from:
 *   - Server Components (read session)
 *   - Route Handlers (sign-out, the auth callback's `exchangeCodeForSession`)
 *   - Server Actions
 *
 * Cookie writes from a Server Component render are best-effort — `cookies()` is
 * read-only there. The `proxy.ts` middleware does the authoritative refresh on
 * every request, so any write that fails here will land on the next navigation.
 *
 * Pair with `src/lib/supabase/client.ts` (`createBrowserSupabaseClient()`) for
 * Client Components.
 */
import 'server-only';

import { cookies } from 'next/headers';
import { createServerClient, type CookieOptions } from '@supabase/ssr';

import { env } from '@/lib/env';

export async function createServerSupabaseClient() {
  const url = env.NEXT_PUBLIC_SUPABASE_URL ?? env.SUPABASE_URL ?? '';
  const key = env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? env.SUPABASE_PUBLISHABLE_KEY ?? '';
  const store = await cookies();
  return createServerClient(url, key, {
    cookies: {
      getAll() {
        return store.getAll();
      },
      setAll(toSet) {
        try {
          for (const { name, value, options } of toSet) {
            store.set(name, value, options as CookieOptions);
          }
        } catch {
          // Server Component render — cookies() is read-only here. The proxy.ts
          // middleware (which CAN write) refreshes the session on the next request.
        }
      },
    },
  });
}
