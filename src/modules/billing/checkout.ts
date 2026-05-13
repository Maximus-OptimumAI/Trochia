/**
 * Stripe Checkout session creation (Plan 01-07, FND-05).
 *
 * `createCheckoutSession({ accountId, tier, period, customerEmail })`:
 *   - mode: 'subscription'
 *   - line_items: [{ price: TIERS[tier].stripePriceIds[period], quantity: 1 }]
 *   - subscription_data.trial_period_days: 7   (D-09)
 *   - payment_method_collection: 'always'      (card-on-file at signup, even on trial)
 *   - automatic_tax.enabled: true              (Stripe Tax — D-09)
 *   - client_reference_id: accountId           (the webhook uses this)
 *   - success_url / cancel_url derive from APP_URL — NEVER hardcoded
 *
 * Fires `tier_selected` + `checkout_started` (server-side via Plan 05's
 * analytics).
 */
import { getStripe } from '@/modules/billing/stripe';
import { TIERS, type Period, type Tier } from '@/modules/billing/tiers';
import { APP_URL } from '@/lib/env';
import { track } from '@/lib/analytics';
import { AppError } from '@/lib/errors';

export interface CreateCheckoutOpts {
  accountId: string;
  tier: 'pre_raise' | 'active_raise';
  period: Period;
  /** Optional — Stripe creates the Customer object using this email. */
  customerEmail?: string;
  /** Existing Stripe customer id (when a returning founder re-subscribes). */
  customerId?: string;
}

export async function createCheckoutSession(opts: CreateCheckoutOpts): Promise<{ url: string }> {
  const tierDef = TIERS[opts.tier as Tier];
  const priceId = tierDef.stripePriceIds[opts.period];
  if (!priceId) {
    throw new AppError(`Stripe price id not configured for ${opts.tier}/${opts.period}`, {
      code: 'BILLING_PRICE_MISCONFIGURED',
      status: 500,
    });
  }

  const stripe = getStripe();
  // Fire the funnel events server-side; never block on them.
  void track('tier_selected', { tier: opts.tier, period: opts.period }).catch(() => undefined);
  void track('checkout_started', { tier: opts.tier, period: opts.period }).catch(() => undefined);

  const session = await stripe.checkout.sessions.create({
    mode: 'subscription',
    client_reference_id: opts.accountId,
    customer: opts.customerId,
    customer_email: opts.customerId ? undefined : opts.customerEmail,
    line_items: [{ price: priceId, quantity: 1 }],
    subscription_data: { trial_period_days: 7 },
    payment_method_collection: 'always',
    automatic_tax: { enabled: true },
    success_url: `${APP_URL}/onboarding?checkout=success`,
    cancel_url: `${APP_URL}/onboarding?checkout=cancelled`,
  });

  if (!session.url) {
    throw new AppError('Stripe Checkout session created without a URL', {
      code: 'BILLING_CHECKOUT_NO_URL',
      status: 500,
    });
  }
  return { url: session.url };
}
