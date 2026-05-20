/**
 * Unified raise timeline (Phase 2 — XC-08).
 *
 * `timeline_event` is the chronological cross-module event log that anchors the
 * "one operator" feel from day one. Every Phase 2+ module writes an append-only
 * event row whenever something founder-visible happens:
 *
 *   - Phase 2 (memory): `memory_confirmed`, `memory_field_updated`,
 *                       `memory_staleness_dismissed`
 *   - Phase 3 (deck):   `deck_uploaded`, `deck_reviewed`, `deck_shared`
 *   - Phase 4 (pipeline): `investor_added`, `application_submitted`,
 *                         `outreach_drafted`, `intro_requested`
 *   - Phase 5 (brief):  `call_logged`, `transcript_ingested`, `follow_up_drafted`
 *   - Phase 8/9 (safe + cap_table): `safe_generated`, `safe_signed`,
 *                                   `cap_table_updated`
 *   - Phase 8 (legal):  `legal_doc_recommended`
 *
 * The 7-value `source_module` enum is pre-seeded here in Phase 2 so downstream
 * phases write their events WITHOUT an ALTER TYPE migration in every phase.
 * Pitfall 11 mitigation (per docs/Trochia_AI_Phase_2_PLAN_v1.md §6 — "lock the
 * schema in Week 1; provenance + payload jsonb for flex fields, not new columns
 * or enum values mid-phase").
 *
 * `event_type` is intentionally `text`, NOT an enum — module-internal vocabulary
 * grows fastest and is the most appropriate place to absorb that churn.
 *
 * `source_id` is a uuid FK by convention only — there is no SQL FK because the
 * source rows live in different tables across modules. Application code is
 * responsible for nulling the timeline event before a source row is hard-deleted
 * (in practice we soft-delete almost everywhere).
 */
import { boolean, index, jsonb, pgEnum, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

import { tenantIsolationPolicy } from '@/db/rls';
import { accounts } from '@/db/schema/tenancy';

// ────────────────────────────────────────────────────────────────────────────
// Enums
// ────────────────────────────────────────────────────────────────────────────

/**
 * Which module produced the event. Pre-seeded with all downstream phase modules
 * so Phase 3 / 4 / 5 / 8 / 9 do NOT need ALTER TYPE migrations to write events.
 *
 * Phase 2 only writes `'memory'` values; the other 6 are reserved.
 */
export const timelineSourceModuleEnum = pgEnum('timeline_source_module_t', [
  'memory',
  'pipeline',
  'deck',
  'brief',
  'safe',
  'cap_table',
  'legal',
]);

// ────────────────────────────────────────────────────────────────────────────
// timeline_event — append-only chronological cross-module event log
// ────────────────────────────────────────────────────────────────────────────

/**
 * `timeline_event` — one row per founder-visible event across every module.
 * Read by the unified timeline UI (Plan 02-10 / XC-08b). Append-only — events
 * are never mutated after insert; corrections are a NEW event with payload
 * referencing the original.
 *
 * `founder_visible = false` is the audit-only escape hatch — used by the
 * memory-staleness logic (Plan 02-09 / KNW-08) to record dismissals + snoozes
 * that should not appear on the user's timeline but must be kept for replay /
 * eval. The timeline UI filters by `founder_visible = true` by default.
 */
export const timelineEvent = pgTable(
  'timeline_event',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    accountId: uuid('account_id')
      .notNull()
      .references(() => accounts.id, { onDelete: 'cascade' }),
    sourceModule: timelineSourceModuleEnum('source_module').notNull(),
    sourceId: uuid('source_id').notNull(), // FK by convention only — no SQL FK (cross-module)
    eventType: text('event_type').notNull(), // module-internal vocabulary; grows freely
    summary: text('summary').notNull(), // ≤140 chars by convention; founder-facing one-liner
    payload: jsonb('payload').notNull().default({}),
    investorId: uuid('investor_id'), // nullable; filled when investor-scoped; FK convention only
    founderVisible: boolean('founder_visible').notNull().default(true),
    eventAt: timestamp('event_at', { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    tenantIsolationPolicy(t.accountId),
    // Primary read path: chronological per-tenant timeline.
    index('timeline_event_account_event_at_idx').on(t.accountId, t.eventAt),
    // Module filter: "show me everything from the pipeline module."
    index('timeline_event_account_source_module_idx').on(t.accountId, t.sourceModule),
    // Investor filter: "show me everything for investor X." Partial index keeps
    // the index small since the column is null for module-level events.
    index('timeline_event_account_investor_idx').on(t.accountId, t.investorId),
  ],
);

export type TimelineEventRow = typeof timelineEvent.$inferSelect;
export type TimelineEventInsert = typeof timelineEvent.$inferInsert;
