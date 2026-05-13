import { redirect } from 'next/navigation';
import { eq } from 'drizzle-orm';

import { createServerSupabaseClient } from '@/lib/supabase/server';
import { getServiceClient } from '@/db/client';
import { accounts } from '@/db/schema';
import { DPA_VERSION } from '@/lib/compliance/dpa';
import { isActiveOrTrialing } from '@/modules/billing/entitlements';
import { TierPicker } from './tier-picker';

/**
 * `/onboarding` index (Plan 01-07, FND-12).
 *
 * Decides which onboarding step to show based on the account row + the
 * `?checkout=` query param:
 *   - DPA not yet accepted ⇒ `/onboarding/welcome`
 *   - DPA accepted, no active sub, no `?checkout` ⇒ render the tier picker
 *   - `?checkout=success` ⇒ `/app` (webhook will already have set the sub state;
 *                            if it hasn't yet, the reconcile cron catches up)
 *   - `?checkout=cancelled` ⇒ re-render the tier picker (founder can try again)
 *   - active sub + DPA accepted ⇒ `/app`
 *
 * Plan 09 owns the full onboarding tree — it refines this index + adds
 * `/onboarding/import|deck|review` after the founder picks a tier.
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
    where: eq(accounts.ownerUserId, user.id),
  });
  if (!account) redirect('/sign-in');

  const dpaAccepted = !!account.dpaAcceptedAt && account.dpaVersion === DPA_VERSION;
  const active = isActiveOrTrialing({
    subscription_status: account.subscriptionStatus,
    tier: account.tier,
  });

  // Send the founder to welcome the first time through (clickwrap acceptance
  // happens there).
  if (!dpaAccepted) redirect('/onboarding/welcome');

  // Checkout return: success → /app (webhook does the work); cancelled → stay
  // on the tier picker.
  if (checkout === 'success') {
    redirect('/app');
  }

  // If they already have an active sub and DPA accepted → /app.
  if (active && checkout !== 'cancelled') {
    redirect('/app');
  }

  // Otherwise: show the tier picker.
  return <TierPicker />;
}
