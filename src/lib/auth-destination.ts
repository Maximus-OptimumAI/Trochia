/**
 * Post-login destination decision (AUTH-EMAIL-PASSWORD-01, FIX 2).
 *
 * The single source of truth for "after a successful login, where does the
 * founder land". Extracted verbatim from the decision that lived inline in
 * src/app/auth/callback/route.ts, so the OAuth callback and the email/password
 * sign-in action route IDENTICALLY:
 *
 *   - DPA not yet accepted OR no active/trialing subscription -> '/onboarding'
 *     (the /onboarding index resumes wherever the founder left off)
 *   - otherwise -> '/app'
 *
 * Pure and dependency-free, so it is unit-testable directly and safe to import
 * on client or server. It reads ONLY the two persisted account fields; it never
 * calls Stripe, never reads a cookie, and never sees user input.
 */

/** The subset of an `accounts` row this decision reads. */
export interface AuthDestinationAccount {
  dpaAcceptedAt: Date | string | null | undefined;
  subscriptionStatus: string | null | undefined;
}

export type AuthDestination = '/onboarding' | '/app';

/**
 * Compute the post-login destination. A missing account (no row yet) routes to
 * onboarding, the same as an un-accepted DPA or an inactive subscription. This
 * mirrors the auth callback's original inline logic exactly:
 * `!dpaAccepted || !active -> '/onboarding'; else '/app'`.
 */
export function authDestination(
  account: AuthDestinationAccount | null | undefined,
): AuthDestination {
  const dpaAccepted = !!account?.dpaAcceptedAt;
  const active =
    account?.subscriptionStatus === 'trialing' || account?.subscriptionStatus === 'active';
  if (!dpaAccepted || !active) return '/onboarding';
  return '/app';
}
