/**
 * `processStripeEventTransactional(event)` — the transactional webhook driver
 * (PR-3, /codex 01-07 [P1] finding #2).
 *
 * Inverts the pre-PR-3 ordering, which committed the `processed_stripe_events`
 * claim BEFORE running the side-effects. That was racy on partial failure: a
 * throw inside `applySubscriptionState` left the claim row committed, Stripe's
 * retry saw "already processed", and the state drift persisted forever (the
 * 6-hour reconcile cron only repairs accounts with a `stripe_customer_id`
 * already set — so pre-customer-mapping failures leak through indefinitely).
 *
 * The new flow:
 *   1. Open ONE transaction.
 *   2. Run `applySubscriptionState(tx, event)` (pure DB writes — no email/Inngest).
 *   3. INSERT `processed_stripe_events (event_id, event_type)` as the LAST
 *      statement of the transaction.
 *   4. If the INSERT hits the unique constraint (concurrent delivery already
 *      committed the same event_id), throw a sentinel error → the tx rolls
 *      back → we catch and return `{ deduped: true }` → caller returns 200.
 *   5. On success, the tx commits atomically — claim + side-effects together.
 *   6. Any OTHER throw (DB error, Stripe data parsing) rolls back BOTH the
 *      claim and the side-effects; caller returns 500 → Stripe retries.
 *
 * External side-effects (analytics events, Inngest dispatches, dunning emails)
 * are returned to the caller in {@link ProcessResult} for AFTER-commit dispatch.
 * Never fire external effects inside the transaction.
 */
import type Stripe from 'stripe';

import { getServiceClient } from '@/db/client';
import { processedStripeEvents } from '@/db/schema/billing';
import { applySubscriptionState, type ApplyResult } from '@/modules/billing/state';

export interface ProcessResult {
  /** True if this delivery lost the concurrent-claim race (no work was done). */
  deduped: boolean;
  /** Set on the winning delivery — the side-effect summary the caller dispatches. */
  apply?: ApplyResult | null;
}

/** Sentinel thrown inside the transaction to force a rollback when the claim
 *  row conflicts (another delivery for the same event_id already committed). */
class ConcurrentClaimError extends Error {
  constructor() {
    super('concurrent stripe webhook delivery already claimed this event');
    this.name = 'ConcurrentClaimError';
  }
}

/**
 * Run a Stripe webhook event end-to-end with claim-after-side-effect ordering.
 * See module docstring for the full contract.
 *
 * @param event - the Stripe.Event returned by `stripe.webhooks.constructEvent`
 *                (already signature-verified by the caller).
 */
export async function processStripeEventTransactional(
  event: Stripe.Event,
): Promise<ProcessResult> {
  const db = getServiceClient();
  try {
    const apply = await db.transaction(async (tx) => {
      const result = await applySubscriptionState(tx, event);

      // Claim AFTER the side-effects run, as the LAST statement of the tx.
      // ON CONFLICT DO NOTHING + returning lets us detect concurrent claims
      // without raising a unique-violation error (which would surface as a
      // generic SQL error and obscure the deduped case).
      const claimed = await tx
        .insert(processedStripeEvents)
        .values({ eventId: event.id, eventType: event.type })
        .onConflictDoNothing({ target: processedStripeEvents.eventId })
        .returning({ eventId: processedStripeEvents.eventId });

      if (claimed.length === 0) {
        // Concurrent delivery already committed this event_id. Roll back the
        // side-effects we just applied (the other delivery committed its own
        // copy of identical writes — they're idempotent column updates, but
        // we'd rather have ONE source of truth, the first-mover's tx).
        throw new ConcurrentClaimError();
      }

      return result;
    });

    return { deduped: false, apply };
  } catch (err) {
    if (err instanceof ConcurrentClaimError) {
      return { deduped: true };
    }
    // All other errors propagate: route handler returns 500 → Stripe retries.
    throw err;
  }
}
