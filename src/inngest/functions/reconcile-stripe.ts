/**
 * `reconcile-stripe` — the billing-state safety-net cron (every 6 hours,
 * Plan 04 stub now filled by Plan 07).
 *
 * Webhooks are the optimization; this poller is the safety net (PITFALLS §18):
 * for each account with a `stripe_customer_id`, re-pull the active/trialing
 * subscription from the Stripe API and reconcile
 * `accounts.subscription_status` / `tier` / `current_period_end` to match.
 * Any drift is logged.
 *
 * Runs as a system Inngest function — no per-account session, talks to the
 * service client. Concurrency 1 so a slow run doesn't stack. Retries 4.
 */
import { isNotNull } from 'drizzle-orm';

import { logger } from '@/lib/logger';
import { getServiceClient } from '@/db/client';
import { accounts } from '@/db/schema';
import { getStripe } from '@/modules/billing/stripe';
import { priceIdToTierAndPeriod } from '@/modules/billing/tiers';
import { eq } from 'drizzle-orm';

import { inngest } from '../client';

export const reconcileStripeFn = inngest.createFunction(
  { id: 'reconcile-stripe', retries: 4, concurrency: { limit: 1 }, triggers: [{ cron: '0 */6 * * *' }] },
  async ({ step }) => {
    return step.run('reconcile-all', async () => {
      const db = getServiceClient();
      const stripe = getStripe();
      let reconciled = 0;
      let drift = 0;

      const candidates = await db
        .select({
          id: accounts.id,
          customerId: accounts.stripeCustomerId,
          status: accounts.subscriptionStatus,
          tier: accounts.tier,
          periodEnd: accounts.currentPeriodEnd,
        })
        .from(accounts)
        .where(isNotNull(accounts.stripeCustomerId));

      for (const acc of candidates) {
        if (!acc.customerId) continue;
        try {
          // Pull the latest subscription for this customer (any status). Stripe
          // returns at most a handful per customer for our use case.
          const subs = await stripe.subscriptions.list({
            customer: acc.customerId,
            status: 'all',
            limit: 5,
          });
          // Prefer trialing/active; else most recent.
          const sub =
            subs.data.find((s) => s.status === 'trialing' || s.status === 'active') ??
            subs.data[0];

          let nextStatus: typeof acc.status = 'none';
          let nextTier: typeof acc.tier = null;
          let nextPeriodEnd: Date | null = null;
          if (sub) {
            nextStatus = mapStatus(sub.status);
            const priceId = sub.items?.data?.[0]?.price?.id;
            const lookup = priceIdToTierAndPeriod(priceId);
            nextTier = lookup?.tier ?? null;
            // Stripe Subscription has `current_period_end` (s) as a Unix timestamp.
            const cpe = (sub as unknown as { current_period_end?: number }).current_period_end;
            if (cpe) nextPeriodEnd = new Date(cpe * 1000);
          }

          const drifted =
            acc.status !== nextStatus ||
            acc.tier !== nextTier ||
            (acc.periodEnd?.getTime?.() ?? null) !== (nextPeriodEnd?.getTime() ?? null);

          if (drifted) {
            drift++;
            logger.info('reconcile-stripe: corrected drift', {
              accountId: acc.id,
              from: { status: acc.status, tier: acc.tier },
              to: { status: nextStatus, tier: nextTier },
            });
            await db
              .update(accounts)
              .set({
                subscriptionStatus: nextStatus,
                tier: nextTier,
                currentPeriodEnd: nextPeriodEnd,
                updatedAt: new Date(),
              })
              .where(eq(accounts.id, acc.id));
          }
          reconciled++;
        } catch (err) {
          logger.warn('reconcile-stripe: per-account error', { accountId: acc.id, err });
        }
      }
      logger.info('reconcile-stripe: done', { reconciled, drift });
      return { reconciled, drift };
    });
  },
);

const STRIPE_STATUS_MAP: Record<string, 'trialing' | 'active' | 'past_due' | 'canceled' | 'incomplete' | 'none'> = {
  trialing: 'trialing',
  active: 'active',
  past_due: 'past_due',
  unpaid: 'past_due',
  canceled: 'canceled',
  incomplete: 'incomplete',
  incomplete_expired: 'canceled',
  paused: 'past_due',
};

function mapStatus(s: string | null | undefined) {
  return s ? STRIPE_STATUS_MAP[s] ?? 'none' : 'none';
}
