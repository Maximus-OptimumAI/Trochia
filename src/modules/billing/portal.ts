/**
 * Stripe Customer Portal session creation (Plan 01-07, FND-05).
 *
 * Self-serve subscription management — plan switch, card update, cancel —
 * handled by Stripe's hosted portal. Trochia stores only the customer id; we
 * never see card details (T-1-42).
 */
import { getStripe } from '@/modules/billing/stripe';
import { APP_URL } from '@/lib/env';
import { AppError } from '@/lib/errors';
import { track } from '@/lib/analytics';

export interface CreatePortalOpts {
  customerId: string;
  /** Optional override for the `return_url` — defaults to `/app/billing`. */
  returnTo?: string;
}

export async function createPortalSession(opts: CreatePortalOpts): Promise<{ url: string }> {
  if (!opts.customerId) {
    throw new AppError('Cannot open billing portal: no Stripe customer on account', {
      code: 'BILLING_NO_CUSTOMER',
      status: 400,
    });
  }
  const stripe = getStripe();
  void track('manage_billing_clicked').catch(() => undefined);
  const session = await stripe.billingPortal.sessions.create({
    customer: opts.customerId,
    return_url: `${APP_URL}${opts.returnTo ?? '/app/billing'}`,
  });
  if (!session.url) {
    throw new AppError('Stripe portal session created without a URL', {
      code: 'BILLING_PORTAL_NO_URL',
      status: 500,
    });
  }
  return { url: session.url };
}
