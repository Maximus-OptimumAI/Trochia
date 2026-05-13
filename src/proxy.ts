/**
 * Next.js 16 `proxy.ts` (was `middleware.ts` ≤ Next 15) — Plan 01-07, FND-04 / D-02b.
 *
 * Runs on EVERY request. Does two jobs:
 *
 *   1. Refresh the Supabase session cookies via `@supabase/ssr` — the standard
 *      "update session" pattern. Without this, the JWT in the cookie expires
 *      after an hour and the founder gets silently signed out mid-session.
 *
 *   2. Gate the `(app)` route group:
 *        - `/sign-in` / `/sign-up` / `/auth/callback` / `/` / `/pricing` / …  — no gate
 *        - `/app` / `/app/*`              — require session AND `isActiveOrTrialing(account)`
 *                                            else → `/sign-in` (no session) or `/reactivate` (no sub)
 *        - `/onboarding` / `/onboarding/*` — require session only (this is where they pick a tier!)
 *        - `/styleguide`                   — require session only (dev tool, never `entitlements()`)
 *
 * The subscription gate consults `entitlements.isActiveOrTrialing(account)` —
 * a pure read over the persisted `accounts.subscription_status`. Stripe is the
 * webhook's job, not this hot path.
 *
 * Threats this addresses: T-1-39 (un-subscribed user reaching `/app` =
 * free access), T-1-40 (forged/stolen session cookie — cookie is HttpOnly+
 * Secure, JWT signed server-side, this refresh path enforces server-side
 * verification on every request).
 */
import { NextResponse, type NextRequest } from 'next/server';
import { createServerClient } from '@supabase/ssr';

import { env } from '@/lib/env';
import { isActiveOrTrialing } from '@/modules/billing/entitlements';

/** Routes inside `/app/*` and `/onboarding/*` etc. are gated; everything else is open. */
function classify(pathname: string):
  | 'public'
  | 'app' // session + active sub required
  | 'onboarding-or-styleguide' // session only
{
  if (pathname === '/styleguide' || pathname.startsWith('/styleguide/')) {
    return 'onboarding-or-styleguide';
  }
  if (pathname === '/onboarding' || pathname.startsWith('/onboarding/')) {
    return 'onboarding-or-styleguide';
  }
  if (pathname === '/app' || pathname.startsWith('/app/')) {
    return 'app';
  }
  return 'public';
}

export async function proxy(request: NextRequest) {
  // Start with a pass-through response we can mutate cookies on.
  let response = NextResponse.next({ request });

  // Fast path: classify the route FIRST. Public routes (homepage, /pricing,
  // /sign-up, etc.) get a no-op pass-through — no Supabase call, no cookie
  // refresh — so the cold-start latency on prerendered marketing pages doesn't
  // pay for the session-gate machinery. The cookie refresh runs on every
  // gated route (where it matters) AND on every request to a Supabase auth
  // endpoint via the route's own server client (so the JWT does get refreshed
  // on the navigations that need it).
  const classification = classify(request.nextUrl.pathname);
  if (classification === 'public') return response;

  const url = env.NEXT_PUBLIC_SUPABASE_URL ?? env.SUPABASE_URL ?? '';
  const key = env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? env.SUPABASE_PUBLISHABLE_KEY ?? '';
  // In dev/test the Supabase vars may be empty strings — short-circuit to a
  // pass-through (auth is not enforceable without keys; the proxy must not
  // crash the app under bare-bones local config).
  if (!url || !key) return response;

  const supabase = createServerClient(url, key, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(toSet) {
        // Mutate BOTH the request (so downstream renders see the new cookies)
        // and the response (so the browser persists them).
        for (const { name, value } of toSet) request.cookies.set(name, value);
        response = NextResponse.next({ request });
        for (const { name, value, options } of toSet) response.cookies.set(name, value, options);
      },
    },
  });

  // Refresh the session — writes new cookies into `response` via setAll above.
  // IMPORTANT: do NOT replace `supabase.auth.getUser()` with `getSession()` here.
  // `getUser()` revalidates against Supabase Auth server-side; `getSession()`
  // trusts the cookie. Auth-critical paths must `getUser()`.
  //
  // Wrapped in try/catch: a network failure / bad fallback key would otherwise
  // throw and 500 every request. Treating an error as "no session" is the
  // fail-closed posture — gated routes redirect to /sign-in, public routes
  // pass through unchanged.
  let user: { id: string } | null = null;
  try {
    const { data } = await supabase.auth.getUser();
    user = data.user;
  } catch {
    user = null;
  }

  // From here on: a session is required.
  if (!user) {
    const redirectTo = new URL('/sign-in', request.url);
    return NextResponse.redirect(redirectTo);
  }

  // For onboarding / styleguide, the session is enough.
  if (classification === 'onboarding-or-styleguide') return response;

  // For `/app/*`, also enforce isActiveOrTrialing(account). We read the
  // `accounts.subscription_status` from the auth.users → accounts mapping via
  // a JWT custom claim (the Custom Access Token Auth Hook injects tenant_id).
  // The simplest read in proxy.ts is to use the Supabase REST API as the
  // authenticated user — RLS guarantees they can only see their own row. This
  // is one extra round-trip per `/app` request; cheaper than spinning up the
  // Drizzle request client in middleware.
  const { data: account, error } = await supabase
    .from('accounts')
    .select('subscription_status')
    .limit(1)
    .maybeSingle();

  // If we cannot read the account (RLS denial, missing row, network error), be
  // conservative: send them to onboarding to (re)acquire a subscription. The
  // auth callback ensures a row exists at sign-in; this branch is a safety net.
  if (error || !account) {
    const redirectTo = new URL('/onboarding', request.url);
    return NextResponse.redirect(redirectTo);
  }

  if (!isActiveOrTrialing(account as { subscription_status: string | null })) {
    const redirectTo = new URL('/reactivate', request.url);
    return NextResponse.redirect(redirectTo);
  }

  return response;
}

/**
 * Run the proxy on all routes EXCEPT static asset paths. Next 16 follows the
 * same matcher syntax as the Next-15 `middleware.ts`.
 */
export const config = {
  matcher: [
    /*
     * Match all request paths EXCEPT:
     *   - _next/static, _next/image, favicon.ico, public assets
     *   - /api/webhooks/* (Stripe + Inngest — they verify signatures themselves
     *     and the proxy must NOT touch their bodies)
     *   - /api/inngest (Inngest verifies via signing key)
     */
    '/((?!_next/static|_next/image|favicon.ico|api/webhooks|api/inngest|monitoring|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)',
  ],
};
