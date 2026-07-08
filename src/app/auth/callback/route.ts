/**
 * Supabase Auth PKCE callback (Plan 01-07, FND-04).
 *
 * The Google SSO flow ends with Supabase redirecting the browser to
 * `${APP_URL}/auth/callback?code=...`. We exchange the code for a session,
 * ensure an `accounts` row exists (the tenant), then route the founder:
 *   - DPA not yet accepted OR no active sub → `/onboarding`
 *                                              (the `/onboarding` index decides
 *                                               welcome vs. tier picker vs. /app)
 *   - else → `/app`
 *
 * `track('signed_in')` fires server-side via the Amplitude node SDK (Plan 05's
 * analytics: typed events).
 *
 * Threats: T-1-45 (redirect URI must NOT be client-supplied; `next` is bounded
 * to absolute paths starting with `/`).
 *
 * Preview hosting (fix/preview-auth-01): every post-exchange redirect resolves
 * against `redirectBase`, not `APP_URL` directly. On prod the request arrives on
 * the pinned canonical host, so `resolveRedirectOrigin` returns `APP_URL` and
 * the behavior is byte-identical to before. On a Vercel `*.vercel.app` preview
 * the request arrives on that preview host, so the redirect STAYS on it, the
 * same host the sign-in page sent the round-trip to, so the session cookie set
 * here remains visible. The base is derived ONLY from the request's own origin
 * (never a query param / `next`), so it cannot become an open redirect.
 */
import { NextResponse, type NextRequest } from 'next/server';
import { and, eq, isNull, sql } from 'drizzle-orm';

import { createServerSupabaseClient } from '@/lib/supabase/server';
import { getServiceClient } from '@/db/client';
import { accounts, users } from '@/db/schema';
import { track } from '@/lib/analytics';
import { APP_URL } from '@/lib/env';
import { resolveRedirectOrigin } from '@/lib/auth-redirect';
import { authDestination } from '@/lib/auth-destination';
import { logger } from '@/lib/logger';

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url);
  const { searchParams } = requestUrl;
  // Resolve against the request's OWN origin on a preview host; `APP_URL` on
  // prod (unchanged). The post-exchange redirect must land on the same host the
  // OAuth round-trip started on, or the session cookie isn't seen.
  const redirectBase = resolveRedirectOrigin(requestUrl.origin, APP_URL);
  const code = searchParams.get('code');
  // `next` is a client-controlled hint; restrict to internal absolute paths so
  // the callback cannot become an open redirect.
  const nextParam = searchParams.get('next') ?? null;
  const safeNext =
    nextParam && nextParam.startsWith('/') && !nextParam.startsWith('//') ? nextParam : null;

  if (!code) {
    return NextResponse.redirect(new URL('/sign-in?error=missing_code', redirectBase));
  }

  const supabase = await createServerSupabaseClient();
  const { error: exchangeError, data } = await supabase.auth.exchangeCodeForSession(code);
  if (exchangeError || !data?.user) {
    logger.warn('auth/callback: exchangeCodeForSession failed', { err: exchangeError });
    return NextResponse.redirect(new URL('/sign-in?error=exchange_failed', redirectBase));
  }

  const user = data.user;

  // Ensure the `public.users` mirror row + the `accounts` tenant row exist.
  // We use the service client because the JWT's tenant_id claim hasn't been
  // injected yet (the Auth Hook only fires on token issuance, which has
  // already happened; the request client we'd build now wouldn't see this
  // user's tenant_id because they don't yet have an `accounts` row).
  //
  // Concurrency: two simultaneous first-login callbacks for the same user_id
  // could both pass a read-then-insert check and produce two live accounts,
  // a fatal nondeterminism for the auth-hook tenant resolution (the hook's
  // `LIMIT 1` picks one, src/server/context.ts's `findFirst` may pick the
  // other). PR-1 fixes this with:
  //   1. a partial UNIQUE index on accounts(owner_user_id) WHERE deleted_at IS NULL
  //      (migration 0003 + tenancy.ts), and
  //   2. an atomic INSERT ... ON CONFLICT DO NOTHING here (no read-first),
  //      then a single SELECT to pick up whichever row won the race.
  // Surfaced by /codex 01-07 review (P1).
  const service = getServiceClient();
  try {
    await service
      .insert(users)
      .values({ id: user.id, email: user.email ?? '' })
      .onConflictDoNothing({ target: users.id });

    // Atomic: at most one row per user_id while deleted_at IS NULL, enforced
    // by the partial unique index `accounts_owner_user_id_uniq`. On a concurrent
    // race the loser is a no-op; the follow-up SELECT sees the winning row.
    //
    // Raw SQL because Drizzle 0.44's `onConflictDoNothing` doesn't accept the
    // index predicate clause that's required for Postgres to infer a partial
    // unique index. PR-4 (drizzle 0.45 upgrade) is expected to add native
    // support; replace with the typed builder then.
    await service.execute(sql`
      insert into ${accounts} (owner_user_id, region, subscription_status)
      values (${user.id}, 'us', 'none')
      on conflict (owner_user_id) where deleted_at is null do nothing
    `);
  } catch (err) {
    logger.error('auth/callback: failed to resolve account row', { err, userId: user.id });
    return NextResponse.redirect(new URL('/sign-in?error=account_setup_failed', redirectBase));
  }

  // PR-6 / codex re-verify 2026-05-15 [P1]: refresh the Supabase session AFTER
  // the account upsert so the next JWT carries the now-resolvable `tenant_id`
  // claim. `exchangeCodeForSession()` above minted a token whose claim was
  // null (the custom_access_token_hook ran BEFORE the row existed). Without
  // this refresh the founder's session cookie carries the stale-null claim
  // until JWT TTL (~1h) or sign-out/in; proxy.ts's `/app/*` gate then loops
  // them back to `/onboarding` because RLS on `accounts` denies the claim-
  // driven read. Best-effort: if the refresh fails (network blip, Supabase
  // hiccup), we still redirect; proxy.ts's `ownerSelfReadPolicy` fallback
  // (PR-6 Fix B) catches the stale-claim case on the next request.
  try {
    await supabase.auth.refreshSession();
  } catch (err) {
    logger.warn('auth/callback: refreshSession failed (non-fatal, proxy fallback covers)', {
      err,
      userId: user.id,
    });
  }

  // Best-effort analytics. Never block the redirect.
  void track('signed_in').catch(() => undefined);

  // Read back the (now-existing) live account, must filter on the same
  // partial-unique predicate so a soft-deleted row from a prior account
  // never shadows the live one.
  const account = await service.query.accounts.findFirst({
    where: and(eq(accounts.ownerUserId, user.id), isNull(accounts.deletedAt)),
  });

  // A client-supplied `next` still wins (bounded to internal paths above);
  // otherwise the shared helper picks the destination. authDestination() carries
  // the SAME logic this route used inline (`!dpaAccepted || !active -> /onboarding;
  // else /app`), so the OAuth routing is behavior-preserved, byte for byte.
  if (safeNext) {
    return NextResponse.redirect(new URL(safeNext, redirectBase));
  }
  return NextResponse.redirect(new URL(authDestination(account), redirectBase));
}
