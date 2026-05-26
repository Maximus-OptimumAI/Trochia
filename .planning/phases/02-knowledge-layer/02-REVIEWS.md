---
phase: 2
cycle: 1
reviewers: [codex]
reviewed_at: 2026-05-26T20:18:37Z
plans_reviewed:
  - .planning/phases/02-knowledge-layer/02-04-PLAN.md
plans_closed_skipped:
  - .planning/phases/02-knowledge-layer/02-01-PLAN.md  # CLOSED 02-01-SUMMARY.md
  - .planning/phases/02-knowledge-layer/02-02-PLAN.md  # CLOSED 02-02-SUMMARY.md
  - .planning/phases/02-knowledge-layer/02-03-PLAN.md  # CLOSED 02-03-SUMMARY.md
codex_model: default (gpt-5-codex unavailable on this ChatGPT account; CLI fell back to default)
---

# Cross-AI Plan Review — Phase 2 (Knowledge Layer), Cycle 1

**Scope of this cycle:** Plan 02-04 (Week 4 — Embed pipeline + pgvector HNSW + Inngest + Voyage + curated corpus loader + eval scaffold). Plans 02-01, 02-02, 02-03 are CLOSED with SUMMARY.md files and were intentionally not re-reviewed.

**Convergence purpose:** catch HIGH issues BEFORE T01 of 02-04 dispatches.

---

## Codex Review

**Summary**

Plan 02-04 is directionally solid, but not dispatch-ready. The biggest risks are not schema shape; they are execution drift and idempotency semantics. The plan still points executors at wrong files, does not explicitly replace the existing `embedFn` stub, and its `ON CONFLICT DO NOTHING` contract can freeze stale embeddings if a confirmed `business_memory` row changes under the same `(account_id, source_type, source_id, chunk_idx, embedding_model_version)` key.

**Strengths**

- Correctly preserves schema lock: no new columns or migrations.
- Correctly separates Voyage from the Anthropic chokepoint at `src/ai/client.ts`.
- Event payload contract is mostly privacy-safe: `{ accountId, businessMemoryId, lastUpdatedAt }`, no draft fields or chunk text.
- TOCTOU re-read is placed inside `step.run('upsert-embeddings')`, and the insert is planned inside a DB transaction.
- Drizzle 0.44.7 does support `.for('share')`; `LockStrength` includes `'share'`.
- Corpus body cap is enforced both in content task and loader sketch: `if (body.length === 0 || body.length > 400) continue`.
- Eval runner contract correctly codifies `any fail => exit 1`, even while stubs return `pending`.

**Concerns**

- **CRITICAL — `.planning/phases/02-knowledge-layer/02-04-PLAN.md:50, 830, 1064, 1124, 1258, 1796` — Wrong Inngest registration path**

  The plan repeatedly says to register functions in `src/inngest/client.ts`, but the repo registers served functions via `src/inngest/functions/index.ts` and `allFunctions`. `src/inngest/client.ts` only exports the app client. Executors following the plan will create orphaned functions or mutate the wrong file.

  Fix: replace all "register in `src/inngest/client.ts`" instructions with "export/import in `src/inngest/functions/index.ts` and add to `allFunctions`."

- **CRITICAL — `src/inngest/functions/stubs.ts` / `src/inngest/functions/index.ts` — Existing `embedFn` stub conflict**

  The repo already exports `embedFn` from `stubs.ts`, and `allFunctions` already includes it. Plan 02-04 creates `embed-memory.ts` but does not require removal/replacement of the stub. That risks two embedding-related functions being served, with divergent triggers and misleading operational behavior.

  Fix: T04 must explicitly remove `embedFn` from `stubs.ts` exports/imports or replace it in-place. `allFunctions` should include `embedMemory`, not both `embedFn` and `embedMemory`.

- **CRITICAL — `.planning/.../02-04-PLAN.md:52, 466, 633, 685, 1708, 1913` — Env path drift**

  The actual env file is `src/lib/env.ts`; the plan says `src/env.ts`. This will either fail or create a dead env file that nothing imports.

  Fix: change every `src/env.ts` reference to `src/lib/env.ts`. Add this to plan-checker.

- **CRITICAL — T04 atomic upsert semantics — Stale embeddings can become permanent**

  The plan uses `ON CONFLICT DO NOTHING` as the only write behavior. If a confirmed `business_memory` row changes while retaining the same `source_id` and `embedding_model_version`, existing chunk rows will not update. If the new content has fewer chunks, old higher `chunk_idx` rows also remain. The `lastUpdatedAt` TOCTOU guard detects stale event runs, but it does not solve replacement for the fresh event because the dedup key conflicts.

  Fix: either prove confirmed `business_memory` rows are immutable after first confirm, or change the write transaction to delete existing embeddings for `(account_id, source_type='memory', source_id, embedding_model_version)` after the `lastUpdatedAt` match and before inserting the current chunk set. Alternative: `ON CONFLICT DO UPDATE` plus delete chunks with `chunk_idx >= newChunkCount`.

- **HIGH — T04 TOCTOU lock semantics are underspecified**

  `FOR SHARE` is supported and acceptable for the narrow re-read, but Inngest steps are not one shared DB transaction. The lock only exists inside the `upsert-embeddings` transaction. The plan should explicitly state that the earlier `load-row`, `flatten-and-chunk`, and `embed` steps have no DB lock continuity. Current language may imply a broader lock than exists.

  Fix: document that only the final re-read and write are atomic. The invariant is "compare current `lastUpdatedAt` immediately before write," not "lock the row across the whole function."

- **HIGH — T07 file list omission for `package.json`**

  The plan does add `eval:run` in T07, but the top-level `files_modified` list omits `package.json`. This is exactly the kind of dispatch drift that causes reviews to miss a required edit.

  Fix: add `package.json` to `files_modified`.

- **HIGH — `.planning/.../02-04-PLAN.md:1168` — Corpus disk path may fail in Vercel/Inngest runtime**

  `path.resolve(process.cwd(), 'data/corpus')` is fragile in bundled/serverless production. `process.cwd()` may not point at the repo root in the deployed function bundle, and the `data/corpus` directory may not be included.

  Fix: either configure Vercel output tracing/includeFiles for `data/corpus/**`, or move corpus content into importable modules/JSON under `src`, or resolve relative to a known bundled module path and test it in production build.

- **HIGH — T05 corpus sync fan-out cost/rate behavior under FOLLOWUP scale is not pinned**

  The plan says early 5-doc scale is fine, but FOLLOWUP-CORPUS 50 docs × 25 tenants means 1,250 chunk embeddings. At batch size 8 that is under 200 HTTP requests, but this should be written into the plan as the expected upper-bound cost and runtime model.

  Fix: add a corpus fan-out budget note and a test/metric asserting batch size and request count math.

- **MEDIUM — Langfuse whitelist test is sentinel-based but not type-pinned**

  Case 8 proves one sentinel string does not leak. It does not prevent future code from adding arbitrary keys to trace metadata.

  Fix: implement a `const TRACE_METADATA_KEYS = [...] as const`, derive a `TraceMetadata` type, and construct metadata through a function that rejects extra keys. Test both sentinel absence and exact key set.

- **MEDIUM — `uuidv5` conflicts with "zero new deps"**

  `package.json` does not include `uuid`. The plan sketch calls `uuidv5(slug, CORPUS_NAMESPACE)` while the threat model claims zero new deps. Native `crypto.randomUUID()` is not deterministic v5.

  Fix: either add a dependency and update the supply-chain section, or implement deterministic UUID generation with `node:crypto` hash bytes formatted as UUID v5-compatible/stable UUID.

- **MEDIUM — Eval harness remains fail-open at plan close**

  The runner test proving "any fail exits 1" is necessary but not sufficient to prevent a permanent pending state. The plan accepts this risk, but T08 should include a hard handoff guard that 02-05 must fail if checks still return only `pending`.

  Fix: add a TODO/plan-checker assertion in 02-05 preflight: no check may return `pending` except explicitly deferred `qa-grounding`.

- **MEDIUM — Voyage rate limiting for bursty memory confirms**

  Per-tenant concurrency `{ limit: 3 }` plus batch size 8 is reasonable, but a founder pasting 10 large docs in 30 seconds can still create many Voyage calls. Retries can amplify 429s.

  Fix: add handling for 429 with `Retry-After` where available, jittered backoff, and a breadcrumb/metric for rate-limit exits.

- **LOW — Chunking heuristic token drift**

  The 1 token ≈ 4 chars heuristic likely keeps chunks far below Voyage's 32K token input limit, but tokenCount becomes approximate metadata. The plan should name that `token_count` is estimated unless a real tokenizer is present.

  Fix: encode `estimatedTokenCount` internally or document approximation in code comments and `tasks/lessons.md`.

- **LOW — Plan-checker list missing known drift checks**

  The checker currently has 14 checks and misses the two known repo-grounded drifts.

  Fix: add checks #15 and #16: no `src/env.ts` references; no "register in `src/inngest/client.ts`" references.

**Suggestions**

- Add a specific test for "re-embed same `businessMemoryId` with changed content updates/replaces rows."
- Add a test that `allFunctions` contains `embedMemory` and `corpusSync` exactly once and no longer contains the old `embedFn`.
- Add a production-build test or smoke check for corpus file discovery.
- Make `memory.confirmed` payload validation explicit with a Zod schema or exact-key assertion.

**Risk Assessment: HIGH**

The plan has strong architectural intent, but the current dispatch text contains concrete repo path drift and a serious stale-embedding write flaw. The wrong Inngest registration path and `src/env.ts` references can directly block execution. The `ON CONFLICT DO NOTHING` strategy can silently preserve obsolete vectors under normal update/retry scenarios unless confirmed memory is truly immutable. Fix those before T01 dispatch.

---

## Consensus Summary

Only one external reviewer (Codex) ran in this cycle. The orchestrator's working hypothesis (env.ts path drift, inngest registration drift, embedFn stub conflict) was confirmed verbatim. Two additional CRITICAL findings emerged that were not on the orchestrator's list:

1. **Stale-embeddings idempotency hole** — `ON CONFLICT DO NOTHING` does not handle re-confirmed memory with changed content under the same dedup key. The TOCTOU guard catches stale runs but not the fresh-event-with-changed-content case.
2. **TOCTOU lock semantics** — the plan's language implies a broader lock than `FOR SHARE` inside a single `step.run` actually provides.

### Agreed Strengths (single-reviewer cycle — flagged as Codex-only)

- Schema-lock invariant preserved
- Voyage adapter correctly isolated from Anthropic chokepoint
- Event payload privacy-safe
- TOCTOU re-read placed inside the transaction (semantic still needs tightening)
- Corpus body cap enforced in loader sketch
- Eval runner fail-closed contract codified

### Agreed Concerns (Codex + orchestrator pre-review hypothesis)

| # | Concern | Severity |
|---|---|---|
| 1 | Inngest registration path drift (`client.ts` vs `functions/index.ts`) | CRITICAL |
| 2 | Pre-existing `embedFn` stub conflict — must be replaced, not duplicated | CRITICAL |
| 3 | `src/env.ts` vs `src/lib/env.ts` path drift | CRITICAL |
| 4 | `ON CONFLICT DO NOTHING` cannot replace stale chunks under unchanged dedup key | CRITICAL |
| 5 | TOCTOU lock semantics underspecified (no cross-step lock continuity) | HIGH |
| 6 | `package.json` missing from T07 `files_modified` | HIGH |
| 7 | Corpus disk path fragile in Vercel/Inngest serverless runtime | HIGH |
| 8 | FOLLOWUP-CORPUS scale budget not pinned in plan text | HIGH |

### Divergent Views

N/A in single-reviewer cycle.

---

## Required Plan Edits Before T01 Dispatch (Convergence Loop — Cycle 1 → Cycle 2)

The planner (`/gsd:plan-phase 2 --reviews`) must address every CRITICAL and HIGH from this cycle. Specifically:

1. **CRITICAL — Inngest registration:** rewrite all six occurrences of "register in `src/inngest/client.ts`" → "export from and import in `src/inngest/functions/index.ts`; add to `allFunctions`." Touch sites: §files_modified line 50, §T04 read_first, §T04 action step 2, §T05 files line 1124, §T05 action step 3, §risks_and_mitigations row 9.

2. **CRITICAL — embedFn replacement:** T04 must include an explicit step that (a) removes `embedFn` from `src/inngest/functions/stubs.ts` exports, (b) removes the import + `embedFn` array entry from `src/inngest/functions/index.ts`, and (c) inserts `embedMemory` in its place. Add an acceptance test that `allFunctions.filter(f => /embed/i.test(f.name))` returns exactly one function and its id is `'embed-memory'`.

3. **CRITICAL — env.ts path:** replace every `src/env.ts` → `src/lib/env.ts` (frontmatter §files_modified, T02 file list, T02 read_first, T02 action step 2, T08 step 11, success criteria item 13).

4. **CRITICAL — Stale-embeddings idempotency:** rewrite the T04 §"Step 3 — TOCTOU re-read + atomic upsert" block to delete existing rows for `(accountId, sourceType='memory', sourceId, embeddingModelVersion)` inside the same transaction AFTER the lastUpdatedAt match, BEFORE the insert. Add a new test case (Case 9?) — "re-confirm with changed narrative content rewrites embeddings rows; old chunk_idx rows are deleted." Update §must_haves.truths to reflect "DELETE-then-INSERT inside transaction" rather than "ON CONFLICT DO NOTHING."

5. **HIGH — TOCTOU semantics tightening:** add a sentence to T04 §action and the `<interfaces>` block: "Steps 1–2 (load-and-chunk, voyage-embed-batch-*) hold NO database lock. Only Step 3's transaction with `FOR SHARE` provides atomicity, and only for the `lastUpdatedAt` re-read → insert window."

6. **HIGH — package.json:** add `package.json` to §files_modified.

7. **HIGH — Corpus disk path:** add a §"Vercel includeFiles config" sub-step to T05 (and/or T06): either `next.config.js` `outputFileTracingIncludes` block for `data/corpus/**`, OR move corpus to `src/data/corpus/*.md` with `import.meta.url`-relative resolution. Add a smoke test that the production-build output contains the corpus files.

8. **HIGH — Corpus fan-out budget:** add a §"Cost + runtime budget" subsection to T05 documenting the math: 50 docs × 25 tenants × 1 chunk/doc = 1,250 inserts ≤ 200 HTTP calls (batch 8) ≤ Voyage rate-limit headroom. Include the budget assertion as part of T05's verify step.

After the planner replans, this REVIEWS.md file is consumed and a fresh `02-REVIEWS.md` is written in Cycle 2 (or it's empty if all CRITICAL/HIGH are resolved).

---

*Cross-AI review cycle 1 — 2026-05-26. Single reviewer: Codex CLI (default model; ChatGPT account does not authorize gpt-5-codex). Next step: orchestrator runs `/gsd:plan-phase 2 --reviews` to address findings, then re-runs `/gsd:review` for Cycle 2 convergence check.*
