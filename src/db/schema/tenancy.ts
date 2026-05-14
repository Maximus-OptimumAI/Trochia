/**
 * Tenancy spine: `users`, `accounts` (= the tenant), `sessions`.
 *
 * Phase-1 narrowing (D-03): this models ONLY identity + tenant + billing-state +
 * region + legal-acceptance bookkeeping. It deliberately does NOT pre-model
 * `decks`, `investors`, `pipeline_entries`, `businesses` — those are later phases.
 *
 * `auth.users` (Supabase Auth) is the identity source of truth. `public.users` is a
 * thin mirror row that app tables can FK against and that carries Trochia-specific
 * bookkeeping. One business per account in Phase 1, so `accounts.owner_user_id` is
 * the 1:1 link the auth hook uses to resolve `tenant_id`.
 */
import { sql } from 'drizzle-orm';
import { authUsers } from 'drizzle-orm/supabase';
import { pgEnum, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';

import { ownUserRowPolicy, tenantIsolationPolicy } from '@/db/rls';

/**
 * The data-residency region the tenant's data lives in (FND-10 / D-05).
 * `us` and `in` only — `eu` is reserved (added in Phase 8 with EU residency). All
 * `getDbForRegion` branches resolve to the US Supabase project today; the enum and
 * the column exist now so the seam is real.
 */
export const regionEnum = pgEnum('region_t', ['us', 'in']);

/**
 * Subscription lifecycle state mirrored from Stripe onto the account (Plan 07 wires
 * the webhook that writes it). `none` until a checkout completes.
 */
export const subscriptionStatusEnum = pgEnum('subscription_status_t', [
  'none',
  'trialing',
  'active',
  'past_due',
  'canceled',
  'incomplete',
]);

/** Pricing tier — maps to the four Stripe price IDs (Pre-Raise / Active Raise × monthly/annual). */
export const tierEnum = pgEnum('tier_t', ['pre_raise', 'active_raise', 'close_mode', 'alumni']);

/**
 * `public.users` — a mirror of `auth.users`. RLS: a user sees/updates only their own row.
 */
export const users = pgTable(
  'users',
  {
    id: uuid('id')
      .primaryKey()
      .references(() => authUsers.id, { onDelete: 'cascade' }),
    email: text('email').notNull(),
    fullName: text('full_name'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [ownUserRowPolicy(t.id)],
);

/**
 * `accounts` — THE TENANT. Every tenant-scoped row hangs off `accounts.id`.
 * RLS: `id = (auth.jwt() ->> 'tenant_id')::uuid` — the claim the auth hook injects.
 */
export const accounts = pgTable(
  'accounts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    ownerUserId: uuid('owner_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    name: text('name'),
    region: regionEnum('region').notNull().default('us'),
    // ── Billing state (mirrored from Stripe by Plan 07's webhook) ──
    stripeCustomerId: text('stripe_customer_id'),
    subscriptionStatus: subscriptionStatusEnum('subscription_status').notNull().default('none'),
    tier: tierEnum('tier'),
    currentPeriodEnd: timestamp('current_period_end', { withTimezone: true }),
    // ── Legal / DPA bookkeeping ──
    dpaAcceptedAt: timestamp('dpa_accepted_at', { withTimezone: true }),
    dpaVersion: text('dpa_version'),
    // ── Onboarding progress (Plan 09 — FND-12) ──
    // `onboarding_step` tracks the founder's position in the 5-step onboarding
    // funnel ('welcome' | 'tier' | 'import' | 'deck' | 'review') or `null` when
    // onboarding is done. `onboarding_completed_at` is set when the founder
    // finishes (or skips through) the review step → dashboard.
    onboardingStep: text('onboarding_step'),
    onboardingCompletedAt: timestamp('onboarding_completed_at', { withTimezone: true }),
    // ── Soft delete (account deletion is a service-role op; see db/client.ts) ──
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    tenantIsolationPolicy(t.id),
    // Phase-1 D-03 enforces 1:1 auth.users.id → accounts.id while the account
    // is LIVE (deleted_at IS NULL). Without this constraint, concurrent
    // first-login callbacks (src/app/auth/callback/route.ts) can race and
    // create two live accounts for one user; the Custom Access Token Auth Hook's
    // `LIMIT 1` (src/db/migrations/0000_*.sql) and src/server/context.ts's
    // `findFirst` would then pick different tenants nondeterministically. The
    // partial predicate keeps the constraint compatible with soft-delete +
    // re-onboard (the deleted row's owner_user_id is free for re-use).
    // Surfaced by /codex 01-07 review (P1) — fix in PR-1.
    uniqueIndex('accounts_owner_user_id_uniq')
      .on(t.ownerUserId)
      .where(sql`deleted_at IS NULL`),
  ],
);

/**
 * `sessions` — app-level session metadata (last-seen device/IP, etc.). Supabase Auth
 * owns the real session/refresh-token machinery in `auth.sessions`; this table is a
 * thin tenant-scoped record the app can attach data to. Kept minimal on purpose.
 */
export const sessions = pgTable(
  'sessions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    accountId: uuid('account_id')
      .notNull()
      .references(() => accounts.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    userAgent: text('user_agent'),
    ipHash: text('ip_hash'),
    lastSeenAt: timestamp('last_seen_at', { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [tenantIsolationPolicy(t.accountId)],
);
