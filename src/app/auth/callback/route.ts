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
 * Threats: T-1-45 (redirect URI must NOT be client-supplied — `next` is bounded
 * to absolute paths starting with `/`).
 */
import { NextResponse, type NextRequest } from 'next/server';
import { and, eq, isNull, sql } from 'drizzle-orm';

import { createServerSupabaseClient } from '@/lib/supabase/server';
import { getServiceClient } from '@/db/client';
import { accounts, users } from '@/db/schema';
import { track } from '@/lib/analytics';
import { APP_URL } from '@/lib/env';
import { logger } from '@/lib/logger';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get('code');
  // `next` is a client-controlled hint — restrict to internal absolute paths so
  // the callback cannot become an open redirect.
  const nextParam = searchParams.get('next') ?? null;
  const safeNext =
    nextParam && nextParam.startsWith('/') && !nextParam.startsWith('//') ? nextParam : null;

  if (!code) {
    return NextResponse.redirect(new URL('/sign-in?error=missing_code', APP_URL));
  }

  const supabase = await createServerSupabaseClient();
  const { error: exchangeError, data } = await supabase.auth.exchangeCodeForSession(code);
  if (exchangeError || !data?.user) {
    logger.warn('auth/callback: exchangeCodeForSession failed', { err: exchangeError });
    return NextResponse.redirect(new URL('/sign-in?error=exchange_failed', APP_URL));
  }

  const user = data.user;

  // Ensure the `public.users` mirror row + the `accounts` tenant row exist.
  // We use the service client because the JWT's tenant_id claim hasn't been
  // injected yet (the Auth Hook only fires on token issuance, which has
  // already happened; the request client we'd build now wouldn't see this
  // user's tenant_id because they don't yet have an `accounts` row).
  //
  // Concurrency: two simultaneous first-login callbacks for the same user_id
  // could both pass a read-then-insert check and produce two live accounts —
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

    // Atomic: at most one row per user_id while deleted_at IS NULL — enforced
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
    return NextResponse.redirect(new URL('/sign-in?error=account_setup_failed', APP_URL));
  }

  // Best-effort analytics — never block the redirect.
  void track('signed_in').catch(() => undefined);

  // Read back the (now-existing) live account — must filter on the same
  // partial-unique predicate so a soft-deleted row from a prior account
  // never shadows the live one.
  const account = await service.query.accounts.findFirst({
    where: and(eq(accounts.ownerUserId, user.id), isNull(accounts.deletedAt)),
  });
  const dpaAccepted = !!account?.dpaAcceptedAt;
  const active =
    account?.subscriptionStatus === 'trialing' || account?.subscriptionStatus === 'active';

  if (safeNext) {
    return NextResponse.redirect(new URL(safeNext, APP_URL));
  }
  if (!dpaAccepted || !active) {
    return NextResponse.redirect(new URL('/onboarding', APP_URL));
  }
  return NextResponse.redirect(new URL('/app', APP_URL));
}
