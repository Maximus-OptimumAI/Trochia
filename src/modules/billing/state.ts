/**
 * `applySubscriptionState(db, event)` — the webhook side-effect layer (Plan 01-07,
 * FND-05, T-1-38). PURE DB WRITES — no external side-effects (email, Inngest,
 * analytics) belong here; those are returned via {@link ApplyResult.postCommitEmail}
 * and fired by the caller AFTER the surrounding transaction commits.
 *
 * Given a Stripe event and a Drizzle client (a `DrizzleDb` OR a transaction
 * client), find the owning account (via `client_reference_id` on
 * `checkout.session.completed`, else via `stripe_customer_id`) and bring
 * `accounts` + `subscriptions` into agreement with what Stripe says. Pure-ish —
 * same event applied twice is a no-op (the column writes are idempotent; dedupe
 * is one layer up in `src/modules/billing/process.ts`).
 *
 * **PR-3 change (/codex 01-07 [P1] finding #2):** previously this ran outside any
 * transaction and the webhook's `processed_stripe_events` claim was committed
 * BEFORE these writes. If a write threw, Stripe's retry saw "already processed"
 * and the side-effect dropped permanently. PR-3 inverts the ordering: the caller
 * (processStripeEventTransactional) opens a transaction, calls this function,
 * then INSERTs the claim ledger as the LAST statement inside the same
 * transaction. Any throw rolls back BOTH the side-effects AND the claim, so
 * Stripe's retry replays cleanly.
 *
 * Event types handled:
 *   - checkout.session.completed       → set stripe_customer_id, status='trialing', tier, period
 *   - customer.subscription.created    → upsert subscriptions row, mirror to accounts
 *   - customer.subscription.updated    → mirror status/tier/period/current_period_end
 *   - customer.subscription.deleted    → status='canceled', clear tier on accounts
 *   - invoice.payment_failed           → status='past_due'; return postCommitEmail for dunning
 *   - invoice.paid                     → status='active' (Stripe also fires this
 *                                         post-trial; safe to re-mirror)
 *
 * Unknown event types are a benign no-op.
 */
import { eq } from 'drizzle-orm';
import type Stripe from 'stripe';

import { type DrizzleDb } from '@/db/client';
import { accounts, users } from '@/db/schema/tenancy';
import { subscriptions } from '@/db/schema/billing';
import { logger } from '@/lib/logger';
import { priceIdToTierAndPeriod, type Tier, type Period } from '@/modules/billing/tiers';

type AccountRow = typeof accounts.$inferSelect;

/** The transaction-or-pooled client both shapes export. Drizzle 0.44's tx type
 *  has the same query/insert/update surface as `DrizzleDb`, so we accept either. */
export type TxOrDb = DrizzleDb | Parameters<Parameters<DrizzleDb['transaction']>[0]>[0];

/**
 * The shape returned by {@link applySubscriptionState}. `postCommitEmail` is set
 * for events that require a transactional email (dunning, etc.) — the caller
 * fires it AFTER the surrounding tx commits, so a rollback never leaks an email.
 */
export interface ApplyResult {
  accountId: string;
  tier: Tier | null;
  period: Period | null;
  /** Optional email the caller fires post-commit (never inside the transaction). */
  postCommitEmail?: {
    to: string;
    template: 'payment-failed';
    props: { updatePaymentUrl: string };
  };
}

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

async function findAccountByCustomer(db: TxOrDb, customerId: string): Promise<AccountRow | null> {
  const row = await db.query.accounts.findFirst({
    where: eq(accounts.stripeCustomerId, customerId),
  });
  return row ?? null;
}

async function findAccountById(db: TxOrDb, accountId: string): Promise<AccountRow | null> {
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
  db: TxOrDb,
  account: AccountRow,
  sub: SubLike,
): Promise<{ tier: Tier | null; period: Period | null }> {
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
 * Apply a Stripe event to the persisted billing state. **All writes go through
 * the caller-supplied `db` (a transaction client when called from
 * `processStripeEventTransactional`).** Idempotent (re-applying the same event
 * lands the same target state).
 *
 * Returns the `{ accountId, tier, period, postCommitEmail? }` of the affected
 * account, or `null` if no matching account was found (which the webhook treats
 * as a benign no-op — the reconcile cron catches it later).
 */
export async function applySubscriptionState(
  db: TxOrDb,
  event: Stripe.Event,
): Promise<ApplyResult | null> {
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
      const account = await findAccountById(db, accountId);
      if (!account) return null;
      // Persist the Stripe customer id on the account so subsequent events
      // (which only carry the customer id) can find this account.
      if (customerId && account.stripeCustomerId !== customerId) {
        await db
          .update(accounts)
          .set({ stripeCustomerId: customerId, updatedAt: new Date() })
          .where(eq(accounts.id, account.id));
        account.stripeCustomerId = customerId;
      }
      // The subscription gets mirrored when its own *.created/*.updated event
      // arrives (Stripe fires both during a checkout); for now set status=
      // 'trialing' optimistically so the founder lands on /app without waiting.
      await db
        .update(accounts)
        .set({ subscriptionStatus: 'trialing', updatedAt: new Date() })
        .where(eq(accounts.id, account.id));
      return { accountId: account.id, tier: null, period: null };
    }

    case 'customer.subscription.created':
    case 'customer.subscription.updated': {
      const sub = event.data.object as unknown as SubLike;
      const account = await findAccountByCustomer(db, sub.customer);
      if (!account) return null;
      const { tier, period } = await mirrorSubscription(db, account, sub);
      return { accountId: account.id, tier, period };
    }

    case 'customer.subscription.deleted': {
      const sub = event.data.object as unknown as SubLike;
      const account = await findAccountByCustomer(db, sub.customer);
      if (!account) return null;
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
      const account = await findAccountByCustomer(db, invoice.customer);
      if (!account) return null;
      await db
        .update(accounts)
        .set({ subscriptionStatus: 'past_due', updatedAt: new Date() })
        .where(eq(accounts.id, account.id));
      // Look up the owner's email for the dunning send — but DON'T fire the
      // email here. We return it on the result so the caller can dispatch it
      // AFTER the transaction commits. (Firing inside the tx would leak an
      // email on rollback; firing on every retry would double-email.)
      const owner = await db.query.users.findFirst({
        where: eq(users.id, account.ownerUserId),
      });
      const result: ApplyResult = { accountId: account.id, tier: null, period: null };
      if (owner?.email) {
        result.postCommitEmail = {
          to: owner.email,
          template: 'payment-failed',
          props: {
            updatePaymentUrl: `${process.env.NEXT_PUBLIC_APP_URL ?? ''}/app/billing`,
          },
        };
      }
      return result;
    }

    case 'invoice.paid': {
      const invoice = event.data.object as unknown as { customer: string };
      const account = await findAccountByCustomer(db, invoice.customer);
      if (!account) return null;
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
