'use server';

/**
 * Email + password sign-in server action (AUTH-EMAIL-PASSWORD-01, FIX 2).
 *
 * Sign-in must land the founder where the OAuth callback would: an
 * onboarding-incomplete account RESUMES onboarding instead of being bounced to
 * /reactivate by the proxy /app gate (which redirects any non-active
 * subscription). So, like the sign-up action, this runs server-side:
 * signInWithPassword establishes the session cookie, then it reads the account
 * and routes through the shared `authDestination()` helper (the SAME decision the
 * OAuth callback uses).
 *
 * The service client is used ONLY to read the caller's own account row, keyed on
 * the authenticated user id returned by signInWithPassword (owner_user_id =
 * user.id). No cross-tenant reach. The failure message is generic and identical
 * for every failure (no enumeration); neither the email nor the password is ever
 * logged.
 */
import { redirect } from 'next/navigation';
import { and, eq, isNull } from 'drizzle-orm';

import { createServerSupabaseClient } from '@/lib/supabase/server';
import { getServiceClient } from '@/db/client';
import { accounts } from '@/db/schema';
import { authDestination } from '@/lib/auth-destination';
import { logger } from '@/lib/logger';

export type SignInResult = { error: string };

const GENERIC_SIGNIN_ERROR = 'Invalid email or password.';

export async function signInAction(input: { email: string; password: string }): Promise<SignInResult> {
  const email = input.email.trim();
  const password = input.password;

  const supabase = await createServerSupabaseClient();
  const { data, error: signInError } = await supabase.auth.signInWithPassword({ email, password });

  // Non-enumerating: a wrong password, an unknown email, and a session-less
  // response all collapse to the SAME generic message; the email is never logged.
  if (signInError || !data.user || !data.session) {
    logger.warn('sign-in: password auth failed');
    return { error: GENERIC_SIGNIN_ERROR };
  }

  const user = data.user;

  // Read ONLY the caller's own account row (owner_user_id = the authenticated
  // user id), through the service client. Same partial-unique predicate the
  // callback uses, so a soft-deleted row never shadows the live one. Select just
  // the two fields the destination decision needs.
  let account: { dpaAcceptedAt: Date | null; subscriptionStatus: string | null } | null = null;
  try {
    account =
      (await getServiceClient().query.accounts.findFirst({
        where: and(eq(accounts.ownerUserId, user.id), isNull(accounts.deletedAt)),
        columns: { dpaAcceptedAt: true, subscriptionStatus: true },
      })) ?? null;
  } catch (err) {
    // A read failure must not leak the user past onboarding. Fall through with a
    // null account, which the helper routes to /onboarding (fail-safe).
    logger.error('sign-in: account read failed', { err, userId: user.id });
  }

  // redirect() throws NEXT_REDIRECT (typed `never`); nothing runs after it.
  redirect(authDestination(account));
}
