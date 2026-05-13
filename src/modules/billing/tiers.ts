/**
 * Tier definitions (FND-05, FND-06, D-09 pricing).
 *
 * Single source of truth for the four tiers + their Stripe price IDs + the
 * feature gates `entitlements()` consults. Pricing here MUST match
 * `src/components/marketing/pricing-cards.tsx`'s `PRICING_TIERS` (Plan 08) —
 * the two constants are kept in sync by Code Review (cross-reference comment
 * in both files).
 *
 * Phase 1: `pre_raise` and `active_raise` are `active:true`. `close_mode` and
 * `alumni` are `active:false` (Phase 11 activates them — flipping `active:true`
 * + filling in the price IDs is a data change, not a refactor).
 *
 * Note: this module deliberately does NOT import `stripe`. `entitlements.ts`
 * imports `TIERS` and must remain Stripe-free (`tests/billing/entitlements.
 * test.ts` enforces this structurally). The Stripe SDK only enters in
 * `checkout.ts` / `portal.ts` / `state.ts` / the webhook route.
 */
import { env } from '@/lib/env';

/** The four tier identifiers. Mirrors `tier_t` enum on `accounts.tier`. */
export type Tier = 'pre_raise' | 'active_raise' | 'close_mode' | 'alumni';

/** Stripe billing intervals — paired with a price ID per tier. */
export type Period = 'monthly' | 'annual';

/** Phase-1 feature gates. The set is intentionally small; later phases expand it. */
export type Feature =
  | 'business_memory'
  | 'pitch_lab'
  | 'investor_pipeline'
  | 'live_raise'
  | 'data_room'
  | 'raise_ops';

export interface TierDefinition {
  /** Human-readable name shown on the tier picker and the dashboard. */
  displayName: string;
  /** Monthly list price in USD (whole dollars). */
  monthlyPriceUsd: number;
  /** Annual list price in USD per month (whole dollars), null if no annual plan. */
  annualPriceUsd: number | null;
  /** Stripe price IDs read from env. Null when no annual plan or tier inactive. */
  stripePriceIds: { monthly: string | null; annual: string | null };
  /** Feature gates this tier unlocks (consumed by `entitlements()`). */
  features: Feature[];
  /** False ⇒ no purchase CTA / no entitlement (Phase 1 = Close Mode + Alumni). */
  active: boolean;
}

// Phase-1 feature gates are mostly the same for the two active tiers — the
// real per-tier differentiation lands in later phases as modules ship. Active
// Raise unlocks everything; Pre-Raise omits live_raise (call ingestion is the
// Active Raise differentiator per D-09).
const PRE_RAISE_FEATURES: Feature[] = [
  'business_memory',
  'pitch_lab',
  'investor_pipeline',
];
const ACTIVE_RAISE_FEATURES: Feature[] = [
  'business_memory',
  'pitch_lab',
  'investor_pipeline',
  'live_raise',
];
// Phase 11 fills these in when Close Mode + Alumni go live.
const CLOSE_MODE_FEATURES: Feature[] = [
  'business_memory',
  'pitch_lab',
  'investor_pipeline',
  'live_raise',
  'data_room',
  'raise_ops',
];
const ALUMNI_FEATURES: Feature[] = ['business_memory'];

export const TIERS: Record<Tier, TierDefinition> = {
  pre_raise: {
    displayName: 'Pre-Raise',
    monthlyPriceUsd: 49,
    annualPriceUsd: 39,
    stripePriceIds: {
      monthly: env.STRIPE_PRICE_PRE_RAISE_MONTHLY ?? null,
      annual: env.STRIPE_PRICE_PRE_RAISE_ANNUAL ?? null,
    },
    features: PRE_RAISE_FEATURES,
    active: true,
  },
  active_raise: {
    displayName: 'Active Raise',
    monthlyPriceUsd: 199,
    annualPriceUsd: 159,
    stripePriceIds: {
      monthly: env.STRIPE_PRICE_ACTIVE_RAISE_MONTHLY ?? null,
      annual: env.STRIPE_PRICE_ACTIVE_RAISE_ANNUAL ?? null,
    },
    features: ACTIVE_RAISE_FEATURES,
    active: true,
  },
  close_mode: {
    displayName: 'Close Mode',
    monthlyPriceUsd: 399,
    annualPriceUsd: null,
    stripePriceIds: { monthly: null, annual: null },
    features: CLOSE_MODE_FEATURES,
    active: false,
  },
  alumni: {
    displayName: 'Alumni',
    monthlyPriceUsd: 19,
    annualPriceUsd: null,
    stripePriceIds: { monthly: null, annual: null },
    features: ALUMNI_FEATURES,
    active: false,
  },
};

/** Tiers that can currently be purchased (the tier picker iterates this). */
export const ACTIVE_TIERS: Tier[] = (Object.keys(TIERS) as Tier[]).filter(
  (t) => TIERS[t].active,
);

/**
 * Reverse lookup: given a Stripe price ID (from a webhook event), return the
 * (tier, period) it corresponds to. Returns null if the id matches nothing
 * configured — the webhook treats that as a benign no-op (Stripe might emit
 * events for prices we don't model yet; reconcile-stripe will catch drift).
 */
export function priceIdToTierAndPeriod(
  priceId: string | null | undefined,
): { tier: Tier; period: Period } | null {
  if (!priceId) return null;
  for (const tier of Object.keys(TIERS) as Tier[]) {
    const def = TIERS[tier];
    if (def.stripePriceIds.monthly === priceId) return { tier, period: 'monthly' };
    if (def.stripePriceIds.annual === priceId) return { tier, period: 'annual' };
  }
  return null;
}
