/**
 * `tests/billing/tiers.test.ts` — TIERS shape + price-id reverse-lookup
 * (Plan 01-07).
 */
import { beforeAll, describe, expect, it } from 'vitest';

beforeAll(() => {
  process.env.STRIPE_PRICE_PRE_RAISE_MONTHLY = 'price_pre_raise_m';
  process.env.STRIPE_PRICE_PRE_RAISE_ANNUAL = 'price_pre_raise_a';
  process.env.STRIPE_PRICE_ACTIVE_RAISE_MONTHLY = 'price_active_raise_m';
  process.env.STRIPE_PRICE_ACTIVE_RAISE_ANNUAL = 'price_active_raise_a';
});

describe('TIERS data structure', () => {
  it('pre_raise is active with prices and Stripe price ids from env', async () => {
    const { TIERS } = await import('@/modules/billing/tiers');
    expect(TIERS.pre_raise.active).toBe(true);
    expect(TIERS.pre_raise.monthlyPriceUsd).toBe(49);
    expect(TIERS.pre_raise.annualPriceUsd).toBe(39);
    expect(TIERS.pre_raise.stripePriceIds.monthly).toBe('price_pre_raise_m');
    expect(TIERS.pre_raise.stripePriceIds.annual).toBe('price_pre_raise_a');
    expect(TIERS.pre_raise.features.length).toBeGreaterThan(0);
  });

  it('active_raise is active and featured pricing', async () => {
    const { TIERS } = await import('@/modules/billing/tiers');
    expect(TIERS.active_raise.active).toBe(true);
    expect(TIERS.active_raise.monthlyPriceUsd).toBe(199);
    expect(TIERS.active_raise.annualPriceUsd).toBe(159);
    expect(TIERS.active_raise.features).toContain('live_raise');
  });

  it('close_mode is inactive in Phase 1', async () => {
    const { TIERS } = await import('@/modules/billing/tiers');
    expect(TIERS.close_mode.active).toBe(false);
    expect(TIERS.close_mode.monthlyPriceUsd).toBe(399);
    expect(TIERS.close_mode.stripePriceIds.monthly).toBeNull();
  });

  it('alumni is inactive in Phase 1', async () => {
    const { TIERS } = await import('@/modules/billing/tiers');
    expect(TIERS.alumni.active).toBe(false);
    expect(TIERS.alumni.monthlyPriceUsd).toBe(19);
    expect(TIERS.alumni.stripePriceIds.monthly).toBeNull();
  });
});

describe('priceIdToTierAndPeriod', () => {
  it('round-trips pre_raise monthly + annual', async () => {
    const { priceIdToTierAndPeriod } = await import('@/modules/billing/tiers');
    expect(priceIdToTierAndPeriod('price_pre_raise_m')).toEqual({
      tier: 'pre_raise',
      period: 'monthly',
    });
    expect(priceIdToTierAndPeriod('price_pre_raise_a')).toEqual({
      tier: 'pre_raise',
      period: 'annual',
    });
  });

  it('round-trips active_raise monthly + annual', async () => {
    const { priceIdToTierAndPeriod } = await import('@/modules/billing/tiers');
    expect(priceIdToTierAndPeriod('price_active_raise_m')).toEqual({
      tier: 'active_raise',
      period: 'monthly',
    });
    expect(priceIdToTierAndPeriod('price_active_raise_a')).toEqual({
      tier: 'active_raise',
      period: 'annual',
    });
  });

  it('returns null for an unknown price id', async () => {
    const { priceIdToTierAndPeriod } = await import('@/modules/billing/tiers');
    expect(priceIdToTierAndPeriod('price_unknown')).toBeNull();
    expect(priceIdToTierAndPeriod(null)).toBeNull();
    expect(priceIdToTierAndPeriod(undefined)).toBeNull();
  });
});
