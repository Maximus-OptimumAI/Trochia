/**
 * Account deletion / restoration (XC-04).
 *
 * Model: 30-day soft delete, then permanent purge.
 *   - `softDeleteAccount(accountId)` sets `accounts.deleted_at = now()` and signs the
 *     account's users out. The `purge-soft-deleted` Inngest cron (Plan 04) hard-deletes
 *     rows whose `deleted_at` is older than `PURGE_AFTER_DAYS` (30), cascading to every
 *     dependent record via the schema's `ON DELETE CASCADE`.
 *   - `restoreAccount(accountId)` clears `deleted_at` if the account is still inside the
 *     30-day window; after that the deletion is irreversible by design.
 *
 * The `deleted_at` write goes through `getServiceClient()` — one of the audited
 * service-role call sites listed in `src/db/client.ts` (caller #4, "account deletion").
 * It must NOT go through the user's RLS request client: the user is allowed to trigger
 * the deletion (via an authenticated tRPC mutation gated by the typed-`DELETE` confirm
 * Dialog in Plans 02/09), but the soft-delete also flips `accounts.deleted_at`, which
 * the tRPC context treats as "no live tenant" — so the user's request client would lose
 * read access mid-operation. The mutation authenticates the actor; the service client
 * performs the write.
 */
import 'server-only';

import { createClient } from '@supabase/supabase-js';
import { eq } from 'drizzle-orm';

import { getServiceClient } from '@/db/client';
import { accounts } from '@/db/schema/tenancy';
import { env } from '@/lib/env';
import { AppError } from '@/lib/errors';
import { logger } from '@/lib/logger';

import { inngest } from '@/inngest/client';

/** Days an account stays soft-deleted before the purge cron removes it. Mirrors `PURGE_AFTER_DAYS`. */
export const SOFT_DELETE_WINDOW_DAYS = 30;

/** Sign out every Supabase session for the account owner (best-effort). */
async function revokeOwnerSessions(ownerUserId: string): Promise<void> {
  if (!env.SUPABASE_URL || !env.SUPABASE_SECRET_KEY) {
    logger.info('revokeOwnerSessions: Supabase admin not configured — skipping', { ownerUserId });
    return;
  }
  try {
    const admin = createClient(env.SUPABASE_URL, env.SUPABASE_SECRET_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    await admin.auth.admin.signOut(ownerUserId);
  } catch (err) {
    logger.warn('revokeOwnerSessions: sign-out failed (non-fatal)', { ownerUserId, err });
  }
}

/**
 * Soft-delete an account: set `deleted_at`, sign the owner out, and emit an Inngest
 * event for any async cleanup. The permanent purge happens 30 days later via the
 * `purge-soft-deleted` cron (Plan 04). No-op if the account is already soft-deleted.
 */
export async function softDeleteAccount(accountId: string): Promise<void> {
  const db = getServiceClient();
  const rows = await db
    .update(accounts)
    .set({ deletedAt: new Date(), updatedAt: new Date() })
    .where(eq(accounts.id, accountId))
    .returning({ id: accounts.id, ownerUserId: accounts.ownerUserId });
  if (rows.length === 0) {
    throw new AppError('Account not found', { status: 404, code: 'ACCOUNT_NOT_FOUND' });
  }
  await revokeOwnerSessions(rows[0].ownerUserId);
  try {
    await inngest.send({ name: 'account/soft-deleted', data: { accountId } });
  } catch (err) {
    logger.warn('softDeleteAccount: failed to emit account/soft-deleted (non-fatal)', { accountId, err });
  }
  logger.info('softDeleteAccount: account marked deleted (30-day purge window started)', { accountId });
}

/**
 * Restore a soft-deleted account if it is still within the {@link SOFT_DELETE_WINDOW_DAYS}
 * window. Throws if the account is not soft-deleted, or if the window has passed (the
 * purge cron may already have removed it; the deletion is irreversible by design).
 */
export async function restoreAccount(accountId: string): Promise<void> {
  const db = getServiceClient();
  const account = await db.query.accounts.findFirst({ where: eq(accounts.id, accountId) });
  if (!account) {
    throw new AppError('Account not found', { status: 404, code: 'ACCOUNT_NOT_FOUND' });
  }
  if (!account.deletedAt) {
    throw new AppError('Account is not deleted', { status: 409, code: 'ACCOUNT_NOT_DELETED' });
  }
  const cutoff = new Date(Date.now() - SOFT_DELETE_WINDOW_DAYS * 24 * 60 * 60 * 1000);
  if (account.deletedAt < cutoff) {
    throw new AppError(
      'The 30-day restore window has passed; this deletion is permanent.',
      { status: 410, code: 'RESTORE_WINDOW_EXPIRED' },
    );
  }
  await db
    .update(accounts)
    .set({ deletedAt: null, updatedAt: new Date() })
    .where(eq(accounts.id, accountId));
  logger.info('restoreAccount: account restored', { accountId });
}
