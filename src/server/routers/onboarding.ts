/**
 * `onboardingRouter` (Plan 01-09, FND-12) — the onboarding-progress tRPC surface.
 *
 * Procedures:
 *   - `getProgress`       (protectedProcedure) — { step, completedAt } for the caller's tenant.
 *   - `markStepComplete`  (protectedProcedure) — advance the founder's `onboarding_step` to the next
 *                            step. When `step === 'review'` is marked complete, sets
 *                            `onboarding_completed_at = now()` and clears `onboarding_step`.
 *   - `skipStep`          (protectedProcedure) — advance without doing the step's work
 *                            (the import + deck steps are skippable in Phase 1 since
 *                            the feature logic ships in later phases).
 *
 * The onboarding steps are UI shells with no security significance — the access gate
 * is the subscription status (proxy.ts, Plan 07), NOT the onboarding step. The worst a
 * forged `markStepComplete`/`skipStep` call does is mark the founder's own onboarding
 * "done" (T-1-55 in the plan's threat model).
 */
import { eq } from 'drizzle-orm';
import { z } from 'zod';

import { getServiceClient } from '@/db/client';
import { accounts } from '@/db/schema';
import { protectedProcedure, router } from '@/server/trpc';

const STEPS = ['welcome', 'tier', 'import', 'deck', 'review'] as const;
const stepEnum = z.enum(STEPS);

/** Next step in the linear funnel. `review` → null (done). */
const NEXT_STEP: Record<(typeof STEPS)[number], (typeof STEPS)[number] | null> = {
  welcome: 'tier',
  tier: 'import',
  import: 'deck',
  deck: 'review',
  review: null,
};

export const onboardingRouter = router({
  /** Read the caller's onboarding progress. */
  getProgress: protectedProcedure.query(({ ctx }) => ({
    step: ctx.account.onboardingStep ?? null,
    completedAt: ctx.account.onboardingCompletedAt ?? null,
  })),

  /**
   * Mark the named step complete for the caller's tenant.
   * - `step === 'review'` → set `onboarding_completed_at = now()` and clear `onboarding_step`.
   * - else → advance `onboarding_step` to the next step in the funnel.
   *
   * Uses the service client to write the columns; the row already belongs to
   * `ctx.tenantId` (resolved by the tRPC context).
   */
  markStepComplete: protectedProcedure
    .input(z.object({ step: stepEnum }))
    .mutation(async ({ ctx, input }) => {
      const service = getServiceClient();
      if (input.step === 'review') {
        await service
          .update(accounts)
          .set({ onboardingStep: null, onboardingCompletedAt: new Date() })
          .where(eq(accounts.id, ctx.tenantId));
        return { step: null, completedAt: new Date() };
      }
      const next = NEXT_STEP[input.step];
      await service
        .update(accounts)
        .set({ onboardingStep: next })
        .where(eq(accounts.id, ctx.tenantId));
      return { step: next, completedAt: null };
    }),

  /**
   * Skip the named step (advance without doing the step's work). In Phase 1 the
   * import + deck steps are skippable since their feature logic ships in later
   * phases. Behavior is identical to `markStepComplete` — the distinction is
   * for instrumentation: callers fire a different analytics event on skip vs.
   * complete (Plan 09's step screens).
   */
  skipStep: protectedProcedure
    .input(z.object({ step: stepEnum }))
    .mutation(async ({ ctx, input }) => {
      const service = getServiceClient();
      if (input.step === 'review') {
        await service
          .update(accounts)
          .set({ onboardingStep: null, onboardingCompletedAt: new Date() })
          .where(eq(accounts.id, ctx.tenantId));
        return { step: null, completedAt: new Date() };
      }
      const next = NEXT_STEP[input.step];
      await service
        .update(accounts)
        .set({ onboardingStep: next })
        .where(eq(accounts.id, ctx.tenantId));
      return { step: next, completedAt: null };
    }),
});
