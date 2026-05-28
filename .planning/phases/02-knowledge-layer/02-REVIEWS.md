---
phase: 2
cycles_completed: [1, 2, 3, 4, 5]
reviewers: [codex]
plans_reviewed:
  - .planning/phases/02-knowledge-layer/02-04-PLAN.md
plans_closed_skipped:
  - .planning/phases/02-knowledge-layer/02-01-PLAN.md  # CLOSED 02-01-SUMMARY.md
  - .planning/phases/02-knowledge-layer/02-02-PLAN.md  # CLOSED 02-02-SUMMARY.md
  - .planning/phases/02-knowledge-layer/02-03-PLAN.md  # CLOSED 02-03-SUMMARY.md
codex_model:
  cycle_1: default (gpt-5-codex unavailable on this ChatGPT account; CLI fell back to default)
  cycle_2: default (gpt-5-codex still unavailable; CLI fell back to default)
  cycle_3: gpt-5.5 (Codex CLI v0.130.0 reported model 'gpt-5.5' for this run)
  cycle_4: gpt-5.5 (Codex CLI v0.130.0; same model as cycle 3)
  cycle_5: gpt-5.5 (Codex CLI v0.130.0; same model as cycle 3 and 4)
cycle_1:
  reviewed_at: 2026-05-26T20:18:37Z
  findings: { critical: 4, high: 4, medium: 4, low: 2 }
  outcome: re-plan required (commit 834dff4)
cycle_2:
  reviewed_at: 2026-05-26T21:50:00Z
  findings: { critical: 0, high: 0, medium: 1, low: 1 }
  resolution_summary: "C1-C4 all RESOLVED; H1-H4 all RESOLVED; M1+M3+L1 RESOLVED; M2 + L2 PARTIALLY RESOLVED (lingering uuidv5 acceptance line + two prose-grep plan-checker checks). Zero new HIGHs."
  verdict: APPROVED for T01 dispatch
cycle_3:
  reviewed_at: 2026-05-27T17:30:00Z
  head_at_review: 8b41d22
  scope: "Verify M2 cleanup at commit 8b41d22 (rewrote two stale uuidv5 instructional lines → corpusSourceUuid). Confirm no regression. Surface any new HIGH/CRITICAL."
  findings: { critical: 0, high: 0, medium: 0, low: 1 }
  resolution_summary: "M2 cleanup CORRECTLY APPLIED at lines 1364 + 1581; both audited as CORRECTLY CLEANED. All other uuidv5/CORPUS_NAMESPACE grep hits are ACCEPTABLE-CONTEXT (canonical impl code, code comments, historical-context prose). Zero regressions. Zero new HIGH/CRITICAL. L2 (broad plan-checker #18 + #21) remains PARTIAL — 8b41d22 did not touch it; carries forward as cleanup during T05 implementation."
  verdict: APPROVED for T01 dispatch (re-confirmed; risk LOW)
cycle_4:
  reviewed_at: 2026-05-28T13:58:00Z
  head_at_review: 45885c5
  baseline: 8b41d22
  scope: "Non-regression check for pnpm→npm migration (commit 45885c5): 27 mechanical pnpm→npm rewrites in 02-04-PLAN.md (25 instructional `pnpm <script>`→`npm run <script>` + 2 CI-infra cleanups in eval.yml) + 2 additive package.json changes (db:check script + packageManager pin to npm@11.12.1)."
  findings: { critical: 0, high: 0, medium: 0, low: 0 }
  resolution_summary: "Codex independently verified the diff against the live repo (HEAD-resolved git diff + rg checks + file reads). All 4 npm-migration checklist items CLEAN: (1) semantic preservation — `pnpm <script>` correctly rewritten to `npm run <script>`; chained `&&` order and exit propagation preserved; no malformed `npm typecheck`/`npm lint`/`npm eval:run` forms; (2) CI workflow consistency — `actions/setup-node@v4` + `cache: npm` + `npm ci` + `npm run eval:run` coherent with package-lock.json; no orphaned pnpm references; YAML structure intact; (3) `db:check` script correctness — `drizzle-kit check` (validates migration history) is the right subcommand; drizzle-kit@0.31.10 confirmed in devDependencies; (4) `packageManager` pin — `npm@11.12.1` is a published version (npm CLI v11 changelog confirmed); defensively correct for Corepack-aware tooling. All 13 cumulative cycle-1+2+3 closures held: Inngest registration path (functions/index.ts not client.ts), embedFn removal, src/lib/env.ts path, DELETE-then-INSERT idempotency, TOCTOU lock scope, package.json in files_modified, corpus disk path resolution, uuidv5→corpusSourceUuid cleanup all still present. Codex also noted bookkeeping edits to STATE.md and 02-REVIEWS.md at HEAD beyond the pasted diff — confirmed no npm drift in those files. M2 status: STILL FULLY RESOLVED. L2 status: still PARTIAL, carries to T05 (unchanged from cycle 3). Zero new HIGH, zero new CRITICAL, zero new MEDIUM, zero new LOW."
  verdict: APPROVED for T01 dispatch (re-confirmed; risk LOW; convergence series CLOSED)
cycle_5:
  reviewed_at: 2026-05-28T18:30:00Z
  head_at_review: 222e802
  baseline: 45885c5
  scope: "Non-regression check for db:diff removal (commit 222e802): 9 plan-doc edits replacing `npm run db:diff` (a script that does not exist in package.json) with `git diff --quiet 29228e8 -- src/db/schema/` (deterministic git-baseline schema-lock guard covering memory.ts, timeline.ts, embeddings.ts). One additive FOLLOWUP-DBDIFF-01 entry punting the reusable db:diff tool to the first future plan that legitimately modifies schema. No package.json change in this commit."
  findings: { critical: 0, high: 0, medium: 0, low: 3 }
  resolution_summary: "Codex independently verified the cycle-5 diff at HEAD 222e802. All 9 db:diff → git-freeze replacements are semantically correct and form-consistent (bare form inside `<automated>` && chains, readable-failure wrapper with `|| { echo ...; exit 1; }` inside human-facing verification loops). Line 298 rationale (drizzle-kit has no `--dry-run` ⇒ git freeze is the right tool) is sound. Risk #10 mitigation is STRONGER than before: src/db/schema/memory.ts is inside the guarded path, so a `last_embedded_at`-on-business_memory column add would be caught at staging. FOLLOWUP-DBDIFF-01 correctly defers the reusable drift-detection tool without weakening the current plan's no-schema-change gate. Repo facts verified: `git rev-parse 29228e8` resolves to `29228e835244092cae869380bcf7218b39c68658`; `git diff --quiet 29228e8 -- src/db/schema/; echo $?` returns 0; `git ls-tree -r 29228e8 -- src/db/schema/` lists all 8 schema files at baseline (billing, embeddings, index, jobs, legal, memory, tenancy, timeline) — all current files match baseline blob hashes. All 14 cumulative cycle-1+2+3+4 closures held. M2 status: STILL FULLY RESOLVED. L2 status: still PARTIAL, carries to T05 (unchanged from cycle 3+4). Zero new HIGH, zero new CRITICAL, zero new MEDIUM, three new LOW findings (all minor: untracked-file gap in git freeze, plan-checker forward-reference handling, line-298 wording polish)."
  executable_plan_checker_assertion:
    permanent_rule: "Permanent plan-checker requirement for all Phase 2+ phases: comm-based npm-script existence check MUST be executed against post-commit HEAD on every cycle. Non-empty comm output triggers HIGH-severity review unless the plan itself contains a documented package.json add-step for the missing script BEFORE the script's first execution dependency."
    method: "grep -oE 'npm run [a-zA-Z][a-zA-Z0-9:_-]*' .planning/phases/02-knowledge-layer/02-04-PLAN.md | sed 's/npm run //' | sort -u > /tmp/referenced.txt; node -e \"const p=require('./package.json');Object.keys(p.scripts||{}).sort().forEach(k=>console.log(k));\" > /tmp/defined.txt; comm -23 /tmp/referenced.txt /tmp/defined.txt"
    comm_output_verbatim: "eval:run"
    interpretation: "Acceptable forward-reference. The plan-doc references `eval:run` AND T07 step 7 (line 1836) explicitly adds `\"eval:run\": \"tsx src/ai/eval/runner.ts\"` to package.json scripts. files_modified §66 documents the package.json add. The script's first executable dependency (CI workflow, T07 step 10 local verify, T08 verify loop) all run AFTER T07 step 7. This is materially different from the `pnpm` / `db:check` / `db:diff` defects (cycles 4+5 fixes), which referenced nonexistent things WITHOUT any plan add-step. The executable assertion correctly surfaces the forward-reference; the human-judgment layer applies the add-step exception."
    classified_as: "LOW concern (not HIGH) for THIS cycle due to documented add-step. Future plans must surface comm-output items as HIGH unless a same-plan add-step is verified."
  verdict: APPROVED for T01 dispatch (re-confirmed; risk LOW; convergence series re-CLOSED after one-commit hotfix)
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

---

# Cross-AI Plan Review — Phase 2 (Knowledge Layer), Cycle 2

**Scope of this cycle:** Verify whether the replan at commit `834dff4` (which claimed to address all 4 CRITICAL + 4 HIGH + 4 MEDIUM + 2 LOW findings from cycle 1) actually closed each finding in Plan 02-04. Plans 02-01, 02-02, 02-03 remain CLOSED.

**Reviewer:** Codex CLI (default model — gpt-5-codex still unavailable on this ChatGPT account; CLI fell back to default).

**HEAD at review:** `bcb6d93` (replan + planning-complete doc).

---

## Codex Review — Cycle 2

**Summary**: The replan converged on all cycle-1 CRITICAL/HIGH findings in the executable task text. No new HIGH issues emerged. Two medium/low cleanup issues remain: one lingering `uuidv5` acceptance line can still misdirect T05, and several new plan-checker checks are prose-greps rather than tight scoped assertions.

**Resolution status table**:

| Cycle-1 # | Severity | Concern | Status | Evidence (line numbers or excerpt) |
|---|---|---|---|---|
| C1 | CRITICAL | Inngest registration drift | RESOLVED | Lines 249-251 define `src/inngest/functions/index.ts` as the registration barrel; lines 1189-1201 instruct registration there and explicitly say not `client.ts`; line 1326 acceptance says `client.ts` is NOT modified for registration. |
| C2 | CRITICAL | embedFn stub conflict | RESOLVED | Lines 1195-1199 require deleting `embedFn` from `stubs.ts` and `allFunctions`; lines 1234-1240 add a test proving exactly one embed function and no old `id === 'embed'`; line 1327 acceptance requires `stubs.ts` no longer exports `embedFn`. |
| C3 | CRITICAL | env.ts path drift | RESOLVED | Line 65 lists `src/lib/env.ts`; line 486 says real env path, NOT `src/env.ts`; line 689 says `src/env.ts` does not exist; line 765 repeats the caveat. |
| C4 | CRITICAL | ON CONFLICT DO NOTHING stale-embeddings | RESOLVED | Lines 115-116 require DELETE-then-INSERT inside Step 3 transaction; lines 1144-1156 code-sketch the delete; lines 1267 and 1304-1310 add idempotency/reconfirm replacement tests. |
| H1 | HIGH | TOCTOU lock semantics | RESOLVED | Line 115 states Steps 1-2 hold NO database lock and ONLY Step 3 is transactional; line 135 repeats the interface contract; lines 966-970 explain the lock window. |
| H2 | HIGH | package.json missing | RESOLVED | Line 66 lists `package.json`; lines 1723 and 1834 require adding `eval:run`. |
| H3 | HIGH | Corpus disk path | RESOLVED | Line 45 lists `next.config.ts`; lines 1416-1425 use `fileURLToPath(import.meta.url)`; lines 1531-1539 add `outputFileTracingIncludes`; line 1585 forbids `process.cwd()` resolution. |
| H4 | HIGH | FOLLOWUP fan-out budget | RESOLVED | Lines 1524 and 1551 pin 50 docs x 25 tenants; lines 1556-1567 assert `<= 7` Voyage calls and exactly 25 insert transactions. |
| M1 | MEDIUM | Langfuse whitelist type-pin | RESOLVED | Line 121 requires `TRACE_METADATA_KEYS as const`, derived type, `buildTraceMetadata`; lines 538-571 sketch tuple/type/constructor; lines 728-730 add exact key-set test. |
| M2 | MEDIUM | uuidv5 zero-new-deps conflict | PARTIALLY RESOLVED | Lines 1375-1401 define `corpusSourceUuid` using `node:crypto`; line 2106 says zero new deps. But line 1581 still says `via uuidv5(slug, CORPUS_NAMESPACE)`, which can misdirect implementation. Replace that acceptance line with `via corpusSourceUuid(slug)`. |
| M3 | MEDIUM | Eval fail-open guard | RESOLVED | Line 2133 requires Plan 02-05 checker to reject any remaining `pending` except `qa-grounding`; lines 1888-1907 pin 02-04's temporary pending behavior. |
| L1 | LOW | Chunking token drift | RESOLVED | Lines 801-804 explicitly mark `1 token ≈ 4 characters` as an approximation and require `estimated` labeling under the heuristic. |
| L2 | LOW | Plan-checker drift checks | PARTIALLY RESOLVED | Lines 2265-2272 add checks #15-22, but #18 and #21 are broad prose checks unless implemented with scoped assertions; see audit below. |

**Plan-checker check #15-22 audit**:

| Check | Audit |
|---|---|
| #15 | Mostly adequate. The check allows historical/caveat `src/env.ts` mentions and requires context review, not a pure grep failure. It catches target-path drift if the reviewer actually inspects every hit. |
| #16 | Adequate for the original drift. The regex catches direct "register/add ... `src/inngest/client.ts`" action claims; current remaining `client.ts` references are import/caveat context. |
| #17 | Adequate. The plan has explicit T04 removal steps for both `stubs.ts` and `allFunctions`, plus a registration test. |
| #18 | Text passes, but the checker is too broad if automated. `grep -A 2 "DELETE-then-INSERT\|delete(embeddings)"` could match summary/caveat text instead of T04 Step 3. Scope it to T04 or require both `tx.delete(embeddings)` and the `lastUpdatedAt` match block in the same code sketch. |
| #19 | Adequate. The lock-scope sentence is explicit in must-haves, interface, and T04 comments. |
| #20 | Adequate. `package.json` is in frontmatter `files_modified`. |
| #21 | Mostly adequate in plan text, but vague as a checker. It should assert `next.config.ts` in frontmatter, `outputFileTracingIncludes` in T05, `fileURLToPath(import.meta.url)` in the corpus-sync sketch, and no `process.cwd()` in executable corpus path code. Current explanatory `process.cwd()` mentions are acceptable. |
| #22 | Adequate. The test sketch asserts `httpCallSpy <= 7` and `insertSpy === 25`, despite the test title still saying "under 200 HTTP calls." |

**New concerns introduced by the replan**:

**MEDIUM**

- `.planning/phases/02-knowledge-layer/02-04-PLAN.md:1581` — lingering `uuidv5(slug, CORPUS_NAMESPACE)` acceptance criterion conflicts with the new zero-deps `corpusSourceUuid` implementation at lines 1375-1401. Remediation: replace line 1581 with "Deterministic source_id per doc via `corpusSourceUuid(slug)` using `node:crypto`; no `uuid` dependency."

**LOW**

- `.planning/phases/02-knowledge-layer/02-04-PLAN.md:2268, 2271` — plan-checker #18 and #21 are not tight enough as automated checks. Remediation: scope #18 to the T04 Step 3 transaction/code sketch, and split #21 into three assertions: frontmatter includes `next.config.ts`, T05 includes `outputFileTracingIncludes`, corpus-sync code uses `fileURLToPath(import.meta.url)` and no executable `process.cwd()` path resolution.

**Risk assessment**: MEDIUM for shipping this plan to T01 dispatch as-is. No CRITICAL/HIGH blockers remain, but the lingering `uuidv5` line is a real dispatch-drift risk.

**Convergence verdict**: APPROVED for T01 dispatch. Clean up the `uuidv5` acceptance line before or during T05 implementation; no re-plan required.

---

## Consensus Summary — Cycle 2

Single reviewer cycle (Codex CLI, default model). All 4 cycle-1 CRITICAL findings are now RESOLVED. All 4 cycle-1 HIGH findings are now RESOLVED. Two MEDIUM remain PARTIALLY RESOLVED (M2 lingering `uuidv5` line + L2 prose-grep plan-checker checks). Zero new HIGH or CRITICAL findings emerged from the replan.

### Resolution breakdown

| Severity | Cycle 1 raised | Cycle 2 RESOLVED | Cycle 2 PARTIAL | Cycle 2 OPEN | New in cycle 2 |
|---|---|---|---|---|---|
| CRITICAL | 4 | 4 | 0 | 0 | 0 |
| HIGH | 4 | 4 | 0 | 0 | 0 |
| MEDIUM | 4 | 3 | 1 (M2) | 0 | 0 |
| LOW | 2 | 1 | 1 (L2) | 0 | 0 |

### Remaining cleanup before T01 dispatch (non-blocking; can land in same commit as T05 fixes)

1. **MEDIUM (M2 cleanup) — `02-04-PLAN.md:1581`** — replace `via uuidv5(slug, CORPUS_NAMESPACE)` with `via corpusSourceUuid(slug)` so the T05 acceptance criterion matches the cycle-1-fix implementation at lines 1375-1401.

2. **LOW (L2 cleanup) — `02-04-PLAN.md:2268, 2271`** — tighten plan-checker checks #18 and #21 to scope their greps. #18 should target T04 Step 3 specifically (require both `tx.delete(embeddings)` and the `lastUpdatedAt` match block in the same code sketch). #21 should split into three discrete assertions: (a) `next.config.ts` in frontmatter, (b) `outputFileTracingIncludes` in T05, (c) `fileURLToPath(import.meta.url)` in corpus-sync sketch with no executable `process.cwd()` path resolution.

---

## Convergence Verdict — Cycle 2

**APPROVED for T01 dispatch.** The two remaining items (M2 + L2 cleanup) are documentation tightening, not architectural concerns. They do not block T01 (Embeddings table contract verification + RLS fan-out test, READ-ONLY) and can be cleaned up before or during T05 implementation. The convergence loop closes after cycle 2.

---

*Cross-AI review cycle 2 — 2026-05-26. Single reviewer: Codex CLI (default model). Outcome: APPROVED for T01 dispatch with two minor cleanups recommended. Orchestrator may now proceed to `/plan-checker` then T01.*

---

# Cross-AI Plan Review — Phase 2 (Knowledge Layer), Cycle 3

**Scope of this cycle:** Verify that commit `8b41d22` correctly closes the cycle-2 PARTIAL M2 finding (two lingering `uuidv5(slug, CORPUS_NAMESPACE)` / `uuidv5(slug, NAMESPACE_CORPUS)` instructional references in Plan 02-04 prose/acceptance). Confirm no regression introduced. Surface any newly-emerged HIGH or CRITICAL.

**Reviewer:** Codex CLI v0.130.0 (model reported: `gpt-5.5`). Note: in cycles 1 + 2 the CLI fell back to default because `gpt-5-codex` was unauthorized on this ChatGPT account; in cycle 3 it served `gpt-5.5`. Recorded for traceability.

**HEAD at review:** `8b41d22` (`docs(02-04): align corpus helper references with corpusSourceUuid impl`).

**Diff under review (2 lines):**

```
-         - Generates a deterministic UUID from `slug` (e.g. `uuidv5(slug, NAMESPACE_CORPUS)`); this becomes `source_id`
+         - Generates a deterministic UUID from `slug` (e.g. `corpusSourceUuid(slug)`); this becomes `source_id`

-    - Deterministic source_id per doc via uuidv5(slug, CORPUS_NAMESPACE)
+    - Deterministic source_id per doc via corpusSourceUuid(slug)
```

---

## Codex Review — Cycle 3

**Summary**

Cycle 3 is clean. The M2 cleanup is correct and complete: the two stale executor-facing `uuidv5(...)` instructions were rewritten to `corpusSourceUuid(slug)`, and remaining `uuidv5` / namespace references are either implementation code, explanatory comments, or historical review context. No new blocker and no regression from commit `8b41d22`.

**M2 cleanup verification**

| Location | Status | Notes |
|---|---|---|
| Line 1364, T05 action prose | CORRECTLY CLEANED | Now says deterministic UUID via `corpusSourceUuid(slug)`; no executor-facing `uuidv5(...)` remains. |
| Line 1581, T05 acceptance criteria | CORRECTLY CLEANED | Now says `Deterministic source_id per doc via corpusSourceUuid(slug)`. |
| Lines 1384, 1386, 1389 | ACCEPTABLE-CONTEXT | Canonical implementation code for `CORPUS_NAMESPACE` and `corpusSourceUuid`; required for the zero-new-deps helper. |
| Lines 1443, 1447 | ACCEPTABLE-CONTEXT | Code comments explaining the cycle-1 fix and why the helper replaces package-based UUID v5 usage. Not an instruction to call `uuidv5`. |
| Lines 18, 185, 2106 | ACCEPTABLE-CONTEXT | Historical review / threat-model prose documenting the prior issue and its fix. Not directive. |

**New concerns introduced by `8b41d22`**

None.

**Other newly-surfaced HIGH/CRITICAL findings**

None.

**L2 status**

Still PARTIAL. Commit `8b41d22` only closes the stale `uuidv5` instructional references for M2. It does not materially narrow or improve broad plan-checker checks #18 and #21, so L2 remains acknowledged partial cleanup for T05.

**Final verdict**

APPROVED for T01. Risk level: LOW.

---

## Consensus Summary — Cycle 3

Single reviewer cycle (Codex CLI, gpt-5.5). M2 PARTIAL from cycle 2 is now FULLY RESOLVED. Zero CRITICAL, zero HIGH, zero MEDIUM, one LOW carry-forward (L2 — plan-checker checks #18/#21 still broad; explicitly tracked as T05-implementation cleanup, not a planning blocker).

### Resolution breakdown (cumulative across all 3 cycles)

| Severity | Cycle 1 raised | After cycle 2 | After cycle 3 |
|---|---|---|---|
| CRITICAL | 4 | 0 open | 0 open |
| HIGH | 4 | 0 open | 0 open |
| MEDIUM | 4 | 1 PARTIAL (M2) | 0 open (M2 RESOLVED at 8b41d22) |
| LOW | 2 | 1 PARTIAL (L2) | 1 PARTIAL (L2 — carries to T05) |

### Newly raised in cycle 3

None.

### Divergent views

N/A (single-reviewer cycle).

---

## Convergence Verdict — Cycle 3

**APPROVED for T01 dispatch (re-confirmed).** All cycle-1 CRITICAL + HIGH findings remain RESOLVED. M2 MEDIUM closed by commit `8b41d22`. Only L2 LOW remains PARTIAL — it is a documentation/scoping cleanup for plan-checker checks #18 and #21, deliberately deferred to T05 implementation and not a T01 blocker. The convergence loop is fully closed.

Next step: orchestrator runs `/plan-checker` then dispatches T01 of Plan 02-04.

---

*Cross-AI review cycle 3 — 2026-05-27. Single reviewer: Codex CLI v0.130.0 (gpt-5.5). Outcome: APPROVED for T01 dispatch. M2 RESOLVED; L2 carries forward as T05 cleanup (LOW, non-blocking). Convergence achieved.*

---

# Cross-AI Plan Review — Phase 2 (Knowledge Layer), Cycle 4

**Scope of this cycle:** Non-regression check for the pnpm→npm package-manager migration (commit `45885c5`). The diff contains 27 mechanical pnpm→npm rewrites in Plan 02-04 (25 instructional `pnpm <script>` → `npm run <script>` lines + 2 CI-infra cleanups inside `.github/workflows/eval.yml` for T07: removed `pnpm/action-setup@v3`, changed `cache: pnpm` → `cache: npm`, `pnpm install --frozen-lockfile` → `npm ci`) plus two additive `package.json` changes (added `"db:check": "drizzle-kit check"` script — the script that T01 + T08 verify steps depend on, previously missing; added top-level `"packageManager": "npm@11.12.1"` field as a defensive Corepack pin).

**Reviewer:** Codex CLI v0.130.0 (model reported: `gpt-5.5`; same model as cycle 3).

**Baseline:** `8b41d22` (cycle-3 APPROVED commit)
**HEAD at review:** `45885c5` (`fix(02-04): align plan-doc + repo with npm package manager`)

**Repo evidence for the migration:**
- `package-lock.json` exists at repo root; no `pnpm-lock.yaml`
- `npm run db:check` verified clean at HEAD `45885c5` (output: `Everything's fine 🐶🔥`)
- `drizzle-kit@0.31.10` confirmed in devDependencies
- `package.json` already had a `scripts` block keyed for npm; pnpm was never wired up

---

## Codex Review — Cycle 4

**Summary**

Cycle 4 is clean. The npm migration preserves command semantics, the T07 workflow snippet is internally consistent, and the additive `package.json` changes are appropriate. Codex independently verified the diff against the live repo (HEAD-resolved `git diff --stat`, ripgrep checks across plan-doc and STATE.md/REVIEWS.md, file reads of package.json and package-lock.json, and the spliced eval.yml YAML block) rather than trusting the pasted patch. Codex also noted that HEAD changes `.planning/STATE.md` and `02-REVIEWS.md` beyond the pasted plan-doc + package.json diff — those are bookkeeping/review-log edits and introduce no npm drift.

**M2 / L2 / Cumulative-Closure Status**

M2 remains FULLY RESOLVED: executor-facing `uuidv5(...)` instructions still point to `corpusSourceUuid(slug)`. L2 remains the same LOW carry-forward to T05 (unchanged from cycle 3).

Cumulative closures from cycles 1+2+3 all held:

| Cycle-1/2/3 closure | Cycle-4 status | Spot-check |
|---|---|---|
| Inngest registration target = `src/inngest/functions/index.ts` (NOT `client.ts`) | HELD | Plan-doc lines 1189, 1326, 1345, 1526, 1577, 2119 still reference the registration barrel correctly |
| `embedFn` removal still required by T04 | HELD | Plan-doc steps 2a + 2b in T04 still call out the deletion from `stubs.ts` + `index.ts` |
| Env path = `src/lib/env.ts` (NOT `src/env.ts`) | HELD | Plan-doc lines 486, 689, 765, 2030 all point to `src/lib/env.ts` |
| DELETE-then-INSERT idempotency contract for T04 | HELD | Plan-doc lines 305, 1144, 1332, 2113 still document the pattern |
| `package.json` in `files_modified` | HELD | Line 66 of frontmatter |
| Corpus disk path resolution via Vercel-tracing / module-relative | HELD | Line 2268 plan-checker check #21 + T05 `outputFileTracingIncludes` instruction at line 1531 |
| uuidv5 → `corpusSourceUuid(slug)` cleanup | HELD | Lines 1364 + 1581 still rewritten |

**npm-migration verification (per cycle-4 checklist)**

| # | Check | Verdict | Evidence |
|---|---|---|---|
| 1 | Semantic preservation of plan-doc rewrites | CLEAN | `pnpm <script>` correctly rewritten to `npm run <script>`; chained `&&` order and exit propagation preserved; ripgrep across plan-doc found no malformed `npm typecheck` / `npm lint` / `npm eval:run` forms (i.e., no dropped `run` keyword) |
| 2 | CI workflow internal consistency | CLEAN | `actions/setup-node@v4` + `cache: npm` + `npm ci` + `npm run eval:run` are coherent with `package-lock.json`. No orphaned `pnpm` references in YAML block. YAML indentation intact after the `pnpm/action-setup@v3` step removal |
| 3 | `db:check` script correctness | CLEAN | `"db:check": "drizzle-kit check"` correctly aliases the Drizzle migration-history validator; `drizzle-kit@0.31.10` present in devDependencies; T01 + T08 verify steps that reference `npm run db:check` will now resolve |
| 4 | `packageManager` pin | CLEAN | `npm@11.12.1` is a published npm version (npm CLI v11 changelog: https://docs.npmjs.com/cli/v11/using-npm/changelog/). Defensively correct for Corepack-aware tooling. Caveat: it is a toolchain signal rather than universal hard enforcement by itself |
| 5 | Non-regression of prior cycle closures | CLEAN | All 13 cumulative cycle-1+2+3 closures verified intact via ripgrep + line-anchor spot-checks (see table above) |

**New concerns introduced by `45885c5`**

None.

**Final verdict**

APPROVED for T01 dispatch (re-confirmed) — the npm migration is mechanically sound, closes the previously-undetected `db:check` script gap (which all three prior cycles missed), and does not regress prior-cycle closures.

---

## Consensus Summary — Cycle 4

Single reviewer cycle (Codex CLI v0.130.0, gpt-5.5). Zero CRITICAL, zero HIGH, zero MEDIUM, zero new LOW. M2 + L2 status unchanged from cycle 3 (M2 fully resolved; L2 carries to T05).

### Resolution breakdown (cumulative across all 4 cycles)

| Severity | Cycle 1 raised | After cycle 2 | After cycle 3 | After cycle 4 |
|---|---|---|---|---|
| CRITICAL | 4 | 0 open | 0 open | 0 open |
| HIGH | 4 | 0 open | 0 open | 0 open |
| MEDIUM | 4 | 1 PARTIAL (M2) | 0 open | 0 open |
| LOW | 2 | 1 PARTIAL (L2) | 1 PARTIAL (L2 → T05) | 1 PARTIAL (L2 → T05) |

### Newly raised in cycle 4

None.

### Divergent views

N/A (single-reviewer cycle).

### Notable observations

- Codex used live repo verification rather than trusting the pasted patch — it ran `git diff --stat 8b41d22..HEAD`, `rg` across plan-doc + STATE.md + REVIEWS.md for `pnpm` / npm-form drift, file reads of package.json + package-lock.json (confirming lockfileVersion 3, drizzle-kit 0.31.10, packageManager pin), and a spliced read of the eval.yml YAML block to confirm setup-node@v4 + cache:npm + npm ci structure.
- Codex independently confirmed `db:check` was missing prior to this commit and that adding it closes a real gap that cycles 1–3 missed.
- The `npm@11.12.1` pin was independently validated against the npm CLI v11 changelog as a published version.
- Codex flagged (correctly) that HEAD also touches `.planning/STATE.md` and `.planning/phases/02-knowledge-layer/02-REVIEWS.md` beyond the pasted diff. Both files contain zero `pnpm` substring hits after the migration; the changes are bookkeeping only (date roll + cycle-3 record append).

---

## Convergence Verdict — Cycle 4

**APPROVED for T01 dispatch (re-confirmed; convergence series CLOSED).** The npm-migration is mechanically sound and non-regressing. All cycle-1 CRITICAL + HIGH findings remain RESOLVED. M2 MEDIUM remains FULLY RESOLVED (cycle 3). The previously-undetected `db:check` script gap is now closed. The `packageManager` pin guards against future pnpm/npm drift. Only L2 LOW remains PARTIAL — it is a documentation/scoping cleanup for plan-checker checks #18 and #21, deliberately deferred to T05 implementation and not a T01 blocker.

This is the fourth consecutive APPROVED cycle. The convergence series is closed.

Next step: orchestrator runs `/plan-checker` then dispatches T01 of Plan 02-04.

---

*Cross-AI review cycle 4 — 2026-05-28. Single reviewer: Codex CLI v0.130.0 (gpt-5.5). Outcome: APPROVED for T01 dispatch. Non-regression check for pnpm→npm migration: CLEAN. db:check script gap closed. packageManager pinned to npm@11.12.1. Zero new findings at any severity. Convergence series CLOSED.*

---

# Cross-AI Plan Review — Phase 2 (Knowledge Layer), Cycle 5

**Scope of this cycle:** Plan 02-04 (Week 4 — Embed pipeline + pgvector HNSW + Inngest + Voyage + curated corpus loader + eval scaffold). Single-commit hotfix to a phantom-script defect surfaced post-cycle-4-close.

**Convergence purpose:** Verify that the `db:diff` removal (commit 222e802) is semantically correct, form-consistent, and does not regress any of the 14 cumulative cycle-1+2+3+4 closures. Re-validate convergence via the new permanent executable plan-checker assertion (comm-based npm-script existence check).

**Scope reduction context:**
- Plans 02-01, 02-02, 02-03 remain CLOSED with SUMMARY.md files; intentionally not re-reviewed (no diff touched them).
- Cycle 5 reviews ONLY the cycle-5 diff: `git diff 45885c5..222e802 -- .planning/phases/02-knowledge-layer/02-04-PLAN.md` (19 lines changed across 9 hits + 1 new FOLLOWUP entry).
- The cycle is triggered by founder discovery that `npm run db:diff` (referenced 9× in the plan) is not a defined script in package.json and has no add-step in any task. This survived 4 review cycles because reviewers treated the plan-doc as ground truth instead of cross-checking against package.json scripts.

---

## Mandatory Executable Plan-Checker Assertion (Cycle 5 — PERMANENT RULE)

Per founder mandate, all Phase 2+ reviews MUST execute the comm-based npm-script existence check against post-commit HEAD and paste the raw output verbatim.

**Command (executed at HEAD 222e802):**
```bash
grep -oE 'npm run [a-zA-Z][a-zA-Z0-9:_-]*' .planning/phases/02-knowledge-layer/02-04-PLAN.md \
  | sed 's/npm run //' | sort -u > /tmp/referenced.txt
node -e "const p=require('./package.json');Object.keys(p.scripts||{}).sort().forEach(k=>console.log(k));" > /tmp/defined.txt
comm -23 /tmp/referenced.txt /tmp/defined.txt
```

**Verbatim stdout:**
```
eval:run
```

**Defined scripts at HEAD 222e802** (`package.json`):
```
build, check:banned, db:check, db:generate, db:push, dev, gate, gen:dpa-pdf, lint, postbuild, start, test, test:e2e, test:watch, typecheck
```

**Referenced npm-run scripts in 02-04-PLAN.md at HEAD 222e802:**
```
check:banned, db:check, eval:run, lint, typecheck
```

**Interpretation — `eval:run` finding is an acceptable forward-reference, NOT a phantom-script defect.**

Critical distinction from cycle-4 `db:check` / cycle-5 `db:diff` defects:
- `pnpm` (cycle 4 fix): referenced a package manager the repo doesn't use — NO add-step in any task.
- `db:check` (cycle 4 fix): referenced script not added by plan — NO add-step.
- `db:diff` (cycle 5 fix): referenced non-existent script — NO add-step.
- `eval:run` (this cycle): plan references script AND **plan adds the script in T07 step 7 (line 1836)** with explicit add: `"eval:run": "tsx src/ai/eval/runner.ts"`. files_modified §66 lists `package.json` with note "add `eval:run` script in T07 (review-cycle-1 fix)". The script's first execution dependency (CI workflow at .github/workflows/eval.yml, T07 step 10 local verify, T08 verify loop) all occur AFTER T07 step 7.

This is a valid plan-time forward-reference: the plan creates the script as part of its own implementation.

**Classification:** LOW concern for cycle 5. The executable assertion correctly surfaces it; the human-judgment layer applies the documented add-step exception.

**PERMANENT plan-checker rule (recorded for all future Phase 2+ phases):**
> The comm-based npm-script existence check MUST be executed against post-commit HEAD on every review cycle. Non-empty comm output triggers HIGH-severity treatment unless the plan itself contains a documented `package.json` add-step for the missing script BEFORE the script's first execution dependency, AND `files_modified` lists `package.json` with explicit add-script intent. The plan-checker layer (not the reviewer's prose-reading) is the source of truth for script existence.

---

## Codex Review

**Model:** Codex CLI v0.130.0 (gpt-5.5) — same model as cycles 3 and 4.

### Summary

APPROVED for T01 dispatch. The cycle-5 patch correctly removes the nonexistent `npm run db:diff` dependency and replaces it with a deterministic baseline schema freeze that is appropriate for a no-schema-change plan. The remaining `eval:run` checker output is an acceptable plan-time forward-reference because T07 explicitly adds the script to `package.json` before any later verification step depends on it.

### Strengths

- All executable `npm run db:diff` references are gone; the only remaining `db:diff` text is the deferred follow-up item, not a command dependency.
- `git diff --quiet 29228e8 -- src/db/schema/` is consistently used where the plan needs a terse automated gate, while the readable failure wrapper is used in human-facing verification loops.
- Line 298's rationale is sound: for this plan, freezing schema files against the known baseline is a better fit than inventing a fake Drizzle dry-run command.
- Risk #10 is now stronger than before: `src/db/schema/memory.ts` is inside the guarded path, so a `last_embedded_at` column on `business_memory` would be caught if tracked/staged.
- `FOLLOWUP-DBDIFF-01` correctly defers reusable drift tooling without weakening this plan's current no-schema-change gate.
- Prior closure anchors still appear held: Inngest registration target, `embedFn` removal, `src/lib/env.ts`, DELETE-then-INSERT, package.json inclusion, corpus path handling, Langfuse pin, `corpusSourceUuid`, eval fail-open handoff, npm migration, `db:check`, and `packageManager` pin.

### Concerns

- **LOW — `02-04-PLAN.md` (all 9 git-freeze occurrences) — Untracked-new-file gap in schema freeze.** `git diff --quiet 29228e8 -- src/db/schema/` does not catch untracked new files under `src/db/schema/`. It catches tracked/staged schema drift and modifications, which fully covers the stated `last_embedded_at` risk (because that mutates an existing tracked file), but the §10 ship checklist item "zero new files under `src/db/migrations/**` or `src/db/schema/**`" is not enforced by `git diff` alone. A new untracked `last_embedded_observability.ts` file under `src/db/schema/` would slip past the freeze.

- **LOW — Plan-checker forward-reference handling.** The plan-checker assertion is too blunt if interpreted as a strict hard-fail rule. `eval:run` is referenced before it exists at HEAD, but T07 explicitly modifies `package.json` to add `"eval:run": "tsx src/ai/eval/runner.ts"` before running it. That is a valid forward-reference in an implementation plan, unlike the prior `db:diff` issue.

- **LOW — Line 298 wording polish.** The line-298 wording says the guard catches drift to "ANY Phase-2 locked table," but the command actually covers every file under `src/db/schema/`. This is stricter, not weaker, but the prose could say "all schema files, including the Phase-2 locked files" to avoid ambiguity.

- **No CRITICAL/HIGH/MEDIUM regressions found in the cycle-5 diff.**

### Suggestions

1. Add an untracked-file check beside the schema freeze where the plan claims "zero new files":
   ```bash
   git diff --quiet 29228e8 -- src/db/schema/
   test -z "$(git ls-files --others --exclude-standard src/db/schema/)"
   ```
2. Update the plan-checker logic to allow forward-referenced scripts only when the same plan has a `package.json` add-step before first required execution. For this plan, `eval:run` qualifies; `db:diff` did not.
3. Optional wording polish: change "all Phase-2 schema files" to "all schema files under `src/db/schema/`, including memory.ts, timeline.ts, embeddings.ts."

### Risk Assessment

LOW for T01 dispatch. The patch fixes the substantive phantom-script defect and preserves the no-schema-change invariant. The only residual gap is untracked schema files, which is easy to tighten but not enough to require re-plan.

### Verdict

**APPROVED for T01 dispatch**

---

## Repo Facts Verified (HEAD 222e802)

| Check | Result |
|---|---|
| `git rev-parse 29228e8` | `29228e835244092cae869380bcf7218b39c68658` (baseline exists) |
| `git diff --quiet 29228e8 -- src/db/schema/; echo $?` | `0` (freeze passes right now) |
| Baseline schema file count under `src/db/schema/` | 8 (billing, embeddings, index, jobs, legal, memory, tenancy, timeline) |
| Current schema file count | 8 (identical to baseline) |
| Phase-2 locked files (memory.ts, timeline.ts, embeddings.ts) | All present in baseline tree; all byte-identical at HEAD |
| `npm run db:diff` occurrences in 02-04-PLAN.md | 0 (full removal confirmed) |
| `db:diff` text occurrences in 02-04-PLAN.md | 1 (only in FOLLOWUP-DBDIFF-01 deferral entry) |
| `git diff --quiet 29228e8 -- src/db/schema/` occurrences | 9 (matches the 9 expected hit sites) |
| Bare form (inside `<automated>` && chains) | Used at line 467 |
| Readable-failure wrapper (`\|\| { echo …; exit 1; }`) | Used at line 298 and line 1973 (human-facing verify loops) |
| Prose form (description only) | Used at lines 128, 198, 472, 2058, 2120, 2229 |

---

## Consensus Summary — Cycle 5

### Agreed strengths (single reviewer; codex)

- 9 db:diff → git-freeze replacements are semantically correct and form-consistent.
- Risk #10 mitigation is materially stronger (memory.ts now inside the guard, not just embeddings.ts).
- FOLLOWUP-DBDIFF-01 correctly punts reusable tooling without weakening the current gate.
- Line 298 rationale (drizzle-kit has no --dry-run) is technically sound.
- All 14 cumulative prior closures held.

### Agreed concerns (single reviewer; codex)

| # | Severity | Concern | Location | Cycle status |
|---|---|---|---|---|
| C5-L1 | LOW | Untracked-new-file gap: git freeze doesn't catch new untracked `src/db/schema/*.ts` files | All 9 git-freeze sites | NEW — open; minor tightening recommended |
| C5-L2 | LOW | Plan-checker forward-reference handling needs same-plan-add-step exception | Permanent plan-checker rule | NEW — open; rule documented in this cycle |
| C5-L3 | LOW | Line 298 wording could be clearer about "all schema files" vs "Phase-2 schema files" | Line 298 | NEW — open; cosmetic |

### Newly raised in cycle 5

3 LOW findings (all listed above). Zero CRITICAL / HIGH / MEDIUM.

### Status of prior cycle items

| Item | Origin | Cycle-5 status |
|---|---|---|
| Inngest registration path (functions/index.ts) | C1 CRIT | Still RESOLVED |
| `embedFn` stub removal | C1 CRIT | Still RESOLVED |
| `src/lib/env.ts` path | C1 CRIT | Still RESOLVED |
| DELETE-then-INSERT idempotency | C1 CRIT | Still RESOLVED |
| TOCTOU lock scope correctly narrowed | C1 HIGH | Still RESOLVED |
| `files_modified` includes package.json | C1 HIGH | Still RESOLVED |
| Corpus disk path resolution | C1 HIGH | Still RESOLVED |
| FOLLOWUP fan-out present | C1 HIGH | Still RESOLVED |
| Langfuse type-pin | C1 MED | Still RESOLVED |
| Corpus name UUID alignment (corpusSourceUuid) | C1 MED | Still RESOLVED |
| Eval fail-open guard | C1 MED | Still RESOLVED |
| Chunking token drift | C1 MED | Still RESOLVED |
| Plan-checker checks #15-22 | C1 LOW | Partially RESOLVED (L2 still PARTIAL, carries to T05; unchanged) |
| M2 line-1364 + line-1581 cleanup | C2 MED | FULLY RESOLVED (cycle 3 confirmed; cycle 4 + 5 held) |
| L2 broad plan-checker scope | C2 LOW | PARTIAL (carries to T05 implementation; unchanged) |
| npm migration (pnpm→npm) | C4 | Still RESOLVED |
| db:check script in package.json | C4 | Still RESOLVED |
| packageManager pin (npm@11.12.1) | C4 | Still RESOLVED |

### Divergent views

N/A (single-reviewer cycle).

### Notable observations

- Codex independently identified that the executable plan-checker assertion would surface `eval:run` and proactively analyzed it as an acceptable forward-reference WITHOUT being directly asked. This is the correct human-judgment layer over the blunt comm-based check.
- Codex also flagged the untracked-file gap unprompted, demonstrating that the git-freeze approach (while better than the nonexistent `db:diff` script) still has a small surface area where a determined drift could slip through. The fix (`git ls-files --others --exclude-standard`) is trivial and additive — recommended for an observational follow-up rather than a re-plan trigger.
- All 9 git-freeze form choices (bare vs readable-failure wrapper vs prose) were independently audited and judged appropriate to their context. Specifically: bare form inside `<automated>` && chains preserves exit propagation; the readable-failure wrapper inside human-facing verify loops provides actionable failure messages.

---

## Convergence Verdict — Cycle 5

**APPROVED for T01 dispatch (re-confirmed; convergence series re-CLOSED after one-commit hotfix).** The db:diff removal is semantically clean, form-consistent across all 9 sites, and the new git-freeze guard is materially stronger than the nonexistent script it replaces (catches drift to memory.ts and timeline.ts in addition to embeddings.ts). The mandatory executable plan-checker assertion surfaced `eval:run` as an acceptable forward-reference (plan adds the script in T07 step 7; files_modified §66 documents the add). All 14 cumulative cycle-1+2+3+4 closures remain held.

This is the fifth consecutive APPROVED cycle (cycle 4 was the closing-out cycle pre-hotfix; cycle 5 re-confirms after the db:diff fix). The convergence series is re-closed.

Next step: orchestrator runs `/plan-checker` (now with the new permanent comm-based npm-script existence rule) then dispatches T01 of Plan 02-04.

**Permanent plan-checker rule recorded** (carries to all future Phase 2+ phases): the comm-based npm-script existence check MUST be executed against post-commit HEAD on every review cycle; non-empty output triggers HIGH-severity treatment unless the plan itself documents a `package.json` add-step before the script's first execution dependency.

---

*Cross-AI review cycle 5 — 2026-05-28. Single reviewer: Codex CLI v0.130.0 (gpt-5.5). Outcome: APPROVED for T01 dispatch. Non-regression check for db:diff removal: CLEAN. 9 db:diff → git-freeze replacements verified semantically correct and form-consistent. FOLLOWUP-DBDIFF-01 deferral documented. Mandatory executable plan-checker assertion executed — eval:run surfaced as acceptable forward-reference. Three new LOW findings (untracked-file gap, plan-checker handling rule, line 298 wording). Zero new CRITICAL/HIGH/MEDIUM. Permanent comm-based plan-checker rule recorded. Convergence series re-CLOSED after one-commit hotfix.*
