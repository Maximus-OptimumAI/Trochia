/**
 * The clickwrap-acceptance plumbing for the DPA / Terms / Privacy documents.
 *
 * `DPA_VERSION` is the single version string for the current DPA text (the text
 * itself lives in `dpa-content.tsx`). Bump it on any material revision — that makes
 * `dpaStatus` report a stale acceptance, which the UI uses to re-prompt.
 *
 * `recordDpaAcceptance` / `recordTosAcceptance` / `recordPrivacyAcceptance` write an
 * append-only `legal_acceptances` row (the full history) and — for the DPA — also set
 * the denormalised `accounts.dpa_accepted_at` / `accounts.dpa_version` (the "latest"
 * snapshot). Idempotent at the current version: re-calling is a no-op.
 *
 * These run inside an authenticated tRPC mutation (Plan 07's sign-up clickwrap flow
 * and re-acceptance prompts), so the caller passes the request-scoped `db` (RLS
 * applies) — there is no service-client write here.
 */
import { and, eq } from 'drizzle-orm';

import type { RequestDb } from '@/db/client';
import { accounts } from '@/db/schema/tenancy';
import { legalAcceptances } from '@/db/schema/legal';
import { DPA_VERSION } from '@/lib/compliance/dpa-sections';

/** The current DPA text version. Bump on a material revision (triggers re-acceptance). */
export { DPA_VERSION };

/** The current Terms of Service version. */
export const TOS_VERSION = '2026-05';

/** The current Privacy Policy version. */
export const PRIVACY_VERSION = '2026-05';

type LegalDocument = 'dpa' | 'tos' | 'privacy';

/**
 * Record acceptance of `document` at `version` for `accountId`. Inserts a
 * `legal_acceptances` row unless one already exists at that exact version (idempotent).
 * Returns `true` if a new row was written, `false` if it was already on record.
 */
async function recordAcceptance(
  accountId: string,
  db: RequestDb,
  document: LegalDocument,
  version: string,
  acceptedByUserId?: string,
): Promise<boolean> {
  return db.rls(async (tx) => {
    const existing = await tx
      .select({ id: legalAcceptances.id })
      .from(legalAcceptances)
      .where(
        and(
          eq(legalAcceptances.accountId, accountId),
          eq(legalAcceptances.document, document),
          eq(legalAcceptances.version, version),
        ),
      )
      .limit(1);
    if (existing.length > 0) return false;

    await tx.insert(legalAcceptances).values({
      accountId,
      document,
      version,
      ...(acceptedByUserId ? { acceptedByUserId } : {}),
    });
    return true;
  });
}

/**
 * Record DPA acceptance: writes the `legal_acceptances` history row AND updates
 * `accounts.dpa_accepted_at` / `accounts.dpa_version`. Idempotent at {@link DPA_VERSION}.
 */
export async function recordDpaAcceptance(
  accountId: string,
  db: RequestDb,
  acceptedByUserId?: string,
): Promise<void> {
  const wrote = await recordAcceptance(accountId, db, 'dpa', DPA_VERSION, acceptedByUserId);
  if (!wrote) return;
  await db.rls((tx) =>
    tx
      .update(accounts)
      .set({ dpaAcceptedAt: new Date(), dpaVersion: DPA_VERSION })
      .where(eq(accounts.id, accountId)),
  );
}

/** Record Terms-of-Service acceptance (history row only). Idempotent at {@link TOS_VERSION}. */
export async function recordTosAcceptance(
  accountId: string,
  db: RequestDb,
  acceptedByUserId?: string,
): Promise<void> {
  await recordAcceptance(accountId, db, 'tos', TOS_VERSION, acceptedByUserId);
}

/** Record Privacy-Policy acceptance (history row only). Idempotent at {@link PRIVACY_VERSION}. */
export async function recordPrivacyAcceptance(
  accountId: string,
  db: RequestDb,
  acceptedByUserId?: string,
): Promise<void> {
  await recordAcceptance(accountId, db, 'privacy', PRIVACY_VERSION, acceptedByUserId);
}
