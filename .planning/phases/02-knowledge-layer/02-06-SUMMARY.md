---
phase: 02-knowledge-layer
plan: 06
subsystem: knowledge-layer
tags: [phase-2, rag, retrieve, hybrid-search, pgvector, cosine, fts, websearch_to_tsquery, ts_rank_cd, rrf, voyage, query-embed, tenant-scope, rls, schema-lock, deploy-deferred, codex, cso]

# Dependency graph
requires:
  - phase: 02-knowledge-layer
    plan: 04
    provides: "embeddings rows (vector(1024), source_type='memory'/'corpus', embedding_model_version='voyage-3-large') written by the embed-memory pipeline; voyage.adapter.ts with the inputType:'query' entrypoint + TRACE_METADATA_KEYS whitelist; HNSW vector_cosine_ops index; the per-tenant embeddings model"
  - phase: 02-knowledge-layer
    plan: 01
    provides: "embeddings schema + chunk_text text column + dedup unique index + tenantIsolationPolicy RLS + schema-lock baseline 29228e8"
  - phase: 01-foundation
    provides: "src/db/client.ts getRequestClient(token).rls(fn) request-scoped tenant runner (SET LOCAL role=authenticated + request.jwt.claims); src/lib/errors.ts AppError(message, {code,cause}); src/lib/langfuse.ts; sentry-scrub.ts beforeSend (key-based)"
provides:
  - "src/ai/rag/retrieve.ts — hybridRetrieve({ accountId, query, topK=8 }, ctx:{ rls }) → ranked Candidate[]. Embeds the query via voyage.embed(inputType:'query', sourceType:'query') at the single read-path Voyage call site; runs a pgvector cosine search (drizzle cosineDistance over the HNSW index) AND a query-time Postgres FTS (websearch_to_tsquery/ts_rank_cd/to_tsvector('english', chunk_text)) over the per-tenant embeddings; fuses by RRF (k=60, 1-based) keyed on embeddings.id; returns top-effTopK candidates sorted by rrfScore with vectorScore (cosine similarity = 1-dist) + ftsScore + rrfScore. Tenant-scoped: explicit account_id predicate on BOTH queries inside one ctx.rls transaction; NO getServiceClient; NO @anthropic-ai/sdk. Retrieval only — no synthesis/citations/'I don't know'/cost-cap (02-07). Exports Candidate + HybridRetrieveArgs + HybridRetrieveCtx + CANDIDATE_POOL_FACTOR/MAX_TOP_K/RRF_K/EMBEDDING_MODEL_VERSION/SOURCE_TYPES"
  - "src/ai/integrations/voyage.adapter.ts — OD-4: VoyageEmbedInput.trace.sourceType widened to include 'query' (additive TS union; TRACE_METADATA_KEYS UNCHANGED). Pre-redeploy hardening: for inputType:'query' the network-error message + !response.ok body are redacted (status only, no cause) so the query never enters the AppError (CSO-H2); embeddings.length === texts.length asserted before use → VOYAGE_COUNT_MISMATCH (CSO-M2)"
  - "tests/ai/rag/retrieve.test.ts — 12 cases (a–k + Candidate-shape): RRF math, per-side tenant/source/model predicate via real .toSQL()/PgDialect (NOT the embed-memory ignore-_pred fake), empty path, single-chokepoint query-trace, query-text-not-traced, effTopK cap incl NaN, weak path, and (k) redacted-error contract (query + cause absent on a DB failure). All live deps mocked"
  - "tests/ai/integrations/voyage.adapter.test.ts — +Case 9 (OD-4 query-trace), +Case 10 (query-echoing 400 body not leaked, CSO-H2), +Case 11 (count mismatch, CSO-M2)"
affects:
  - "Plan 02-07 (qa-rag agent + ambient Q&A sidebar + OBS-COST-01 — the joint write+read+cost-cap merge): calls hybridRetrieve with the request session's ctx.rls; applies the 0.6-cosine 'I don't know' floor against the returned scores WITHOUT re-querying (02-CONTEXT.md); flips qa-grounding.ts from 'pending' to real + empties PENDING_ALLOWED; ships PULL-OBS-COST-01-FORWARD ($5/user/day cap metering the Anthropic client + the single Voyage query-embed call site); takes the write+read path to prod"

# Tech tracking
tech-stack:
  added: []   # zero new npm deps — pgvector cosine via installed drizzle-orm cosineDistance; FTS via raw sql`` over the installed postgres driver
  patterns:
    - "Hybrid retrieval = pgvector cosine + Postgres query-time FTS fused by Reciprocal Rank Fusion (RRF, k=60, fuse-by-rank not score) — cosine distance and ts_rank_cd are incomparable scales; RRF needs no calibration. The retriever returns raw per-side scores so the downstream agent thresholds without re-querying"
    - "Query-time FTS keeps the schema locked (OD-1 Option A): to_tsvector('english', chunk_text) computed inline, no stored GENERATED column, no GIN index — viable because the tenant filter bounds the base set to one founder's chunks at Phase-2 scale. GIN index deferred to FOLLOWUP-FTS-GIN-INDEX-01 (lands with FOLLOWUP-DBDIFF-01 when per-tenant counts reach thousands)"
    - "Read-path AI egress discipline: the query embed fires at EXACTLY ONE voyage.embed call site so a future cost cap (02-07 OBS-COST-01) has one read-side meter point; the query traces honestly as source_type:'query' (OD-4 union widening, key-set-preserving)"
    - "Sensitive-query leak hygiene: a founder query in an AppError MESSAGE reaches Sentry UNSCRUBBED (sentry-scrub.ts redacts structured fields by key, never exception .value strings). Mitigation: redact at the throw site (DB block try/catch → static AppError no-cause; Voyage query-embed error → status only). The Langfuse trace was already metadata-only"
    - "Per-side predicate test proof: serialize the ACTUAL query the executor runs (drizzle .toSQL() for the typed builder; PgDialect().sqlToQuery() for the raw sql`` fragment) and assert account_id/source_type/model-version as bound params — NOT the embed-memory ignore-_pred fake (which would pass vacuously and void the cross-tenant proof)"

key-files:
  created:
    - "src/ai/rag/retrieve.ts (~290 lines) — the hybrid retriever; the whole Phase-2 read path"
    - "tests/ai/rag/retrieve.test.ts (~460 lines) — 12-case unit suite, all live deps mocked"
    - ".planning/phases/02-knowledge-layer/02-06-PLAN.md — plan + convergence (gsd-plan-checker + Codex cycle 1)"
    - ".planning/phases/02-knowledge-layer/02-06-SUMMARY.md — this file"
    - ".gstack/security-reports/20260601-cso-plan-02-06.json — /cso report (gitignored)"
  modified:
    - "src/ai/integrations/voyage.adapter.ts — OD-4 'query' trace union widening + query-embed error redaction (CSO-H2) + count assertion (CSO-M2)"
    - "tests/ai/integrations/voyage.adapter.test.ts — +Case 9/10/11"
    - ".planning/phases/02-knowledge-layer/02-REVIEWS.md — Plan 02-06 cross-AI review (cycle 0 internal + cycle 1 Codex)"
    - ".planning/ROADMAP.md + .planning/STATE.md — plan progress"

key-decisions:
  - "OD-1 = Option A (FOUNDER-CONFIRMED 2026-06-01): query-time FTS, NO schema change. git diff --quiet 29228e8 -- src/db/schema/ stays exit 0; zero migrations; FOLLOWUP-DBDIFF-01 stays deferred. The embeddings.ts:89-97 documented intent to add the tsvector column 'in Plan 02-06' is consciously DEFERRED (FOLLOWUP-FTS-GIN-INDEX-01), not silently executed — surfaced as the load-bearing Open Decision per the schema-lock guardrail"
  - "OD-2 = RRF (k=60, rank-based). Fusion by rank position, never by raw score — cosine distance (0..2) and ts_rank_cd (unbounded) are incomparable scales"
  - "OD-4 = honest 'query' trace.sourceType (recommended over the draft's false 'memory'). Pure additive TS union widening; TRACE_METADATA_KEYS unchanged so the adapter Case 8b key-set pin holds. Replaced writing a knowingly-false value onto the privacy-contract trace"
  - "OD-5 = grounding boundary: retrieve.ts returns ranked Candidates + raw scores; the 0.6-cosine 'I don't know' decision is 02-07's, never a vector-side cutoff here"
  - "PULL-OBS-COST-01-FORWARD NOT shipped here: the query-embed egress is placed at one chokepoint; the $5/user/day cap lands in the 02-07 joint merge (deploy-deferred posture)"

requirements-completed:
  - KNW-05a   # RAG retrieve service (the retrieval portion of KNW-05). KNW-05 itself stays Pending until Plan 02-07 lands the cited, <8s-median, "I don't know"-capable Q&A sidebar on top of this retriever.

# Metrics
duration: "~1 day (plan author + convergence + T01 + T02 + founder-gated /codex + /cso + batch fix, 2026-06-01)"
completed: 2026-06-01
---

# Phase 2 Plan 06 — Hybrid RAG Retriever (KNW-05a) Summary

**`src/ai/rag/retrieve.ts` is the read path: `hybridRetrieve` embeds a founder's query through the Voyage adapter (one read-path call site, `inputType:'query'`, honest `source_type:'query'`), runs a pgvector cosine search (drizzle `cosineDistance` over the HNSW index) AND a query-time Postgres full-text search (`websearch_to_tsquery`/`ts_rank_cd`/`to_tsvector('english', chunk_text)`) over the per-tenant `embeddings` rows the 02-04 pipeline wrote, fuses the two ranked lists by Reciprocal Rank Fusion (k=60, rank-based) keyed on `embeddings.id`, and returns the top-`effTopK` candidates sorted by `rrfScore` with raw `vectorScore` (cosine similarity) + `ftsScore` attached for 02-07's grounding threshold — all inside ONE request-scoped `ctx.rls` transaction with an explicit `account_id` predicate on BOTH queries (RLS belt-and-suspenders, no `getServiceClient`, no `@anthropic-ai/sdk`). OD-1 resolved Option A (founder-confirmed): query-time FTS keeps the schema byte-locked at `29228e8` (zero migrations; GIN index deferred to FOLLOWUP-FTS-GIN-INDEX-01). Retrieval only — synthesis, citations, the "I don't know" call, and the $5/user/day cost cap are all Plan 02-07. Branch-only; PR #7 DRAFT; main untouched.**

## Performance
- **Duration:** ~1 day (2026-06-01): plan author → gsd-plan-checker + Codex convergence (cycle 1, current_high=0) → T01 → T02 → founder-gated /codex + /cso → batch fix.
- **Tasks:** 2 of 2 (T01 retriever + OD-4 adapter widening; T02 unit tests + adapter query-trace case).
- **Execution model:** sequential single-agent (one gsd-executor per task; founder greenlight between each; Windows worktree rule — no parallel agents).
- **Source LOC delta:** ~+290 retrieve.ts, ~+30 voyage.adapter.ts, ~+490 tests.

## Accomplishments
- **Hybrid retriever** — pgvector cosine + query-time Postgres FTS, RRF-fused (k=60), tenant-scoped, schema-locked, single Voyage query-embed chokepoint. Returns ranked `Candidate[]` with raw per-side scores.
- **OD-1 Option A held** — `git diff --quiet 29228e8 -- src/db/schema/` exits 0; zero migrations; `drizzle-kit check` clean; zero new npm deps.
- **OD-4 honest query trace** — adapter `trace.sourceType` union widened with `'query'` (key-set-preserving; Case 8b holds).
- **Query-leak hardening (pre-redeploy)** — redacted error paths so a founder query can never reach Sentry via an exception message; cross-tenant isolation + FTS injection safety confirmed clean by both gates.

## Task + close commits
| Item | Commit | Description |
|------|--------|-------------|
| Plan + convergence | `4da6269` | docs(02-06): plan + convergence cycle 1 |
| T01 | `a8997a2` | feat(02-06/T01): OD-4 'query' trace widening + hybrid retriever retrieve.ts |
| T02 | `e3fc417` | feat(02-06/T02): hybrid retriever unit tests + adapter query-trace case |
| Pre-redeploy triage | `c89110e` | fix(02-06): batch /codex + /cso findings — query-leak redaction + topK NaN guard + voyage count check |
| Close docs | (this wave) | docs(02-06): SUMMARY + STATE/ROADMAP |

## Convergence (planning)
Internal **gsd-plan-checker (sonnet): APPROVED-WITH-NOTES** (1 HIGH + 2 MED + 3 LOW, all folded) → **Codex CLI cycle 1: current_high=0** (CONVERGED; 2 new MED/LOW folded — topK clamp, test harness). Full record in `02-REVIEWS.md`. All 3 founder guardrails verified at plan level: SCHEMA-LOCK (OD-1 Option A), NEW AI EGRESS (single chokepoint + PULL-OBS-COST-01-FORWARD deferred + tenant-scoped), MOCK-LIVE-DEPS.

## Founder-gated review (/codex + /cso) — completed 2026-06-01
Both gates ran on `1d72cb3..e3fc417` (code only) and were triaged into ONE pre-redeploy batch commit `c89110e` (branch-only, no deploy). Both agree on the same 4 issues.

- **/codex** (Codex CLI, read-only, high): **GATE FAIL — 2×P1, 2×P2.** Clean on RRF math, tenant predicates, RLS, FTS parameter binding. P1s = query-leak via DB error + Voyage error body; P2s = topK NaN bypass + missing per-input count validation. All 4 fixed.
- **/cso** (CSO audit, scoped --diff --code): **APPROVED-WITH-FIXES — 0 CRITICAL, 2 HIGH, 2 MED.** Confirmed /codex's two query-leak P1s AND extended the impact: the query lands in **Sentry unscrubbed** because `sentry-scrub.ts` redacts structured fields by key, never the exception `.value` message string. Flagged the Voyage **network-catch** path too (not just `:156`). CLEAN: cross-tenant isolation (account_id on both queries + RLS), FTS injection (bound params), Langfuse trace (no query text). Report at `.gstack/security-reports/20260601-cso-plan-02-06.json` (gitignored).

**Batch `c89110e` applied:** retrieve.ts DB block try/catch → redacted `AppError` (no query, no cause) [CSO-H1/codex-P1-1]; voyage.adapter.ts query-embed error redaction (network + body, status only, no cause) [CSO-H2/codex-P1-2] + `embeddings.length === texts.length` assertion → `VOYAGE_COUNT_MISMATCH` [CSO-M2/codex-P2-2]; `Number.isFinite(topK)` guard before clamp [CSO-M1/codex-P2-1]; tests retrieve (k)+(j NaN), adapter Case 10+11.

## Verify-loop (post-batch, branch-only close)
| # | Gate | Status | Evidence |
|---|------|--------|----------|
| 1 | `npm run typecheck` | **PASS** | tsc --noEmit clean |
| 2 | `npm run lint` | **PASS** | 0 errors, 10 pre-existing warnings (embed-memory.test.ts `_proj`/`_table`/`_pred` stubs) |
| 3 | `npm run check:banned` | **PASS** | "Banned-string check passed" |
| 4 | Schema-lock `git diff --quiet 29228e8 -- src/db/schema/` | **PASS** | exit 0 (byte-identical to baseline) |
| 5 | `npx drizzle-kit check` | **PASS** | "Everything's fine 🐶🔥" |
| 6 | `npx vitest run` (full) | **ACCEPTED-WITH-FOLLOWUP** | 308 pass / 2 fail. The 2 are the pre-existing FOLLOWUP-HARDCODED-DOMAIN-REGEX-01 (`checkout-session.test.ts:66` + `email.test.ts:56`, trochia.asranest regex over-fire) — D4 carve-out, not a 02-06 regression. Plan-02-06 specific: retrieve 12/12 + adapter 13/13 = 25/25. |

## Hand-off to Plan 02-07 (qa-rag + sidebar + OBS-COST-01 — the joint merge)
- **`hybridRetrieve(args, ctx)` is the read engine** — call with the Q&A request's `ctx.rls`; apply the 0.6-cosine "I don't know" floor against the returned `vectorScore`/`rrfScore` WITHOUT re-querying (OD-5).
- **PULL-OBS-COST-01-FORWARD lands here** — the $5/user/day cap must meter BOTH `src/ai/client.ts` (Anthropic synthesis) AND the single `voyage.embed` query-embed call site in retrieve.ts.
- **Flip `qa-grounding.ts`** from `'pending'` to real + remove `'qa-grounding'` from `PENDING_ALLOWED` (G-EVAL-1 → 0 pending) per the 02-05 hand-off.
- **DEPLOY-DEFERRED** — the read path debuts to prod in this 02-07 joint write+read+cost-cap merge; PR #7 flips DRAFT→ready then.

## Still-open follow-ups (carried)
- **FOLLOWUP-FTS-GIN-INDEX-01** (NEW) — stored `to_tsvector` GENERATED column + GIN index when a tenant's chunk count reaches thousands; lands WITH FOLLOWUP-DBDIFF-01 + a migration + prod schema re-deploy.
- **PULL-OBS-COST-01-FORWARD** — $5/user/day cap in the 02-07 joint merge.
- **FOLLOWUP-DBDIFF-01** — stays deferred (OD-1 Option A); activates at FOLLOWUP-FTS-GIN-INDEX-01.
- **Query-embed app-level cache** (optional) — normalized-query LRU to cut repeat read-path Voyage egress; revisit if 02-07 cost telemetry shows it material.
- **FOLLOWUP-HARDCODED-DOMAIN-REGEX-01** — the 2 pre-existing test failures; route through CCO/compliance before tightening.
- **FOLLOWUP-NODE-VERSION-SKEW-01** + **FOLLOWUP-SOURCEMAP-PROD-PUBLIC-HARDENING-01** — pre-first-prod-merge gates (unchanged).

## DEPLOY-DEFERRED note
No prod deploy at this close. 02-06 is branch-only on `phase-2-knowledge-layer`; PR #7 stays DRAFT; main untouched at `acfab36`. Both founder-gated reviews complete (above). The read path + write-path prod-debut + OBS-COST-01 cap ship together in the 02-07 joint merge.

## Self-Check: PASSED
- Both tasks (T01/T02) + the pre-redeploy batch map to commits; both gate verdicts recorded with finding→fix traceability.
- Verify-loop ran end-to-end; only failures are the documented pre-existing FOLLOWUP (D4 carve-out).
- Guardrails held: schema-lock exit 0 (OD-1 Option A); zero new deps; AI chokepoint intact (no @anthropic-ai/sdk, no getServiceClient in retrieve.ts); tenant-scoped (account_id on both queries + RLS); query text never in trace/log/error after the batch.
- Trochia voice held (operator register); banned-string check clean.
- DEPLOY-DEFERRED explicit; PR #7 DRAFT; main untouched.

---

*Authored 2026-06-01 by Claude Opus 4.8 (1M context) at Plan 02-06 close (branch-only). Predecessor: Plan 02-05 (eval harness, `1d72cb3`). Successor: Plan 02-07 (qa-rag + ambient Q&A sidebar + OBS-COST-01 — the joint write+read+cost-cap merge that takes the read path to prod).*
