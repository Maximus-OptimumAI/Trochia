/**
 * tRPC init + the procedure tiers (FND-03).
 *
 * - `publicProcedure`    — no auth.
 * - `protectedProcedure` — requires a session AND a resolved tenant; injects the
 *                          non-null `session` / `tenantId` / `region` / `db` /
 *                          `account` into `ctx`. This is the ergonomic layer on top
 *                          of Postgres RLS (the physical backstop).
 * - `assertEntitled(feature)` — a `protectedProcedure` that will gate on the tenant's
 *                          plan entitlements. Phase-1 STUB: it always passes.
 *                          TODO(Plan 07): replace the body with the real
 *                          `entitlements(ctx.account)` check (D-02b — entitlements is
 *                          the single gate). The signature is final so call sites
 *                          written now don't change.
 */
import 'server-only';

import { initTRPC, TRPCError } from '@trpc/server';
import superjson from 'superjson';

import type { TRPCContext } from '@/server/context';
import { entitlements } from '@/modules/billing/entitlements';

const t = initTRPC.context<TRPCContext>().create({
  transformer: superjson,
});

export const router = t.router;
export const createCallerFactory = t.createCallerFactory;
export const middleware = t.middleware;

/** A procedure with no auth requirement. */
export const publicProcedure = t.procedure;

/**
 * A procedure that requires a valid session and a resolved tenant. Narrows the
 * nullable context members so handlers get non-null `db` / `tenantId` / `account`.
 */
export const protectedProcedure = t.procedure.use(({ ctx, next }) => {
  if (!ctx.session || !ctx.tenantId || !ctx.region || !ctx.db || !ctx.account) {
    throw new TRPCError({ code: 'UNAUTHORIZED' });
  }
  return next({
    ctx: {
      ...ctx,
      session: ctx.session,
      tenantId: ctx.tenantId,
      region: ctx.region,
      db: ctx.db,
      account: ctx.account,
    },
  });
});

/**
 * Gate a procedure on the tenant having `feature` in its plan (FND-06, D-02b).
 *
 * `entitlements(ctx.account)` is a pure read over the persisted
 * `accounts.subscription_status` + `accounts.tier`; the Stripe webhook keeps
 * those columns fresh. This middleware throws `FORBIDDEN` when the feature
 * isn't in the active tier's allowlist — the tRPC-layer backstop to the
 * `proxy.ts` route gate (T-1-39).
 *
 * Plan 07 replaces Plan 03's pass-through stub with this real implementation.
 */
export function assertEntitled(feature: string) {
  return protectedProcedure.use(({ ctx, next }) => {
    const ent = entitlements({
      subscription_status: ctx.account.subscriptionStatus,
      tier: ctx.account.tier,
    });
    if (!ent.active || !ent.features.includes(feature)) {
      throw new TRPCError({
        code: 'FORBIDDEN',
        message: `Feature "${feature}" is not available on your current plan.`,
      });
    }
    return next();
  });
}
