/**
 * `complianceRouter` — the clickwrap DPA + data-subject-rights tRPC surface (XC-01 / XC-04).
 *
 * Procedures:
 *   - `acceptDpa`              — record DPA acceptance for the caller's tenant (sign-up
 *                                clickwrap flow, Plan 07; re-acceptance prompts).
 *   - `dpaStatus`              — { accepted, version, currentVersion } for the caller's tenant.
 *   - `requestDataExport`      — run an on-demand full data export; returns the signed
 *                                download URL + expiry (Plan 09's Settings screen).
 *   - `requestAccountDeletion` — soft-delete the caller's account (30-day window, then
 *                                the purge cron). The typed-`DELETE`-confirm gate lives
 *                                in the UI (Plan 02 Dialog + Plan 09 screen); this just
 *                                executes.
 *   - `restoreAccount`         — clear `deleted_at` if still inside the 30-day window.
 *
 * All five are `protectedProcedure` mutations/queries — they act only on the session's
 * own tenant (`ctx.tenantId`).
 */
import { DPA_VERSION, recordDpaAcceptance } from '@/lib/compliance/dpa';
import { exportAccountData } from '@/modules/data-rights/export';
import { restoreAccount, softDeleteAccount } from '@/modules/data-rights/delete-account';
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

  /** Run an on-demand full data export for the caller's tenant. Returns the signed URL + expiry. */
  requestDataExport: protectedProcedure.mutation(async ({ ctx }) => {
    return exportAccountData(ctx.tenantId);
  }),

  /** Soft-delete the caller's account (starts the 30-day purge window). */
  requestAccountDeletion: protectedProcedure.mutation(async ({ ctx }) => {
    await softDeleteAccount(ctx.tenantId);
    return { deleted: true };
  }),

  /** Restore the caller's account if still inside the 30-day window. */
  restoreAccount: protectedProcedure.mutation(async ({ ctx }) => {
    await restoreAccount(ctx.tenantId);
    return { restored: true };
  }),
});
