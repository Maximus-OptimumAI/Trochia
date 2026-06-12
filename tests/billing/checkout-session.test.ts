/**
 * `tests/billing/checkout-session.test.ts` — asserts the Stripe Checkout
 * session is created with the right params (trial, card-on-file, automatic
 * tax, client_reference_id, env-derived URLs).
 *
 * Mocks the Stripe SDK; never makes a network call.
 */
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

const checkoutCreate = vi.fn();

beforeAll(() => {
  process.env.STRIPE_PRICE_PRE_RAISE_MONTHLY = 'price_pre_raise_m';
  process.env.STRIPE_PRICE_PRE_RAISE_ANNUAL = 'price_pre_raise_a';
  process.env.STRIPE_PRICE_ACTIVE_RAISE_MONTHLY = 'price_active_raise_m';
  process.env.STRIPE_PRICE_ACTIVE_RAISE_ANNUAL = 'price_active_raise_a';
  process.env.STRIPE_SECRET_KEY = 'sk_test_dummy';
  // Hermetic env (HARDCODED-DOMAIN-REGEX-01): the "no hardcoded trochia
  // domain" assertions must hold regardless of the developer's .env.local /
  // missing .env.test — stub BOTH url vars to neutral test values.
  vi.stubEnv('NEXT_PUBLIC_APP_URL', 'https://app.test.example');
  vi.stubEnv('NEXT_PUBLIC_SITE_URL', 'https://test.example');
});

afterAll(() => {
  vi.unstubAllEnvs();
});

vi.mock('stripe', () => {
  // Stripe is a default-export class — use a real class declaration so
  // `new Stripe(key, opts)` works at call sites (vi.fn().mockImplementation
  // is not a constructor).
  class Stripe {
    checkout = { sessions: { create: checkoutCreate } };
    webhooks = { constructEvent: () => ({}) };
    constructor(_key?: string, _opts?: unknown) {
      void _key;
      void _opts;
    }
  }
  return { default: Stripe };
});

afterEach(() => {
  checkoutCreate.mockReset();
});

describe('createCheckoutSession', () => {
  it('passes trial_period_days=7, payment_method_collection=always, automatic_tax, client_reference_id, and APP_URL-derived URLs', async () => {
    vi.resetModules();
    checkoutCreate.mockResolvedValue({ url: 'https://stripe.test/c/cs_xyz' });
    const { createCheckoutSession } = await import('@/modules/billing/checkout');

    const out = await createCheckoutSession({
      accountId: 'acc_123',
      tier: 'active_raise',
      period: 'monthly',
      customerEmail: 'founder@example.com',
    });

    expect(out.url).toBe('https://stripe.test/c/cs_xyz');
    expect(checkoutCreate).toHaveBeenCalledTimes(1);
    const call = checkoutCreate.mock.calls[0][0];
    expect(call.mode).toBe('subscription');
    expect(call.client_reference_id).toBe('acc_123');
    expect(call.line_items).toEqual([{ price: 'price_active_raise_m', quantity: 1 }]);
    expect(call.subscription_data?.trial_period_days).toBe(7);
    expect(call.payment_method_collection).toBe('always');
    expect(call.automatic_tax?.enabled).toBe(true);
    expect(call.customer_email).toBe('founder@example.com');
    // URLs come from APP_URL (NEVER hardcoded).
    expect(call.success_url).toMatch(/\?checkout=success$/);
    expect(call.cancel_url).toMatch(/\?checkout=cancelled$/);
    // No hardcoded trochia domain in the urls.
    expect(call.success_url).not.toMatch(/https?:\/\/trochia\./);
  });

  it('uses pre_raise annual price id when tier=pre_raise, period=annual', async () => {
    vi.resetModules();
    checkoutCreate.mockResolvedValue({ url: 'https://stripe.test/c/cs_abc' });
    const { createCheckoutSession } = await import('@/modules/billing/checkout');
    await createCheckoutSession({ accountId: 'acc_1', tier: 'pre_raise', period: 'annual' });
    const call = checkoutCreate.mock.calls[0][0];
    expect(call.line_items[0].price).toBe('price_pre_raise_a');
  });

  it('throws BILLING_PRICE_MISCONFIGURED when the price id is not in env', async () => {
    vi.resetModules();
    delete process.env.STRIPE_PRICE_ACTIVE_RAISE_MONTHLY;
    const { createCheckoutSession } = await import('@/modules/billing/checkout');
    await expect(
      createCheckoutSession({ accountId: 'acc_x', tier: 'active_raise', period: 'monthly' }),
    ).rejects.toMatchObject({ code: 'BILLING_PRICE_MISCONFIGURED' });
    // restore for subsequent suites
    process.env.STRIPE_PRICE_ACTIVE_RAISE_MONTHLY = 'price_active_raise_m';
  });
});
