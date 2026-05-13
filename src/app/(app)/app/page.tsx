import { redirect } from 'next/navigation';

import { AppShell } from '@/components/shell/app-shell';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { getServiceClient } from '@/db/client';
import { accounts } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { entitlements } from '@/modules/billing/entitlements';
import { TIERS } from '@/modules/billing/tiers';
import { DashboardViewedTracker } from './tracker';

/**
 * `/app` (FND-04, FND-06, FND-12) — the Walking-Skeleton payoff.
 *
 * The `proxy.ts` gate already guarantees: session present AND
 * `isActiveOrTrialing(account) === true` (else `/sign-in` or `/reactivate`).
 * So here we just read the account, compute the tier display, and render.
 *
 * Plan 09 fills the empty-dashboard state + the FND-12 CTA cards. Phase 1
 * goal: render the founder's tier — proving `entitlements()` end-to-end.
 */
export default async function AppDashboardPage() {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/sign-in');

  // The auth callback creates the row at first sign-in; the proxy redirected
  // away if not active. We just read.
  const service = getServiceClient();
  const account = await service.query.accounts.findFirst({
    where: eq(accounts.ownerUserId, user.id),
  });
  if (!account) redirect('/onboarding');

  const ent = entitlements({
    subscription_status: account.subscriptionStatus,
    tier: account.tier,
  });
  const tierName = ent.tier ? TIERS[ent.tier].displayName : 'No active plan';

  return (
    <AppShell
      title="Dashboard"
      activeHref="/app"
      userName={user.user_metadata?.full_name as string | undefined}
      userEmail={user.email ?? undefined}
    >
      <DashboardViewedTracker />
      <div className="flex flex-col gap-6">
        <Card>
          <h2 className="text-h4 text-ink">You&apos;re on the {tierName} plan.</h2>
          <p className="mt-2 text-body-sm text-graphite">
            Subscription status: <span className="font-mono">{account.subscriptionStatus}</span>
            {account.currentPeriodEnd ? (
              <>
                {' '}· renews{' '}
                <span className="font-mono">
                  {new Date(account.currentPeriodEnd).toISOString().slice(0, 10)}
                </span>
              </>
            ) : null}
          </p>
          <div className="mt-6 flex gap-3">
            <Button variant="secondary" size="compact" render={<a href="/app/billing" />}>
              Manage billing
            </Button>
          </div>
        </Card>
      </div>
    </AppShell>
  );
}
