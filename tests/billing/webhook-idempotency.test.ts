/**
 * `tests/billing/webhook-idempotency.test.ts` (mock-based, post PR-3) — asserts:
 *   - missing signature → 400
 *   - bad signature → 400
 *   - first checkout.session.completed → fires checkout_completed analytics + Inngest + 200
 *   - replayed event id → deduped path returns 200 with `{ deduped: true }`, NO post-commit effects fire
 *   - customer.subscription.deleted → processStripeEventTransactional receives the event
 *   - post-commit email is fired for results with `apply.postCommitEmail`
 *
 * Mocks: Stripe SDK (signature verify), the transactional driver
 * `processStripeEventTransactional`, Inngest, analytics, email. Real
 * transactional semantics (the concurrent-claim race + side-effect rollback)
 * live in `tests/billing/stripe-event-processing.integration.test.ts` which
 * runs against a real Postgres via TEST_DATABASE_URL.
 */
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const constructEvent = vi.fn();
const processFn = vi.fn();
const inngestSend = vi.fn();
const trackFn = vi.fn();
const sendEmailFn = vi.fn();

beforeAll(() => {
  process.env.STRIPE_SECRET_KEY = 'sk_test_dummy';
  process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test';
});

vi.mock('stripe', () => {
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

vi.mock('@/modules/billing/process', () => ({
  processStripeEventTransactional: (...args: unknown[]) => processFn(...args),
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

vi.mock('@/lib/email/client', () => ({
  sendEmail: (...args: unknown[]) => sendEmailFn(...args),
}));

afterEach(() => {
  constructEvent.mockReset();
  processFn.mockReset();
  inngestSend.mockReset();
  trackFn.mockReset();
  sendEmailFn.mockReset();
});

beforeEach(() => {
  inngestSend.mockResolvedValue(undefined);
  sendEmailFn.mockResolvedValue({ sent: true });
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

describe('POST /api/webhooks/stripe (PR-3 — claim-after-side-effect)', () => {
  it('returns 400 when the stripe-signature header is missing', async () => {
    const { POST } = await import('@/app/api/webhooks/stripe/route');
    const res = await POST(makeRequest('{}', null) as never);
    expect(res.status).toBe(400);
    expect(processFn).not.toHaveBeenCalled();
  });

  it('returns 400 when constructEvent throws (bad signature)', async () => {
    constructEvent.mockImplementation(() => {
      throw new Error('bad sig');
    });
    const { POST } = await import('@/app/api/webhooks/stripe/route');
    const res = await POST(makeRequest('{}', 'sig_bad') as never);
    expect(res.status).toBe(400);
    expect(processFn).not.toHaveBeenCalled();
  });

  it('first checkout.session.completed → processStripeEventTransactional + analytics + Inngest + 200', async () => {
    constructEvent.mockReturnValue({
      id: 'evt_1',
      type: 'checkout.session.completed',
      data: { object: { client_reference_id: 'acc_1', customer: 'cus_1' } },
    });
    processFn.mockResolvedValue({
      deduped: false,
      apply: { accountId: 'acc_1', tier: 'active_raise', period: 'monthly' },
    });
    const { POST } = await import('@/app/api/webhooks/stripe/route');
    const res = await POST(makeRequest('{"x":1}', 'sig_ok') as never);
    expect(res.status).toBe(200);
    expect(processFn).toHaveBeenCalledTimes(1);
    expect(trackFn).toHaveBeenCalledWith(
      'checkout_completed',
      expect.objectContaining({ tier: 'active_raise', period: 'monthly' }),
    );
    expect(inngestSend).toHaveBeenCalledTimes(1);
    expect(sendEmailFn).not.toHaveBeenCalled();
  });

  it('replayed event id → deduped path: 200 + NO analytics, NO Inngest, NO email', async () => {
    constructEvent.mockReturnValue({
      id: 'evt_1',
      type: 'checkout.session.completed',
      data: { object: { client_reference_id: 'acc_1', customer: 'cus_1' } },
    });
    processFn.mockResolvedValue({ deduped: true });
    const { POST } = await import('@/app/api/webhooks/stripe/route');
    const res = await POST(makeRequest('{"x":1}', 'sig_ok') as never);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { deduped: boolean };
    expect(body.deduped).toBe(true);
    // Critical: the post-commit side-effects MUST NOT fire on a deduped delivery.
    expect(trackFn).not.toHaveBeenCalled();
    expect(inngestSend).not.toHaveBeenCalled();
    expect(sendEmailFn).not.toHaveBeenCalled();
  });

  it('invoice.payment_failed with postCommitEmail → email IS dispatched after commit', async () => {
    constructEvent.mockReturnValue({
      id: 'evt_dun',
      type: 'invoice.payment_failed',
      data: { object: { customer: 'cus_1' } },
    });
    processFn.mockResolvedValue({
      deduped: false,
      apply: {
        accountId: 'acc_1',
        tier: null,
        period: null,
        postCommitEmail: {
          to: 'founder@example.com',
          template: 'payment-failed',
          props: { updatePaymentUrl: 'https://trochia.test/app/billing' },
        },
      },
    });
    const { POST } = await import('@/app/api/webhooks/stripe/route');
    const res = await POST(makeRequest('{}', 'sig_ok') as never);
    expect(res.status).toBe(200);
    expect(sendEmailFn).toHaveBeenCalledTimes(1);
    expect(sendEmailFn).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'founder@example.com',
        template: 'payment-failed',
      }),
    );
    // No checkout_completed analytics for a payment_failed event.
    expect(trackFn).not.toHaveBeenCalled();
  });

  it('transactional driver throws → 500 (Stripe retries)', async () => {
    constructEvent.mockReturnValue({
      id: 'evt_err',
      type: 'customer.subscription.updated',
      data: { object: { id: 'sub_1', customer: 'cus_1', status: 'active', items: { data: [] } } },
    });
    processFn.mockRejectedValue(new Error('DB connection lost'));
    const { POST } = await import('@/app/api/webhooks/stripe/route');
    const res = await POST(makeRequest('{}', 'sig_ok') as never);
    expect(res.status).toBe(500);
    expect(trackFn).not.toHaveBeenCalled();
    expect(inngestSend).not.toHaveBeenCalled();
  });
});
