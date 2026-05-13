/**
 * `purge-soft-deleted` — daily cron that permanently deletes accounts soft-deleted
 * more than 30 days ago (XC-04: account deletion → 30-day soft delete → permanent purge).
 *
 * `accounts.deleted_at` is set when a founder deletes their account (a service-role
 * op — see db/client.ts). This cron finds rows where `deleted_at < now() - 30 days`
 * and hard-deletes them via `getServiceClient()`. The schema's `ON DELETE CASCADE`
 * fans the delete out to `sessions`, `subscriptions`, `jobs`, `legal_acceptances`
 * (and `users` if the owner row cascades) — no manual child cleanup needed.
 *
 * Implemented FULLY here (the schema exists from Plan 03 — that's why this plan
 * `depends_on: [1, 3]`). The DB work lives in `purgeSoftDeletedAccounts(db)` so it
 * is unit-testable with a fake client.
 */
import { and, isNotNull, lt } from 'drizzle-orm';

import { getServiceClient, type DrizzleDb } from '@/db/client';
import { accounts } from '@/db/schema/tenancy';
import { logger } from '@/lib/logger';

import { inngest } from '../client';

/** Soft-delete retention window before permanent purge. */
export const PURGE_AFTER_DAYS = 30;

/**
 * Permanently delete every account whose `deleted_at` is older than
 * {@link PURGE_AFTER_DAYS}. Returns the number of accounts purged. Cascades to all
 * tenant-owned child rows via the schema's `ON DELETE CASCADE`.
 */
export async function purgeSoftDeletedAccounts(db: DrizzleDb): Promise<number> {
  const cutoff = new Date(Date.now() - PURGE_AFTER_DAYS * 24 * 60 * 60 * 1000);
  const deleted = await db
    .delete(accounts)
    .where(and(isNotNull(accounts.deletedAt), lt(accounts.deletedAt, cutoff)))
    .returning({ id: accounts.id });
  return deleted.length;
}

export const purgeSoftDeletedFn = inngest.createFunction(
  { id: 'purge-soft-deleted', retries: 4, concurrency: { limit: 1 }, triggers: [{ cron: '0 3 * * *' }] },
  async ({ step }) => {
    const purged = await step.run('purge', () => purgeSoftDeletedAccounts(getServiceClient()));
    logger.info('purge-soft-deleted: permanently purged soft-deleted accounts', { count: purged });
    return { purged };
  },
);
