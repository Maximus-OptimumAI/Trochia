/**
 * `applySubscriptionState(event)` — the webhook side-effect layer (Plan 01-07,
 * FND-05, T-1-38).
 *
 * Given a Stripe event, finds the owning account (via `client_reference_id`
 * on `checkout.session.completed`, else via `stripe_customer_id`) and brings
 * `accounts` + `subscriptions` into agreement with what Stripe says. Pure-ish
 * — same event applied twice is a no-op (the column writes are idempotent;
 * dedupe is one layer up in `dedupe.ts`).
 *
 * Event types handled:
 *   - checkout.session.completed       → set stripe_customer_id, status='trialing', tier, period
 *   - customer.subscription.created    → upsert subscriptions row, mirror to accounts
 *   - customer.subscription.updated    → mirror status/tier/period/current_period_end
 *   - customer.subscription.deleted    → status='canceled', clear tier on accounts
 *   - invoice.payment_failed           → status='past_due'; fire payment-failed email
 *   - invoice.paid                     → status='active' (Stripe also fires this
 *                                         post-trial; safe to re-mirror)
 *
 * Unknown event types are a benign no-op.
 */
import { eq } from 'drizzle-orm';
import type Stripe from 'stripe';

import { getServiceClient } from '@/db/client';
import { accounts } from '@/db/schema/tenancy';
import { subscriptions } from '@/db/schema/billing';
import { logger } from '@/lib/logger';
import { priceIdToTierAndPeriod, type Tier, type Period } from '@/modules/billing/tiers';
import { sendEmail } from '@/lib/email/client';

type AccountRow = typeof accounts.$inferSelect;

const STRIPE_STATUS_MAP: Record<string, AccountRow['subscriptionStatus']> = {
  trialing: 'trialing',
  active: 'active',
  past_due: 'past_due',
  unpaid: 'past_due',
  canceled: 'canceled',
  incomplete: 'incomplete',
  incomplete_expired: 'canceled',
  paused: 'past_due',
};

function mapStripeStatus(s: string | null | undefined): AccountRow['subscriptionStatus'] {
  if (!s) return 'none';
  return STRIPE_STATUS_MAP[s] ?? 'none';
}

async function findAccountByCustomer(customerId: string): Promise<AccountRow | null> {
  const db = getServiceClient();
  const row = await db.query.accounts.findFirst({
    where: eq(accounts.stripeCustomerId, customerId),
  });
  return row ?? null;
}

async function findAccountById(accountId: string): Promise<AccountRow | null> {
  const db = getServiceClient();
  const row = await db.query.accounts.findFirst({ where: eq(accounts.id, accountId) });
  return row ?? null;
}

interface SubLike {
  id: string;
  status: string;
  customer: string;
  items: { data: Array<{ price: { id: string } }> };
  current_period_end?: number | null;
}

function priceIdFromSub(sub: SubLike): string | null {
  return sub.items?.data?.[0]?.price?.id ?? null;
}

async function mirrorSubscription(
  account: AccountRow,
  sub: SubLike,
): Promise<{ tier: Tier | null; period: Period | null }> {
  const db = getServiceClient();
  const priceId = priceIdFromSub(sub);
  const lookup = priceIdToTierAndPeriod(priceId);
  const tier = lookup?.tier ?? null;
  const period = lookup?.period ?? null;
  const status = mapStripeStatus(sub.status);
  const currentPeriodEnd = sub.current_period_end
    ? new Date(sub.current_period_end * 1000)
    : null;

  // Upsert subscriptions row keyed on stripe_subscription_id (UNIQUE).
  await db
    .insert(subscriptions)
    .values({
      accountId: account.id,
      stripeSubscriptionId: sub.id,
      stripePriceId: priceId ?? undefined,
      status,
      tier: tier ?? undefined,
      period: period ?? undefined,
      currentPeriodEnd: currentPeriodEnd ?? undefined,
    })
    .onConflictDoUpdate({
      target: subscriptions.stripeSubscriptionId,
      set: {
        status,
        tier: tier ?? null,
        period: period ?? null,
        stripePriceId: priceId ?? null,
        currentPeriodEnd: currentPeriodEnd ?? null,
        updatedAt: new Date(),
      },
    });

  // Mirror to accounts.
  await db
    .update(accounts)
    .set({
      subscriptionStatus: status,
      tier: tier ?? null,
      currentPeriodEnd: currentPeriodEnd ?? null,
      stripeCustomerId: account.stripeCustomerId ?? sub.customer,
      updatedAt: new Date(),
    })
    .where(eq(accounts.id, account.id));

  return { tier, period };
}

/**
 * Apply a Stripe event to the persisted billing state. Idempotent (re-applying
 * the same event lands the same target state).
 *
 * Returns the `{ accountId, tier, period }` of the affected account, or null
 * if no matching account was found (which the webhook treats as a benign no-op
 * — the reconcile cron catches it later).
 */
export async function applySubscriptionState(
  event: Stripe.Event,
): Promise<{ accountId: string; tier: Tier | null; period: Period | null } | null> {
  switch (event.type) {
    case 'checkout.session.completed': {
      const session = event.data.object as unknown as {
        client_reference_id?: string | null;
        customer?: string | null;
        subscription?: string | null;
      };
      const accountId = session.client_reference_id ?? null;
      const customerId = session.customer ?? null;
      if (!accountId) {
        logger.warn('webhook: checkout.session.completed without client_reference_id', {
          eventId: event.id,
        });
        return null;
      }
      const account = await findAccountById(accountId);
      if (!account) return null;
      // Persist the Stripe customer id on the account so subsequent events
      // (which only carry the customer id) can find this account.
      if (customerId && account.stripeCustomerId !== customerId) {
        const db = getServiceClient();
        await db
          .update(accounts)
          .set({ stripeCustomerId: customerId, updatedAt: new Date() })
          .where(eq(accounts.id, account.id));
        account.stripeCustomerId = customerId;
      }
      // The subscription gets mirrored when its own *.created/*.updated event
      // arrives (Stripe fires both during a checkout); for now set status=
      // 'trialing' optimistically so the founder lands on /app without waiting.
      const db = getServiceClient();
      await db
        .update(accounts)
        .set({ subscriptionStatus: 'trialing', updatedAt: new Date() })
        .where(eq(accounts.id, account.id));
      return { accountId: account.id, tier: null, period: null };
    }

    case 'customer.subscription.created':
    case 'customer.subscription.updated': {
      const sub = event.data.object as unknown as SubLike;
      const account = await findAccountByCustomer(sub.customer);
      if (!account) return null;
      const { tier, period } = await mirrorSubscription(account, sub);
      return { accountId: account.id, tier, period };
    }

    case 'customer.subscription.deleted': {
      const sub = event.data.object as unknown as SubLike;
      const account = await findAccountByCustomer(sub.customer);
      if (!account) return null;
      const db = getServiceClient();
      await db
        .update(subscriptions)
        .set({ status: 'canceled', canceledAt: new Date(), updatedAt: new Date() })
        .where(eq(subscriptions.stripeSubscriptionId, sub.id));
      await db
        .update(accounts)
        .set({
          subscriptionStatus: 'canceled',
          tier: null,
          currentPeriodEnd: null,
          updatedAt: new Date(),
        })
        .where(eq(accounts.id, account.id));
      return { accountId: account.id, tier: null, period: null };
    }

    case 'invoice.payment_failed': {
      const invoice = event.data.object as unknown as { customer: string };
      const account = await findAccountByCustomer(invoice.customer);
      if (!account) return null;
      const db = getServiceClient();
      await db
        .update(accounts)
        .set({ subscriptionStatus: 'past_due', updatedAt: new Date() })
        .where(eq(accounts.id, account.id));
      // Best-effort dunning email — never throw out of the webhook handler.
      try {
        const owner = await db.query.users.findFirst({
          where: eq((await import('@/db/schema/tenancy')).users.id, account.ownerUserId),
        });
        if (owner?.email) {
          await sendEmail({
            to: owner.email,
            template: 'payment-failed',
            props: {
              updatePaymentUrl: `${process.env.NEXT_PUBLIC_APP_URL ?? ''}/app/billing`,
            },
          });
        }
      } catch (err) {
        logger.warn('webhook: payment-failed email send failed', { err });
      }
      return { accountId: account.id, tier: null, period: null };
    }

    case 'invoice.paid': {
      const invoice = event.data.object as unknown as { customer: string };
      const account = await findAccountByCustomer(invoice.customer);
      if (!account) return null;
      const db = getServiceClient();
      await db
        .update(accounts)
        .set({ subscriptionStatus: 'active', updatedAt: new Date() })
        .where(eq(accounts.id, account.id));
      return { accountId: account.id, tier: null, period: null };
    }

    default:
      // Unknown event type — benign no-op.
      return null;
  }
}
