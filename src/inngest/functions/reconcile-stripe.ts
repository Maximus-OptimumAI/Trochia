/**
 * `reconcile-stripe` — the billing-state safety-net cron (every 6 hours).
 *
 * Webhooks are the optimization; this poller is the safety net (PITFALLS §18):
 * for each account with a `stripe_customer_id`, re-pull the subscription from the
 * Stripe API and reconcile `accounts.subscription_status` / `tier` /
 * `current_period_end`.
 *
 * TODO(Plan 07): wire this to the billing module once Plan 07 ships it (the Stripe
 * client + `applySubscriptionState` + the `accounts` billing columns are written by
 * Plan 07). Until then this is a documented no-op.
 */
import { logger } from '@/lib/logger';

import { inngest } from '../client';

export const reconcileStripeFn = inngest.createFunction(
  { id: 'reconcile-stripe', retries: 4, concurrency: { limit: 1 }, triggers: [{ cron: '0 */6 * * *' }] },
  async () => {
    // TODO(Plan 07): for each account with a stripe_customer_id, re-pull the
    // subscription from Stripe and reconcile accounts.subscription_status/tier/
    // current_period_end. No-op until Plan 07's billing module exists.
    logger.info('reconcile-stripe: billing module not yet wired (TODO Plan 07) — no-op');
    return { reconciled: 0, note: 'billing module wired in Plan 07' };
  },
);
