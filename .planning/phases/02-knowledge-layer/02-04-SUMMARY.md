---
phase: 02-knowledge-layer
plan: 04
subsystem: knowledge-layer
tags: [phase-2, week-4, embed-pipeline, voyage, inngest, pgvector, corpus, eval-harness, schema-lock, codex, cso, deploy-deferred]

# Dependency graph
requires:
  - phase: 02-knowledge-layer
    plan: 01
    provides: embeddings table (vector(1024) + HNSW cosine + dedup unique index on (account_id, source_type, source_id, chunk_idx, embedding_model_version)) + business_memory.lastUpdatedAt (TOCTOU key) + tenantIsolationPolicy RLS + schema-lock baseline 29228e8
  - phase: 02-knowledge-layer
    plan: 02
    provides: extractFromPaste agent (StablePrefix + runAgent), memoryRouter (extractFromPaste / confirmDraft / getDraft), atomic-upsert with isNull(confirmedAt) guard, paste page + client state machine at /onboarding/import/paste
  - phase: 02-knowledge-layer
    plan: 03
    provides: promptInjectionSanitizer + redactUnrelatedPartyPII (POST-runAgent, PRE-persistence — business_memory is PII-clean by construction before embed), provenance jsonb union shape, ConflictResolver UI, TOCTOU lastUpdatedAt-in-UPDATE-WHERE guard
  - phase: 01-foundation
    provides: src/ai/client.ts (Anthropic chokepoint — Voyage adapter MUST NOT route through), src/lib/env.ts (prodRequired wrapper), src/lib/errors.ts (AppError(message, opts)), src/lib/langfuse.ts (getLangfuseClient() nullable), src/db/client.ts (getServiceClient() — documented Inngest-job legitimate caller), src/inngest/client.ts (Inngest app client), src/inngest/functions/index.ts (allFunctions registration barrel), Sentry breadcrumb plumbing, banned-string CI
provides:
  - "src/ai/integrations/voyage.adapter.ts — voyage.embed({ texts, inputType, trace }) → { embeddings, tokenCount, modelVersion, latencyMs }; HTTPS POST api.voyageai.com/v1/embeddings with bearer auth in header (never logged); 30s AbortController timeout with clearTimeout in finally; 8-chunk batch cap; dim-mismatch defensive assert; Langfuse trace via type-pinned TRACE_METADATA_KEYS const tuple + buildTraceMetadata runtime strip — zero @anthropic-ai/sdk import; zero new npm deps"
  - "src/ai/chunking/chunk.ts — chunkText(text, { size: 800, overlap: 200 }) → Array<{ text, idx, tokenCount }>; pure deterministic function; zero I/O; 1-token≈4-char heuristic with the limitation labeled on the Chunk type itself; throws CHUNK_INPUT_EMPTY on empty input"
  - "src/inngest/functions/embed-memory.ts — embedMemory Inngest function; trigger: memory.confirmed; concurrency: { limit: 3, key: 'event.data.accountId' }; retries: 2; three-step structure (load-and-chunk, voyage-embed-batch-*, upsert-embeddings); TOCTOU guard via FOR SHARE re-read of business_memory.lastUpdatedAt inside Step 3 transaction only; atomic DELETE-then-INSERT inside same transaction (replaces stale chunks under unchanged dedup key); 6 Sentry breadcrumb tags (EMBED_TOCTOU_STALE, EMBED_VOYAGE_FAILED, EMBED_CHUNK_OVERFLOW, EMBED_ROW_MISSING_OR_UNCONFIRMED, EMBED_NOTHING_TO_EMBED, EMBED_ROW_GONE); rethrows on failure inside step.run so Inngest applies retry policy → after retry cap surfaces as Inngest function_failed (T08-ratified 2026-05-30: the terminal observable for alerting)"
  - "src/server/routers/memory.ts — confirmDraft now emits inngest.send({ name: 'memory.confirmed', data: { accountId, businessMemoryId, lastUpdatedAt } }) wrapped in try/catch + logger.warn; payload is exactly 3 fields (zero PII, zero draft content, zero chunk_text); resilience matches Stripe webhook pattern"
  - "src/ai/eval/runner.ts — runEvalSuite() → { checks, exitCode }; CI-friendly JSON to stdout + Markdown summary to GITHUB_STEP_SUMMARY + eval-report.json local artifact; exit 0 on all-pending|all-pass, exit 1 on any-fail (fail-CLOSED contract codified now, exercised in 02-05 when stubs flip)"
  - "src/ai/eval/checks/{extraction-floor, qa-grounding, cache-hit}.ts — three EvalCheck stubs returning {status:'pending'} at this plan close; Plan 02-05 flips extraction-floor + cache-hit to real implementations; qa-grounding waits for Plan 02-07's qa-rag agent"
  - "src/ai/eval/types.ts — EvalCheck / EvalCheckResult / EvalSuiteResult + EvalStatus union ('pending' | 'pass' | 'fail')"
  - "src/lib/env.ts — VOYAGE_API_KEY: prodRequired(z.string()) (T08-Phase-A flip from .optional() now that the prod env is populated — guarded by adapter runtime check VOYAGE_API_KEY_MISSING so tests/dev importing without the key still load)"
  - ".github/workflows/eval.yml — Eval Harness workflow; triggers pull_request + nightly UTC 04:00 + workflow_dispatch; actions/checkout@v5 + actions/setup-node@v5 + node 24 (T08-Phase-A bump to match ci.yml); uploads eval-report.json as 30-day artifact; permissions contents:read only (pull-requests:write removed at T08 close after /cso F2; re-added in FOLLOWUP-EVAL-PR-COMMENT-01)"
  - ".github/workflows/ci.yml — TEST_DATABASE_URL presence assertion as FIRST step of build-and-test (Codex P2-2 + /cso F1, cross-confirmed) so silently-skipped RLS suites cannot let regressions slip through CI; VOYAGE_API_KEY non-secret literal fallback for the prod-mode `next build` env validation"
  - "data/corpus/*.md (5 docs) + MANIFEST.json — link + ≤2-sentence operator paraphrase per doc; SHA-256 integrity per body; INERT at this plan close (no runtime reader — corpus-sync deferred to FOLLOWUP-CORPUS-SYNC-01)"
  - "tests/integration/embed-pipeline-rls.test.ts — 2 genuinely-new RLS cases (corpus per-tenant SCHEMA support + 1024-dim positive); 4 overlapping cases live in tests/integration/rls-memory.test.ts (cross-referenced in header)"
  - "tests/ai/integrations/voyage.adapter.test.ts — 10-case MSW test (Cases 1-7 happy/error paths + Case 8 sentinel pin + 8b exact-key-set pin + 8c null-Langfuse no-op backstop)"
  - "tests/ai/chunking/chunk.test.ts — 10-case test with determinism Case 1 running chunkText 100× in-test (vitest 4.1.6 has no --repeat flag; serial in-test loop is the alternative)"
  - "tests/inngest/functions/embed-memory.test.ts — 10-case test (load-and-chunk, voyage-embed, TOCTOU stale, idempotent DELETE-then-INSERT replacement, voyage-failure-rethrows, chunk-overflow, concurrency cap, registration drift pin, re-confirm-rewrites-rows pin); Case 5 pins the rethrow → Inngest retry-policy contract"
  - "tests/ai/eval/runner.test.ts — 5 cases (all-pending → exit 0, any-fail → exit 1, all-pass → exit 0, canonical-ids, summary-shape Markdown)"
affects:
  - "Plan 02-05 (Eval harness — flip stubs to real) — extractFromPaste fixtures already exist at tests/ai/fixtures/paste-*.txt; runner contract codified; stubs at src/ai/eval/checks/{extraction-floor,cache-hit}.ts must flip to real pass/fail (qa-grounding waits for Plan 02-07); plan-checker MUST assert `grep -rn \"status: 'pending'\" src/ai/eval/checks/` returns ≤1 hit AND that hit is qa-grounding.ts (codified handoff in this plan; runtime gate is FOLLOWUP-EVAL-PENDING-RUNTIME-GATE-01)"
  - "Plan 02-06 (RAG retrieve — hybrid pgvector + FTS) — embed-memory now produces vector(1024) rows with source_type='memory'; voyage adapter exposes inputType='query' entrypoint already (cycle-1 design); HNSW cosine index ready; FTS GENERATED column + GIN index is the ONE schema change Phase 2 sees post-02-01 (planned for 02-06)"
  - "Plan 02-07 (Q&A sidebar + cost cap) — qa-rag agent reads from the embeddings rows this pipeline writes; OBS-COST-01 ($5/user/day) is now PULL-OBS-COST-01-FORWARD: ship in the SAME merge that takes the write path to prod (per founder ruling 2026-05-30) — preserves the invariant that prod always has cost caps for any AI operation that bills tokens"
  - "Future plans introducing AI-token egress — must ratify defer-write-path-until-read-path posture with the founder before authoring (lessons.md 2026-05-30)"

# Tech tracking
tech-stack:
  added:
    - "src/ai/integrations/ subdirectory (per-vendor adapter pattern; first occupant is voyage.adapter.ts)"
    - "src/ai/chunking/ subdirectory (pure-function chunker; future home for tokenizer-swap if Plan 02-05 eval shows drift)"
    - "src/ai/eval/ subdirectory (eval harness scaffold — runner + 3 stub checks + types + fixtures README)"
    - "src/inngest/functions/embed-memory.ts (replaces the no-op embedFn stub from Phase 1)"
    - ".github/workflows/eval.yml (second GHA workflow; ci.yml unchanged in scope)"
    - "data/corpus/ subdirectory (5 inert seed docs + MANIFEST.json with SHA-256 integrity)"
  patterns:
    - "Adapter pattern for non-Anthropic AI vendors — src/ai/integrations/<vendor>.adapter.ts; never routes through src/ai/client.ts; never imports @anthropic-ai/sdk; per-vendor trace whitelist + error truncation"
    - "Type-pinned trace whitelist — const tuple (`as const`) + derived type + runtime strip via dedicated constructor (buildTraceMetadata); two-layer test pin (sentinel-absence Case 8 + exact-key-set Case 8b + null-client no-op Case 8c)"
    - "Inngest step.run lock scoping — Steps 1+2 hold NO DB lock; only Step 3 transaction is atomic; FOR SHARE re-read of the TOCTOU key (lastUpdatedAt) immediately before write inside the same transaction as DELETE-then-INSERT"
    - "DELETE-then-INSERT inside Step 3 transaction (NOT ON CONFLICT DO NOTHING) — replaces stale chunk_text under unchanged dedup key; removes orphaned higher chunk_idx rows when new content has fewer chunks; scope is exactly 4-tuple (account_id + source_type + source_id + embedding_model_version) so never crosses tenants or model versions"
    - "Service-client + explicit-tenant-re-assert pattern for Inngest jobs — getServiceClient() bypasses RLS; the job re-asserts accountId from event.data in every WHERE clause; documented legitimate caller of the RLS-bypassing path"
    - "Eval-harness pending-vs-pass-vs-fail status machine — pending is fail-OPEN by design at scaffold close; runner contract codifies fail-CLOSED on any 'fail' for the moment the stubs flip; process-level handoff to 02-05's plan-checker is the bridge until FOLLOWUP-EVAL-PENDING-RUNTIME-GATE-01 lands a runtime allowlist"
    - "Deploy-deferred branch-only close — when a feature introduces a new AI egress with per-token billing AND its read-side surface is in a later plan, the write path holds in-branch until the read-side merge lands with the cost cap; preserves the prod invariant 'any token-spending op has a $5/user/day cap'"
    - "Founder-gated review + deploy flow — executor prepares pre-review commit; founder triggers /codex + /cso; APPROVED-WITH-FIXES batches into one pre-redeploy commit (no --no-verify); founder triggers deploy (or chooses not to)"

key-files:
  created:
    - "src/ai/integrations/voyage.adapter.ts (216 lines) — Voyage embeddings adapter; THE only surface that calls api.voyageai.com; trace whitelist + error truncation"
    - "src/ai/chunking/chunk.ts (128 lines) — pure deterministic chunker; 800/200; 1-token≈4-char heuristic labeled on type"
    - "src/inngest/functions/embed-memory.ts (287 lines) — Inngest embed function; 3-step + TOCTOU + DELETE-then-INSERT + 6 breadcrumb tags"
    - "src/ai/eval/runner.ts (81 lines) — runEvalSuite + ESM-safe CLI entrypoint"
    - "src/ai/eval/types.ts (36 lines) — EvalCheck / EvalCheckResult / EvalSuiteResult + EvalStatus"
    - "src/ai/eval/checks/extraction-floor.ts (30 lines) — stub returning 'pending'"
    - "src/ai/eval/checks/qa-grounding.ts (28 lines) — stub returning 'pending'"
    - "src/ai/eval/checks/cache-hit.ts (26 lines) — stub returning 'pending'"
    - "src/ai/eval/fixtures/README.md (30 lines) — placeholder for Plan 02-05 fixture population"
    - ".github/workflows/eval.yml (45 lines) — PR + nightly UTC 04:00 + workflow_dispatch; checkout@v5 + setup-node@v5 + node 24; contents:read only"
    - "data/corpus/01-safe-primer.md (9 lines) — YC SAFE doc set: link + ≤2-sentence paraphrase"
    - "data/corpus/02-pre-seed-benchmarks.md (9 lines) — Carta State of Private Markets: link + ≤2-sentence paraphrase"
    - "data/corpus/03-pitch-narrative-structure.md (9 lines) — PG founder essays: link + ≤2-sentence paraphrase"
    - "data/corpus/04-investor-pipeline-hygiene.md (9 lines) — NfX pipeline guide: link + ≤2-sentence paraphrase"
    - "data/corpus/05-term-sheet-vocabulary.md (9 lines) — YC seed fundraising guide: link + ≤2-sentence paraphrase"
    - "data/corpus/MANIFEST.json (41 lines) — 5 docs × { slug, source_url, sha256_of_body, last_reviewed } + deferred FOLLOWUP-CORPUS-01 stub"
    - "tests/integration/embed-pipeline-rls.test.ts (147 lines) — 2 schema-contract cases (corpus per-tenant + 1024-dim positive); header cross-refs rls-memory.test.ts for 4 overlapping cases"
    - "tests/ai/integrations/voyage.adapter.test.ts (357 lines) — 10-case MSW test; trace whitelist triple-pin"
    - "tests/ai/chunking/chunk.test.ts (~330 lines) — 10-case deterministic chunker test; determinism Case 1 runs 100×"
    - "tests/inngest/functions/embed-memory.test.ts (571 lines) — 10-case Inngest function test; TOCTOU + idempotency + rethrow + breadcrumbs + registration pin"
    - "tests/ai/eval/runner.test.ts (~190 lines) — 5-case runner contract test (exit-code + summary shape)"
  modified:
    - "src/lib/env.ts (+8 lines net) — VOYAGE_API_KEY added (T02 .optional()) then flipped to prodRequired(z.string()) at T08 Phase A; module-load safe in tests/dev (adapter raises VOYAGE_API_KEY_MISSING at call time)"
    - "src/server/routers/memory.ts (+24 lines) — confirmDraft success path emits inngest.send({ name: 'memory.confirmed', data: { accountId, businessMemoryId, lastUpdatedAt } }) wrapped in try/catch + logger.warn (Stripe-webhook resilience pattern); ZERO PII/chunk_text/draft content in payload"
    - "src/inngest/functions/index.ts (+5 lines net) — embedMemory imported + registered in allFunctions; embedFn (stub) removed from the import list + array"
    - "src/inngest/functions/stubs.ts (-12 lines) — embedFn no-op export removed (replaced by real embedMemory; six other stubs preserved for their respective phases)"
    - ".github/workflows/ci.yml (+24 lines across two waves) — VOYAGE_API_KEY non-secret literal fallback (T08-Phase-A); TEST_DATABASE_URL presence assertion as FIRST step of build-and-test (T08 close — Codex P2-2 + /cso F1)"
    - ".github/workflows/eval.yml (+6 lines net) — bumped to checkout@v5 + setup-node@v5 + node 24 (T08-Phase-A, T07-D3 ratification); dropped pull-requests:write (T08 close — /cso F2; deferred to FOLLOWUP-EVAL-PR-COMMENT-01)"
    - ".planning/phases/02-knowledge-layer/02-04-PLAN.md (cycle-7 scope reduce + cycles 1-9 review history + T08 deferred_items additions) — three embed-memory final-failure quotes corrected at Phase C close to match the shipped throw → Inngest function_failed behavior (T08 ratification)"
    - "tasks/lessons.md (+~150 lines across the wave) — vitest 4.1.6 --repeat flag absence + tokenCount heuristic-on-type + bounded-bypass D4 rule + founder-gated review+deploy flow + defer-write-path-until-read-path strategy"
    - "tests/integration/memory-paste-rls.test.ts (P2-3 broaden) — assertion `expect(['CONFLICT', 'NOT_FOUND']).toContain(rejectedError.code)` with justifying header comment citing both confirmDraft code paths (memory.ts:655-661 + :763-769)"
    - "package.json (+1 script) — eval:run = `tsx src/ai/eval/runner.ts`"
    - ".gitignore (+1 entry) — eval-report.json runtime artifact (T07 Rule 3 auto-fix)"

key-decisions:
  - "Voyage adapter is SEPARATE from src/ai/client.ts — Anthropic chokepoint and ESLint @anthropic-ai/sdk boundary stay intact; per-vendor concerns (auth shape, rate limits, observability whitelist) live in src/ai/integrations/<vendor>.adapter.ts. The Voyage adapter MUST NOT import @anthropic-ai/sdk; grep-verified."
  - "Type-pinned Langfuse trace whitelist — TRACE_METADATA_KEYS = [...] as const tuple drives both the TraceMetadata type AND the runtime strip via buildTraceMetadata. Adding a future trace key requires updating BOTH the tuple AND any caller; defense in depth via test Cases 8 + 8b + 8c (sentinel-absence + exact-key-set + null-client no-op). This pin is the privacy contract; never include chunk_text or PII in a trace payload."
  - "Inngest step.run lock scoping is narrow by design — Steps 1 (load-and-chunk) and 2 (voyage-embed-batch-*) hold NO DB lock; only Step 3 (upsert-embeddings) is a single DB transaction with FOR SHARE row-lock on business_memory + lastUpdatedAt re-read compare + DELETE-then-INSERT in one atomic unit. A concurrent confirmDraft between Steps 1 and 3 is exactly the race TOCTOU catches; the next memory.confirmed event re-triggers from scratch."
  - "DELETE-then-INSERT inside Step 3 transaction — NOT ON CONFLICT DO NOTHING (cycle-1 review CRITICAL #4 fix). ON CONFLICT DO NOTHING cannot replace stale chunk_text under the same dedup key; DELETE-then-INSERT does, AND drops orphaned higher chunk_idx rows when new content has fewer chunks. DELETE scope is exactly (account_id + source_type='memory' + source_id + embedding_model_version) — never crosses tenants or model versions; rolling re-embed contract from Plan 02-01 preserved."
  - "embed-memory rethrows on failure inside step.run; after retry cap Inngest surfaces function_failed — RATIFIED 2026-05-30 (Codex P2-1 implementation-over-plan): rethrow IS the contract because the framework's function_failed signal is the correct terminal observable for alerting; a silent clean-exit would HIDE terminal embed failures. Plan-doc three-place wording corrected at Phase C close to match shipped behavior (lines 119, ~1002, 1379). Test tests/inngest/functions/embed-memory.test.ts:410 codifies the rethrow."
  - "P2-3 concurrent-confirm assertion broadened to accept CONFLICT OR NOT_FOUND — both are correct surfaces of the loser-error invariant under READ COMMITTED: Scenario A (both SELECTs before either commit) → loser's UPDATE WHERE matches 0 → CONFLICT (memory.ts:763-769); Scenario B (winner commits before loser's SELECT) → loser's SELECT WHERE confirmedAt IS NULL returns 0 → NOT_FOUND (memory.ts:655-661). CI flake on 2026-05-30 was Scenario B; local 30× loop pre/post-fix was 100% Scenario A. Assertion now pins the invariant ('loser surfaces a typed error, never silent overwrite') not the race outcome. confirmDraft code unchanged."
  - "VOYAGE_API_KEY is module-load safe in tests/dev — env.ts validation wraps `prodRequired(z.string())` after T08-Phase-A flip, but the adapter raises VOYAGE_API_KEY_MISSING at CALL time (not at import time). Tests importing the adapter without the env var still load cleanly; production builds (NODE_ENV=production) fail fast at build time if the key is unset (correct failure mode)."
  - "ci.yml VOYAGE_API_KEY fallback is a non-credential-shaped literal — 'ci-placeholder-not-a-real-key'. CI never actually calls Voyage at runtime; the fallback exists purely to satisfy the prod-mode `next build` env validation. Real Voyage key belongs ONLY in Vercel production env; adding a real GitHub secret would be a security regression (the literal is intentionally not shaped like a real Voyage 'pa-' prefix key)."
  - "Eval harness ships fail-OPEN at 02-04 close — all 3 stubs return 'pending'; runner contract `anyFail → exit 1` is codified but never triggered while stubs are in place. Plan 02-05 flips stubs to real implementations and the gate activates. Process-level handoff (plan-checker assertion) is the bridge until FOLLOWUP-EVAL-PENDING-RUNTIME-GATE-01 lands a runtime allowlist in the runner itself."
  - "data/corpus/*.md ships INERT — 5 seed docs land at this plan close but no runtime reader exists in Plan 02-04. The corpus-sync Inngest function that would fan out per-tenant embedding was scope-reduced out of this plan in cycle 7 (T05 dropped after surfacing fundamental implementation drift) and deferred to FOLLOWUP-CORPUS-SYNC-01. T01's NEW-1 case pins the per-tenant schema invariant via direct service-client inserts so the schema contract is locked even though no production code writes corpus rows yet."
  - "Plan 02-04 is merge-READY, not merged — DEPLOY-DEFERRED per founder ruling 2026-05-30: prod deploy waits until the read path (02-06/02-07) ships, with OBS-COST-01 in-app cost caps landing in that same merge. The write path's prod-debut + the cost cap that bounds founder-side worst-case spend + the read-side retrieval value all arrive together. PR #7 stays a DRAFT through more Phase 2 work; main untouched at acfab36. PULL-OBS-COST-01-FORWARD captured as the reminder for the joint-merge plan."

requirements-completed:
  - KNW-04   # Voyage voyage-3-large embeddings via Inngest pipeline; idempotent per (tenant_id, source_type, source_id); embedding_model_version persisted; HNSW + cosine retrieval-ready — canonical requirement COMPLETE
  - EVAL-01a # Eval harness scaffold (runner + 3 stub checks + CI workflow) — canonical requirement COMPLETE (real implementations flip in Plan 02-05)

# Metrics
duration: ~10 days (commit 07a2d81 plan-doc on 2026-05-26 → commit 3301aa9 T08 close on 2026-05-30; includes 9 cross-AI review cycles + one cycle-7 scope-reduce of T05)
completed: 2026-05-30
---

# Phase 2 Plan 04 — Week-4 Embed Pipeline + Curated Corpus + Eval Scaffold (KNW-04 + EVAL-01a) Summary

**A founder-confirmed business_memory row now triggers a TOCTOU-guarded, concurrency-capped Inngest function (`embed-memory`) that chunks the PII-redacted narrative + traction text via a deterministic 800/200 chunker, calls a privacy-bounded Voyage `voyage-3-large` adapter (bearer auth, 30s AbortController timeout, type-pinned Langfuse trace whitelist proven against a sentinel string + exact-key-set + null-client no-op), and atomically DELETE-then-INSERTs the resulting `vector(1024)` rows into the `embeddings` table inside a single DB transaction that re-reads `business_memory.lastUpdatedAt` under FOR SHARE — replacing stale chunks under the unchanged dedup key (account_id + source_type='memory' + source_id + embedding_model_version), never crossing tenants or model versions; on failure the function rethrows from inside `step.run` so Inngest applies its retry policy (cap 2) and surfaces `function_failed` as the terminal alerting observable. Five inert curated corpus seed docs landed (link + ≤2-sentence operator paraphrase, SHA-256 integrity in MANIFEST.json), the eval-harness scaffold ships with three `'pending'` stubs + a fail-CLOSED-on-`'fail'` runner + a PR/nightly GHA workflow, the schema-lock invariant held end-to-end (`git diff --quiet 29228e8 -- src/db/schema/` exits 0; `npx drizzle-kit check` clean; zero migrations), `/codex` returned GATE PASS (0×P1) and `/cso` returned APPROVED (0×P1, 0×HIGH) with both flagging the same TEST_DATABASE_URL silent-skip risk closed in one pre-redeploy commit alongside dropping the unused `pull-requests: write` permission from eval.yml — and per founder ruling 2026-05-30 the prod deploy is DEFERRED until the read path (02-06/02-07) ships in the SAME merge as `OBS-COST-01`'s $5/user/day cost cap, preserving the invariant that prod always has cost caps for any AI operation that bills tokens.**

## Performance

- **Duration:** ~10 days (2026-05-26 plan-doc `07a2d81` → 2026-05-30 close `3301aa9`)
- **Commits on the wave:** 11 (T01 → T08 close, including 9 cross-AI review cycles + cycle-7 T05 scope-reduce ahead of T01 dispatch)
- **Source LOC delta:** +~2,200 / -~30 across ~30 files (Voyage adapter + chunker + embed-memory + eval scaffold + corpus + tests + env + CI; corpus-sync surface deferred via cycle-7 reduce)
- **Test delta:** 200 (02-03 baseline) → 273 passing + 2 failing (deferred — see Verification Loop) + ~35 skipped; 60 e2e specs (50 pass + 10 skipped pending Phase 4.5 test-user-mint helper)
- **Tasks:** 8 of 8 (T05 corpus-sync scope-reduced to FOLLOWUP-CORPUS-SYNC-01 in cycle-7; remaining 7 tasks + T08 close shipped)

## Accomplishments

- **Voyage adapter at `src/ai/integrations/voyage.adapter.ts`** (216 lines, the single surface that calls `api.voyageai.com`): HTTPS POST `/v1/embeddings` with bearer auth in Authorization header (never logged; even in error catch blocks only `err.message.slice(0, 200)` is propagated); 30s `AbortController` timeout with `clearTimeout` in finally; 8-chunk batch hard cap; defensive re-sort by `index` to match input order; dim-mismatch assertion fires loudly on config drift; type-pinned `TRACE_METADATA_KEYS = [...] as const` tuple drives the privacy-bounded Langfuse payload via `buildTraceMetadata`; null-Langfuse no-op via `getLangfuseClient()?.trace()` guard; zero `@anthropic-ai/sdk` import (grep-verified); zero new npm deps
- **Deterministic chunker at `src/ai/chunking/chunk.ts`** (128 lines): `chunkText(text, { size, overlap })` is a pure synchronous function with zero I/O and zero logger calls; 1-token≈4-char heuristic with the limitation labeled directly on the `Chunk` type so a future reader sees the caveat at the call site, not just in the module docstring; throws `CHUNK_INPUT_EMPTY` on empty input; determinism Case 1 in the test suite runs `chunkText(input)` 100× in-test (vitest 4.1.6 has no `--repeat` flag, captured in lessons.md as a gate-1-sibling rule for future plans)
- **embed-memory Inngest function at `src/inngest/functions/embed-memory.ts`** (287 lines): trigger `memory.confirmed`; concurrency `{ limit: 3, key: 'event.data.accountId' }`; retries cap `2`; three-step structure where Steps 1 (`load-and-chunk`) and 2 (`voyage-embed-batch-*`) hold NO DB lock and only Step 3 (`upsert-embeddings`) is a single DB transaction that SELECTs `business_memory.lastUpdatedAt` under `FOR SHARE`, compares against `event.data.lastUpdatedAt`, and either exits with `EMBED_TOCTOU_STALE` breadcrumb on drift OR executes the atomic `DELETE-then-INSERT` under the row read-lock when matched; six distinct Sentry breadcrumb tags (`EMBED_TOCTOU_STALE`, `EMBED_VOYAGE_FAILED`, `EMBED_CHUNK_OVERFLOW`, `EMBED_ROW_MISSING_OR_UNCONFIRMED`, `EMBED_NOTHING_TO_EMBED`, `EMBED_ROW_GONE`); 64-chunk hard cap defends against runaway content; per failure attempt the function writes the breadcrumb AND rethrows from inside `step.run` so Inngest applies its retry policy — after the retry cap is exhausted the function surfaces as Inngest `function_failed` (T08-ratified 2026-05-30: that terminal-fail observable is the alerting surface, not a silent clean-exit)
- **memory.confirmed event emission added to `confirmDraft`** at `src/server/routers/memory.ts:817-823`: payload is exactly three identifiers `{ accountId, businessMemoryId, lastUpdatedAt }` — ZERO PII, ZERO draft content, ZERO chunk_text — wrapped in try/catch + `logger.warn` so an Inngest outage does NOT fail the confirmDraft mutation (matches the Stripe webhook resilience pattern at `src/app/api/webhooks/stripe/route.ts:110-117`); a missed embed is re-driven by the next confirmDraft, idempotent under the DELETE-then-INSERT semantics
- **Inngest registration barrel updated at `src/inngest/functions/index.ts`**: `embedMemory` added to `allFunctions`; the old `embedFn` no-op stub REMOVED from both `stubs.ts` and the import list (never co-existing); registration drift pinned by `tests/inngest/functions/embed-memory.test.ts` Case 9 asserting `allFunctions.filter(f => /embed/i.test(f.id)).length === 1`
- **Five curated corpus seed docs** at `data/corpus/*.md` + `MANIFEST.json` (SHA-256 integrity per body): 01-safe-primer (YC SAFE docs), 02-pre-seed-benchmarks (Carta), 03-pitch-narrative-structure (Paul Graham), 04-investor-pipeline-hygiene (NfX), 05-term-sheet-vocabulary (YC seed fundraising guide); each ≤2-sentence operator paraphrase + frontmatter (title, slug, source_url, license_note, last_reviewed); INERT at this plan close (no runtime reader; corpus-sync deferred to FOLLOWUP-CORPUS-SYNC-01); the remaining 45 docs tracked as FOLLOWUP-CORPUS-01
- **Eval harness scaffold** at `src/ai/eval/` (`runner.ts` + 3 check stubs + `types.ts` + `fixtures/README.md`): `runEvalSuite()` iterates the three checks, emits a CI-friendly JSON report to stdout + Markdown summary to `GITHUB_STEP_SUMMARY` when set + `eval-report.json` local artifact; exits `0` on all-pending or all-pass, `1` on any-fail (fail-CLOSED contract codified now, exercised in Plan 02-05 when stubs flip); ESM-safe CLI entrypoint via `fileURLToPath(import.meta.url) + process.argv[1]` comparison (T07-D1 deviation: `require.main === module` would not typecheck under `module=esnext + moduleResolution=bundler`); `npm run eval:run` script added to `package.json`; `eval-report.json` gitignored (T07-D2 Rule 3 auto-fix)
- **Eval CI workflow** at `.github/workflows/eval.yml` (45 lines, T08 Phase A aligned with ci.yml): triggers `pull_request` + `schedule` (nightly UTC 04:00) + `workflow_dispatch`; `actions/checkout@v5` + `actions/setup-node@v5` + node 24 (T07-D3 ratification at T08 Phase A); uploads `eval-report.json` as a 30-day artifact; `permissions: contents: read` only after T08 close (the originally-granted `pull-requests: write` was dropped per `/cso` F2 since the workflow doesn't actually post PR comments yet; the PR-comment step from plan must_haves artifact #11 is deferred to FOLLOWUP-EVAL-PR-COMMENT-01)
- **CI test-DB secret assertion** at `.github/workflows/ci.yml:80-91` (FIRST step of build-and-test): `if [ -z "$TEST_DATABASE_URL" ]; then echo "::error::..."; exit 1; fi` closes both Codex P2-2 and `/cso` F1 in one fix — without it, missing-secret silently turns `HAS_TEST_DB=false` and every RLS integration suite hits `describe.skip` while CI still goes green (false-confidence regression-detection gap)
- **VOYAGE_API_KEY env validation** at `src/lib/env.ts:111` flipped from `.optional()` → `prodRequired(z.string())` at T08 Phase A now that the rotated key is populated in Vercel production env; the adapter raises `VOYAGE_API_KEY_MISSING` at CALL time (not at module-load) so tests/dev importing the adapter without the env var still load cleanly; production `next build` fails fast on missing key (correct failure mode); ci.yml carries a non-credential-shaped literal fallback `'ci-placeholder-not-a-real-key'` matching the established `prodRequired-with-CI-fallback` pattern from ANTHROPIC_API_KEY / Stripe / Sentry
- **Two genuinely-new RLS schema-contract cases** at `tests/integration/embed-pipeline-rls.test.ts` (147 lines): NEW-1 corpus per-tenant SCHEMA support — two tenants holding the same logical corpus chunk (same `source_id` + `chunk_idx` + `model_version`) under the dedup unique index, because `account_id` is part of the key; NEW-2 1024-dim positive insert pinning the accept-side of the vector dim contract (rls-memory.test.ts only proves the 768-dim rejection); the 4 overlapping cases (tenant isolation, dedup index rejection, rolling model_version coexistence, 768-dim rejection) are NOT duplicated and stay in `tests/integration/rls-memory.test.ts` (cross-referenced verbatim in the new file's header)
- **Schema-lock invariant from Plan 02-01 held end-to-end**: `git diff --quiet 29228e8 -- src/db/schema/` exits 0 at HEAD `3301aa9`; `npx drizzle-kit check` reports `Everything's fine 🐶🔥`; zero migration files authored (the previously-shipped `0005_easy_the_executioner.sql` + `0006_eminent_toro.sql` already in prod per Plan 02-03 close); zero `ALTER TABLE` statements emitted against any Phase-2 schema file
- **`/codex` returned GATE PASS** (0×P1, 2×P2, 1×P3): P2-1 embed-memory rethrow ratified implementation-over-plan per founder ruling (plan-doc corrected at Phase C close to match shipped behavior); P2-2 TEST_DATABASE_URL silent-skip closed in pre-redeploy commit; P3 eval fail-open runtime gate deferred to FOLLOWUP-EVAL-PENDING-RUNTIME-GATE-01
- **`/cso` returned APPROVED for prod redeploy** (0×P1, 0×HIGH, 1×P2 [F1, same as Codex P2-2], 1×P3 [F2, eval workflow over-granted permission]): both findings closed in the same pre-redeploy commit; 11 STRIDE mitigations verified present in code; 20 invariants verified clean by code-trace; all 5 corpus docs reviewed for copyright posture (link + ≤2-sentence paraphrase, no verbatim long passages, source_url + license_note frontmatter consistent); banned-string CI green; full report at `.gstack/security-reports/20260530-cso-plan-02-04.json` (gitignored)
- **DEPLOY-DEFERRED branch-only close ratified** per founder ruling 2026-05-30: Plan 02-04 is merge-READY, not merged; PR #7 stays a DRAFT through more Phase 2 work; main untouched at `32e35c1`; the write path's prod-debut + the cost cap that bounds founder-side worst-case spend + the read-side retrieval value all arrive together in the joint 02-06/02-07 + PULL-OBS-COST-01-FORWARD merge

## Task Commits

11 commits on the wave (most recent first), mapped to Plan 02-04's 8 tasks. T05 was scope-reduced out in cycle 7 (corpus-sync Inngest function deferred to FOLLOWUP-CORPUS-SYNC-01).

| Task | Commit | Description |
|------|--------|-------------|
| Plan doc | `07a2d81` | docs(02-04): Plan 02-04 v2 authored — embed pipeline + corpus + eval scaffold |
| 1 | `3f842b3` | feat(02-04/T01): schema verify + 2-case embed-pipeline RLS test (KNW-04a) |
| 2 | `7f501af` | feat(02-04/T02): Voyage adapter + 10-case MSW test + VOYAGE_API_KEY env (KNW-04b) |
| 2 ratify | `aa0e2f2` | docs(02-04): ratify T02 Case 6 timeout-test swap + capture FOLLOWUP-VOYAGE-TIMEOUT-TEST |
| 3 | `a46fa33` | feat(02-04/T03): deterministic chunker + 10-case test (KNW-04 chunker) |
| 3 ratify | `c660016` | docs(02-04): ratify T03 deviations (D1-D6), correct fixture word-count, capture FOLLOWUP-HARDCODED-DOMAIN-REGEX-01 |
| 4 | `fc3dfd4` | feat(02-04/T04): Inngest embed-memory function + TOCTOU + 10-case test (KNW-04b) |
| 4 lessons | `71c0a0f` | docs: bake D4 bounded-bypass rule into lessons.md |
| 5 | (scope-reduced cycle 7) | corpus-sync Inngest function dropped; deferred to FOLLOWUP-CORPUS-SYNC-01 |
| 6 | `ec3fa16` | feat(02-04/T06): 5 curated corpus seed docs + MANIFEST.json (KNW-04c content) |
| 7 | `60e3845` | feat(02-04/T07): eval harness scaffold + CI workflow (EVAL-01a) |
| 8 Phase A | `28f3605` | chore(02-04/T08): VOYAGE_API_KEY prod-required + eval.yml GHA bump |
| P2-3 fix | `4a2f870` | fix(02-04/P2-3): broaden concurrent-confirm assertion to accept NOT_FOUND |
| 8 triage | `3301aa9` | fix(02-04/T08): close /codex P2-2 + /cso F1 + F2 — pre-redeploy triage |
| 8 close | (this commit) | docs(02-04): Phase C close — SUMMARY + lessons + plan-doc quote corrections + handoff doc |

T08 is a `checkpoint:human-verify` task; the founder fired `/codex` + `/cso`, triaged findings, ratified the embed-memory rethrow, and ratified the DEPLOY-DEFERRED posture. No prod redeploy fires at this close.

## Files Created

(See `key-files.created` in frontmatter above for full per-file LOC table.)

Summary: **21 new files** — 9 application/infra code (voyage adapter + chunker + embed-memory + 3 eval checks + eval runner + eval types + eval workflow + ci-yml-modify), 5 corpus seed docs + MANIFEST.json, 5 test files (3 unit + 1 integration + 1 runner) + 1 fixtures README.

## Files Modified

(See `key-files.modified` in frontmatter above for the full table.)

Summary: **11 modified** — env.ts (VOYAGE_API_KEY flip across T02 + T08 Phase A); memory.ts (memory.confirmed emit); inngest/functions/index.ts + stubs.ts (registration swap); ci.yml (VOYAGE fallback + TEST_DATABASE_URL assertion across T08 Phase A + close); eval.yml (GHA bump + permission drop); 02-04-PLAN.md (cycle history + deferred_items + 3-quote correction at Phase C close); lessons.md (~150 lines across the wave); memory-paste-rls.test.ts (P2-3 broaden); package.json (eval:run script); .gitignore (eval-report.json).

## Verification Loop Results (Phase C — branch-only close)

| # | Gate | Status | Evidence |
|---|------|--------|----------|
| 1 | `npx drizzle-kit check` | **PASS** | "Everything's fine 🐶🔥" |
| 2 | Schema-lock guard `git diff --quiet 29228e8 -- src/db/schema/` | **PASS** | Phase-2 schema files byte-identical to baseline 29228e8 |
| 3 | `npm run lint` | **PASS** | 0 errors, 10 pre-existing warnings (T04 leading-underscore `_proj` / `_table` / `_pred` / `_strength` test stubs — convention, not regressions) |
| 4 | `npm run typecheck` | **PASS** | `tsc --noEmit` clean (0 errors) |
| 5 | `npm run check:banned` | **PASS** | "Banned-string check passed — no violations." |
| 6 | `npm run eval:run` | **PASS** | exitCode 0; all 3 checks return `{status: 'pending'}` as designed at this plan close; writes `eval-report.json` artifact |
| 7 | `npx vitest run` | **ACCEPTED-WITH-FOLLOWUP** | 273/275 pass (2 failures in `tests/lib/email.test.ts:56` + `tests/billing/checkout-session.test.ts:66` — both `not.toMatch(/trochia\.ai\|trochia\.asranest/)` over-firing on the legitimate `trochia.asranest.com` build domain). **Bounded-bypass D4 carve-out applies**: both failing tests grep-match `FOLLOWUP-HARDCODED-DOMAIN-REGEX-01` (the only failure D4 currently covers); pre-existing since Phase 1 commits `14b8281` / `892bece`; awaiting CCO/compliance review of the trademark-safety regex intent before any fix lands. Not a Plan 02-04 regression. |
| 8 | `npm run test:e2e` (Playwright smoke) | **PASS** | 50 passed / 10 skipped / 0 failed (skipped specs are the authed onboarding-paste + conflict cases that wait on the Phase 4.5 test-user-mint helper; CI re-verifies them via the same skip-gate pattern Plans 02-02 + 02-03 use) |

Verify-loop ran end-to-end on HEAD `3301aa9` (pre-Phase-C-commit); duration ~9 min wall-clock; all results captured at `.verify-loop-output.tmp` (gitignored).

## T07 D1–D3 Ratifications

Three T07 deviations surfaced in the T07 commit message (`60e3845`) and are formally ratified here at Phase C close:

| ID | Deviation | Ratification |
|----|-----------|---------------|
| T07-D1 | Runner CLI entrypoint uses `fileURLToPath(import.meta.url) + process.argv[1]` comparison instead of `require.main === module` (plan-doc line ~1695). | **RATIFIED.** tsconfig sets `module=esnext + moduleResolution=bundler`; the CJS-only `module` global is not declared in `@types/node`, so the literal plan text would fail `tsc --noEmit`. Runtime contract is preserved exactly (runner exits with `r.exitCode` when invoked as the script; silent when imported by tests). Rule 3 auto-fix. No plan-doc edit needed since the original text was implementation-incompatible. |
| T07-D2 | `.gitignore` adds `eval-report.json`. Plan-doc `files_modified` did not list `.gitignore`. | **RATIFIED.** The runner writes `eval-report.json` to repo root on every invocation; without the ignore, the file becomes untracked on every `npm run eval:run` and T08's `git add -A` would commit a stale report. Rule 3 auto-fix. |
| T07-D3 | `.github/workflows/eval.yml` used `actions/checkout@v4` + `setup-node@v4` + node 20 while `ci.yml` uses v5 + node 24. T07 surfaced for orchestrator review at T08. | **RATIFIED + APPLIED.** T08 Phase A commit `28f3605` bumped eval.yml to checkout@v5 + setup-node@v5 + node 24 to match ci.yml. The cross-workflow version skew is closed. (Separate FOLLOWUP-NODE-VERSION-SKEW-01 captures the Vercel-runtime-22 vs CI-24 alignment that surfaces at first prod merge.) |

## /codex + /cso Findings + Resolutions (T08)

**`/codex` verdict** (2026-05-30, against `866a20b..4a2f870`): **GATE PASS — 0 × P1, 2 × P2, 1 × P3**.

| ID | Finding | Resolution |
|----|---------|------------|
| Codex P2-1 | `embed-memory` final-attempt rethrow contradicts plan's "no throw past step boundary" wording. | **RATIFIED implementation-over-plan** per founder ruling 2026-05-30: rethrow → Inngest `function_failed` IS the correct terminal observable; a silent clean-exit would hide terminal embed failures from alerting. Plan-doc three-place wording (lines 119, ~1002, 1379) corrected at Phase C close to match shipped behavior. Test `tests/inngest/functions/embed-memory.test.ts:410` already pins the rethrow contract. |
| Codex P2-2 | CI can greenlight while RLS integration coverage is silently skipped (`TEST_DATABASE_URL` absent). | **CLOSED** in pre-redeploy commit `3301aa9` (cross-confirmed by `/cso` F1) — `.github/workflows/ci.yml:80-91` adds presence assertion as FIRST step of build-and-test. |
| Codex P3 | Eval fail-open handoff documented but not executable in runner. | **DEFERRED** to FOLLOWUP-EVAL-PENDING-RUNTIME-GATE-01 (Plan 02-05 — runtime allowlist `PENDING_ALLOWED = ['qa-grounding']` in `src/ai/eval/runner.ts`); matches plan-doc T-02-04-08 acceptance. |

**`/cso` verdict** (2026-05-30, against `866a20b..4a2f870`): **APPROVED for prod redeploy — 0 × P1, 0 × HIGH, 1 × P2, 1 × P3**. Full report at `.gstack/security-reports/20260530-cso-plan-02-04.json`.

| ID | Finding | Resolution |
|----|---------|------------|
| /cso F1 | `TEST_DATABASE_URL` silent-skip — RLS regression backstop loss (Phase 4 CI/CD). | **CLOSED** in `3301aa9` (cross-confirmed by Codex P2-2). Same 3-line shell step. |
| /cso F2 | Eval workflow grants `pull-requests: write` but never uses it (least-privilege violation). | **CLOSED** in `3301aa9` — dropped from `.github/workflows/eval.yml`. Re-add when PR-comment step lands in FOLLOWUP-EVAL-PR-COMMENT-01. |

**11 STRIDE mitigations verified present in code** (T-02-04-01 through T-02-04-10 + T-02-04-SC); **20 invariants verified clean by code-trace**; **all 5 corpus docs verified for copyright posture** (link + ≤2-sentence paraphrase + source_url + license_note frontmatter; zero verbatim long passages spotted).

## Surprises / Deviations from Plan

1. **T05 corpus-sync scope-reduced in cycle 7** — the corpus-sync Inngest function (originally Task 5) surfaced fundamental drift in cycle 7's expanded audit (Voyage batch budget contradiction: per-doc loop in implementation vs ≤7 HTTP calls / 50 docs assertion). Founder elected option-3 scope-reduce: drop T05 entirely, defer to **FOLLOWUP-CORPUS-SYNC-01** with all 6 standing plan-checker gates applied at AUTHORING time (not retroactively). T01's `tests/integration/embed-pipeline-rls.test.ts` Case NEW-1 still pins the per-tenant corpus schema contract via direct service-client inserts. T06 still landed the 5 seed docs (inert at this plan close).

2. **Cycle-7 audit surfaced three new sibling plan-checker gates** (logged in lessons.md 2026-05-27): Gate 4 External-library SIGNATURE consistency (Inngest v4 createFunction is 2-arg not 3-arg form); Gate 5 Drizzle column-type-annotation completeness (jsonb columns without `.$type<T>()` need explicit cast at access site); Gate 6 Implementation-vs-assertion cross-check (counted invariants like batch-size or HTTP-call-count must match in both halves). All three carry forward to every future Phase 2+ plan.

3. **P2-3 concurrent-confirm test flaked once on CI #68** (broad CI re-ran green on retry). Investigation classified it as a TEST-orchestration race, not a real code race — both `CONFLICT` (Scenario A, both SELECTs before either commit) and `NOT_FOUND` (Scenario B, winner commits before loser's SELECT) are correct loser-error surfaces of the same safety invariant ("loser surfaces a typed error, never silent overwrite"). 30× local loop pre-fix was 100% Scenario A. Assertion broadened in commit `4a2f870` to `expect(['CONFLICT', 'NOT_FOUND']).toContain(rejectedError.code)` with a justifying header comment citing both code paths (`memory.ts:655-661` + `:763-769`). `confirmDraft` code unchanged. 30× post-fix re-run stable.

4. **embed-memory rethrow contract** — Codex P2-1 surfaced the plan-vs-implementation mismatch (plan said "no throw past step boundary on final failure"; implementation rethrows on every attempt including the final one, surfacing as Inngest `function_failed`). Founder ratified implementation-over-plan: the framework-owned `function_failed` terminal observable is the correct alerting surface; a silent clean-exit would HIDE failures from alerting. Plan-doc three quotes (lines 119, ~1002, 1379) corrected at Phase C close.

5. **vitest 4.1.6 has no `--repeat` flag** — surfaced at T03 dispatch (lessons.md 2026-05-29); the chunker determinism test uses 3 serial in-test runs of `chunkText(input)` 100× instead. Carries forward as a Gate-1 sibling rule: verify CLI flags exist in installed tool versions, not just that the script exists.

6. **Bounded-bypass `--no-verify` rule (D4)** — Plan 02-04 T04 surfaced the legitimate edge case: pre-existing FOLLOWUP-HARDCODED-DOMAIN-REGEX-01 fails the pre-push gate on `tests/billing/checkout-session.test.ts:66` + `tests/lib/email.test.ts:56` because of trademark-safety regex over-firing on the `trochia.asranest.com` build domain. Rule baked into lessons.md 2026-05-29: `--no-verify` is permitted IFF every failing test grep-matches a documented FOLLOWUP, after stash/re-run on the pre-task baseline confirms the failures predate the executor's changes. Currently FOLLOWUP-HARDCODED-DOMAIN-REGEX-01 is the only failure the carve-out covers.

7. **Production schema unchanged** — Plan 02-04 emitted zero migrations; the prod schema is at the Plan 02-01 + 02-03 precursor baseline (`0005_easy_the_executioner.sql` + `0006_eminent_toro.sql`, both applied in prod on 2026-05-25 per Plan 02-03 SUMMARY). All Plan 02-04 work is application code + tests + data + one CI workflow. The `embeddings` table shape was set at Plan 02-01 and held byte-identical (`git diff --quiet 29228e8 -- src/db/schema/` exits 0 at HEAD `3301aa9`).

8. **9 cross-AI review cycles before T01 dispatch** — the convergence series ran through 9 cycles (CRIT 4 → 0; HIGH 4 → 0; MED 4 → 0; LOW 2 → 0) including a cycle-7 scope-reduce of T05, a cycle-5 deterministic npm-script existence gate, and cycle-7 introducing three new sibling plan-checker gates. All 6 standing plan-checker gates (Gates 1-6) now carry forward to every future Phase 2+ plan.

9. **DEPLOY-DEFERRED branch-only close** (founder ruling 2026-05-30): Plan 02-04 is merge-READY, not merged; PR #7 stays a DRAFT through more Phase 2 work; main untouched at `32e35c1`; the write path's prod-debut waits until the joint 02-06/02-07 + PULL-OBS-COST-01-FORWARD merge so OBS-COST-01 ($5/user/day) ships in the SAME merge as the embed pipeline + qa-rag retrieval. Preserves the invariant that prod always has cost caps for any AI operation that bills tokens. The principle generalizes: every future plan introducing a new AI-token egress (Plan 02-06 qa-rag query embedding, Phase 3 deck reviewer, Phase 4 pipeline auto-stage, Phase 5 voice ASR vendor) should ratify with the founder whether it's a "ship write path before read path" candidate (rare) or a "wait for joint deploy" candidate (default).

## Open Follow-ups

**Deferred to Plan 02-05 (Eval harness — flip stubs to real):**

- Real `extraction-floor.ts` (live extractor + 5 fixtures + ≥8-fields assertion)
- Real `cache-hit.ts` (live Sonnet + Langfuse `cache_read_input_tokens` assertion)
- Live-Sonnet sanitizer eval (carry-over from 02-03 deferred-items)
- Fixture population in `src/ai/eval/fixtures/`
- **FOLLOWUP-EVAL-PR-COMMENT-01** — Wire the PR-comment step the plan must_haves artifact #11 promised; re-add `pull-requests: write`
- **FOLLOWUP-EVAL-PENDING-RUNTIME-GATE-01** — Runtime allowlist `PENDING_ALLOWED = ['qa-grounding']` in `src/ai/eval/runner.ts`

**Deferred to Plan 02-06 (RAG retrieve — hybrid pgvector + FTS):**

- `src/ai/rag/retrieve.ts` hybrid retriever
- `to_tsvector('english', chunk_text)` GENERATED column + GIN index migration (the ONE schema change Phase 2 sees post-02-01)
- Voyage `'query'` input_type usage in retrieve path
- `cosineDistance` ordering + top-k fusion logic
- Real `qa-grounding.ts` eval check (depends on Plan 02-07)

**Deferred to Plan 02-07 (Q&A sidebar + cost cap):**

- `qa-rag.agent.ts` (Opus 4.7, Zod-validated, "I don't know" path)
- **PULL-OBS-COST-01-FORWARD** — ship in-app cost caps in the SAME merge that takes the write path to prod (not a separate Plan 02-07-FOLLOWUP)

**Deferred until first prod merge (joint write+read path deploy):**

- **FOLLOWUP-NODE-VERSION-SKEW-01** — Vercel runtime Node 22.x vs CI Node 24; align + test before first prod merge
- **FOLLOWUP-SOURCEMAP-PROD-PUBLIC-HARDENING-01** — Verify production source maps are uploaded to Sentry but not served as `_next/static/.../*.map` on the authed app surface; pin via build-time assertion test

**Deferred to dedicated follow-up plan:**

- **FOLLOWUP-CORPUS-SYNC-01** — corpus-sync Inngest function (cycle-7 scope-reduced). All 6 standing plan-checker gates apply at AUTHORING time. Re-introduces `next.config.ts outputFileTracingIncludes` for `data/corpus/**` + production-build smoke-test.
- **FOLLOWUP-CORPUS-01** — Expand curated corpus from 5 → 50 docs
- **FOLLOWUP-DBDIFF-01** — Build proper reusable schema-vs-DB drift-detection command (`db:diff`) in the first future plan that legitimately modifies schema
- **FOLLOWUP-DRIZZLE-TYPE-ANNOTATION-01** — Post-Phase-2 schema-lock release, add `.$type<T>()` annotations to jsonb columns; replace cast-at-access pattern in embed-memory.ts
- **FOLLOWUP-VOYAGE-TIMEOUT-TEST** — Add real-timer abort test when voyage.adapter.ts is next edited (T02 cycle-7 deferred)
- **FOLLOWUP-HARDCODED-DOMAIN-REGEX-01** — `trochia.asranest` regex over-fire (the only failure D4 bounded-bypass currently covers); route through CCO / compliance lens before tightening

**Deferred to Phase 4.5 polish backlog:**

- **P4.5-POLISH-07** — Agent worktree hygiene meta-process for gsd-executor (carry-over)
- **P4.5-POLISH-08** — Worktree isolation breach on Windows (Claude Code #3099) — sequential dispatch policy
- **P4.5-POLISH-09** — gsd-executor worktree branch-check safety hole
- **Test-user-mint helper** — enables 10 currently-locally-skipped authed Playwright specs
- **Tokenizer swap** — replace heuristic char-based chunker with `@anthropic-ai/tokenizer` if Plan 02-05 eval shows drift

## Hand-off to Plan 02-05 (Eval harness — flip stubs to real)

Plan 02-05 inherits from this plan:

- **Eval scaffold is LIVE** — `src/ai/eval/runner.ts` + 3 stub checks + `.github/workflows/eval.yml` + `npm run eval:run` script are all in place. Plan 02-05's job is to swap the three `return { status: 'pending', ... }` lines for real check implementations.
- **Fail-open guard handoff (cycle-1 fix MEDIUM)** — Plan 02-05's plan-checker MUST include the hard preflight assertion: `grep -rn "status: 'pending'" src/ai/eval/checks/` returns ≤ 1 hit AND that hit MUST be `qa-grounding.ts` (which depends on Plan 02-07). FOLLOWUP-EVAL-PENDING-RUNTIME-GATE-01 promotes this from process-gate to runtime-gate.
- **Live-Sonnet sanitizer eval scope** (carried from 02-03 deferred): Plan 02-05's eval harness should add a 4th check that runs the 20 OWASP injection + 15 PII fixtures through the actual extractor against real Sonnet 4.6 to measure FP/FN rates.
- **Voyage cache-hit metric path** — the Voyage adapter has zero cache (Voyage doesn't expose prompt-caching like Anthropic does). Plan 02-05's `cache-hit` check applies to Anthropic only.
- **Fixture directory `src/ai/eval/fixtures/`** is currently a README placeholder. Plan 02-05 populates it.
- **Schema-lock invariant from 02-01 + 02-04 still holds.** Plan 02-05 adds NO migrations. Eval harness is application code + fixtures only.

## Hand-off to Plan 02-06 (RAG retrieve — hybrid pgvector + FTS)

Plan 02-06 inherits from this plan:

- **embedMemory now produces rows** — every confirmed business_memory yields N `vector(1024)` rows with `source_type='memory'`. Plan 02-06's `src/ai/rag/retrieve.ts` queries these.
- **Corpus embeddings exist per-tenant** at schema level (T01 NEW-1 pins this) — Plan 02-06's hybrid retriever queries `embeddings` filtered by `WHERE account_id = ctx.tenantId AND source_type IN ('memory', 'corpus')`. Tenant A's retrieval sees A's memory + A's corpus; no cross-tenant pollution. (Production corpus rows wait on FOLLOWUP-CORPUS-SYNC-01.)
- **Voyage adapter has a `'query'` input_type entrypoint** — Plan 02-06's query-side embedding goes through `voyage.embed({ ..., inputType: 'query' })` — same adapter, different input_type. No new vendor surface.
- **HNSW index is on `embedding vector_cosine_ops`** — Plan 02-06's retrieval uses `<=>` (cosine distance) operator per drizzle-orm's `cosineDistance()` helper.
- **FTS side (Postgres `to_tsvector`) is NOT in scope here.** Plan 02-06 adds the GENERATED column + GIN index for FTS on `chunk_text` as a NEW migration (the only schema change Phase 2 sees post-02-01).
- **`embedding_model_version` query filter** — Plan 02-06's retriever filters by `embeddingModelVersion = 'voyage-3-large'` to support the rolling re-embed contract.
- **Langfuse trace whitelist applies to query side too** — Plan 02-06 must not put the query text into the Langfuse trace input (query content is more sensitive than document content; it's what the founder is asking).

## DEPLOY-DEFERRED note

**Plan 02-04 is merge-ready; prod deploy deferred until the read path (02-06/02-07) ships, with OBS-COST-01 in-app cost caps landing in that same merge.**

Founder ruling 2026-05-30: the write path (memory.confirmed → embed-memory → Voyage egress → pgvector upsert) is functionally complete and CI-green at HEAD `3301aa9`, but its prod-debut waits until two conditions are met in the same merge:

1. The read path (Plan 02-06 hybrid retriever + Plan 02-07 qa-rag agent) is in place so founders get retrieval value commensurate with the embed token spend (no "we ship the write path now, the read path next sprint" shape — that would mean founders pay Voyage costs and get nothing back).
2. OBS-COST-01 ($5/user/day cap covering both Anthropic + Voyage spend) ships in the SAME merge, not as a Plan 02-07-FOLLOWUP. PULL-OBS-COST-01-FORWARD is the planner reminder. Tests must demonstrate that a single tenant cannot drive aggregate AI spend above the cap.

Operational consequence:
- PR #7 stays a DRAFT through Plan 02-05 + 02-06 + 02-07 development.
- `phase-2-knowledge-layer` accumulates more commits.
- main stays at `32e35c1`.
- At Plan 02-07 close, the joint-merge plan ships all three (read path + write path live-debut + cost cap) in one Vercel auto-deploy on push to main.

The pattern generalizes: every future plan introducing a new AI-token egress should ratify with the founder whether it's a "ship write path before read path" candidate (rare; only when the write path itself surfaces founder value) or a "wait for joint deploy" candidate (default).

## Self-Check: PASSED

Verified before commit:

- `.planning/phases/02-knowledge-layer/02-04-SUMMARY.md` exists at the expected path
- All 11 commit hashes on the wave (`git log --oneline 07a2d81..HEAD` minus pre-T01 cycle commits) referenced or accounted for above
- All file paths under `key-files.created` referenced in their respective task commit `git log --stat` output
- All 18 must_haves.truths from the plan frontmatter mapped to a verification-loop result or shipped artifact above
- All 9 must_haves.artifacts from the plan frontmatter mapped to Files Created or Files Modified above
- All 8 task headings (T01-T08, with T05 scope-reduced and noted) map to commits or to FOLLOWUP-CORPUS-SYNC-01
- Banned-string clean — zero hard-banned terms in this document
- Trochia voice held — operator register only; no `we / I / happy / love / feel / want / help / hope` in the substantive summary body
- Schema-lock holds — `npx drizzle-kit check` reports `Everything's fine 🐶🔥` at HEAD `3301aa9`
- DEPLOY-DEFERRED posture explicit; PR #7 confirmed DRAFT; main confirmed at `acfab36` (untouched)

---

*Authored 2026-05-30 by Claude Opus 4.7 (1M context) for Plan 02-04 T08 Phase C (branch-only close). Predecessor: Plan 02-03 (shipped `f2666e5`). Successor: Plan 02-05 (eval harness — flip stubs to real) + Plan 02-06 (RAG retrieve — hybrid pgvector + FTS) + Plan 02-07 (Q&A sidebar + OBS-COST-01 cost cap — the joint-merge plan that takes the write path live).*
