/**
 * Lazy Stripe SDK singleton. Imported only by the billing module + the webhook
 * route — never by `entitlements.ts` / `tiers.ts` (those are Stripe-free by
 * design and the structural test enforces it).
 */
import Stripe from 'stripe';

import { env } from '@/lib/env';

let stripe: Stripe | null = null;

export function getStripe(): Stripe {
  if (!stripe) {
    const key = env.STRIPE_SECRET_KEY ?? '';
    stripe = new Stripe(key, { typescript: true });
  }
  return stripe;
}
