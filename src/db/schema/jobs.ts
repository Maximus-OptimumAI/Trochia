/**
 * `jobs` — the durable record behind background work (Inngest functions land in Plan
 * 04; this plan creates the table only).
 *
 * `account_id` is NULLABLE: system jobs (e.g. the deploy-time AI health-check ping)
 * have no tenant. Those `account_id IS NULL` rows match NO `authenticated`-role policy
 * → they are reachable only via `getServiceClient()` (RLS-bypassing). That is the
 * default-deny posture covering system rows. Tenant-owned rows are isolated on
 * `account_id` like every other tenant table.
 *
 * Supabase Realtime is enabled on this table (in the migration) so the app can
 * subscribe to job-status changes.
 */
import { jsonb, pgEnum, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

import { tenantIsolationPolicy } from '@/db/rls';
import { accounts } from '@/db/schema/tenancy';

export const jobStatusEnum = pgEnum('job_status_t', ['queued', 'running', 'done', 'failed']);

export const jobs = pgTable(
  'jobs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    // Nullable on purpose — system jobs (AI health-check, etc.) have no tenant.
    accountId: uuid('account_id').references(() => accounts.id, { onDelete: 'cascade' }),
    type: text('type').notNull(),
    status: jobStatusEnum('status').notNull().default('queued'),
    payload: jsonb('payload'),
    result: jsonb('result'),
    error: text('error'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [tenantIsolationPolicy(t.accountId)],
);
