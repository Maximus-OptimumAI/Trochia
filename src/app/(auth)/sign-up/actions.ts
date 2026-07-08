'use server';

/**
 * Email + password sign-up server action (AUTH-EMAIL-PASSWORD-01).
 *
 * Why a server action: the tenant bootstrap needs the RLS-bypassing service
 * client, which is server-only. Confirm-email is OFF in Supabase, so `signUp`
 * returns a LIVE session immediately (no verification round-trip).
 *
 * THE SPINE: there is NO database trigger that creates the account/workspace row
 * at user creation. Google sign-up creates it inside
 * `src/app/auth/callback/route.ts`; email + password never passes through that
 * callback, so this action must replicate the same bootstrap or the new user
 * would have no `accounts` row, `custom_access_token_hook` would stamp
 * `tenant_id = null`, and RLS would deny every tenant-scoped read. This is a
 * deliberate duplication of the callback's pattern: the callback was just
 * hardened (PR #25) and must NOT be modified, so it is not refactored into a
 * shared helper here.
 *
 * Security: the failure message is generic and identical for "already
 * registered" vs other failures, so it never reveals whether the email exists.
 * Neither the email nor the password is ever logged.
 */
import { redirect } from 'next/navigation';
import { sql } from 'drizzle-orm';

import { createServerSupabaseClient } from '@/lib/supabase/server';
import { getServiceClient } from '@/db/client';
import { accounts, users } from '@/db/schema';
import { logger } from '@/lib/logger';

export type SignUpResult = { error: string };

const GENERIC_SIGNUP_ERROR =
  'Could not complete sign-up. Try signing in or resetting your password.';

export async function signUpAction(input: { email: string; password: string }): Promise<SignUpResult> {
  const email = input.email.trim();
  const password = input.password;

  const supabase = await createServerSupabaseClient();
  const { data, error: signUpError } = await supabase.auth.signUp({ email, password });

  // Non-enumerating: an already-registered email yields a signUp error (or a
  // session-less response). Both collapse to the SAME generic message, and the
  // email is never logged.
  if (signUpError || !data.user || !data.session) {
    logger.warn('sign-up: signUp did not establish a session');
    return { error: GENERIC_SIGNUP_ERROR };
  }

  const user = data.user;

  // Bootstrap the tenant row server-side via the audited service client (the
  // RLS-bypass escape hatch), used here ONLY for these two upserts. Mirrors
  // src/app/auth/callback/route.ts: users mirror upsert, then the accounts upsert
  // onto the `accounts_owner_user_id_uniq` partial index.
  const service = getServiceClient();
  try {
    await service
      .insert(users)
      .values({ id: user.id, email: user.email ?? email })
      .onConflictDoNothing({ target: users.id });

    await service.execute(sql`
      insert into ${accounts} (owner_user_id, region, subscription_status)
      values (${user.id}, 'us', 'none')
      on conflict (owner_user_id) where deleted_at is null do nothing
    `);
  } catch (err) {
    logger.error('sign-up: failed to resolve account row', { err, userId: user.id });
    return { error: 'Could not complete sign-up. Please try again.' };
  }

  // Refresh so the next JWT re-runs custom_access_token_hook against the
  // now-existing account row and stamps the real tenant_id (the same reason the
  // OAuth callback refreshes after its upsert). Best-effort: the proxy
  // owner-self-read fallback covers a transient refresh failure.
  try {
    await supabase.auth.refreshSession();
  } catch (err) {
    logger.warn('sign-up: refreshSession failed (non-fatal, proxy fallback covers)', {
      err,
      userId: user.id,
    });
  }

  redirect('/onboarding');
}
