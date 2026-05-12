/**
 * `legal_acceptances` — an append-only ledger of which legal document version each
 * account accepted and when (DPA / Terms / Privacy). The "latest DPA" denormalised
 * fields also live on `accounts` (`dpa_accepted_at` / `dpa_version`); this table is
 * the full history. RLS: tenant-isolated on `account_id`.
 */
import { pgEnum, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

import { tenantIsolationPolicy } from '@/db/rls';
import { accounts } from '@/db/schema/tenancy';
import { users } from '@/db/schema/tenancy';

export const legalDocumentEnum = pgEnum('legal_document_t', ['dpa', 'tos', 'privacy']);

export const legalAcceptances = pgTable(
  'legal_acceptances',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    accountId: uuid('account_id')
      .notNull()
      .references(() => accounts.id, { onDelete: 'cascade' }),
    acceptedByUserId: uuid('accepted_by_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    document: legalDocumentEnum('document').notNull(),
    version: text('version').notNull(),
    acceptedAt: timestamp('accepted_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [tenantIsolationPolicy(t.accountId)],
);
