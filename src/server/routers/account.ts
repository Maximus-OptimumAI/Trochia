/**
 * `accountRouter` — the tenant's own account. `account.me` proves the tenant context
 * end-to-end (session → tenant → region → RLS-enforcing client). No mutations yet —
 * onboarding (Plan 07/09) adds those.
 */
import { protectedProcedure, router } from '@/server/trpc';

export const accountRouter = router({
  /** The current tenant's account summary. Source: `ctx.account` (resolved in context). */
  me: protectedProcedure.query(({ ctx }) => ({
    id: ctx.account.id,
    name: ctx.account.name,
    region: ctx.account.region,
    tier: ctx.account.tier,
    subscriptionStatus: ctx.account.subscriptionStatus,
    currentPeriodEnd: ctx.account.currentPeriodEnd,
    dpaAcceptedAt: ctx.account.dpaAcceptedAt,
    dpaVersion: ctx.account.dpaVersion,
  })),

  /** Minimal identity echo — useful for a connectivity smoke check. */
  whoami: protectedProcedure.query(({ ctx }) => ({
    userId: ctx.session.user.id,
    email: ctx.session.user.email ?? null,
    tenantId: ctx.tenantId,
  })),
});
