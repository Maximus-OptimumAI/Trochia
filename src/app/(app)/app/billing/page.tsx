import { redirect } from 'next/navigation';
import { and, eq, isNull } from 'drizzle-orm';

import { AppShell } from '@/components/shell/app-shell';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { getServiceClient } from '@/db/client';
import { accounts } from '@/db/schema';
import { entitlements } from '@/modules/billing/entitlements';
import { TIERS } from '@/modules/billing/tiers';
import { BillingView } from './billing-view';

/**
 * `/app/billing` (Plan 01-09 / FND-05, UI-SPEC §"/app/billing").
 *
 * Server shell — reads the account's persisted billing state, hands the
 * snapshot (tier display name, status, trial/period-end, has-customer-id) to
 * the client view that wires the "Manage billing" → Stripe Customer Portal and
 * the destructive Cancel-subscription Dialog.
 */
export default async function BillingPage() {
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
  if (!account) redirect('/onboarding');

  const ent = entitlements({
    subscription_status: account.subscriptionStatus,
    tier: account.tier,
  });
  const tierName = ent.tier ? TIERS[ent.tier].displayName : null;
  const periodEnd = account.currentPeriodEnd
    ? new Date(account.currentPeriodEnd).toISOString().slice(0, 10)
    : null;

  return (
    <AppShell
      title="Billing"
      activeHref="/app/billing"
      userName={user.user_metadata?.full_name as string | undefined}
      userEmail={user.email ?? undefined}
    >
      <BillingView
        tierName={tierName}
        status={account.subscriptionStatus}
        periodEnd={periodEnd}
        hasCustomer={!!account.stripeCustomerId}
      />
    </AppShell>
  );
}
