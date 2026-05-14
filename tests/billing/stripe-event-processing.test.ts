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
