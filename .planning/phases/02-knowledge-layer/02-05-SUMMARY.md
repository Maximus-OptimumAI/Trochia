---
phase: 02-knowledge-layer
plan: 05
subsystem: testing
tags: [phase-2, eval-harness, langfuse, fetchTraces, prompt-cache, extraction-floor, cache-hit, skip-status, EVAL_LIVE_REQUIRED, PENDING_ALLOWED, ci, github-actions, cross-ai-convergence, schema-lock]

# Dependency graph
requires:
  - phase: 02-knowledge-layer
    plan: 04
    provides: "eval-harness scaffold (src/ai/eval/runner.ts fail-CLOSED contract + types.ts EvalStatus + 3 'pending' stub checks + .github/workflows/eval.yml + npm run eval:run); the runner.test.ts 5-case contract test"
  - phase: 02-knowledge-layer
    plan: 02
    provides: "extractFromPaste agent (routes through runAgent → src/ai/client.ts chokepoint) + the 5 paste fixtures at tests/ai/fixtures/paste-*.txt; countPopulatedFields in business-memory.zod.ts"
  - phase: 01-foundation
    provides: "src/lib/langfuse.ts (getLangfuseClient nullable + isLangfuseConfigured); src/ai/client.ts (trace name agent:${taskClass} + trace.update metadata.cacheRead/inputTokens — NO GENERATION observations); src/lib/env.ts (prodRequired wrapper + unconditional NEXT_PUBLIC_SITE_URL/APP_URL)"
provides:
  - "src/ai/eval/types.ts — EvalStatus extended to 'pending' | 'pass' | 'fail' | 'skip'; 'skip' = env-unavailable (fail-OPEN in non-live; FAILS under EVAL_LIVE_REQUIRED) documented on the type, distinct from 'pending' = not-yet-implemented (qa-grounding only)"
  - "src/ai/eval/runner.ts — PENDING_ALLOWED = new Set<string>(['qa-grounding']); exitCode 1 on any 'fail' OR non-allowlisted 'pending' OR (EVAL_LIVE_REQUIRED==='1' AND any 'skip'); badge() widened to EvalStatus + renders '⏭️ skip'; stdout/GITHUB_STEP_SUMMARY/eval-report.json/ESM-CLI entrypoint unchanged (FOLLOWUP-EVAL-PENDING-RUNTIME-GATE-01 closed)"
  - "src/ai/eval/checks/extraction-floor.ts — REAL: no ANTHROPIC_API_KEY → 'skip' (agent not called); else real extractFromPaste × 5 paste fixtures → reuse shallow countPopulatedFields → mean ≥ 8 ? 'pass' : 'fail'; metric=mean, threshold=8; reason carries counts only; no @anthropic-ai/sdk import"
  - "src/ai/eval/checks/cache-hit.ts — REAL: !isLangfuseConfigured() → 'skip' (no call); else fetchTraces({fromTimestamp: Date−7d, fields:'core,io', limit:100}) filtered by 'agent:' name-prefix, sum metadata.cacheRead/inputTokens, ratio>0 ? 'pass' : 'fail'; metric=ratio, threshold=0; reads ONLY metadata.* (never .input/.output); Array.isArray(res.data) guard → fail-CLOSED on malformed/401 reads"
  - "src/ai/eval/fixtures/index.ts — re-export seam: PASTE_FIXTURE_PATHS (5 cwd-anchored paths to tests/ai/fixtures/paste-*.txt) + loadFixtureText(); zero fixture bodies duplicated"
  - ".github/workflows/eval.yml — pull-requests: write re-added; PR step (if pull_request, no secrets, EVAL_LIVE_REQUIRED unset → live checks skip) + LIVE step (if != pull_request, EVAL_LIVE_REQUIRED=1 + ANTHROPIC/Langfuse secrets) + actions/github-script@v7 PR-comment step (if always() && pull_request, whitelisted summary only); both eval steps now set NEXT_PUBLIC_SITE_URL/APP_URL (env.ts import requirement) (FOLLOWUP-EVAL-PR-COMMENT-01 closed)"
  - "tests/ai/eval/checks/extraction-floor.test.ts (7 cases, extractFromPaste mocked) + tests/ai/eval/checks/cache-hit.test.ts (6 cases, getLangfuseClient mocked) + runner.test.ts (8 cases incl. Case 6 non-allowlisted-pending→1, Case 7 skip→0, Case 8 skip+EVAL_LIVE_REQUIRED→1)"
affects:
  - "Plan 02-06 (RAG retrieve) — no direct dependency; eval harness is orthogonal infra"
  - "Plan 02-07 (Q&A sidebar + qa-rag + cost cap) — flips qa-grounding.ts from 'pending' to real AND removes 'qa-grounding' from PENDING_ALLOWED so the allowlist empties; the joint-merge plan where the deploy-deferred write+read+cost-cap ships"
  - "Phase 3 (Pitch Lab — PITCH-04) — reuses this eval harness; the deferred FOLLOWUP-SANITIZER-EVAL-01 owns the Phase-3 'FP rate <25%' gate"
  - "FOLLOWUP-SANITIZER-EVAL-01 — the live-sanitizer FP/FN eval (deferred from this plan); a DIRECT eval over promptInjectionSanitizer + redactUnrelatedPartyPII, NOT via the paste path"

# Tech tracking
tech-stack:
  added: []   # zero new npm deps; uses installed langfuse@^3.38.20 fetchTraces
  patterns:
    - "Eval-status model: 'skip' (env-unavailable, fail-OPEN in non-live) vs 'pending' (not-implemented, allowlisted) vs 'pass'/'fail'; runner promotes 'skip' → FAILURE under EVAL_LIVE_REQUIRED so a creds-misconfigured scheduled run is a RED gate, not a green lie"
    - "Live-AI eval checks env-gate on credential PRESENCE (not validity); ALWAYS mock the live dependency (extractFromPaste / getLangfuseClient) in vitest — a present-but-invalid key in .env.local defeats a presence-only gate and fires a real call (lessons.md 2026-06-01)"
    - "GitHub Actions PR/LIVE step split (mutually-exclusive github.event_name conditions) instead of an invalid `if:`-under-`env:` block — secrets + EVAL_LIVE_REQUIRED only on the non-PR step; PR-comment step posts a whitelisted summary only"
    - "Langfuse cache metrics live on TRACE metadata (trace.update), not GENERATION observations — read via fetchTraces({fields:'core,io'}) reading metadata.*, never trace .input/.output"

key-files:
  created:
    - "src/ai/eval/fixtures/index.ts — fixture re-export seam (PASTE_FIXTURE_PATHS + loadFixtureText)"
    - "tests/ai/eval/checks/extraction-floor.test.ts — 7 cases, agent mocked"
    - "tests/ai/eval/checks/cache-hit.test.ts — 6 cases, Langfuse mocked"
    - ".planning/phases/02-knowledge-layer/02-05-SUMMARY.md — this file"
  modified:
    - "src/ai/eval/types.ts — +'skip' to EvalStatus"
    - "src/ai/eval/runner.ts — PENDING_ALLOWED Set + EVAL_LIVE_REQUIRED gate + badge('skip')"
    - "src/ai/eval/checks/extraction-floor.ts — flipped 'pending' → real"
    - "src/ai/eval/checks/cache-hit.ts — flipped 'pending' → real via fetchTraces"
    - "src/ai/eval/fixtures/README.md — reframed to the shipped re-export-seam reality"
    - "tests/ai/eval/runner.test.ts — Cases 1/4/5 mock live checks; +Cases 6/7/8; Case 2 made hermetic at close"
    - ".github/workflows/eval.yml — PR/LIVE/PR-comment split + pull-requests:write + NEXT_PUBLIC_* env"
    - "tasks/lessons.md — env-gate-keys-on-presence gotcha (2026-06-01)"
    - ".planning/ROADMAP.md + .planning/STATE.md — plan progress"

key-decisions:
  - "T04 (live-sanitizer FP/FN check) DEFERRED per founder ruling 2026-05-31 — Codex C1-H4 proved the originally-planned wiring could not run (injection fixtures are short strings that fail extractFromPaste's MIN-length check before the sanitizer; PII fixtures are draftInput objects for redactUnrelatedPartyPII, not pastes). Captured as FOLLOWUP-SANITIZER-EVAL-01 (a DIRECT sanitizer/redactor eval), which owns the Phase-3 FP-rate gate. 02-05 stays at exactly the founder's stated scope: extraction-floor + cache-hit."
  - "'skip' EvalStatus + EVAL_LIVE_REQUIRED gate (OD-A) — the load-bearing decision. 'skip' separates env-unavailable (fail-OPEN on PR/local) from 'pending' (not-implemented). EVAL_LIVE_REQUIRED=1 (set only on the scheduled/manual LIVE step) turns a 'skip' into a FAILURE — proven end-to-end at close: PR-sim exit 0, LIVE-sim (no creds) exit 1."
  - "cache-hit reads TRACE metadata via fetchTraces, NOT fetchObservations({type:'GENERATION'}) — Codex C1-H2 traced client.ts and found it writes cache metrics to trace metadata and creates NO GENERATION observations, so the cycle-1 observations query would have returned no data. fields:'core,io' is the restricted whitelist that returns metadata; the check reads ONLY metadata.cacheRead/inputTokens (G-LANGFUSE-WHITELIST)."
  - "Array.isArray(res.data) guard in cache-hit (T03 deviation, ratified) — a malformed/401 Langfuse response resolves with non-array data; the guard treats it as zero traces → ratio 0 → 'fail' (fail-CLOSED, never a throw, never a silent pass). Genuine production hardening, in-scope."
  - "eval.yml NEXT_PUBLIC_SITE_URL/APP_URL env added (close-out fix, surfaced by the verify-loop) — env.ts requires these two URLs UNCONDITIONALLY and validates at import; 02-05's flipped checks import env.ts transitively, so eval:run (and both CI eval steps) crashed at import without them. Same secrets-||-localhost fallback pattern as ci.yml. 02-04's stubs imported nothing, which is why this surfaced only now."
  - "requirements: [] — 02-05 delivers no canonical REQUIREMENTS.md ID (verified: phase-02 IDs are KNW-*/XC-08, no eval requirement). It is prerequisite eval infrastructure: cache-hit is the verification surface for XC-06 (already Complete) + FND-07; PITCH-04 (Phase 3) reuses the harness later. Strategic ticket EVAL-01b. (plan-checker Finding 1)"

requirements-completed: []   # prerequisite eval infrastructure; no canonical Phase-2 requirement delivered (see key-decisions). strategic_tickets: [EVAL-01b]

# Metrics
duration: ~2 days (plan author 2026-05-30 d47c9b7 → close 2026-06-01); 3 cross-AI convergence cycles + 3 sequential single-agent task executions
completed: 2026-06-01
---

# Phase 2 Plan 05 — Eval Harness: flip extraction-floor + cache-hit stubs to real (EVAL-01b) Summary

**The eval harness's two Phase-2 checks now run for real: `extraction-floor` scores the live `extractFromPaste` agent over the 5 paste fixtures (reusing the existing shallow `countPopulatedFields`, mean ≥ 8 → pass), and `cache-hit` reads the Anthropic prompt-cache ratio from Langfuse TRACE metadata via `fetchTraces` (ratio > 0 → pass) — both behind a new `'skip'` EvalStatus that is fail-OPEN on PRs/local but becomes a FAILURE under the `EVAL_LIVE_REQUIRED` signal the scheduled/manual CI step sets, with a `PENDING_ALLOWED = new Set(['qa-grounding'])` runtime gate that fails CI on any other lingering `'pending'`; `qa-grounding` stays `'pending'` (Plan 02-07), the originally-routed 4th sanitizer check was deferred to FOLLOWUP-SANITIZER-EVAL-01 per founder ruling after Codex proved its fixtures couldn't flow through the paste path, the eval.yml workflow split into a no-secrets PR step + a secrets+EVAL_LIVE_REQUIRED LIVE step + a whitelisted PR-comment step, and the schema-lock held byte-identical at `29228e8`.**

## Performance

- **Duration:** ~2 days (plan author 2026-05-30 → close 2026-06-01)
- **Tasks:** 3 of 3 (T01 runner gate; T02 extraction-floor flip + fixture seam; T03 cache-hit flip + eval.yml split). Optional T04 deferred per founder.
- **Execution model:** sequential single-agent, one gsd-executor per task, founder greenlight between each (Windows worktree rule; no parallel agents)
- **Convergence:** internal gsd-plan-checker (sonnet) APPROVED-WITH-NOTES → 3 Codex cross-AI cycles (4 HIGH → replan → resolved + 2 new minor → 1 HIGH refuted via type-def evidence + 1 MED fixed) → CONVERGED
- **Source LOC delta:** ~+560 / −70 across 8 eval/test/CI files + lessons.md

## Accomplishments

- **`extraction-floor.ts` flipped to a real eval** — env-gates on `ANTHROPIC_API_KEY` (absent → `'skip'`, agent never called), else runs the real `extractFromPaste` over the 5 paste fixtures (via the `fixtures/index.ts` re-export seam, zero duplication), counts populated fields by reusing the existing `countPopulatedFields` (shallow `Object.keys(group).length>0` semantics, not re-implemented), and returns `mean ≥ 8 ? 'pass' : 'fail'` with `metric`/`threshold`. `reason` carries counts only; no `@anthropic-ai/sdk` import (Anthropic exercised only through the chokepoint).
- **`cache-hit.ts` flipped to a real eval** — env-gates on `isLangfuseConfigured()` (false → `'skip'`), else `fetchTraces({ fromTimestamp: Date−7d, fields: 'core,io', limit: 100 })`, filters to `agent:*` traces, sums `metadata.cacheRead`/`metadata.inputTokens`, `ratio > 0 ? 'pass' : 'fail'`. Reads ONLY `metadata.*` (never `.input`/`.output`); credentials only via `src/lib/langfuse.ts`; `Array.isArray` guard makes a malformed/401 read fail-CLOSED.
- **Runner runtime gate (FOLLOWUP-EVAL-PENDING-RUNTIME-GATE-01)** — `PENDING_ALLOWED = new Set<string>(['qa-grounding'])` + `EVAL_LIVE_REQUIRED` promotes any `'skip'` to a FAILURE on live runs. `badge()` widened to `EvalStatus`. 8/8 runner cases pin the contract.
- **eval.yml (FOLLOWUP-EVAL-PR-COMMENT-01)** — `pull-requests: write` re-added; valid PR/LIVE/PR-comment three-step split (no invalid `if:`-under-`env:`); secrets + `EVAL_LIVE_REQUIRED` only on the non-PR step; `actions/github-script@v7` posts a whitelisted summary (no secrets/trace/PII). Plus the close-out env fix (`NEXT_PUBLIC_SITE_URL`/`APP_URL`) so `eval:run` can import `env.ts` in CI.
- **`qa-grounding` correctly held at `'pending'`** — the single allow-listed pending; G-EVAL-1 reaches its final `≤1` state (exactly `qa-grounding.ts`). Plan 02-07 flips it and empties the allowlist.
- **Schema-lock held** — zero migrations; `git diff --quiet 29228e8 -- src/db/schema/` exits 0; `npx drizzle-kit check` clean. Zero new npm deps.

## Task Commits

| Task | Commit | Description |
|------|--------|-------------|
| Plan + convergence | `d47c9b7` | docs(02-05): plan + convergence cycles 1-3 |
| T01 | `1f5941f` | feat(02-05/T01): 'skip' EvalStatus + PENDING_ALLOWED + EVAL_LIVE_REQUIRED runner gate |
| T02 | `ddade8b` | feat(02-05/T02): flip extraction-floor to real eval + fixtures re-export seam |
| T03 | `ca1b574` | feat(02-05/T03): flip cache-hit to real eval via Langfuse fetchTraces + eval.yml PR/LIVE/comment split |
| Close fix | (this wave) | fix(02-05): eval.yml CI env + Case 2 hermetic test (verify-loop findings) |
| Close docs | (this wave) | docs(02-05): SUMMARY + lessons + ROADMAP/STATE |

Executed sequential single-agent, one task per dispatch, with founder greenlight between each.

## Decisions Made

See `key-decisions` frontmatter. Headline: T04 deferred (FOLLOWUP-SANITIZER-EVAL-01); `'skip'`+`EVAL_LIVE_REQUIRED` status model; `fetchTraces`-over-trace-metadata read path; `requirements: []` (prerequisite infra, not a canonical Phase-2 requirement).

## Deviations from Plan

All ratified by the founder during the per-task greenlight loop.

**1. [T02] `runner.test.ts` Cases 4+5 stubbed the now-live checks.** T01 authored those cases unmocked (safe while all checks were inert stubs). Once extraction-floor went live and `tests/setup.ts` loaded `.env.local`'s (invalid) key, they fired a real 401. Fix: `vi.spyOn(...).mockResolvedValueOnce('skip')` — assertions unchanged, T01 logic untouched. Verified mock-only via diff inspection.

**2. [T03] `Array.isArray(res.data)` guard in cache-hit.** A 401 Langfuse response resolves with non-array `data` → `for...of` threw. Guard → zero traces → ratio 0 → `'fail'` (fail-CLOSED). Sound production hardening, in-scope.

**3. [T03] In-code `agent:` prefix filter** instead of a `name:` param to `fetchTraces` — aggregates cache reuse across all agents; the plan explicitly permitted this option.

**4. [Close] `runner.test.ts` Case 2 made hermetic** — the one remaining case that ran cache-hit unmocked (live 401, +6s, offline-fragile). Added `cacheHit → 'skip'` stub mirroring every other case. Founder-greenlit at close.

**5. [Close] eval.yml `NEXT_PUBLIC_SITE_URL`/`APP_URL` env added** — verify-loop found `eval:run` crashes at `env.ts` import (those two URLs are unconditionally required) once the flipped checks import `env.ts`; both CI eval steps would have crashed. Fixed with the ci.yml `secrets-||-localhost` fallback pattern.

## Verification Loop Results (branch-only close)

| # | Gate | Status | Evidence |
|---|------|--------|----------|
| 1 | `npx drizzle-kit check` | **PASS** | "Everything's fine 🐶🔥" |
| 2 | Schema-lock `git diff --quiet 29228e8 -- src/db/schema/` | **PASS** | exit 0 (byte-identical to baseline) |
| 3 | `npm run lint` | **PASS** | 0 errors, 10 pre-existing warnings (T04-era `_proj`/`_table`/`_pred` underscore stubs) |
| 4 | `npm run typecheck` | **PASS** | `tsc --noEmit` clean |
| 5 | `npm run check:banned` | **PASS** | "Banned-string check passed — no violations." |
| 6 | `npm run eval:run` (after env fix) | **PASS** | PR-sim (no creds, EVAL_LIVE_REQUIRED unset) → exit 0 (all skip + qa-grounding pending); LIVE-sim (EVAL_LIVE_REQUIRED=1, no creds) → exit 1 (C1-H1 fail-closed gate proven end-to-end) |
| 7 | `npx vitest run` | **ACCEPTED-WITH-FOLLOWUP** | 289/291 pass. The 2 failures (`tests/lib/email.test.ts:56` + `tests/billing/checkout-session.test.ts`) are the pre-existing `FOLLOWUP-HARDCODED-DOMAIN-REGEX-01` (`not.toMatch(/trochia\.ai\|trochia\.asranest/)` over-firing on the legitimate `system@trochia.asranest.com` from-address), present since Phase 1 — NOT a 02-05 regression (02-05 touched only eval files + runner test + eval.yml). D4 bounded-bypass carve-out applies. Eval-specific: **21/21** (runner 8 + extraction-floor 7 + cache-hit 6). |
| 8 | `npm run test:e2e` (Playwright) | **N/A — unaffected** | 02-05 touches zero UI/runtime app code (eval harness + CI workflow only); the Phase-2 e2e baseline (50 pass / 10 skip) is not exercised by this plan. Not re-run. |

## G-EVAL-1 final state

`grep -rln "status: 'pending'" src/ai/eval/checks/` → exactly **1**: `qa-grounding.ts`. The mandatory handoff gate holds.

## Hand-off to Plan 02-07 (qa-rag + cost cap — the joint-merge plan)

- **Flip `qa-grounding.ts`** from `'pending'` to a real eval when the qa-rag agent lands, AND **remove `'qa-grounding'` from `PENDING_ALLOWED`** in `runner.ts` so the allowlist empties (G-EVAL-1 then becomes 0 literal pending).
- **PULL-OBS-COST-01-FORWARD** still owed in that same merge (the deploy-deferred write+read+cost-cap cutover).
- The eval harness is ready to gate the qa-rag work: add a `qa-grounding` real check + its fixtures; the runner/skip/EVAL_LIVE_REQUIRED machinery needs no further change.

## Still-open follow-ups (carried, not closed here)

- **FOLLOWUP-SANITIZER-EVAL-01** — DIRECT sanitizer/redactor FP/FN eval (deferred T04); owns the Phase-3 "FP rate <25%" gate; 27 injection + 17 PII fixtures already committed.
- **FOLLOWUP-HARDCODED-DOMAIN-REGEX-01** — the `trochia.asranest` regex over-fire (the 2 pre-existing test failures); route through CCO/compliance before tightening.
- **FOLLOWUP-NODE-VERSION-SKEW-01** + **FOLLOWUP-SOURCEMAP-PROD-PUBLIC-HARDENING-01** — pre-first-prod-merge gates (unchanged).
- The 02-04 deploy-deferred posture stands: PR #7 DRAFT, main untouched, prod cutover at the 02-07 joint merge.

## Founder-gated review (/codex + /cso) — completed 2026-06-01

Both complementary gates ran on `3301aa9..HEAD` (eval surface) and were triaged into ONE pre-redeploy batch commit `27446f1` (branch-only, no deploy).

- **/codex** (Codex CLI): GATE FAIL — 2×P1, 3×P2, 2×P3. One P1 (cache-hit parallel/flush) re-rated to P2 after verification (it measures the ambient window, not this run's traces; the real bug was empty-window→fail). All findings addressed.
- **/cso** (CSO audit): **APPROVED-WITH-FIXES** — 0 CRITICAL, 0 HIGH, 2 MED, 3 LOW. The two prime security properties hold by design: (1) repo secrets never reach a `pull_request` run (LIVE step gated to non-PR); (2) no PII/trace/secret reaches the PR comment or report (hard whitelist + metadata-only Langfuse read). Report at `.gstack/security-reports/20260601-cso-plan-02-05.json` (gitignored).

Batch `27446f1` applied: cache-hit empty-window→`skip`; runner per-check try/catch→sanitized `fail` + always-write report; eval.yml comment same-repo guard (fork-PR 403 safety) + full cell-sanitize/allowlist hardening; PR step `secrets.*`→literal localhost (secret-free); +4 tests (runner thrown-check; cache-hit empty/`{data:undefined}`/rejection). Deferred (non-blocking): /cso M2 SHA-pin first-party actions (consistent with ci.yml convention). Post-batch verify-loop: eval 25/25; tsc clean; eval.yml valid; eval:run PR-sim exit 0 / LIVE-sim exit 1; vitest 293/295 (2 = pre-existing FOLLOWUP-HARDCODED-DOMAIN-REGEX-01).

## Task Commits (final)

| | Commit | |
|---|---|---|
| T01 | `1f5941f` | runner skip/PENDING_ALLOWED/EVAL_LIVE_REQUIRED gate |
| T02 | `ddade8b` | extraction-floor flip + fixtures seam |
| T03 | `ca1b574` | cache-hit flip via fetchTraces + eval.yml split |
| Close fix | `268029e` | eval.yml CI env + Case 2 hermetic test |
| Close docs | `01cb9e1` | SUMMARY + lessons + ROADMAP/STATE |
| Pre-redeploy triage | `27446f1` | /codex + /cso findings batched |

## DEPLOY-DEFERRED note

No prod deploy fires at this close. 02-05 is branch-only on `phase-2-knowledge-layer`; PR #7 stays DRAFT; main untouched at `acfab36`. Both founder-gated reviews are complete (above); the plan rests inside the deploy-deferred branch until the 02-07 joint write+read+cost-cap merge.

## Self-Check: PASSED

- All 3 task headings (T01-T03) map to commits; T04 deferred + recorded.
- Verify-loop ran end-to-end; the only test failures are the documented pre-existing FOLLOWUP (D4 carve-out), proven by direct assertion inspection.
- G-EVAL-1 holds (1 pending = qa-grounding); schema-lock holds (exit 0); zero new deps; AI chokepoint intact (0 SDK imports in eval).
- Trochia voice held (operator register); banned-string check clean.
- DEPLOY-DEFERRED explicit; PR #7 DRAFT; main untouched.

---

*Authored 2026-06-01 by Claude Opus 4.8 (1M context) at Plan 02-05 close (branch-only). Predecessor: Plan 02-04 (deploy-deferred close `3301aa9`). Successor: Plan 02-06 (RAG retrieve) + Plan 02-07 (qa-rag + qa-grounding flip + OBS-COST-01 — the joint-merge plan that takes the write+read path to prod).*
