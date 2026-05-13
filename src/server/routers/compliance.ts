/**
 * `complianceRouter` — the clickwrap DPA + data-subject-rights tRPC surface (XC-01 / XC-04).
 *
 * Procedures:
 *   - `acceptDpa`              — record DPA acceptance for the caller's tenant (sign-up
 *                                clickwrap flow, Plan 07; re-acceptance prompts).
 *   - `dpaStatus`              — { accepted, version, currentVersion } for the caller's tenant.
 *
 * (The data-subject-rights procedures — `requestDataExport`, `requestAccountDeletion`,
 * `restoreAccount` — are added in Task 3.)
 *
 * All procedures are `protectedProcedure` — they act only on the session's own tenant.
 */
import { DPA_VERSION, recordDpaAcceptance } from '@/lib/compliance/dpa';
import { protectedProcedure, router } from '@/server/trpc';

export const complianceRouter = router({
  /** Record DPA acceptance at the current {@link DPA_VERSION} for the caller's tenant. */
  acceptDpa: protectedProcedure.mutation(async ({ ctx }) => {
    await recordDpaAcceptance(ctx.tenantId, ctx.db, ctx.session.user.id);
    return { accepted: true, version: DPA_VERSION };
  }),

  /** Whether the caller's tenant has accepted the current DPA. */
  dpaStatus: protectedProcedure.query(({ ctx }) => {
    const version = ctx.account.dpaVersion ?? null;
    return {
      accepted: version === DPA_VERSION,
      version,
      currentVersion: DPA_VERSION,
      acceptedAt: ctx.account.dpaAcceptedAt ?? null,
    };
  }),
});
