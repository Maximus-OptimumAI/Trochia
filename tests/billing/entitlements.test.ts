/**
 * `tests/billing/entitlements.test.ts` — entitlements() purity + status table
 * + the structural Stripe-free check (FND-06).
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import { entitlements, isActiveOrTrialing } from '@/modules/billing/entitlements';
import { TIERS, type Tier } from '@/modules/billing/tiers';

type Status =
  | 'none'
  | 'trialing'
  | 'active'
  | 'past_due'
  | 'canceled'
  | 'incomplete';

describe('entitlements(account)', () => {
  const ACTIVE: Status[] = ['trialing', 'active'];
  const INACTIVE: Status[] = ['none', 'past_due', 'canceled', 'incomplete'];

  for (const tier of ['pre_raise', 'active_raise'] as Tier[]) {
    for (const status of ACTIVE) {
      it(`status=${status} tier=${tier} → active with the tier features`, () => {
        const e = entitlements({ subscription_status: status, tier });
        expect(e.active).toBe(true);
        expect(e.tier).toBe(tier);
        expect(e.features).toEqual(TIERS[tier].features);
      });
    }
    for (const status of INACTIVE) {
      it(`status=${status} tier=${tier} → inactive with no features`, () => {
        const e = entitlements({ subscription_status: status, tier });
        expect(e.active).toBe(false);
        expect(e.tier).toBeNull();
        expect(e.features).toEqual([]);
      });
    }
  }

  it('null status → inactive', () => {
    const e = entitlements({ subscription_status: null, tier: null });
    expect(e.active).toBe(false);
    expect(e.features).toEqual([]);
  });

  it('extensibility: a hypothetical close_mode → active is a data change, not a code change', () => {
    // The features map lives in tiers.ts as data. We can pretend close_mode is
    // active for this check by reading the features directly and asserting
    // `entitlements()` would surface them.
    const e = entitlements({ subscription_status: 'active', tier: 'close_mode' });
    // close_mode is `active:false` in Phase 1, but entitlements() doesn't gate
    // on `TIERS[tier].active` — it gates on the SUBSCRIPTION STATUS. Once the
    // founder is on close_mode in Stripe (Phase 11), they get its features.
    expect(e.active).toBe(true);
    expect(e.tier).toBe('close_mode');
    expect(e.features).toEqual(TIERS.close_mode.features);
  });
});

describe('isActiveOrTrialing(account)', () => {
  it('trialing → true', () => {
    expect(isActiveOrTrialing({ subscription_status: 'trialing', tier: 'pre_raise' })).toBe(true);
  });
  it('active → true', () => {
    expect(isActiveOrTrialing({ subscription_status: 'active', tier: 'active_raise' })).toBe(true);
  });
  it.each([
    ['none'],
    ['past_due'],
    ['canceled'],
    ['incomplete'],
  ])('%s → false', (status) => {
    expect(isActiveOrTrialing({ subscription_status: status, tier: null })).toBe(false);
  });
  it('null account → false', () => {
    expect(isActiveOrTrialing(null)).toBe(false);
  });
});

describe('structural: entitlements module is Stripe-free (FND-06)', () => {
  it('src/modules/billing/entitlements.ts does not import stripe', () => {
    const source = readFileSync(
      resolve(__dirname, '../../src/modules/billing/entitlements.ts'),
      'utf8',
    );
    expect(source).not.toMatch(/from\s+['"]stripe['"]/);
    expect(source).not.toMatch(/require\(\s*['"]stripe['"]/);
  });

  it('src/modules/billing/tiers.ts does not import stripe (only env + types)', () => {
    const source = readFileSync(
      resolve(__dirname, '../../src/modules/billing/tiers.ts'),
      'utf8',
    );
    expect(source).not.toMatch(/from\s+['"]stripe['"]/);
  });
});
