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
import { eq } from 'drizzle-orm';

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
  const service = getServiceClient();
  try {
    await service
      .insert(users)
      .values({ id: user.id, email: user.email ?? '' })
      .onConflictDoNothing({ target: users.id });

    const existing = await service.query.accounts.findFirst({
      where: eq(accounts.ownerUserId, user.id),
    });
    if (!existing) {
      await service.insert(accounts).values({
        ownerUserId: user.id,
        region: 'us',
        subscriptionStatus: 'none',
      });
    }
  } catch (err) {
    logger.error('auth/callback: failed to resolve account row', { err, userId: user.id });
    return NextResponse.redirect(new URL('/sign-in?error=account_setup_failed', APP_URL));
  }

  // Best-effort analytics — never block the redirect.
  void track('signed_in').catch(() => undefined);

  // Look up the (now-existing) account to decide where to land.
  const account = await service.query.accounts.findFirst({
    where: eq(accounts.ownerUserId, user.id),
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
