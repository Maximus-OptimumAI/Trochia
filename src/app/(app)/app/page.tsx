import { redirect } from 'next/navigation';
import { and, eq, isNull } from 'drizzle-orm';

import { AppShell } from '@/components/shell/app-shell';
import { CtaCards } from '@/components/dashboard/cta-cards';
import { EmptyDashboard } from '@/components/dashboard/empty-dashboard';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { getServiceClient } from '@/db/client';
import { accounts } from '@/db/schema';
import { entitlements } from '@/modules/billing/entitlements';
import { TIERS } from '@/modules/billing/tiers';
import { DashboardViewedTracker } from './tracker';

/**
 * `/app` dashboard (Plan 01-09 — replaces Plan 01-07's Walking-Skeleton tier-display).
 *
 * UI-SPEC §"/app (dashboard)":
 *   - app shell (sidebar + top bar from Plan 02)
 *   - top bar title "Dashboard"
 *   - content: when no Business Memory exists → the empty-dashboard state
 *     ("Welcome to Trochia" + "Start Business Memory" → /app/memory)
 *   - always-visible: the three FND-12 action cards with "Coming Phase N"
 *     badges (rendered by <CtaCards>)
 *   - a subtle tier line ("Active Raise · trial ends {date}") read from the
 *     persisted account row
 *
 * Phase-1 simplification (D-03 narrowing): the `businesses` table is not yet
 * modeled, so `<EmptyDashboard>` always renders. Phase 2 (Memory) replaces the
 * unconditional render with a real "no Business Memory exists" check.
 *
 * Fires `dashboard_viewed` via the <DashboardViewedTracker /> client bridge.
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
    // Live tenant only — mirrors the partial-unique index in migration 0003.
    where: and(eq(accounts.ownerUserId, user.id), isNull(accounts.deletedAt)),
  });
  if (!account) redirect('/onboarding');

  const ent = entitlements({
    subscription_status: account.subscriptionStatus,
    tier: account.tier,
  });
  const tierName = ent.tier ? TIERS[ent.tier].displayName : null;
  const status = account.subscriptionStatus;
  const periodEnd = account.currentPeriodEnd
    ? new Date(account.currentPeriodEnd).toISOString().slice(0, 10)
    : null;

  // TODO(Phase 2): when the businesses table exists, gate the EmptyDashboard
  // render on `!hasBusinessMemory` instead of rendering it unconditionally.
  // Phase 1 (D-03) doesn't have a businesses table so we always show the
  // empty-dashboard state — the EmptyDashboard's "Start Business Memory" CTA
  // is the entry point Phase 2 wires up.
  const hasBusinessMemory = false;

  return (
    <AppShell
      title="Dashboard"
      activeHref="/app"
      userName={user.user_metadata?.full_name as string | undefined}
      userEmail={user.email ?? undefined}
    >
      <DashboardViewedTracker />
      <div className="flex flex-col gap-10">
        {tierName && (
          <p className="text-body-sm text-graphite">
            {tierName}
            {status === 'trialing' && periodEnd ? (
              <>
                {' '}· trial ends <span className="font-mono">{periodEnd}</span>
              </>
            ) : status === 'active' && periodEnd ? (
              <>
                {' '}· renews <span className="font-mono">{periodEnd}</span>
              </>
            ) : null}
          </p>
        )}

        {!hasBusinessMemory && <EmptyDashboard />}

        <CtaCards />
      </div>
    </AppShell>
  );
}
