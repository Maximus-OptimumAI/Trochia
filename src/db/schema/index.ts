/**
 * Barrel for the Drizzle schema. drizzle-kit reads `./src/db/schema` (the dir),
 * and the request/service clients import the relations from here.
 *
 * Phase-1 tables (D-03 narrowing): users, accounts, sessions, subscriptions,
 * jobs, legal_acceptances.
 *
 * Phase-2 tables: business_memory, pipeline_entry, interaction (memory.ts);
 * timeline_event (timeline.ts); embeddings (embeddings.ts). All tenant-scoped
 * + RLS default-deny; schema-locked from end of Plan 02-01 (provenance/payload
 * jsonb absorb future shape changes, columns do not).
 */
export * from '@/db/schema/tenancy';
export * from '@/db/schema/billing';
export * from '@/db/schema/jobs';
export * from '@/db/schema/legal';
export * from '@/db/schema/memory';
export * from '@/db/schema/timeline';
export * from '@/db/schema/embeddings';
// Plan 02-07 (OD-1 Option A — FOUNDER-RATIFIED 2026-06-01): the durable per-(tenant,
// UTC-day) AI-spend counter behind the $5/user/day HARD cap. The FIRST schema change
// since the 29228e8 lock; the lock re-anchors to the post-0007 HEAD.
export * from '@/db/schema/ai_usage_daily';
