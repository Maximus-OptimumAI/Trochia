/**
 * POST /api/webhooks/stripe — the idempotent Stripe webhook (Plan 01-07,
 * FND-05, T-1-38).
 *
 * Steps (post PR-3 — claim-after-side-effect ordering, /codex 01-07 [P1] #2):
 *   1. Read the RAW body + `stripe-signature` header. `request.text()` (NOT
 *      `.json()`) — Stripe verifies the signature over the literal bytes.
 *   2. `stripe.webhooks.constructEvent(body, sig, STRIPE_WEBHOOK_SECRET)` —
 *      throws on bad signature → 400.
 *   3. `processStripeEventTransactional(event)` — opens ONE transaction,
 *      runs the side-effects, INSERTs `processed_stripe_events` as the LAST
 *      statement. If a concurrent delivery already committed the same
 *      event_id, the inner sentinel throws, the tx rolls back, and the
 *      helper returns `{ deduped: true }`. Otherwise the tx commits atomically.
 *   4. Post-commit (and only post-commit): fire analytics + Inngest + any
 *      dunning email returned on `apply.postCommitEmail`. None of these
 *      external effects run inside the transaction — a rollback would
 *      otherwise leak emails / duplicate Inngest events.
 *   5. 200.
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
import { processStripeEventTransactional } from '@/modules/billing/process';
import { track } from '@/lib/analytics';
import { sendEmail } from '@/lib/email/client';
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

  let processed;
  try {
    processed = await processStripeEventTransactional(event);
  } catch (err) {
    logger.error('stripe webhook: transactional processing failed', { err, eventId: event.id });
    // 500 → Stripe retries. The transaction rolled back, so the claim ledger
    // is also free — the retry sees a fresh event and can apply cleanly.
    return new NextResponse('processing failed', { status: 500 });
  }

  if (processed.deduped) {
    return NextResponse.json({ deduped: true });
  }

  const result = processed.apply ?? null;

  // ── Post-commit external side-effects ─────────────────────────────────
  // The transaction is committed; everything below this line is "best
  // effort" — a failure here doesn't roll back the billing-state update
  // (which is correct: a missed analytics event is far less bad than
  // double-applying a Stripe subscription change).

  // Server-side funnel event for checkout completion — non-spoofable revenue.
  if (event.type === 'checkout.session.completed') {
    const analyticsTier: 'pre_raise' | 'active_raise' =
      result?.tier === 'pre_raise' ? 'pre_raise' : 'active_raise';
    const analyticsPeriod: 'monthly' | 'annual' =
      result?.period === 'annual' ? 'annual' : 'monthly';
    void track('checkout_completed', {
      tier: analyticsTier,
      period: analyticsPeriod,
    }).catch(() => undefined);
  }

  // Dunning email for invoice.payment_failed — fired here (post-commit)
  // because state.ts can't fire it inside the tx (a rollback would leak
  // an email send that has no undo).
  if (result?.postCommitEmail) {
    try {
      await sendEmail({
        to: result.postCommitEmail.to,
        template: result.postCommitEmail.template,
        props: result.postCommitEmail.props,
      });
    } catch (err) {
      logger.warn('stripe webhook: post-commit email send failed', {
        err,
        eventId: event.id,
        template: result.postCommitEmail.template,
      });
    }
  }

  // Offload downstream work (welcome email, audit log, etc.) through
  // Inngest — never block the webhook return.
  try {
    await inngest.send({
      name: 'billing/subscription.changed',
      data: { eventId: event.id, eventType: event.type, accountId: result?.accountId ?? null },
    });
  } catch (err) {
    logger.warn('stripe webhook: inngest.send failed', { err, eventId: event.id });
  }

  return NextResponse.json({ ok: true });
}
