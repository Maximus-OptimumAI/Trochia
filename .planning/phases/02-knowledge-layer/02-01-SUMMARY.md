---
phase: 02-knowledge-layer
plan: 01
subsystem: database
tags: [drizzle, postgres, pgvector, hnsw, rls, supabase, schema-lock, vector-embeddings]

# Dependency graph
requires:
  - phase: 01-foundation
    provides: tenancy spine (users/accounts/sessions), RLS pattern (tenantIsolationPolicy + NON_TENANT_TABLES allowlist), schema-scan CI test, two-user-isolation integration test, Drizzle 0.44.7 + Supabase + pgvector extension enabled, src/db/client.ts (request + service clients), drizzle.config.ts
provides:
  - business_memory table (one row per tenant, provenance jsonb catch-all, 18 cols)
  - pipeline_entry table (10-stage enum, surface-only — Phase 4 fills CRUD)
  - interaction table (append-only Q&A audit log + Langfuse trace id)
  - timeline_event table (chronological cross-module event log, 7-value source_module enum pre-seeded for downstream phases)
  - embeddings table with vector(1024) column, HNSW + vector_cosine_ops index, dedup unique index (idempotency key)
  - RLS default-deny + tenant_isolation policy on all 5 new tables
  - Phase 2 integration test (tests/integration/rls-memory.test.ts) with 8 cases proving isolation + idempotency + vector dim lock + default-deny + enum rejection + provenance default + one-row-per-tenant
  - tests/db/test-db.ts cleanup() extended to truncate Phase 2 tables
  - tests/rls/two-user-isolation.test.ts extended to seed + iterate Phase 2 tables
  - tests/rls/schema-scan.test.ts extended with Phase-2 presence assertion
affects: [02-02 paste extractor, 02-04 embed pipeline, 02-06 RAG retrieve, 02-07 Q&A sidebar, 02-09 staleness, 02-10 timeline UI, every Phase 3+ module that reads business_memory or writes timeline_event]

# Tech tracking
tech-stack:
  added:
    - "Drizzle vector('embedding', { dimensions: 1024 }) — pgvector column type"
    - "Drizzle index('...').using('hnsw', t.embedding.op('vector_cosine_ops')) — HNSW + cosine index DSL"
  patterns:
    - "Schema lock at end of plan: provenance/payload jsonb absorb future shape changes, columns do not (Pitfall 11 mitigation)"
    - "Pre-seeded enums for downstream phases — timeline_source_module_t carries all 7 module values now to avoid ALTER TYPE migration in every Phase 3-9 plan"
    - "Embedding dedup unique index includes embedding_model_version — rolling re-embed coexists with old vectors"
    - "Tenant-scoped per-tenant copies of corpus embeddings (not shared) — simpler RLS, trivial storage at expected scale"
    - "drizzle-kit migrate (not push) for any project with hand-authored SQL migrations"

key-files:
  created:
    - src/db/schema/memory.ts (business_memory, pipeline_entry, interaction tables + 3 enums)
    - src/db/schema/timeline.ts (timeline_event table + timeline_source_module_t enum)
    - src/db/schema/embeddings.ts (embeddings table + embedding_source_type_t enum + HNSW index)
    - src/db/migrations/0005_easy_the_executioner.sql (108 lines — 5 CREATE TABLEs, 5 enums, 5 RLS, 5 policies, 9 indexes, 6 FKs)
    - tests/integration/rls-memory.test.ts (8 deeper assertions beyond two-user isolation)
  modified:
    - src/db/schema/index.ts (3 new barrel exports)
    - tests/rls/schema-scan.test.ts (Phase-2 presence + RLS assertion)
    - tests/rls/two-user-isolation.test.ts (seed + assertion loop + covered set extended)
    - tests/db/test-db.ts (cleanup() truncate list extended to Phase 2 tables)
    - tasks/lessons.md (3 new lessons captured)

key-decisions:
  - "Vector dim hard-pinned to 1024 (Voyage voyage-3-large) — not parameterized; future model change is a schema change with explicit migration"
  - "embedding_model_version is text (not enum) — future model rollouts are data changes, not ALTER TYPE migrations"
  - "Per-tenant copies of corpus embeddings (vs shared corpus_embeddings table) — defer optimization until tenant count exceeds ~50"
  - "Used drizzle-kit migrate (not push) to avoid dropping Phase 1 hand-authored auth_admin_can_read_accounts policy"
  - "Phase 2 schema applied to throwaway/test project (spqnjvcfmmmdobkwgmxs), NOT production (xnzyhjwalphcykjwoxdw) — production schema sync deferred"

patterns-established:
  - "Provenance/payload jsonb as flex-field catch-all — Zod-validated at app layer, NOT in SQL — lets shape evolve without migrations"
  - "Pre-seed downstream-phase enum values at Week-1 schema lock — Phase 3-9 modules write their events without ALTER TYPE migrations"
  - "Idempotency unique index includes model version — rebuild safety + rolling re-embed in one"
  - "Schema-foundation plans deliver surface-shape-only tables for downstream phases (pipeline_entry, interaction) — locks the read contract before Phase 4 fills CRUD"

requirements-completed:
  - KNW-01  # foundation — schema for paste-extracted Business Memory record
  - KNW-02  # foundation — schema for file-imported Business Memory record (table identical to KNW-01)
  - KNW-03  # foundation — schema for confirmation-UI state (provenance jsonb shape)
  - KNW-04  # foundation — pgvector + HNSW + embedding pipeline destination
  - KNW-05  # foundation — interaction audit log + embeddings backing the Q&A retrieval
  - KNW-08  # foundation — provenance.snooze_until field for staleness nudge state
  - XC-08   # foundation — timeline_event table + 7-value source_module enum

# Metrics
duration: ~2h orchestrator time across 8 tasks
completed: 2026-05-20
---

# Phase 2 Plan 01: Schema Foundation — Summary

**Five new tenant-scoped tables (`business_memory`, `pipeline_entry`, `interaction`, `timeline_event`, `embeddings`) are live on the throwaway Supabase project with RLS default-deny, an HNSW + cosine vector index, and 8 integration tests proving isolation + idempotency + vector dim lock + default-deny + enum rejection + provenance default + one-row-per-tenant — schema-locked for the rest of Phase 2.**

## Performance

- **Duration:** ~2h orchestrator time (8 tasks across 2 sessions)
- **Started:** 2026-05-19 (CONTEXT/PLAN authored same day)
- **Completed:** 2026-05-20
- **Tasks:** 8 of 8 (Tasks 1-6 autonomous, Task 7 not-autonomous, Task 8 verification loop)
- **Files modified:** 11 (3 new schema files + 1 new migration + 1 new integration test + 6 modified files including barrel + 3 existing tests + lessons)

## Accomplishments

- Schema spine locked for Phase 2 — `provenance` + `payload` jsonb catch-alls absorb future shape changes, columns do not (Pitfall 11 mitigation)
- HNSW index with `vector_cosine_ops` operator class on `embeddings.embedding` (1024-dim, Voyage `voyage-3-large` pinned) emitted cleanly by Drizzle 0.44.7 — no manual SQL edits needed
- Idempotency contract proven by integration test: dedup unique index on `(account_id, source_type, source_id, chunk_idx, embedding_model_version)` rejects duplicate upserts but PERMITS new model_version rows (rolling re-embed coexistence)
- Pre-seeded `timeline_source_module_t` enum with all 7 phase values (memory, pipeline, deck, brief, safe, cap_table, legal) so downstream phases write their events without ALTER TYPE migrations
- All 17 RLS-family tests pass live against the throwaway DB: 8 Phase-2 integration + 6 two-user isolation (extended) + 3 schema-scan (extended)
- Phase 1's `auth_admin_can_read_accounts` policy on `accounts` preserved through the Phase 2 schema apply (verified post-migrate) — required for `supabase_auth_admin`-role JWT minting

## Task Commits

Single Week 1 commit captures all 8 tasks (atomic-per-task commits would have been preferred but the workflow ran sequentially in two sessions and we landed at one commit for the Week):

- **Tasks 1-8: schema foundation, RLS tests, migration, lessons** — `4f8eebf` (feat — Phase 2 Week 1)

**Plan metadata** (committed earlier in `acfab36`): Phase 2 PLAN docs (`02-CONTEXT.md`, `02-PLAN.md`, `02-01-PLAN.md`, `tasks/todo.md`)

## Files Created

- `src/db/schema/memory.ts` (199 lines) — business_memory + pipeline_entry + interaction; 3 enums; RLS via tenantIsolationPolicy; $inferSelect / $inferInsert types
- `src/db/schema/timeline.ts` (78 lines) — timeline_event; 7-value source_module enum pre-seeded for downstream phases
- `src/db/schema/embeddings.ts` (109 lines) — embeddings with vector(1024); HNSW + cosine + dedup unique index; embedding_model_version as text (not enum) for forward-compat
- `src/db/migrations/0005_easy_the_executioner.sql` (108 lines, drizzle-kit generate output) — 5 CREATE TABLEs + 5 enums + 5 RLS + 5 policies + 9 indexes + 6 FKs; no destructive ops; no manual SQL edits
- `src/db/migrations/meta/0005_snapshot.json` (drizzle-kit bookkeeping)
- `tests/integration/rls-memory.test.ts` (~200 lines) — 8 deeper assertions beyond what tests/rls/two-user-isolation.test.ts covers

## Files Modified

- `src/db/schema/index.ts` — 3 new barrel exports (memory, timeline, embeddings)
- `src/db/migrations/meta/_journal.json` — drizzle-kit added 0005 entry
- `tests/rls/schema-scan.test.ts` — new "Phase-2 tables are present and protected" assertion (`it()` block)
- `tests/rls/two-user-isolation.test.ts` — seed + assertion loop + `covered` set extended to 5 Phase 2 tables
- `tests/db/test-db.ts` — `cleanup()` truncate list extended (Phase 2 tables added in CASCADE order)
- `tasks/lessons.md` — 3 new lessons:
  1. drizzle-kit push vs migrate (use migrate for hand-authored SQL)
  2. drizzle-kit does NOT auto-load .env.local (use `set -a && . ./.env.local && set +a`)
  3. .env.local DATABASE_URL points at throwaway, not prod (intentional, safe-by-default)

## Verification Loop Results (Task 8)

| Gate | Status | Notes |
|---|---|---|
| `npm run db:generate` | ✅ clean | "No schema changes, nothing to migrate" — schema matches 0005 migration |
| `npm run typecheck` | ✅ exit 0 | |
| `npm run lint` | ✅ exit 0 | |
| `npm run check:banned` | ✅ exit 0 | No banned compliance strings |
| `npm run build` | ✅ exit 0 (with CI placeholder env) | **Pre-existing condition** surfaced: `.env.local` is missing 4 Stripe Price IDs (CLOSE_MODE_M/A, ALUMNI_M/A) that `prodRequired()` in `src/lib/env.ts` requires. CI passes via placeholders per commit `32e35c1`; local `.env.local` needs the same. NOT caused by Phase 2 work — last edit to `src/lib/env.ts` was commit `657d890` (Phase 4.5 prep). Build with CI-equivalent placeholder env vars succeeds. |
| `npx vitest run` (full suite) | ✅ 123 passed / 26 skipped / 0 failed | 26 skipped = RLS tests waiting on TEST_DATABASE_URL (CI sets it) |
| `npx vitest run tests/integration/rls-memory.test.ts tests/rls/` (live against throwaway DB) | ✅ 17/17 passed | Phase 2 schema proven end-to-end |
| `npx playwright test` | ⏭️ deferred | UI-touching Phase 1 smoke. Phase 2 changes are schema + tests only — zero impact on routes/UI/auth/onboarding. Recommended pre-merge step, not a blocker for Week 1 close. |

## Phase 1 Invariants Preserved (post-Phase-2-apply)

- ✅ pgvector extension enabled (v0.8.0)
- ✅ All 5 new tables exist with RLS toggle ON
- ✅ `tenant_isolation` policy on each new table
- ✅ Phase 1's `auth_admin_can_read_accounts` policy on `accounts` — STILL EXISTS (verified via pg_policies query post-migrate)
- ✅ Drizzle journal: ids 4, 5, 6 applied (4=owner_self_read, 5=PR-1 partial unique, 6=Phase 2 schema)
- ✅ All Phase 1 RLS tests still pass live (two-user-isolation 6/6 green with Phase 2 tables in scope)

## Surprises / Deviations from Plan

1. **drizzle-kit push wanted to drop a Phase 1 policy.** The first `npm run db:push` attempt diffed against schema files and proposed `DROP POLICY "auth_admin_can_read_accounts" ON "accounts" CASCADE` — a policy created by hand-authored SQL in `0000_sturdy_maestro.sql` (line 139), not declared in Drizzle schema files. `strict: true` in `drizzle.config.ts` caught it. Switched to `drizzle-kit migrate` which applies migration files verbatim without diff-sync. **Open follow-up:** declare `auth_admin_can_read_accounts` in `src/db/schema/tenancy.ts` so future `db:push` calls don't see it as drift.
2. **`.env.local` was missing 4 Stripe Price ID env vars** that `prodRequired()` requires (added by commit `657d890`, Phase 4.5 prep). CI has placeholder values per commit `32e35c1`. Local build now needs the same. **Open follow-up:** either (a) add placeholder values to `.env.local`, or (b) make these vars `.optional()` until Phase 11 ships those tiers, or (c) document the inline-env workaround for local builds.
3. **Drizzle vector + HNSW DSL worked first try.** The plan's contingency for manual SQL edits to add HNSW was unnecessary. Drizzle 0.44.7's `vector(...)` column + `.op('vector_cosine_ops')` + `.using('hnsw', ...)` index DSL emits exactly the right SQL.

## Open Follow-ups (deferred to Phase 4.5 or later)

- Declare `auth_admin_can_read_accounts` in Drizzle schema files (currently drift; `db:push` would drop it)
- Add CI-equivalent placeholder Stripe Price IDs to `.env.local` (or revert `prodRequired()` for unshipped tiers)
- Decide tenant-shared corpus embeddings strategy when tenant count exceeds ~50
- Confirm prod migration hook (how does the real project at `xnzyhjwalphcykjwoxdw` get Phase 2 schema?)
- Rotate throwaway-project DB password (leaked in terminal output during Task 7 redaction-regex check)
- Remove stray `.github/workflows/ci.yml.save` backup file from repo root

## Hand-off to Plan 02-02 (Week 2 — Paste extractor + confirmation UI shell)

Plan 02-02 implements **KNW-02a** (paste extractor agent, Sonnet 4.6 + Zod) + **KNW-02b** (confirmation UI shell). It assumes:

- `business_memory` table exists with the provenance jsonb catch-all (this plan)
- `interaction` table exists for logging extract attempts with Langfuse trace IDs (this plan)
- `src/ai/client.ts` exists from Phase 1 (it does — commit `a51b97d`)
- Zod is installed (yes — Phase 1 dep)
- Anthropic SDK is installed (yes — Phase 1 dep, gated via `src/ai/client.ts`)

Schema lock is now in effect. Plan 02-02 + later weeks add NO columns to the 5 Phase-2 tables — only fill them, query them, and mutate the `provenance` jsonb shape via app-layer Zod.

---

*Authored 2026-05-20 by gsd-execute-phase orchestrator for Plan 02-01 Task 8.*
