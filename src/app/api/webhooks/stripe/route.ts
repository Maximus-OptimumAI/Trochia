/**
 * POST /api/webhooks/stripe — the idempotent Stripe webhook (Plan 01-07,
 * FND-05, T-1-38).
 *
 * Steps:
 *   1. Read the RAW body + `stripe-signature` header.
 *      `request.text()` (NOT `request.json()`) is mandatory — Stripe verifies
 *      the signature over the literal bytes.
 *   2. `stripe.webhooks.constructEvent(body, sig, STRIPE_WEBHOOK_SECRET)` —
 *      throws on bad signature → 400.
 *   3. `claimEvent(event.id)` — INSERT-ON-CONFLICT into
 *      `processed_stripe_events`. If the row already existed, this is a
 *      replay; return 200 immediately.
 *   4. `applySubscriptionState(event)` — mirror Stripe state onto accounts +
 *      subscriptions (idempotent).
 *   5. For `checkout.session.completed`, fire `checkout_completed` SERVER-side
 *      (Amplitude node SDK — non-spoofable revenue event).
 *   6. `inngest.send({ name: 'billing/subscription.changed' })` — async
 *      downstream work hook.
 *   7. 200.
 *
 * Returns 200 fast — slow work is offloaded to Inngest.
 *
 * Note: this route is excluded from `src/proxy.ts`'s matcher, so the
 * `@supabase/ssr` cookie refresh doesn't touch the raw body. The route also
 * exports `runtime = 'nodejs'` (Stripe SDK needs Node, not Edge).
 */
export const runtime = 'nodejs';

import { NextResponse, type NextRequest } from 'next/server';

import { env } from '@/lib/env';
import { logger } from '@/lib/logger';
import { getStripe } from '@/modules/billing/stripe';
import { claimEvent } from '@/modules/billing/dedupe';
import { applySubscriptionState } from '@/modules/billing/state';
import { track } from '@/lib/analytics';
import { inngest } from '@/inngest/client';

export async function POST(request: NextRequest) {
  const sig = request.headers.get('stripe-signature');
  if (!sig) {
    return new NextResponse('missing signature', { status: 400 });
  }
  const body = await request.text();

  const stripe = getStripe();
  let event;
  try {
    event = stripe.webhooks.constructEvent(body, sig, env.STRIPE_WEBHOOK_SECRET ?? '');
  } catch (err) {
    logger.warn('stripe webhook: signature verification failed', { err });
    return new NextResponse('signature verification failed', { status: 400 });
  }

  // Dedupe — atomic check-and-claim.
  let claimed: boolean;
  try {
    claimed = await claimEvent(event.id, event.type);
  } catch (err) {
    logger.error('stripe webhook: dedupe insert failed', { err, eventId: event.id });
    // If we can't dedupe, don't risk double-applying — return 500 so Stripe retries.
    return new NextResponse('dedupe failed', { status: 500 });
  }
  if (!claimed) {
    // Already processed — 200 + no work.
    return NextResponse.json({ deduped: true });
  }

  try {
    const result = await applySubscriptionState(event);

    // Server-side funnel event for checkout completion — non-spoofable revenue.
    if (event.type === 'checkout.session.completed') {
      // applySubscriptionState on 'checkout.session.completed' returns null for
      // tier/period (Stripe fires customer.subscription.created moments later
      // with the price id). Use the optimistic Active Raise default; the next
      // event narrows it via mirrorSubscription. The analytics taxonomy only
      // models the two active tiers (Phase 1).
      const analyticsTier: 'pre_raise' | 'active_raise' =
        result?.tier === 'pre_raise' ? 'pre_raise' : 'active_raise';
      const analyticsPeriod: 'monthly' | 'annual' = result?.period === 'annual' ? 'annual' : 'monthly';
      void track('checkout_completed', {
        tier: analyticsTier,
        period: analyticsPeriod,
      }).catch(() => undefined);
    }

    // Offload downstream work (e.g. welcome email, reconcile, audit log)
    // through Inngest — never block the webhook return.
    try {
      await inngest.send({
        name: 'billing/subscription.changed',
        data: { eventId: event.id, eventType: event.type, accountId: result?.accountId ?? null },
      });
    } catch (err) {
      // Inngest send errors are non-fatal — Stripe already has the event.
      logger.warn('stripe webhook: inngest.send failed', { err, eventId: event.id });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    logger.error('stripe webhook: applySubscriptionState failed', { err, eventId: event.id });
    // Returning 500 makes Stripe retry — combined with the dedupe ledger this
    // is safe (the second attempt sees the event_id is already claimed and
    // 200s; the reconcile cron is the long-term safety net).
    return new NextResponse('processing failed', { status: 500 });
  }
}
