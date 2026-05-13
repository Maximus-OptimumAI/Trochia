/**
 * Stripe webhook idempotency (T-1-38, Plan 01-07).
 *
 * Every event from Stripe carries a unique `event.id`. The webhook handler
 * checks it against the `processed_stripe_events` ledger before applying any
 * state — replays are no-ops. Uses the service client (the webhook has no
 * user session). Pattern: `INSERT ... ON CONFLICT DO NOTHING` and inspect the
 * returned row count, so the check + mark are one atomic round-trip.
 */
import { getServiceClient } from '@/db/client';
import { processedStripeEvents } from '@/db/schema/billing';
import { eq } from 'drizzle-orm';

/**
 * Try to claim `eventId`. Returns `true` if this is the first time we've seen
 * it (caller should process the event), `false` if it was already processed
 * (caller should return 200 immediately).
 *
 * Atomic: a concurrent webhook delivery for the same event id will see one
 * winner and one no-op.
 */
export async function claimEvent(eventId: string, eventType: string): Promise<boolean> {
  const db = getServiceClient();
  const rows = await db
    .insert(processedStripeEvents)
    .values({ eventId, eventType })
    .onConflictDoNothing({ target: processedStripeEvents.eventId })
    .returning({ eventId: processedStripeEvents.eventId });
  return rows.length > 0;
}

/** Read-only check (used by tests). */
export async function isEventProcessed(eventId: string): Promise<boolean> {
  const db = getServiceClient();
  const row = await db.query.processedStripeEvents.findFirst({
    where: eq(processedStripeEvents.eventId, eventId),
  });
  return !!row;
}
