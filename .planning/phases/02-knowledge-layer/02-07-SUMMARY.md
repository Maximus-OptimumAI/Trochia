---
phase: 02-knowledge-layer
plan: 07
subsystem: ai
tags: [rag, qa, cost-cap, tRPC, grounding, prompt-injection, privacy, opus, voyage, pgvector, reserve-then-settle]

# Dependency graph
requires:
  - phase: 02-knowledge-layer (02-04)
    provides: embed-memory pipeline (memory.confirmed → Voyage embed → pgvector upsert) — the write path this plan reads from
  - phase: 02-knowledge-layer (02-06)
    provides: hybrid retriever (vector + FTS + RRF, tenant-scoped) — KNW-05a; askQa drives it
  - phase: 02-knowledge-layer (02-05)
    provides: the eval harness + runner (extraction-floor / cache-hit live) — qa-grounding flips real here
  - phase: 01-foundation
    provides: tRPC protectedProcedure (ctx.tenantId / ctx.db.rls / ctx.session), brand tokens, Sonner Toaster, env URL contract
provides:
  - REAL $5/user/day cost cap (OBS-COST-01) — BLOCKS at both Anthropic + Voyage chokepoints via atomic RESERVE-then-SETTLE
  - qa-rag agent — two-stage grounding (0.6 cosine floor + post-synthesis citation validation), metered Opus synthesis, AskQaResult.debug type-separated
  - qa-grounding eval flipped REAL + PENDING_ALLOWED emptied (eval gate fully active — Phase-2 exit criterion 7)
  - qaRouter.ask — returns result.answer ONLY, strips debug at the boundary (P2-D); metadata-only qa_sidebar interaction persist
  - ambient <QaSidebar/> + <CitationChip/> — four states, operator voice, brand tokens, reduced-motion
affects: [Phase 3 deck reviewer (cost-cap pattern + runAgent metering), Phase 4 Live Raise, Phase 4.5 SEC-02 tier-aware caps, prod merge of PR #7]

# Tech tracking
tech-stack:
  added: [ai_usage_daily table (0007), reservation-token RESERVE-then-SETTLE cost meter]
  patterns:
    - "Cost cap as a provable upper-bound reserve priced @ the highest input-side rate, settled to actual in a finally keyed on the reservation token's UTC usageDate"
    - "Type-separated debug surface (AskQaResult.debug) computed by the agent, consumed by the eval, STRIPPED at the tRPC router before the client boundary"
    - "Two-stage grounding: pre-synthesis cosine floor (no Opus on weak retrieval) + post-synthesis citation validation (any dropped citation → grounded:false + deterministic 'I don't know')"
    - "Metadata-only interaction persistence (OD-5): NOT NULL columns populated, query/answer left NULL"
    - "tRPC mutation tested with module-level mock controller driving onSuccess/onError/isPending inside act()"

key-files:
  created:
    - src/db/schema/ai_usage_daily.ts (T01)
    - drizzle/0007_ai_usage_daily.sql (T01)
    - src/ai/cost/cap.ts (T01 — atomic reserve-then-settle; lazy-imports @/db/client)
    - src/ai/agents/qa-rag.agent.ts (T02 — askQa + validateCitations)
    - src/ai/schemas/qa-answer.zod.ts (T02 — qaAnswerSchema + AskQaResult)
    - src/server/routers/qa.ts (T04 — qaRouter.ask)
    - src/components/qa/sidebar.tsx (T04 — <QaSidebar/>)
    - src/components/qa/citation-chip.tsx (T04 — <CitationChip/>)
    - tests/components/qa/sidebar.test.tsx (T04)
  modified:
    - src/ai/client.ts (T01 — costContext metering, OpenAI fallback disabled under cap)
    - src/ai/voyage/adapter.ts (T01 — Voyage chokepoint metering, batch UTF-8 byte reserve)
    - src/ai/eval/checks/qa-grounding.ts + runner.ts (T03 — real askQa, PENDING_ALLOWED empty)
    - src/server/routers/index.ts (T04 — register qa)
    - src/app/(app)/layout.tsx (T04 — mount <QaSidebar/>)

key-decisions:
  - "OD-1 (RATIFIED): ai_usage_daily Postgres table (Option A) — the legitimate first schema change at the prod-debut merge; schema-lock RE-BASELINES to post-0007 HEAD f377dc9"
  - "OD-8 (RATIFIED): HARD block over-cap — 'Daily AI limit reached — resets at midnight UTC'; 02-CONTEXT soft-throttle wording SUPERSEDED"
  - "P2-D: debug surface STRIPPED at the router — the sidebar only ever receives a QaAnswer"
  - "OD-5: metadata-only qa_sidebar interaction persist; query/answer NULL (opt-in audit = FOLLOWUP-QA-PERSISTENCE-AUDIT-OPT-IN)"
  - "DEPLOY-DEFERRED: branch-only, PR #7 DRAFT, main untouched at acfab36; /codex + /cso + merge are founder-gated AFTER this build"

patterns-established:
  - "eval:run is a MANDATORY verify-loop gate — it is the only gate exercising the runAgent + eval static import graph under real tsx module-eval (no Next bundler aliasing of server-only)"
  - "Any @/db/client / server-only import reachable from runAgent or the eval graph MUST be lazy (dynamic import behind an async accessor)"

requirements-completed: [KNW-05]

# Metrics
duration: ~95min (T04 build + full verify-loop + docs)
completed: 2026-06-02
---

# Phase 2 Plan 07: Knowledge Layer Q&A + Cost Cap Summary

**KNW-05 completes: a grounded, cited ambient Q&A sidebar over the founder's confirmed knowledge — synthesized through the metered Opus chokepoint behind a REAL $5/user/day RESERVE-then-SETTLE cost cap, with zero-fabrication two-stage grounding and the eval/debug surface stripped at the tRPC boundary. Branch-only; this is the build that, once founder-reviewed, becomes the first prod merge of Phase 2.**

## Performance

- **Duration:** ~95 min (this pass: T04 build + full verify-loop incl. eval:run + docs)
- **Tasks this pass:** T04 (autonomous) + T05 (captured, not executed)
- **Prior autonomous tasks (on-branch):** T01, T02, T03
- **Files this pass:** 6 (T04) + 2 docs (SUMMARY, lessons)

## What the plan built (T01–T04)

| Task | Deliverable | Commit |
| ---- | ----------- | ------ |
| T01 | Cost-cap core — atomic RESERVE-then-SETTLE, `ai_usage_daily` (0007), dual-chokepoint enforcement (Anthropic + Voyage) | `f377dc9` |
| T01 hotfix | `cap.ts` lazy-imports `@/db/client` so `eval:run` (tsx) doesn't eager-load `server-only` | `a9babe5` |
| T02 | qa-rag agent — two-stage grounding (0.6 floor + citation validation) + metered Opus synthesis + `AskQaResult.debug` | `2eaa075` |
| T03 | qa-grounding eval flipped REAL + `PENDING_ALLOWED` emptied (eval gate fully active) | `fb00cdc` |
| T04 | Ambient Q&A sidebar + `qaRouter.ask` — three states, debug stripped at router, metadata-only persist | `001bbdf` |

(Note: `f377dc9` is also the RE-BASELINED schema-lock anchor — the post-0007 HEAD. Subsequent plans diff `src/db/schema/` against `f377dc9`, not 29228e8. FOLLOWUP-DBDIFF-01 is ACTIVE.)

## The four guardrail proofs

1. **Cost cap is REAL enforcement (guardrail #1 / F-1).** $5/user/day BLOCKS at both chokepoints via RESERVE-then-SETTLE. The RESERVE is a PROVABLE upper bound of the ENTIRE invocation — the (≤2) Anthropic attempts priced @ `OPUS_CACHE_WRITE` (the highest input-side rate, ≥ any actual bucket — P1-A(1)) over a MEASURED `inputTokenCeiling` = `Buffer.byteLength` of the COMPLETE billed input surface (system blocks + variableSuffix + the serialized forced-tool `input_schema` + `tool_choice`, cycle-4 — P1-A(2)); the larger repair-retry priced at `repairInputCeiling`; the OpenAI fallback DISABLED under `costContext` (P1-A(3)); Voyage prices the actual ≤8-text batch via UTF-8 byte length (P1-B). SETTLE = actual − reserved is always ≤ 0. SETTLE-or-REFUND runs in a `finally` keyed on the reservation token's UTC usageDate captured at reserve time (pre-call throw → full refund; post-call throw → settle-to-actual; midnight-crossing call adjusts the RESERVED day's row — P2-C). A hard crash between RESERVE and SETTLE leaves ONE bounded reservation that self-heals at UTC-day rollover (the precise sweeper is FOLLOWUP-COST-RESERVATION-RECLAIM-01).
2. **Zero fabrication, two-stage grounding (guardrail #2 / P2-E).** Stage 1: max `vectorScore` < 0.6 → deterministic "I don't know" WITHOUT calling Opus (cheapest path under the cap). Stage 2: every emitted citation re-validated against the SAME turn's retrieved set; ANY dropped citation forces `grounded:false` + the "I don't know" body. `grounded:true` REQUIRES ≥1 valid AND zero dropped. The fabrication signal is eval-observable AND type-separated: `askQa` returns `AskQaResult { answer, debug:{ droppedCitationCount, maxVectorScore, retrievedKeys } }`; the eval asserts `droppedCitationCount === 0`; a unit test proves the gate FAILS on a dropped citation.
3. **Privacy end-to-end (guardrail #3).** Query / answer / chunk text never enter a trace, logger, or `AppError` message/cause. The `debug` surface carries counts/scores/keys ONLY. **THE T04 PRIVACY BOUNDARY (P2-D):** `qaRouter.ask` returns `result.answer` ONLY — `result.debug` is destructured-and-discarded (`const { answer, debug: _debug } = result; void _debug;`) and never forwarded, logged, or persisted. The sidebar only ever receives a `QaAnswer`. The cap-exceeded path logs a content-blind marker (accountId + userId + action) with NO query echo. A grep confirms `debug` is not returned to the client.
4. **Chokepoint discipline (guardrail #4).** Anthropic synthesis through the EXISTING `runAgent` with prompt caching ON; no new client; `@anthropic-ai/sdk` only in `src/ai/client.ts`. Retrieved chunks screened + delimited into `variableSuffix` INSIDE `qa-rag.agent.ts` (T02), NOT the router (F-2 — a grep for the screening symbols in `qa.ts` returns ZERO; no duplicate layer).

## Key contracts

- **RESERVE-then-SETTLE concurrency + provable upper-bound + finally-lifecycle** — see guardrail #1. Holds under burst concurrency (F-1) and never under-reserves (Codex P1 folds).
- **Two-stage grounding + P2-D/P2-E** — see guardrail #2.
- **The privacy boundary (debug stripped at router)** — see guardrail #3 / P2-D. This is the load-bearing T04 property.
- **Metadata-only persistence (OD-5 + F-3).** The `qa_sidebar` interaction row populates EVERY NOT NULL column — **`accountId` (NOT NULL, `account_id` → accounts.id), `userId` (NOT NULL, `user_id` → users.id, from `ctx.session.user.id`), `kind: 'qa_sidebar'`** — plus the metadata columns `citations` (the answer's valid citation refs — sourceType/sourceId/chunkIdx, no chunk text), `model` (`OPUS_MODEL`), `langfuseTraceId` (null — askQa surfaces no trace id), `latencyMs` (measured at the router), and `grounded` in the `metadata` jsonb. `query`/`answer` columns are left NULL (confidentiality). The `result.debug` surface is NOT persisted. The write runs inside `ctx.db.rls`; a persistence failure is content-blind-swallowed so the founder's answer is never lost.
- **OD-8 HARD-block copy.** `AI_DAILY_CAP_EXCEEDED` → `TRPCError { code:'TOO_MANY_REQUESTS', message:'Daily AI limit reached — resets at midnight UTC.' }` (no query echo). The sidebar renders the limit-reached state with the EXACT copy **"Daily AI limit reached — resets at midnight UTC"** as its OWN distinct non-fabricated, non-error state.

## The three (four) sidebar states

| State | Trigger | Render |
| ----- | ------- | ------ |
| loading | mutation pending | non-streaming loading affordance ("Trochia is reading your knowledge and grounding an answer." + "Grounding…"); submit disabled, shows "Trochia is answering…" (OD-6 / F-4 — true streaming is FOLLOWUP-QA-STREAMING-01) |
| grounded | `answer.grounded === true` | the synthesized answer + inline `<CitationChip/>`s (each tracing to a retrieved source via a RELATIVE in-app route — `/app/memory`, `/app/corpus` — no hardcoded URL) |
| "I don't know" | `answer.grounded === false` (weak retrieval / dropped citation) | the deterministic operator-voice refusal body; NO chips — never a body backed by a fabricated citation |
| daily limit reached | `TOO_MANY_REQUESTS` (OD-8) | the EXACT "Daily AI limit reached — resets at midnight UTC" copy as a non-fabricated, non-error state (its own state — not a toast, not an invented answer) |

Plus a sibling generic error slot for any non-cap failure ("Trochia couldn't answer that just now…") — NEVER the raw error, NEVER the query/answer. Operator voice throughout (no help/want/feel/love), brand tokens only (ink/paper/signal/graphite/stone, Geist/Inter/Geist Mono), reduced-motion aware (`motion-reduce:` variants). The component test (7 passing) renders all four states + asserts no hardcoded URL + operator-voice copy + only `{ query }` forwarded (trimmed).

## Verify-loop (this pass — full, incl. eval:run)

| Gate | Result | Evidence |
| ---- | ------ | -------- |
| `npm run typecheck` | PASS | clean (after casting `ctx.db.rls` across the variance boundary to `AskQaCtx['rls']`, matching the qa-grounding eval-check pattern) |
| `npm run lint` | PASS | 0 errors (10 pre-existing warnings in `tests/inngest/functions/embed-memory.test.ts` — unrelated, out of scope) |
| `npm run check:banned` | PASS | "Banned-string check passed — no violations." |
| `npx vitest run` (full) | PASS w/ 2 known | 363 passed, 2 failed — ONLY the documented FOLLOWUP-HARDCODED-DOMAIN-REGEX-01 (`tests/billing/checkout-session.test.ts:66` + `tests/lib/email.test.ts:56`, the `trochia.asranest.com` build-domain over-fire). ZERO new failures. |
| `npx vitest run tests/components/qa/sidebar.test.tsx` | PASS | 7/7 — loading / grounded-with-chips / "I don't know" / "daily limit reached" (exact copy) + no-URL + voice + trimmed-input |
| `eval:run` PR-sim (creds unset) | PASS | exit 0 — extraction-floor / qa-grounding / cache-hit all `'skip'` (qa-grounding a REAL skip on absent ANTHROPIC_API_KEY, not pending) |
| schema-lock vs `f377dc9` (airtight) | CLEAN | no schema drift, no new schema files (T04/T05 add no schema) |
| `npx drizzle-kit check` | PASS | "Everything's fine" |

## T05 — Pre-prod-merge gate CHECKLIST (CAPTURED, founder-run — NOT executed)

This plan does NOT merge, deploy, push, or change prod schema. The founder runs the following deliberately, in order, AFTER this build + review:

1. **FOLLOWUP-NODE-VERSION-SKEW-01** — Pin Vercel Functions Node.js version (22.x explicitly OR aligned to 24 via `engines`); re-run the Voyage adapter MSW tests under both 22 + 24 locally; record the chosen version in `tasks/constraints.md`.
2. **FOLLOWUP-SOURCEMAP-PROD-PUBLIC-HARDENING-01** — Confirm `next.config.ts` `productionBrowserSourceMaps: false` + `withSentryConfig` `hideSourceMaps: true`; the build-time assertion (no public `.map` under `.next/static/chunks/`) passes.
3. **OD-1 prod schema deploy (RATIFIED).** `0007_ai_usage_daily.sql` runs against prod Supabase (DIRECT_URL path, per drizzle.config) BEFORE the app code that reads/writes `ai_usage_daily` goes live (the cap meter needs its table). The **schema-lock baseline is now `f377dc9`** (RE-BASELINED to the post-0007 HEAD — re-anchored, NOT removed; recorded here for subsequent plans). FOLLOWUP-DBDIFF-01 ACTIVE.
4. **FOLLOWUP-COST-RATES-RATIFY** — Verify `rates.ts` (input / output / cache-write / cache-read / voyage / REPAIR_OVERHEAD_TOKENS — NO OpenAI fallback rates) against current published Anthropic Opus + Voyage pricing before merge.
5. **VOYAGE_API_KEY + ANTHROPIC_API_KEY** present in Vercel prod env (env.ts is prodRequired — a missing key fails the build, the safer failure).
6. **OD-8 confirm-as-built** — HARD block + the exact "Daily AI limit reached — resets at midnight UTC" copy present (no sign-off open; this is a confirm check at the gate).
7. **Founder-gated /codex + /cso** on the execution diff (standing rule 12) — /codex (correctness) first, then /cso (security/data-flow); APPROVED-WITH-FIXES batches into ONE pre-redeploy commit citing each finding ID. Cost-cap + grounding + privacy guardrails are the review focus.
8. **Merge + smoke-test sequence** — flip PR #7 DRAFT→ready; push `phase-2-knowledge-layer` → main → Vercel auto-deploy; smoke: a real Q&A returns a cited answer in <8s; a weak query returns "I don't know"; the cap blocks a tenant driven over $5; the embed pipeline + retriever are live.
9. **Criterion 5 latency gate (F-5)** — After merge, confirm the Langfuse p50 dashboard for the qa-rag synthesis span (`agent:reason`) over the design-partner window reads median < 8s (a Langfuse-dashboard gate, not a unit test). `interaction.latencyMs` is persisted per turn as a cross-check.
10. **Design-partner / early-access awareness** — `/onboarding/import/paste` + the ambient Q&A surface go public with this merge.

## New follow-up captured

- **FOLLOWUP-COST-METER-DEFAULT-ON-01** (from the /codex+/cso pre-merge batch, codex#1 root-cause) — Metering is currently **OPT-IN**: `runAgent` meters only when the caller passes `costContext`. That opt-in design is WHY codex#1 (the paste path calling `runAgent` WITHOUT `costContext` → unmetered $5/day-cap bypass + unmetered OpenAI fallback) slipped through — a caller that simply forgets `costContext` silently escapes the cap with no signal. A follow-up should make user-facing metering **DEFAULT-ON or FAIL-LOUD** on an unmetered user-facing path, e.g.: (a) REQUIRE `costContext` for every non-`classify` `taskClass` (throw/typecheck-fail when absent), OR (b) a lint/test guard asserting every user-facing `runAgent` caller passes `costContext` (the internal health-check ping at `src/ai/health-check.ts` stays the only exempt caller). **Capture only — NOT implemented in this batch.**
- **FOLLOWUP-QA-STABLE-CACHE-01** (from T02's ratified deviation) — Thread the curated corpus + the tenant's confirmed business memory into `runAgent.stablePrefix.corpus` / `businessMemory` as STABLE cached blocks (the prompt-caching cost lever). T02 shipped the minimal form (the grounding system instruction cached in `stablePrefix.system`; per-query retrieved chunks in `variableSuffix`) because `askQa({ accountId, query }, { rls })` receives ONLY the query + the RLS runner — no read path hands the agent those stable blocks, and the plan forbids inventing a second retrieval path. **Cost rationale:** the corpus + confirmed memory are byte-stable across a tenant's queries; caching them as a stable prefix would cut the per-query input cost (cache-read ≪ cache-write/input) on the most expensive (Opus) call. A future plan that threads a stable corpus/memory read path fills these blocks. Non-negotiables already held: `costContext` present, chunks screened in `variableSuffix`, caching not disabled.

## Carried-forward follow-ups (unchanged)

PULL-OBS-COST-01-FORWARD (DELIVERED here; only SEC-02 tier-aware caps carry to Phase 4.5), FOLLOWUP-DBDIFF-01 (ACTIVE), FOLLOWUP-COST-RESERVATION-RECLAIM-01 (P2-C crash-strand sweeper), FOLLOWUP-QA-PERSISTENCE-AUDIT-OPT-IN (OD-5 opt-in full-query persist), FOLLOWUP-QA-GROUNDING-FIXTURE-EXPAND (full 50+10 Q-set), FOLLOWUP-QA-STREAMING-01 (OD-6 true token-streaming), FOLLOWUP-COST-RATES-RATIFY (T05 item 4), FOLLOWUP-SANITIZER-EVAL-01, FOLLOWUP-FTS-GIN-INDEX-01, FOLLOWUP-HARDCODED-DOMAIN-REGEX-01 (the 2 known vitest failures — D4 carve-out, route through CCO before tightening).

## Deviations from Plan

**1. [Rule 3 — blocking type mismatch] `ctx.db.rls` variance cast.**
- **Found during:** T04 typecheck.
- **Issue:** `ctx.db.rls` is typed against the FULL Drizzle schema (`PgTransaction<…full schema…>`); the agent's `AskQaCtx['rls']` declares the structurally-loose `PgTransaction<never,never,never>` runner (from `retrieve.ts`). The direct pass failed `tsc` on the schema variance.
- **Fix:** `{ rls: ctx.db.rls as unknown as AskQaCtx['rls'] }` — the SAME cast `src/ai/eval/checks/qa-grounding.ts` already uses across this variance boundary (runtime behaviour is identical — a `db.transaction` wrapper). Documented inline.
- **Files modified:** `src/server/routers/qa.ts`. **Commit:** `001bbdf`.

**2. [authoring, no behaviour change] Comment rewording to keep merge-gate greps clean.**
- Reworded two doc comments so the F-2 grep (`delimitUntrusted|screenForInjection` in `qa.ts`) and the no-hardcoded-URL grep (`https?://(trochia|localhost)` in `src/components/qa/`) both return ZERO — the only matches had been illustrative prose in comments. No code change; both greps now ZERO.

No other deviations — T04 executed as written.

## DEPLOY-DEFERRED posture

Branch-only. PR #7 stays DRAFT. **main untouched at `acfab36`.** `/codex` + `/cso` + the merge are the remaining founder-gated steps AFTER this build. Once reviewed, this becomes the FIRST prod merge of Phase 2 — the embed pipeline (02-04) + the retriever (02-06) + this agent/sidebar/cap all go live in ONE Vercel auto-deploy.

## Commits

- `f377dc9` feat(02-07/T01): cost-cap core — atomic reserve-then-settle + ai_usage_daily (0007) + dual-chokepoint enforcement (also the RE-BASELINED schema-lock anchor)
- `a9babe5` fix(02-07/T01): lazy-import @/db/client in cap.ts so eval:run (tsx) doesn't eager-load server-only
- `2eaa075` feat(02-07/T02): qa-rag agent — two-stage grounding + metered Opus synthesis + AskQaResult.debug
- `fb00cdc` feat(02-07/T03): flip qa-grounding eval to real + empty PENDING_ALLOWED
- `001bbdf` feat(02-07/T04): ambient Q&A sidebar + qaRouter.ask — three states, debug stripped at router, metadata-only persist
- (this commit) docs(02-07): SUMMARY (build close) + pre-prod-merge checklist (T05) + lessons (eval:run/server-only)

## Self-Check: PASSED

- Files: all 5 created files FOUND (qa.ts, sidebar.tsx, citation-chip.tsx, sidebar.test.tsx, SUMMARY.md).
- Commits: T01 `f377dc9`, T02 `2eaa075`, T03 `fb00cdc`, hotfix `a9babe5`, T04 `001bbdf` all FOUND in git log.
