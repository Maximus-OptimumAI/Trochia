/**
 * Unit tests for the post-login destination helper (AUTH-EMAIL-PASSWORD-01, FIX 2).
 *
 * `authDestination()` is the single source of truth the OAuth callback AND the
 * email/password sign-in action both route through. These pin the exact branch
 * table the callback used inline before the extraction:
 *   - DPA not accepted OR not active/trialing -> '/onboarding'
 *   - DPA accepted AND active/trialing         -> '/app'
 *
 * The helper is pure, so these call it directly with explicit account shapes.
 */
import { describe, expect, it } from 'vitest';

import { authDestination } from '@/lib/auth-destination';

describe('authDestination', () => {
  it('dpa null + sub none -> /onboarding (brand-new founder)', () => {
    expect(authDestination({ dpaAcceptedAt: null, subscriptionStatus: 'none' })).toBe('/onboarding');
  });

  it('dpa set + active -> /app (fully onboarded)', () => {
    expect(
      authDestination({ dpaAcceptedAt: new Date('2026-01-01T00:00:00Z'), subscriptionStatus: 'active' }),
    ).toBe('/app');
  });

  it('dpa set + sub none -> /onboarding (accepted DPA but no subscription yet)', () => {
    expect(
      authDestination({ dpaAcceptedAt: new Date('2026-01-01T00:00:00Z'), subscriptionStatus: 'none' }),
    ).toBe('/onboarding');
  });

  it('dpa set + trialing -> /app (trialing counts as active)', () => {
    expect(
      authDestination({ dpaAcceptedAt: '2026-01-01T00:00:00Z', subscriptionStatus: 'trialing' }),
    ).toBe('/app');
  });

  it('dpa null + active -> /onboarding (active sub but DPA not yet accepted)', () => {
    expect(authDestination({ dpaAcceptedAt: null, subscriptionStatus: 'active' })).toBe('/onboarding');
  });

  it('inactive statuses (past_due / canceled / incomplete) with DPA set -> /onboarding', () => {
    for (const status of ['past_due', 'canceled', 'incomplete']) {
      expect(
        authDestination({ dpaAcceptedAt: new Date('2026-01-01T00:00:00Z'), subscriptionStatus: status }),
      ).toBe('/onboarding');
    }
  });

  it('missing account (null / undefined) -> /onboarding (fail-safe)', () => {
    expect(authDestination(null)).toBe('/onboarding');
    expect(authDestination(undefined)).toBe('/onboarding');
  });
});
