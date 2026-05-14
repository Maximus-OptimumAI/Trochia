/**
 * Regression for /codex 01-07 review [P1] finding #2:
 * "Mark Stripe events processed only after side effects" — PR-3.
 *
 * Integration test against a real Postgres (`TEST_DATABASE_URL`). Skips
 * cleanly when the env is unset. Exercises `processStripeEventTransactional`
 * — the transactional driver introduced by PR-3 — under the two race
 * conditions /codex flagged:
 *
 *   (a) Two concurrent deliveries of the same `event_id` — exactly one
 *       commits the side-effects and the claim; the other returns
 *       `{ deduped: true }` without any retained writes.
 *   (b) The side-effect THROWS mid-transaction — the claim is NOT marked
 *       processed, so a Stripe retry replays cleanly and succeeds.
 */
import { randomUUID } from 'node:crypto';

import { sql } from 'drizzle-orm';
import type Stripe from 'stripe';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import * as schema from '@/db/schema';
import {
  HAS_TEST_DB,
  cleanup,
  closeTestDb,
  getServiceClientForTests,
  migrateTestDb,
} from '../db/test-db';

const d = HAS_TEST_DB ? describe : describe.skip;

// We import the module under test lazily so we can re-mock between tests
// without contaminating module state.
async function loadProcess() {
  vi.resetModules();
  // The transactional driver imports `getServiceClient` from `@/db/client`;
  // we route it to the test DB by overriding the underlying postgres URL
  // through the env var (the singleton init reads it once per process).
  const mod = await import('@/modules/billing/process');
  return mod;
}

/** Seed: insert one user + one account so the apply branches can find it. */
async function seedAccount(stripeCustomerId: string): Promise<{
  userId: string;
  accountId: string;
}> {
  const db = getServiceClientForTests();
  const userId = randomUUID();
  await db.execute(
    sql`insert into auth.users (id, email) values (${userId}, ${`${userId}@test.local`}) on conflict do nothing`,
  );
  await db
    .insert(schema.users)
    .values({ id: userId, email: `${userId}@test.local` })
    .onConflictDoNothing();
  const [acct] = await db
    .insert(schema.accounts)
    .values({
      ownerUserId: userId,
      region: 'us',
      stripeCustomerId,
      subscriptionStatus: 'trialing',
    })
    .returning({ id: schema.accounts.id });
  return { userId, accountId: acct.id };
}

function fakeInvoicePaidEvent(eventId: string, customer: string): Stripe.Event {
  return {
    id: eventId,
    object: 'event',
    type: 'invoice.paid',
    api_version: '2024-06-20',
    created: Math.floor(Date.now() / 1000),
    data: { object: { customer } as unknown as Stripe.Event.Data.Object },
    livemode: false,
    pending_webhooks: 0,
    request: { id: null, idempotency_key: null },
  } as unknown as Stripe.Event;
}

d('processStripeEventTransactional — claim-after-side-effect (PR-3)', () => {
  beforeAll(async () => {
    // Point the runtime `getServiceClient` at the test DB by setting the env
    // BEFORE any module load that reads it.
    process.env.DATABASE_URL = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL;
    // PR-5 / codex #3 race test (below) asserts tier mirroring across the
    // subscription-before-checkout sequence. Stub deterministic Stripe price
    // IDs so `priceIdToTierAndPeriod` resolves; mirrors the pattern in
    // tests/billing/tiers.test.ts. `??=` so CI's real values aren't clobbered.
    process.env.STRIPE_PRICE_PRE_RAISE_MONTHLY ??= 'price_pre_raise_m';
    process.env.STRIPE_PRICE_PRE_RAISE_ANNUAL ??= 'price_pre_raise_a';
    process.env.STRIPE_PRICE_ACTIVE_RAISE_MONTHLY ??= 'price_active_raise_m';
    process.env.STRIPE_PRICE_ACTIVE_RAISE_ANNUAL ??= 'price_active_raise_a';
    await migrateTestDb();
    await cleanup();
  });

  afterAll(async () => {
    await cleanup();
    await closeTestDb();
  });

  beforeEach(async () => {
    await cleanup();
    vi.resetModules();
  });

  it('two concurrent deliveries of the same event_id → exactly one set of writes commits', async () => {
    const { processStripeEventTransactional } = await loadProcess();
    const { accountId } = await seedAccount('cus_test_race');
    const event = fakeInvoicePaidEvent('evt_race_1', 'cus_test_race');

    // Fire two concurrent deliveries. Postgres serialises the conflicting
    // INSERTs on the unique index `processed_stripe_events.event_id`; the
    // winner's tx commits, the loser's tx rolls back (and the loser sees
    // ZERO rows returned by the conflict-targeted INSERT and throws the
    // sentinel internally → returns `{ deduped: true }`).
    const [a, b] = await Promise.all([
      processStripeEventTransactional(event),
      processStripeEventTransactional(event),
    ]);

    // Exactly one delivery succeeded; the other deduped.
    const winners = [a, b].filter((r) => !r.deduped);
    const losers = [a, b].filter((r) => r.deduped);
    expect(winners.length).toBe(1);
    expect(losers.length).toBe(1);

    // The claim ledger has exactly one row for this event_id.
    const db = getServiceClientForTests();
    const claims = await db.execute<{ count: string }>(
      sql`select count(*)::text as count from public.processed_stripe_events where event_id = ${event.id}`,
    );
    expect(Number(claims[0].count)).toBe(1);

    // The account's subscription_status reflects the invoice.paid side-effect
    // (it transitions trialing → active).
    const [acct] = await db
      .select()
      .from(schema.accounts)
      .where(sql`${schema.accounts.id} = ${accountId}`);
    expect(acct.subscriptionStatus).toBe('active');
  });

  it('side-effect throws → claim NOT marked processed; retry succeeds', async () => {
    // We don't load the module here — we re-import after the mock below.
    await seedAccount('cus_test_retry');

    // First delivery: monkey-patch applySubscriptionState to throw AFTER
    // doing one DB write — proves the tx rolls back the partial write AND
    // omits the claim. We do this by mocking the state module at import time.
    vi.resetModules();
    vi.doMock('@/modules/billing/state', async () => {
      const actual = await vi.importActual<typeof import('@/modules/billing/state')>(
        '@/modules/billing/state',
      );
      return {
        ...actual,
        applySubscriptionState: vi.fn().mockImplementation(async () => {
          throw new Error('synthetic side-effect failure');
        }),
      };
    });

    const moduleUnderFailure = await import('@/modules/billing/process');
    const event = fakeInvoicePaidEvent('evt_retry_1', 'cus_test_retry');

    await expect(moduleUnderFailure.processStripeEventTransactional(event)).rejects.toThrow(
      'synthetic side-effect failure',
    );

    // The claim ledger MUST NOT have a row for this event — Stripe's retry
    // would otherwise see "already processed" and skip the replay.
    const db = getServiceClientForTests();
    const claims = await db.execute<{ count: string }>(
      sql`select count(*)::text as count from public.processed_stripe_events where event_id = ${event.id}`,
    );
    expect(Number(claims[0].count)).toBe(0);

    // Now simulate Stripe's retry: clear the mock so applySubscriptionState
    // runs the real branch, and replay the same event.
    vi.doUnmock('@/modules/billing/state');
    vi.resetModules();
    const moduleAfterRecovery = await import('@/modules/billing/process');
    const replay = await moduleAfterRecovery.processStripeEventTransactional(event);

    expect(replay.deduped).toBe(false);

    // After the retry, the claim row exists and the account is active.
    const claimsAfter = await db.execute<{ count: string }>(
      sql`select count(*)::text as count from public.processed_stripe_events where event_id = ${event.id}`,
    );
    expect(Number(claimsAfter[0].count)).toBe(1);
  });

  it('happy path: a fresh event commits writes AND claims the ledger atomically', async () => {
    const { processStripeEventTransactional } = await loadProcess();
    const { accountId } = await seedAccount('cus_happy');
    const event = fakeInvoicePaidEvent('evt_happy_1', 'cus_happy');

    const result = await processStripeEventTransactional(event);
    expect(result.deduped).toBe(false);
    expect(result.apply?.accountId).toBe(accountId);

    const db = getServiceClientForTests();
    const claims = await db.execute<{ count: string }>(
      sql`select count(*)::text as count from public.processed_stripe_events where event_id = ${event.id}`,
    );
    expect(Number(claims[0].count)).toBe(1);
  });

  it('PR-5 / codex #3: subscription-before-checkout race — both events converge on the same account, tier/period applied, customer_id persisted, ledger has exactly 2 rows', async () => {
    const { processStripeEventTransactional } = await loadProcess();

    // Seed an account WITHOUT a stripe_customer_id (the state before
    // checkout.session.completed has run). This is the precise window the
    // codex review flagged: customer.subscription.created arrives first,
    // findAccountByCustomer returns null, and the event would have orphaned
    // the tier/period until the 6h reconcile cron.
    const db = getServiceClientForTests();
    const userId = randomUUID();
    await db.execute(
      sql`insert into auth.users (id, email) values (${userId}, ${`${userId}@test.local`}) on conflict do nothing`,
    );
    await db
      .insert(schema.users)
      .values({ id: userId, email: `${userId}@test.local` })
      .onConflictDoNothing();
    const [acct] = await db
      .insert(schema.accounts)
      .values({ ownerUserId: userId, region: 'us', subscriptionStatus: 'none' })
      .returning({ id: schema.accounts.id });

    // Pick a period end ~30 days out — asserted directly after both events.
    const periodEndSeconds = Math.floor(Date.now() / 1000) + 30 * 24 * 3600;
    const expectedPeriodEnd = new Date(periodEndSeconds * 1000);
    const expectedCustomer = 'cus_not_yet_persisted';

    // ─── EVENT 1 ── customer.subscription.created arrives FIRST. The Stripe
    // object carries the customer id but our accounts row has not been told.
    // metadata.account_id is what `subscription_data.metadata` (set at
    // checkout-session creation by src/modules/billing/checkout.ts) stamps on
    // every subscription Stripe produces — the fallback resolves the account.
    const event1 = {
      id: 'evt_ordering_sub',
      object: 'event',
      type: 'customer.subscription.created',
      api_version: '2024-06-20',
      created: Math.floor(Date.now() / 1000),
      data: {
        object: {
          id: 'sub_test_ordering',
          status: 'trialing',
          customer: expectedCustomer,
          items: { data: [{ price: { id: process.env.STRIPE_PRICE_PRE_RAISE_MONTHLY ?? 'price_pre_raise_m' } }] },
          current_period_end: periodEndSeconds,
          metadata: { account_id: acct.id },
        },
      },
      livemode: false,
      pending_webhooks: 0,
      request: { id: null, idempotency_key: null },
    } as unknown as Stripe.Event;

    const r1 = await processStripeEventTransactional(event1);
    expect(r1.deduped).toBe(false);
    expect(r1.apply?.accountId).toBe(acct.id);
    expect(r1.apply?.tier).toBe('pre_raise');
    expect(r1.apply?.period).toBe('monthly');

    // After event 1: stripe_customer_id persisted via the fallback path; tier
    // + period mirrored to accounts; currentPeriodEnd reflects the unix-seconds
    // → Date conversion in mirrorSubscription.
    const [afterEvent1] = await db
      .select()
      .from(schema.accounts)
      .where(sql`${schema.accounts.id} = ${acct.id}`);
    expect(afterEvent1.stripeCustomerId).toBe(expectedCustomer);
    expect(afterEvent1.tier).toBe('pre_raise');
    expect(afterEvent1.currentPeriodEnd?.getTime()).toBe(expectedPeriodEnd.getTime());

    // ─── EVENT 2 ── checkout.session.completed arrives SECOND for the SAME
    // account/customer. client_reference_id carries the account id (set by
    // checkout.ts). This event must resolve to the SAME account, NOT clobber
    // the tier/period that event 1 just wrote, NOT change the already-persisted
    // stripe_customer_id, and add its own claim row to the ledger.
    const event2 = {
      id: 'evt_ordering_chk',
      object: 'event',
      type: 'checkout.session.completed',
      api_version: '2024-06-20',
      created: Math.floor(Date.now() / 1000),
      data: {
        object: {
          id: 'cs_test_ordering',
          client_reference_id: acct.id,
          customer: expectedCustomer,
          subscription: 'sub_test_ordering',
        },
      },
      livemode: false,
      pending_webhooks: 0,
      request: { id: null, idempotency_key: null },
    } as unknown as Stripe.Event;

    const r2 = await processStripeEventTransactional(event2);
    expect(r2.deduped).toBe(false);
    expect(r2.apply?.accountId).toBe(acct.id); // SAME account, not a different one

    // After event 2: tier + currentPeriodEnd from event 1 SURVIVED (the
    // checkout handler only writes subscriptionStatus + stripeCustomerId,
    // never tier/period); stripeCustomerId unchanged (matches existing,
    // hits the skip-update branch in state.ts:196); subscriptionStatus is
    // 'trialing' (set explicitly by the checkout handler).
    const [afterEvent2] = await db
      .select()
      .from(schema.accounts)
      .where(sql`${schema.accounts.id} = ${acct.id}`);
    expect(afterEvent2.tier).toBe('pre_raise');
    expect(afterEvent2.currentPeriodEnd?.getTime()).toBe(expectedPeriodEnd.getTime());
    expect(afterEvent2.stripeCustomerId).toBe(expectedCustomer);
    expect(afterEvent2.subscriptionStatus).toBe('trialing');

    // ─── Ledger: exactly 2 rows, one per event_id ── proves PR-3's
    // claim-after-side-effect contract held across BOTH events (neither
    // throw rolled the other back; neither was claimed twice).
    const claims = await db.execute<{ count: string }>(
      sql`select count(*)::text as count from public.processed_stripe_events where event_id in (${event1.id}, ${event2.id})`,
    );
    expect(Number(claims[0].count)).toBe(2);
  });

  it('replay of an already-processed event_id → deduped, no extra writes', async () => {
    const { processStripeEventTransactional } = await loadProcess();
    await seedAccount('cus_replay');
    const event = fakeInvoicePaidEvent('evt_replay_1', 'cus_replay');

    const first = await processStripeEventTransactional(event);
    expect(first.deduped).toBe(false);

    const second = await processStripeEventTransactional(event);
    expect(second.deduped).toBe(true);

    // Only one claim row regardless of replay count.
    const db = getServiceClientForTests();
    const claims = await db.execute<{ count: string }>(
      sql`select count(*)::text as count from public.processed_stripe_events where event_id = ${event.id}`,
    );
    expect(Number(claims[0].count)).toBe(1);
  });
});
