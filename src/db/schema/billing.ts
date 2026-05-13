/**
 * Billing: the `subscriptions` table + the `processed_stripe_events` dedupe ledger.
 *
 * Stripe is the billing state machine; Trochia persists + reads. The denormalised
 * "current state" lives on `accounts` (`subscription_status` / `tier` /
 * `current_period_end` / `stripe_customer_id`); `subscriptions` is the per-Stripe-
 * subscription record (one account can churn through several over time). Plan 07
 * wires the webhook that writes both. RLS: tenant-isolated on `account_id`.
 *
 * `processed_stripe_events` is the system-level dedupe ledger that makes the
 * webhook idempotent (T-1-38) — a row per `event.id` seen. Non-tenant (it isn't
 * scoped to a single account), so it lives on the `NON_TENANT_TABLES` allowlist
 * in `src/db/rls.ts` and is only written by `getServiceClient()`.
 */
import { pgEnum, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

import { tenantIsolationPolicy } from '@/db/rls';
import { accounts, subscriptionStatusEnum, tierEnum } from '@/db/schema/tenancy';

/** Billing interval for a Stripe subscription. */
export const billingPeriodEnum = pgEnum('billing_period_t', ['monthly', 'annual']);

export const subscriptions = pgTable(
  'subscriptions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    accountId: uuid('account_id')
      .notNull()
      .references(() => accounts.id, { onDelete: 'cascade' }),
    stripeSubscriptionId: text('stripe_subscription_id').notNull().unique(),
    stripePriceId: text('stripe_price_id'),
    status: subscriptionStatusEnum('status').notNull().default('none'),
    tier: tierEnum('tier'),
    period: billingPeriodEnum('period'),
    currentPeriodEnd: timestamp('current_period_end', { withTimezone: true }),
    canceledAt: timestamp('canceled_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [tenantIsolationPolicy(t.accountId)],
);

/**
 * `processed_stripe_events` — the idempotency ledger for the Stripe webhook
 * (T-1-38). The webhook handler does `INSERT ... ON CONFLICT DO NOTHING` keyed
 * on `event_id`; a successful insert is "first time seen", a no-op is "already
 * processed, return 200". Non-tenant — written only by `getServiceClient()` —
 * and therefore on the `NON_TENANT_TABLES` allowlist in `src/db/rls.ts`.
 */
export const processedStripeEvents = pgTable('processed_stripe_events', {
  eventId: text('event_id').primaryKey(),
  eventType: text('event_type').notNull(),
  processedAt: timestamp('processed_at', { withTimezone: true }).notNull().defaultNow(),
});
