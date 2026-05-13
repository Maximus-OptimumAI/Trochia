/**
 * Entitlements (FND-06, D-02b) — the single feature gate.
 *
 * `entitlements(account)` is a PURE function over the persisted
 * `accounts.subscription_status` + `accounts.tier` (mirrored from Stripe by the
 * webhook in this same plan). It NEVER calls Stripe inline — `tests/billing/
 * entitlements.test.ts` enforces that structurally.
 *
 * The tier→features map lives in `./tiers.ts` as data, so adding Close Mode /
 * Alumni at Phase 11 is a data change (flip `active:false → true`), not a
 * refactor. The `assertEntitled` middleware in `src/server/trpc.ts` consults
 * `entitlements()` (replacing Plan 03's pass-through stub).
 *
 * `isActiveOrTrialing(account)` is the matching boolean the `proxy.ts` gate
 * uses to keep an un-subscribed founder out of `/app`. `'trialing'` and
 * `'active'` pass; everything else (`'none'`, `'past_due'`, `'canceled'`,
 * `'incomplete'`) redirects to `/reactivate`.
 */
import { TIERS, type Tier } from '@/modules/billing/tiers';

/** Minimum subset of the `accounts` row entitlements + the gate read. */
export interface EntitlementsAccount {
  subscription_status: string | null;
  /** Optional: `isActiveOrTrialing` ignores this; only `entitlements()` needs it. */
  tier?: string | null;
}

export interface Entitlements {
  /** The persisted tier (typed) if the subscription is active/trialing, else `null`. */
  tier: Tier | null;
  /** The list of feature gates this tier unlocks. Empty when `!active`. */
  features: string[];
  /** True iff `subscription_status` is `'trialing'` or `'active'`. */
  active: boolean;
}

const ACTIVE_STATUSES = new Set(['trialing', 'active']);

/**
 * Compute the founder's entitlements from their persisted account row.
 *
 * Pure. Never calls Stripe. Never reads anything beyond the two columns.
 */
export function entitlements(account: EntitlementsAccount): Entitlements {
  if (!account.subscription_status || !ACTIVE_STATUSES.has(account.subscription_status)) {
    return { tier: null, features: [], active: false };
  }
  const t = account.tier as Tier | null;
  if (!t || !(t in TIERS)) {
    // Edge case: status says active/trialing but tier is missing or unknown.
    // Treat as inactive — `proxy.ts` will route them to `/reactivate`. The
    // reconcile cron should self-heal this on the next pass.
    return { tier: null, features: [], active: false };
  }
  return { tier: t, features: TIERS[t].features, active: true };
}

/**
 * The `proxy.ts` gate predicate: does this account have an active trial or
 * subscription? Used to decide whether to admit them to `(app)` routes (other
 * than `/onboarding/*` and `/styleguide`, which need only a session).
 */
export function isActiveOrTrialing(account: EntitlementsAccount | null | undefined): boolean {
  if (!account || !account.subscription_status) return false;
  return ACTIVE_STATUSES.has(account.subscription_status);
}
