# Trochia Handoff — 2026-05-30

**Closing:** Plan 02-04 (Phase 2 Week 4 — embed pipeline + curated corpus + eval scaffold) — `[CLOSED on branch — NOT deployed to prod]`
**Branch:** `phase-2-knowledge-layer` at HEAD `3301aa9` (Phase C SUMMARY commit will be the next push)
**Main:** `32e35c1` (untouched — no merge)
**PR #7:** OPEN as DRAFT (base=main, head=phase-2-knowledge-layer); stays draft through more Phase 2 work
**Next plan to start:** Plan 02-05 (eval harness — flip the three `'pending'` stubs to real implementations)

---

## What just shipped (on branch only)

Plan 02-04 added the embed-memory pipeline that turns a founder-confirmed `business_memory` row into per-tenant `vector(1024)` rows in the `embeddings` table:

- **Voyage adapter** at `src/ai/integrations/voyage.adapter.ts` (the only surface that calls `api.voyageai.com`)
- **Deterministic chunker** at `src/ai/chunking/chunk.ts` (800/200, pure, heuristic tokenCount labeled on type)
- **embed-memory Inngest function** at `src/inngest/functions/embed-memory.ts` (per-tenant concurrency cap 3, retries 2, TOCTOU guard via `FOR SHARE` re-read inside Step 3 transaction, DELETE-then-INSERT under unchanged dedup key, 6 distinct Sentry breadcrumb tags)
- **`memory.confirmed` event emission** from `confirmDraft` (try/catch + logger.warn resilience; 3-field payload, zero PII)
- **5 inert curated corpus seed docs** at `data/corpus/*.md` + `MANIFEST.json` (no runtime reader yet — corpus-sync deferred to FOLLOWUP-CORPUS-SYNC-01)
- **Eval-harness scaffold** at `src/ai/eval/` + `.github/workflows/eval.yml` + `npm run eval:run` script (3 `'pending'` stubs; runner contract codified fail-CLOSED on any `'fail'`; Plan 02-05 flips stubs)
- **VOYAGE_API_KEY** flipped to `prodRequired(z.string())` + ci.yml fallback added
- **TEST_DATABASE_URL presence assertion** added as FIRST step of build-and-test (closes /codex P2-2 + /cso F1)
- **eval.yml `pull-requests: write` permission dropped** (least privilege; closes /cso F2)

`/codex` returned GATE PASS (0×P1). `/cso` returned APPROVED for prod redeploy (0×P1, 0×HIGH). 11 STRIDE mitigations verified in code. All 5 corpus docs verified for copyright posture.

Full close detail at `.planning/phases/02-knowledge-layer/02-04-SUMMARY.md`.

---

## The strategic decision: DEPLOY-DEFERRED

**Plan 02-04 is merge-READY, not merged. The prod deploy waits.**

Reason: the embed-memory pipeline introduces a new AI-token egress (Voyage embeddings, per-token billing). Two prerequisites for the prod-debut:

1. **Read path must land in the same merge** — Plan 02-06 (hybrid pgvector + FTS retriever) + Plan 02-07 (qa-rag agent). Shipping the write path alone means founders pay Voyage costs and get zero retrieval value until later. The aggregate value + the aggregate risk both arrive at the read-path merge — that's where the prod cutover belongs.

2. **`OBS-COST-01` ($5/user/day cap) must land in the SAME merge** — not as a Plan 02-07-FOLLOWUP. Tracked as `PULL-OBS-COST-01-FORWARD` in `02-04-PLAN.md` deferred_items. The prod-debut of any AI-token-spending feature must already have its cost cap enforced.

**Operational consequence:**
- PR #7 stays a DRAFT through Plan 02-05 + 02-06 + 02-07
- `phase-2-knowledge-layer` branch accumulates commits
- `main` stays at `32e35c1`
- At Plan 02-07 close, the joint-merge plan ships all three (read path + write path live-debut + cost cap) in one Vercel auto-deploy on push to main

**The principle generalizes:** every future plan introducing a new AI-token egress (Plan 02-06 qa-rag query embedding, Phase 3 deck reviewer, Phase 4 pipeline auto-stage, Phase 5 voice ASR vendor) should ratify with the founder whether it's a "ship write path before read path" candidate (rare; only when the write path itself surfaces founder value) or a "wait for joint deploy" candidate (default).

---

## Open follow-ups (carry to next plan / pre-prod-merge gate)

### Must land in the joint-merge plan (Plan 02-07 + cost-cap close)

- **PULL-OBS-COST-01-FORWARD** — Ship `OBS-COST-01` ($5/user/day cap) in the same merge as the write path's prod-debut. Test asserts a single tenant cannot drive aggregate Anthropic + Voyage daily spend over $5. Implementation gates at `src/ai/client.ts` (Anthropic chokepoint) AND `src/ai/integrations/voyage.adapter.ts` (Voyage chokepoint).
- **FOLLOWUP-NODE-VERSION-SKEW-01** — Vercel runtime defaults to Node 22.x; CI runs Node 24. Align before first prod merge (either pin Vercel to 24 or pin CI to 22; confirm Vercel project Settings → Functions → Node.js Version explicitly).
- **FOLLOWUP-SOURCEMAP-PROD-PUBLIC-HARDENING-01** — Verify production source maps go to Sentry but not to `_next/static/.../*.map` public route on the authed app surface. Pin via build-time assertion test.

### Plan 02-05 (next)

- Flip `extraction-floor.ts` + `cache-hit.ts` from `'pending'` to real implementations
- `qa-grounding.ts` stays `'pending'` until Plan 02-07's qa-rag agent lands
- **FOLLOWUP-EVAL-PENDING-RUNTIME-GATE-01** — Add runtime allowlist `PENDING_ALLOWED = ['qa-grounding']` to `src/ai/eval/runner.ts` (Codex P3 hardening)
- **FOLLOWUP-EVAL-PR-COMMENT-01** — Wire the PR-comment step the plan promised; re-add `pull-requests: write` to eval.yml then
- Plan-checker MUST assert `grep -rn "status: 'pending'" src/ai/eval/checks/` returns ≤ 1 hit AND that hit is `qa-grounding.ts` (process gate until the runtime allowlist lands)

### Background carry

- **FOLLOWUP-CORPUS-SYNC-01** — corpus-sync Inngest function (cycle-7 scope-reduced); all 6 standing plan-checker gates apply at AUTHORING time
- **FOLLOWUP-HARDCODED-DOMAIN-REGEX-01** — `trochia.asranest` regex over-fire (the only failure D4 bounded-bypass currently covers); route through CCO / compliance lens before tightening
- **FOLLOWUP-CORPUS-01** — Expand curated corpus from 5 → 50 docs
- **FOLLOWUP-DRIZZLE-TYPE-ANNOTATION-01** — Post-Phase-2 schema-lock release, add `.$type<T>()` to jsonb columns
- **FOLLOWUP-VOYAGE-TIMEOUT-TEST** — Real-timer abort test when voyage.adapter.ts is next edited
- **FOLLOWUP-DBDIFF-01** — Build proper reusable `db:diff` in the first future plan that legitimately modifies schema

Full per-bucket list at `.planning/phases/02-knowledge-layer/02-04-PLAN.md` `<deferred_items>` block.

---

## Resume context for the next session

**If picking up Plan 02-05 next:**

1. Read `.planning/phases/02-knowledge-layer/02-04-SUMMARY.md` Hand-off to Plan 02-05 section
2. Read `.planning/phases/02-knowledge-layer/02-PLAN.md` for Phase 2 master context
3. The eval scaffold is at `src/ai/eval/`; flip `extraction-floor.ts` + `cache-hit.ts` to real implementations
4. Fixtures live at `tests/ai/fixtures/paste-*.txt` (5 paste fixtures from Plan 02-02)
5. Plan-checker preflight: `grep -rn "status: 'pending'" src/ai/eval/checks/` after 02-05 ships should return ≤ 1 hit (qa-grounding.ts)
6. Schema-lock guard still applies: `git diff --quiet 29228e8 -- src/db/schema/` must continue to exit 0

**If picking up the write-path-prod-debut planning (the joint Plan 02-07 + cost cap close):**

1. Read this handoff doc top-to-bottom + `02-04-SUMMARY.md` DEPLOY-DEFERRED note
2. PULL-OBS-COST-01-FORWARD is the planner's North Star — cost cap is non-negotiable in this merge
3. Before the merge: run FOLLOWUP-NODE-VERSION-SKEW-01 + FOLLOWUP-SOURCEMAP-PROD-PUBLIC-HARDENING-01 checks
4. Verify VOYAGE_API_KEY is in Vercel production env BEFORE the merge fires (env.ts is `prodRequired` so a missing key fails the build, which is the safer failure mode)
5. Confirm design partners / early-access cohort awareness — the `/onboarding/import/paste` flow goes public with this merge

---

## Standing rules carrying forward (don't violate)

1. Sequential single-agent dispatch on Windows (#3099 workaround) — one `/gsd-execute-phase` at a time
2. Push + verify between waves
3. Schema-lock end-to-end — SQL adds only audit-tier columns; all shape evolution at Zod layer
4. `/codex` + `/cso` are complementary mandatory gates at plan close; both lenses matter
5. Sanitizer surfaces locked — no `logger.*` calls inside `src/ai/sanitizers/**`
6. AI chokepoint — Anthropic through `src/ai/client.ts`; Voyage through its own adapter; never cross-import
7. Embedder consumes POST-CONFIRM business_memory rows only — never pre-confirm drafts
8. PII-redacted drafts are what land in business_memory by construction
9. Ratify-or-revert when agents surface deviations during execution
10. Langfuse trace whitelist — never include chunk_text or query content in trace payloads
11. Bounded-bypass `--no-verify` rule (D4) — permitted IFF every failing test grep-matches a documented FOLLOWUP, after stash/re-run on the pre-task baseline
12. Founder-gated review + deploy flow — executor prepares; founder triggers `/codex` + `/cso`; APPROVED-WITH-FIXES batches into one pre-redeploy commit; founder triggers deploy
13. Defer-write-path-until-read-path — new AI-token egress + cost cap + read-side value land together in one merge (this plan ratified the pattern)

---

*Authored 2026-05-30 by Claude Opus 4.7 (1M context) at Plan 02-04 T08 Phase C close. Branch: `phase-2-knowledge-layer` at HEAD `3301aa9`. Successor handoff will be authored at Plan 02-05 close or at the joint-prod-merge close, whichever comes first.*
