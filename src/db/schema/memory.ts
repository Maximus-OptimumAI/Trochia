/**
 * Memory + Pipeline spine (Phase 2 — Knowledge Layer + Memory).
 *
 * Three tables, one purpose: the system-of-record for everything Trochia knows
 * about a founder's company + their fundraising state. Every other Phase 2+
 * module reads from and writes to these three tables.
 *
 * - `business_memory` — one row per `accounts.id` (the tenant). Canonical
 *   relational record extracted (Sonnet 4.6) + confirmed (founder UI in
 *   Plan 02-02) from pasted AI context or uploaded knowledge packs. Schema-
 *   locked from end of Plan 02-01: later plans add NO new columns. All flex
 *   metadata lives in the `provenance` jsonb catch-all (Pitfall 11 mitigation
 *   per docs/Trochia_AI_Phase_2_PLAN_v1.md §6).
 *
 * - `pipeline_entry` — Phase 4 fills CRUD; this plan ships the surface shape
 *   only so the schema spine is stable for downstream RAG + timeline reads.
 *   Tenant-scoped, indexed on (account_id, stage).
 *
 * - `interaction` — append-only audit log of every Q&A query, paste extract,
 *   file import, and staleness-nudge dismissal. Carries the Langfuse trace ID
 *   + latency so eval fixtures (Plan 02-05) can replay traffic shape and the
 *   Phase 2 exit gate (zero fabricated citations in 50 sample Q's) can sample
 *   from real production data.
 *
 * ## Provenance JSON shape (`business_memory.provenance`)
 *
 * Keyed by field name (e.g. `traction.mrr`, `team.founders`). Each value:
 *
 *   {
 *     source_snippet: string,          // verbatim quote from the paste/import
 *     confidence: number,              // 0..1 from the extractor (Sonnet 4.6)
 *     extracted_at: string,            // ISO timestamp — set by extractor
 *     last_updated: string,            // ISO — bumped on every founder edit
 *     snooze_until: string | null,     // ISO — staleness-nudge snooze (KNW-08)
 *   }
 *
 * The shape is enforced at the application layer via Zod (`src/ai/schemas/
 * business-memory.zod.ts`, lands Plan 02-02) — NOT in SQL. This is deliberate:
 * the Phase 2 contract is that provenance schema CAN evolve across V2/V3
 * without a migration, while the column set CANNOT.
 *
 * ## Tenancy + RLS
 *
 * All three tables hang off `accounts.id` and carry the standard
 * `tenantIsolationPolicy(t.accountId)`. The two-user-isolation integration
 * test (`tests/integration/rls-memory.test.ts`, lands in Task 6 of this plan)
 * proves tenant A reads zero of tenant B's rows in every table. Default-deny:
 * a session with no `tenant_id` JWT claim sees nothing.
 */
import { index, jsonb, pgEnum, pgTable, text, integer, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';

import { tenantIsolationPolicy } from '@/db/rls';
import { accounts, users } from '@/db/schema/tenancy';

// ────────────────────────────────────────────────────────────────────────────
// Enums
// ────────────────────────────────────────────────────────────────────────────

/**
 * Investor type on a pipeline entry. `other` is the escape hatch for anything
 * we haven't classified — e.g. corporate strategics, syndicates we don't want
 * to model as VCs. Phase 4 fills these in via the Investor Pipeline UI.
 */
export const pipelineInvestorTypeEnum = pgEnum('pipeline_investor_type_t', [
  'vc',
  'angel',
  'accelerator',
  'family_office',
  'crowd',
  'other',
]);

/**
 * Pipeline stage. 10 values cover the full fundraising lifecycle from initial
 * identification to wired (or declined / ghosted, which are real outcomes worth
 * tracking). Order is meaningful: the Phase 4 kanban orders columns by this
 * enum, so adding a stage later is an ALTER TYPE that needs careful placement.
 */
export const pipelineStageEnum = pgEnum('pipeline_stage_t', [
  'identified',
  'researching',
  'intro_pending',
  'pitched',
  'in_diligence',
  'soft_circle',
  'committed',
  'wired',
  'declined',
  'ghosted',
]);

/**
 * The kind of interaction that produced an `interaction` row. Phase 2 writes
 * all five kinds. Phase 4+ extend by adding values via ALTER TYPE (we accept
 * that — interaction kinds genuinely grow as new modules ship; provenance
 * jsonb above does NOT, because business_memory column shape is part of the
 * read contract for every other module).
 *
 * `paste_extract` writes on the extractor pass (and on security-IR rejection
 * audit rows; the metadata column carries the rejection reason). `paste_confirm`
 * writes on confirmDraft success — kept distinct so eval samplers can split
 * draft-vs-confirmed traffic without parsing answer payloads (Plan 02-03 / T11).
 */
export const interactionKindEnum = pgEnum('interaction_kind_t', [
  'qa_sidebar',
  'paste_extract',
  'paste_confirm',
  'file_import',
  'staleness_nudge',
]);

// ────────────────────────────────────────────────────────────────────────────
// business_memory — one row per tenant, the canonical company record
// ────────────────────────────────────────────────────────────────────────────

/**
 * `business_memory` — one row per `accounts.id`. The canonical relational
 * record for "what Trochia knows about this company." Populated by the paste
 * extractor (Plan 02-02 / KNW-02a) + file-import parsers (Plan 02-08 / KNW-03);
 * mutated by the founder via the confirmation UI (Plan 02-02 / KNW-02b) +
 * staleness nudges (Plan 02-09 / KNW-08). Read by every downstream Phase 2+
 * module via tRPC procedures.
 *
 * The free-form structured fields (`team`, `traction`, `narrative`) are jsonb
 * because their internal shape co-evolves with the Phase 2 extractor prompt;
 * Zod at the application layer is the source of truth for what keys/values
 * are valid (NOT a SQL schema). This is the deliberate Phase 2 contract —
 * provenance + structured fields can evolve, column set cannot.
 */
export const businessMemory = pgTable(
  'business_memory',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    accountId: uuid('account_id')
      .notNull()
      .references(() => accounts.id, { onDelete: 'cascade' }),
    // ── Top-level scalar identity fields ──
    companyName: text('company_name'),
    oneLiner: text('one_liner'),
    sector: text('sector'),
    stage: text('stage'),
    geography: text('geography'),
    incorporationStatus: text('incorporation_status'),
    foundingDate: timestamp('founding_date', { withTimezone: true }),
    // ── Structured groups (Zod-validated at app layer) ──
    team: jsonb('team'), // { founders: [{ name, role, background, ... }], advisors: [...] }
    traction: jsonb('traction'), // { mrr, arr, customers, growth, runway, ... }
    narrative: jsonb('narrative'), // { problem, solution, why_now, why_us, ... }
    // ── Provenance catch-all (see file header for shape). Defaults to '{}' so
    //    UPSERTs from the extractor can safely write a partial provenance map
    //    without a separate INSERT/UPDATE branch. ──
    provenance: jsonb('provenance').notNull().default({}),
    // ── Lifecycle timestamps ──
    extractedAt: timestamp('extracted_at', { withTimezone: true }).notNull().defaultNow(),
    confirmedAt: timestamp('confirmed_at', { withTimezone: true }), // null until founder confirms in the UI
    lastUpdatedAt: timestamp('last_updated_at', { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    tenantIsolationPolicy(t.accountId),
    // One row per tenant — enforced by a unique index on account_id (rather
    // than primary-keying on account_id, so we keep a stable uuid `id` for
    // logging / Langfuse correlation across rebuilds).
    uniqueIndex('business_memory_account_id_uniq').on(t.accountId),
  ],
);

export type BusinessMemoryRow = typeof businessMemory.$inferSelect;
export type BusinessMemoryInsert = typeof businessMemory.$inferInsert;

// ────────────────────────────────────────────────────────────────────────────
// pipeline_entry — investor-pipeline row (Phase 4 fills CRUD)
// ────────────────────────────────────────────────────────────────────────────

/**
 * `pipeline_entry` — one row per investor the founder is tracking. Phase 2
 * ships the surface shape only; Phase 4 (Investor Pipeline) fills CRUD,
 * matching, scoring, bulk actions, CSV import/export.
 *
 * The shape is locked here so Phase 2's timeline UI (XC-08b) + Q&A sidebar
 * (KNW-05) + memory-staleness logic (KNW-08) can all read pipeline rows
 * without waiting for Phase 4 to land.
 */
export const pipelineEntry = pgTable(
  'pipeline_entry',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    accountId: uuid('account_id')
      .notNull()
      .references(() => accounts.id, { onDelete: 'cascade' }),
    investorName: text('investor_name').notNull(),
    investorType: pipelineInvestorTypeEnum('investor_type'),
    stage: pipelineStageEnum('stage').notNull().default('identified'),
    checkSize: text('check_size'), // free-form string, e.g. "$50k–$250k"
    sector: text('sector'),
    geo: text('geo'),
    notes: text('notes'),
    firstContactAt: timestamp('first_contact_at', { withTimezone: true }),
    lastContactAt: timestamp('last_contact_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    tenantIsolationPolicy(t.accountId),
    // Primary read path: kanban-style stage-grouped list per tenant.
    index('pipeline_entry_account_stage_idx').on(t.accountId, t.stage),
  ],
);

export type PipelineEntryRow = typeof pipelineEntry.$inferSelect;
export type PipelineEntryInsert = typeof pipelineEntry.$inferInsert;

// ────────────────────────────────────────────────────────────────────────────
// interaction — append-only audit log of every Q&A / extract / import event
// ────────────────────────────────────────────────────────────────────────────

/**
 * `interaction` — append-only. Every Q&A sidebar query (Plan 02-07 / KNW-05c),
 * paste extract (Plan 02-02), file import (Plan 02-08 / KNW-03), and staleness-
 * nudge action (Plan 02-09 / KNW-08) writes one row. The Phase 2 eval harness
 * (Plan 02-05 / EVAL-01a) samples from this table to compute the must-not-fail
 * thresholds (≥8 fields extracted from 1,500-word paste; zero fabricated
 * citations in 50 sample Q's; latency p50 <8s).
 *
 * `query` / `answer` are nullable because not every interaction kind has both
 * — a `staleness_nudge` dismissal has neither; a `paste_extract` has neither
 * (the paste itself is the input, not a query). Application code is responsible
 * for filling the right shape per kind.
 *
 * Numeric financial figures (`mrr`, `arr`, `valuation`, etc.) MUST NOT enter
 * the `query` or `answer` columns — Phase 1's redacting logger (SENSITIVE_FIELDS)
 * scrubs them out of structured logs, and the same set must be re-applied at
 * the application layer before write here. This is a downstream constraint;
 * the schema itself only carries text.
 *
 *   - metadata jsonb: structured audit signal (security-IR rejection metadata,
 *     conflict-resolution audit). Nullable. Content boundary: NEVER includes raw
 *     attack content, paste content, byType detail, or source_snippet beyond 200
 *     chars. Application layer (Plan 02-03 / T11) is responsible for enforcing
 *     the shape — the column itself accepts any JSON record.
 */
export const interaction = pgTable(
  'interaction',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    accountId: uuid('account_id')
      .notNull()
      .references(() => accounts.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    kind: interactionKindEnum('kind').notNull(),
    query: text('query'),
    answer: text('answer'),
    // Array shape: [{ source_type: 'memory' | 'corpus' | 'interaction',
    //                source_id: uuid, snippet: string }]. Zod-validated at the
    // application layer (Plan 02-07 / KNW-05b).
    citations: jsonb('citations'),
    model: text('model'), // e.g. 'claude-opus-4-7', 'claude-sonnet-4-6'
    langfuseTraceId: text('langfuse_trace_id'),
    latencyMs: integer('latency_ms'),
    // Structured audit signal — security-IR rejection metadata,
    // conflict-resolution audit. Content boundary documented in table header.
    // Nullable; T11 (Plan 02-03) writes specific shapes, column accepts any.
    metadata: jsonb('metadata').$type<Record<string, unknown> | null>(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    tenantIsolationPolicy(t.accountId),
    // Primary read path: chronological per-tenant audit feed; the eval harness
    // and the Phase 2 exit-gate sampler both order by created_at desc.
    index('interaction_account_created_at_idx').on(t.accountId, t.createdAt),
  ],
);

export type InteractionRow = typeof interaction.$inferSelect;
export type InteractionInsert = typeof interaction.$inferInsert;
