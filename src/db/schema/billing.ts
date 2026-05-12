/**
 * Billing: the `subscriptions` table.
 *
 * Stripe is the billing state machine; Trochia persists + reads. The denormalised
 * "current state" lives on `accounts` (`subscription_status` / `tier` /
 * `current_period_end` / `stripe_customer_id`); `subscriptions` is the per-Stripe-
 * subscription record (one account can churn through several over time). Plan 07
 * wires the webhook that writes both. RLS: tenant-isolated on `account_id`.
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
