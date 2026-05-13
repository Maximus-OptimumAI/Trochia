/**
 * `billingRouter` (Plan 01-07, FND-05).
 *
 * Procedures:
 *   - `tiers`               (publicProcedure) — returns the TIERS data for the
 *                              tier picker / pricing surfaces.
 *   - `createCheckout`      (protectedProcedure) — opens a Stripe Checkout session
 *                              and returns its url (client redirects).
 *   - `openPortal`          (protectedProcedure) — opens the Stripe Customer Portal.
 *   - `currentSubscription` (protectedProcedure) — the dashboard read for the
 *                              founder's tier + status.
 */
import { TRPCError } from '@trpc/server';
import { z } from 'zod';

import { TIERS, type Tier } from '@/modules/billing/tiers';
import { entitlements } from '@/modules/billing/entitlements';
import { createCheckoutSession } from '@/modules/billing/checkout';
import { createPortalSession } from '@/modules/billing/portal';
import { protectedProcedure, publicProcedure, router } from '@/server/trpc';

const tierEnum = z.enum(['pre_raise', 'active_raise']);
const periodEnum = z.enum(['monthly', 'annual']);

export const billingRouter = router({
  /** Public read of the tier data — consumed by the pricing surface + tier picker. */
  tiers: publicProcedure.query(() => {
    // Strip Stripe price ids from the public payload (they're not secret, but
    // there's no client-side reason to ship them — the server creates the
    // Checkout session from the typed enum).
    return (Object.keys(TIERS) as Tier[]).map((t) => ({
      id: t,
      displayName: TIERS[t].displayName,
      monthlyPriceUsd: TIERS[t].monthlyPriceUsd,
      annualPriceUsd: TIERS[t].annualPriceUsd,
      features: TIERS[t].features,
      active: TIERS[t].active,
    }));
  }),

  /** Open Checkout for the session's own account. */
  createCheckout: protectedProcedure
    .input(z.object({ tier: tierEnum, period: periodEnum }))
    .mutation(async ({ ctx, input }) => {
      const { url } = await createCheckoutSession({
        accountId: ctx.tenantId,
        tier: input.tier,
        period: input.period,
        customerEmail: ctx.session.user.email ?? undefined,
        customerId: ctx.account.stripeCustomerId ?? undefined,
      });
      return { url };
    }),

  /** Open the Customer Portal for the session's own account. */
  openPortal: protectedProcedure.mutation(async ({ ctx }) => {
    const customerId = ctx.account.stripeCustomerId;
    if (!customerId) {
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: 'No Stripe customer is linked to this account yet.',
      });
    }
    const { url } = await createPortalSession({ customerId });
    return { url };
  }),

  /** Current subscription summary for the dashboard + the billing screen. */
  currentSubscription: protectedProcedure.query(({ ctx }) => {
    const ent = entitlements({
      subscription_status: ctx.account.subscriptionStatus,
      tier: ctx.account.tier,
    });
    return {
      tier: ent.tier,
      status: ctx.account.subscriptionStatus,
      currentPeriodEnd: ctx.account.currentPeriodEnd,
      features: ent.features,
      active: ent.active,
    };
  }),
});
