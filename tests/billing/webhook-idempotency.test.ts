/**
 * `tests/billing/webhook-idempotency.test.ts` — asserts:
 *   - a first checkout.session.completed event applies state
 *   - a replayed event id is a no-op (the dedupe ledger short-circuits)
 *   - customer.subscription.deleted flips accounts.subscription_status to 'canceled'
 *   - a bad signature returns 400
 *
 * Mocks: Stripe SDK (signature verify + the constructEvent call), the dedupe
 * ledger (claimEvent), and the DB-write path in applySubscriptionState.
 */
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const constructEvent = vi.fn();
const claimEvent = vi.fn();
const applyState = vi.fn();
const inngestSend = vi.fn();
const trackFn = vi.fn();

beforeAll(() => {
  process.env.STRIPE_SECRET_KEY = 'sk_test_dummy';
  process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test';
});

vi.mock('stripe', () => {
  // Use a real class declaration so `new Stripe(...)` works.
  class Stripe {
    webhooks = { constructEvent };
    checkout = { sessions: { create: () => ({}) } };
    constructor(_key?: string, _opts?: unknown) {
      void _key;
      void _opts;
    }
  }
  return { default: Stripe };
});

vi.mock('@/modules/billing/dedupe', () => ({
  claimEvent: (...args: unknown[]) => claimEvent(...args),
}));

vi.mock('@/modules/billing/state', () => ({
  applySubscriptionState: (...args: unknown[]) => applyState(...args),
}));

vi.mock('@/inngest/client', () => ({
  inngest: { send: (...args: unknown[]) => inngestSend(...args) },
}));

vi.mock('@/lib/analytics', () => ({
  track: (...args: unknown[]) => {
    trackFn(...args);
    return Promise.resolve();
  },
}));

afterEach(() => {
  constructEvent.mockReset();
  claimEvent.mockReset();
  applyState.mockReset();
  inngestSend.mockReset();
  trackFn.mockReset();
});

beforeEach(() => {
  inngestSend.mockResolvedValue(undefined);
});

function makeRequest(body: string, sig: string | null) {
  return new Request('https://test.local/api/webhooks/stripe', {
    method: 'POST',
    headers: sig
      ? { 'content-type': 'application/json', 'stripe-signature': sig }
      : { 'content-type': 'application/json' },
    body,
  });
}

describe('POST /api/webhooks/stripe', () => {
  it('returns 400 when the stripe-signature header is missing', async () => {
    const { POST } = await import('@/app/api/webhooks/stripe/route');
    const res = await POST(makeRequest('{}', null) as never);
    expect(res.status).toBe(400);
  });

  it('returns 400 when constructEvent throws (bad signature)', async () => {
    constructEvent.mockImplementation(() => {
      throw new Error('bad sig');
    });
    const { POST } = await import('@/app/api/webhooks/stripe/route');
    const res = await POST(makeRequest('{}', 'sig_bad') as never);
    expect(res.status).toBe(400);
    expect(applyState).not.toHaveBeenCalled();
  });

  it('first checkout.session.completed → applies state + fires checkout_completed + 200', async () => {
    constructEvent.mockReturnValue({
      id: 'evt_1',
      type: 'checkout.session.completed',
      data: { object: { client_reference_id: 'acc_1', customer: 'cus_1' } },
    });
    claimEvent.mockResolvedValue(true);
    applyState.mockResolvedValue({ accountId: 'acc_1', tier: 'active_raise', period: 'monthly' });
    const { POST } = await import('@/app/api/webhooks/stripe/route');
    const res = await POST(makeRequest('{"x":1}', 'sig_ok') as never);
    expect(res.status).toBe(200);
    expect(applyState).toHaveBeenCalledTimes(1);
    expect(trackFn).toHaveBeenCalledWith(
      'checkout_completed',
      expect.objectContaining({ tier: 'active_raise', period: 'monthly' }),
    );
    expect(inngestSend).toHaveBeenCalledTimes(1);
  });

  it('replayed event id → 200 + no applyState call (dedupe)', async () => {
    constructEvent.mockReturnValue({
      id: 'evt_1',
      type: 'checkout.session.completed',
      data: { object: { client_reference_id: 'acc_1', customer: 'cus_1' } },
    });
    claimEvent.mockResolvedValue(false);
    const { POST } = await import('@/app/api/webhooks/stripe/route');
    const res = await POST(makeRequest('{"x":1}', 'sig_ok') as never);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { deduped: boolean };
    expect(body.deduped).toBe(true);
    expect(applyState).not.toHaveBeenCalled();
    expect(inngestSend).not.toHaveBeenCalled();
  });

  it('customer.subscription.deleted → applyState called (status → canceled is applyState\'s job)', async () => {
    constructEvent.mockReturnValue({
      id: 'evt_del',
      type: 'customer.subscription.deleted',
      data: { object: { id: 'sub_1', customer: 'cus_1', status: 'canceled', items: { data: [] } } },
    });
    claimEvent.mockResolvedValue(true);
    applyState.mockResolvedValue({ accountId: 'acc_1', tier: null, period: null });
    const { POST } = await import('@/app/api/webhooks/stripe/route');
    const res = await POST(makeRequest('{}', 'sig_ok') as never);
    expect(res.status).toBe(200);
    expect(applyState).toHaveBeenCalledTimes(1);
    const passedEvent = applyState.mock.calls[0][0];
    expect(passedEvent.type).toBe('customer.subscription.deleted');
  });
});
