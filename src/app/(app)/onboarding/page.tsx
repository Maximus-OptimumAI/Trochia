import { redirect } from 'next/navigation';
import { and, eq, isNull } from 'drizzle-orm';

import { createServerSupabaseClient } from '@/lib/supabase/server';
import { getServiceClient } from '@/db/client';
import { accounts } from '@/db/schema';
import { DPA_VERSION } from '@/lib/compliance/dpa';
import { isActiveOrTrialing } from '@/modules/billing/entitlements';
import { TierPicker } from './tier-picker';

/**
 * `/onboarding` index (Plan 01-07 scaffold; Plan 01-09 refined for FND-12).
 *
 * Decides which onboarding surface to show based on the account row + the
 * `?checkout=` query param + `accounts.onboarding_step` / `onboarding_completed_at`:
 *   - DPA not yet accepted ⇒ `/onboarding/welcome`
 *   - `?checkout=success` ⇒ the webhook flips the sub to `trialing` and the
 *                            founder enters the Knowledge-Pack-Import step
 *                            (`/onboarding/import`); also persist
 *                            `onboarding_step = 'import'` if not already set.
 *   - `?checkout=cancelled` ⇒ re-render the tier picker.
 *   - DPA accepted + no active sub ⇒ tier picker.
 *   - DPA accepted + active sub + `onboarding_completed_at` set ⇒ `/app`.
 *   - DPA accepted + active sub + `onboarding_step` set ⇒ that step's page.
 *   - DPA accepted + active sub + no step set ⇒ `/onboarding/import` (start the
 *     stepper after Checkout).
 *
 * Plan 09 owns the post-Checkout half: `/onboarding/import|deck|review` are the
 * stepper screens this index hands off to.
 */
export default async function OnboardingPage({
  searchParams,
}: {
  searchParams: Promise<{ checkout?: string }>;
}) {
  const params = await searchParams;
  const checkout = params.checkout;

  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/sign-in');

  const service = getServiceClient();
  const account = await service.query.accounts.findFirst({
    // Live tenant only — mirrors the partial-unique index in migration 0003.
    where: and(eq(accounts.ownerUserId, user.id), isNull(accounts.deletedAt)),
  });
  if (!account) redirect('/sign-in');

  const dpaAccepted = !!account.dpaAcceptedAt && account.dpaVersion === DPA_VERSION;
  const active = isActiveOrTrialing({
    subscription_status: account.subscriptionStatus,
    tier: account.tier,
  });
  const onboardingDone = !!account.onboardingCompletedAt;
  const step = account.onboardingStep ?? null;

  // Send the founder to the welcome screen the first time through (clickwrap
  // acceptance happens there).
  if (!dpaAccepted) redirect('/onboarding/welcome');

  // Checkout return: cancelled → stay on the tier picker.
  if (checkout === 'cancelled') {
    return <TierPicker />;
  }

  // Checkout success → enter the stepper at step 1. Set `onboarding_step` if
  // not yet set so a refresh keeps the founder in the funnel.
  if (checkout === 'success') {
    if (step !== 'import' && step !== 'deck' && step !== 'review') {
      await service
        .update(accounts)
        .set({ onboardingStep: 'import' })
        .where(eq(accounts.id, account.id));
    }
    redirect('/onboarding/import');
  }

  // Onboarding already finished → /app.
  if (onboardingDone && active) {
    redirect('/app');
  }

  // Active sub but mid-stepper → resume.
  if (active) {
    if (step === 'import') redirect('/onboarding/import');
    if (step === 'deck') redirect('/onboarding/deck');
    if (step === 'review') redirect('/onboarding/review');
    // No step recorded but they have an active sub — they likely landed here
    // post-Checkout without `?checkout=success` (refresh, etc). Start at step 1.
    await service
      .update(accounts)
      .set({ onboardingStep: 'import' })
      .where(eq(accounts.id, account.id));
    redirect('/onboarding/import');
  }

  // DPA accepted, no active sub → tier picker.
  return <TierPicker />;
}
