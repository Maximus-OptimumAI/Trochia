---
phase: 02-knowledge-layer
plan: 00-master
type: phase-overview
mode: mvp
status: active
authored: 2026-05-19
depends_on_phase: 01-foundation
strategic_input: docs/Trochia_AI_Phase_2_PLAN_v1.md
context: 02-CONTEXT.md
requirements: [KNW-01, KNW-02, KNW-03, KNW-04, KNW-05, KNW-08, XC-08]
exit_gate: 8 hard exit criteria (see §11)
hand_off_to_phase: 03-pitch-lab
---

# Phase 2: Knowledge Layer + Memory — Master PLAN

This is the **operational phase plan**. It is the projection of `docs/Trochia_AI_Phase_2_PLAN_v1.md` (strategic) and `02-CONTEXT.md` (locked decisions) into an execution sequence with subagent assignments, skill activations, MCP wiring, and verification loops per week. Per-ticket execution detail lives in `02-NN-PLAN.md` files spawned just-in-time per Week.

**Phase 1 closed 2026-05-19. Phase 2 starts on Martins's go.**

---

## 1. Phase verdict

The Phase 2 strategic plan (`docs/Trochia_AI_Phase_2_PLAN_v1.md`) is **locked, MVP-mode, conservative-pace, 8 weeks**. Every tech decision is decided (Voyage `voyage-3-large`, pgvector HNSW, Sonnet 4.6 extract / Opus 4.7 synth / Haiku 4.5 reserved, 800/200 chunks, hybrid retrieval, Inngest-only embed timing). The risk is execution discipline, not design. The eval harness ships in Phase 2 (Week 4 forward) — not Phase 3 — to give the moat-is-real gate at Week 8 a quantitative spine.

**Phase 3 cannot start until all 8 exit gate criteria in §11 are TRUE.**

---

## 2. Goal

Per `02-CONTEXT.md`:

> A normalized Business Memory + Pipeline Memory spine, embedded into pgvector via Inngest, queried by a grounded+cited Q&A sidebar in median <8s with zero fabricated citations — validated on 3 design partners' own data by Week 8.

---

## 3. Build sequence + plan file map

Phase 1 used 9 PLAN.md files (`01-01` through `01-09`). Phase 2 uses 11 PLAN.md files mapped to the strategic ticket grid:

| Plan file | Week | Strategic tickets | Canonical REQ IDs | Wave | Depends on |
|---|---|---|---|---|---|
| **02-01-PLAN.md** | 1 | KNW-01a, KNW-01b, XC-08a | (schema foundation; supports KNW-01/04/05/08, XC-08) | 1 | — |
| **02-02-PLAN.md** | 2 | KNW-02a, KNW-02b | KNW-01, KNW-03 | 2 | 02-01 |
| **02-03-PLAN.md** | 3 | KNW-02c, KNW-02d | KNW-03 | 3 | 02-02 |
| **02-04-PLAN.md** | 4 | KNW-04a, KNW-04b, KNW-04c | KNW-04 | 4 | 02-01 (schema), 02-03 (real memory to embed) |
| **02-05-PLAN.md** | 4 | EVAL-01a | (phase exit; supports all KNW-xx) | 4 (parallel) | 02-02 (extractor exists to eval) |
| **02-06-PLAN.md** | 5 | KNW-05a, AI-CACHE-01 | KNW-05 (retrieval), XC cross-cut (caching) | 5 | 02-04 (embeddings exist), 02-05 (eval to verify hit-rate) |
| **02-07-PLAN.md** | 6 | KNW-05b, KNW-05c, OBS-COST-01 | KNW-05 | 6 | 02-06 |
| **02-08-PLAN.md** | 7 | KNW-03 | KNW-02 | 7 (parallel) | 02-02 (confirmation UI) |
| **02-09-PLAN.md** | 7 | KNW-08 | KNW-08 | 7 (parallel) | 02-01 (provenance JSON) |
| **02-10-PLAN.md** | 7 | XC-08b | XC-08 | 7 (parallel) | 02-01 (timeline schema), 02-07 (Q&A produces events) |
| **02-11-PLAN.md** | 8 | GATE-PHASE-2 | (phase exit) | 8 | All prior |

**Wave parallelism:** Plans in the same wave can run concurrently when files do not overlap. Plans 02-08/09/10 are explicitly designed to run in parallel during Week 7.

---

## 4. Per-ticket subagent + skill + MCP wiring

Every ticket below specifies: **primary subagent**, **secondary subagents** (review/audit roles), **skill activations** (per Trochia CLAUDE.md skill ecosystem), and **MCP servers** to wire. Code Reviewer + (when applicable) Security Engineer + (when applicable) Compliance Auditor run on every PR by default — not re-listed per ticket.

### Week 1 — Schema foundation (PLAN 02-01)

| Ticket | Primary subagent | Secondary | Skills | MCP servers |
|---|---|---|---|---|
| **KNW-01a** Drizzle schema for `business_memory`, `pipeline_entry`, `interaction`, `timeline_event` + provenance JSON | **Backend Architect** | Database Optimizer (HNSW prep review) | `nextjs-app-router-patterns`, `postgresql`, `drizzle-orm-expert`, `vector-database-engineer`, `database-optimizer` | **context7** (drizzle-orm jsonb + supabase pgvector types) |
| **KNW-01b** RLS default-deny + two-user isolation test | **Backend Architect** | Security Engineer | `postgresql`, `saas-multi-tenant`, `secure-coding`, `database-optimizer` | **context7** (drizzle-orm + supabase RLS), **github** |
| **XC-08a** `timeline_event` schema + source_module enum | **Backend Architect** | Code Reviewer | `drizzle-orm-expert`, `postgresql` | **context7** |

**Verification loop (Week 1):**
1. `npm run db:generate` produces migration; manual review of SQL diff
2. `npm run db:push` against staging Supabase (autonomous: false — interactive)
3. `npx vitest run tests/rls/schema-scan.test.ts` — all four new tables present in scan + appear with RLS + policy
4. `npx vitest run tests/rls/two-user-isolation.test.ts` — extended to cover four new tables, zero cross-tenant rows
5. `npm run check:banned` — green
6. `npm run typecheck` + `npm run lint` — green
7. `/codex` second-opinion on Drizzle schema (financial-primitive-adjacent: pipeline entries hold deal-stage data)
8. PR review by Code Reviewer + Security Engineer
9. Merge → Vercel preview → re-run Playwright smoke (Phase 1's gate) to confirm no regression

---

### Week 2 — Paste extractor + confirmation UI shell (PLAN 02-02)

| Ticket | Primary subagent | Secondary | Skills | MCP servers |
|---|---|---|---|---|
| **KNW-02a** `extractFromPaste` agent (Sonnet 4.6 + Zod) | **AI Engineer** | Backend Architect | `claude-api` (caching, model tiering), `llm-structured-output`, `prompt-engineering-patterns`, `agent-evaluation` | **context7** (`@anthropic-ai/sdk` `tool_use` + Zod schemas) |
| **KNW-02b** Confirmation UI: per-field cards + edit/confirm/reject | **Frontend Developer** | UI Designer | `frontend-design`, `nextjs-app-router-patterns`, `shadcn`, `baseline-ui`, `tailwind-design-system` | **superpowers-chrome** (`/qa`), **context7** (shadcn + react-hook-form) |

**Verification loop (Week 2):**
1. Extractor unit test: 5 fixture pastes (Trochia synthetic — `tests/ai/fixtures/paste-*.txt`) → assert ≥8 fields populated, ≥3 with source_snippet, no banned strings in output
2. Extractor latency assertion p50 <30s on Anthropic Sonnet (Langfuse trace)
3. UI Playwright e2e: paste → confirmation page renders → click confirm → state persists across reload
4. `/design-review` against Phase 1 styleguide tokens (no new colors/fonts)
5. `/qa` real-browser pass on the paste flow
6. `npm run check:banned` — green
7. Code Reviewer PR pass
8. Confirm no `@anthropic-ai/sdk` import outside `src/ai/**` (ESLint boundary rule)

---

### Week 3 — Conflict + PII + injection defense (PLAN 02-03)

| Ticket | Primary subagent | Secondary | Skills | MCP servers |
|---|---|---|---|---|
| **KNW-02c** Conflict surfacing UI: multi-value per field | **Frontend Developer** | UI Designer | `frontend-design`, `shadcn`, `nextjs-app-router-patterns` | **superpowers-chrome** (`/qa`) |
| **KNW-02d** PII redaction + prompt-injection sanitizer | **Security Engineer** | AI Engineer | `frontend-security-coder`, `prompt-engineering-patterns`, `privacy-by-design`, `llm-structured-output` | **context7** (Anthropic prompt-injection guidance) |

**Verification loop (Week 3):**
1. Injection unit test: 20 known injection payloads (OWASP LLM Top 10 patterns) → assert sanitizer strips or escapes; extracted output Zod-validates; banned-string check on output green
2. PII unit test: 15 unrelated-party fixtures (`John Doe, john@example.com`, `(555) 123-4567`, BTC/SOL wallet patterns) → assert flagged + redacted before save
3. Conflict UI Playwright: paste with "$40k MRR" + "$25k MRR" → both surface → founder selects one → only selected value persists with chosen provenance
4. `/cso` Security gate (mandatory — UNTRUSTED-INPUT handling)
5. Compliance Auditor pass: confirm no banned compliance strings in any UX copy
6. `/codex` second-opinion on sanitizer regex coverage
7. PR review

---

### Week 4 — Embed pipeline + corpus + eval scaffold (PLAN 02-04 + 02-05 in parallel)

| Ticket | Primary subagent | Secondary | Skills | MCP servers |
|---|---|---|---|---|
| **KNW-04a** pgvector `embeddings` schema + HNSW index | **Backend Architect** | Database Optimizer | `vector-database-engineer`, `embedding-strategies`, `database-optimizer`, `postgresql` | **context7** (supabase pgvector + HNSW operator class) |
| **KNW-04b** Inngest `embed-memory` function (idempotent, batched Voyage calls) | **Backend Architect** | AI Engineer | `rag-implementation`, `embedding-strategies`, `inngest` (project skill), `workflow-orchestration-patterns` | **context7** (`@inngest/sdk` step.run, `voyageai` batch API) |
| **KNW-04c** Curated corpus loader (50 docs as links+summaries) | **Backend Architect** | Compliance Auditor (copyright check) | `rag-implementation`, `embedding-strategies` | **github** (corpus source PRs) |
| **EVAL-01a** Eval harness scaffold (`src/ai/eval/`) + CI workflow | **AI Engineer** | Code Reviewer | `advanced-evaluation`, `agent-evaluation`, `prompt-engineering-patterns`, `langfuse` | **context7** (Langfuse SDK), **github** (workflow yml) |

**Verification loop (Week 4):**
1. Schema scan + RLS test extends to `embeddings` table; HNSW index confirmed via raw SQL `\d+ embeddings` check
2. Inngest dev server local run: trigger `memory.confirmed` event → embed-memory step fires → batch Voyage call → embeddings row inserted with `embedding_model_version='voyage-3-large'`
3. Idempotency test: re-fire same event → upsert (no duplicate rows); kill mid-run → resume on retry without partial state
4. Corpus loader integration test: load 5 fixture corpus docs → assert `source_type='corpus'` rows present
5. Eval harness sanity: run extractor on 5 fixture pastes → produce JSON report; CI workflow runs on PR; intentional regression (bad prompt) fails CI
6. Langfuse traces visible for all Voyage + Anthropic calls
7. `/codex` review of Inngest concurrency / step budget config
8. Compliance Auditor confirms corpus is links+≤2-sentence summaries only (no verbatim long quotes)

---

### Week 5 — RAG service + prompt caching (PLAN 02-06)

| Ticket | Primary subagent | Secondary | Skills | MCP servers |
|---|---|---|---|---|
| **KNW-05a** `src/ai/rag/retrieve.ts` hybrid retrieval (pgvector + FTS, fused) | **AI Engineer** | Backend Architect | `rag-implementation`, `vector-database-engineer`, `embedding-strategies`, `postgresql` | **context7** (postgres FTS + pgvector hybrid) |
| **AI-CACHE-01** Prompt caching wiring in `src/ai/client.ts` (corpus + memory as cached prefix, 1-hour cache tier) | **AI Engineer** | Backend Architect | `claude-api` (prompt caching), `prompt-engineering-patterns` | **context7** (Anthropic prompt caching docs, Langfuse cache-token metrics) |

**Verification loop (Week 5):**
1. Retrieval unit test: query "what's my MRR" → returns Business Memory chunk in top-3; query "what's a SAFE" → returns corpus chunk in top-3
2. Hybrid fusion test: synthetic queries with one-term-only vs semantic-only → fused ranking outperforms either alone (eval fixture)
3. Cache verification: repeat identical query within 10 min → Langfuse trace shows `cache_read_input_tokens > 0` and `cache_creation_input_tokens` on first call
4. Cache cost dashboard: hit rate computed and visible in Langfuse
5. ESLint boundary check: `safe-engine` and `cap-table-engine` do NOT import `ai/rag/*` (these don't exist yet — confirm boundary rule is in place pre-Phase 9)
6. `/review` pass on `ai/client.ts` changes (high-stakes shared file)
7. `/codex` second-opinion on cache_control placement (one mistake here costs hundreds of dollars over a phase)

---

### Week 6 — Q&A sidebar + cost tracking (PLAN 02-07)

| Ticket | Primary subagent | Secondary | Skills | MCP servers |
|---|---|---|---|---|
| **KNW-05b** `qa-rag.agent.ts` (Opus 4.7, Zod-validated, "I don't know" path) | **AI Engineer** | Code Reviewer | `claude-api`, `rag-implementation`, `llm-structured-output`, `prompt-engineering-patterns`, `agent-evaluation` | **context7** (`@anthropic-ai/sdk` streaming + structured output) |
| **KNW-05c** Ambient Q&A sidebar UI (persistent, streamed answers, citation chips) | **Frontend Developer** | UI Designer | `frontend-design`, `nextjs-app-router-patterns`, `shadcn`, `baseline-ui`, `react-state-management` | **superpowers-chrome** (`/qa`), **context7** (Vercel AI SDK `useChat` / `streamText`) |
| **OBS-COST-01** Per-user cost tracking in Langfuse + daily $5 cap + soft-throttle | **Backend Architect** | AI Engineer | `claude-api`, `observability-engineer`, `langfuse` | **context7** (Langfuse user-level tags + cost metrics) |

**Verification loop (Week 6):**
1. qa-rag eval: 10 in-scope Q's → every answer has ≥1 citation matching a real source row; 10 out-of-scope Q's → ≥9 return "I don't know" template
2. Latency eval (eval fixture): p50 <8s on Opus 4.7 with cached corpus prefix
3. Sidebar Playwright: mount on `/app/dashboard` + `/app/onboarding` → input → streamed response visible → citation chip click navigates to source
4. Cost tracking integration test: 3 simulated users → Langfuse trace tags include `user_id` → cost-per-user query returns 3 rows; simulated runaway → cap fires + Haiku throttle kicks in
5. Banned-string check on all template strings (no "investment advice" / "legal advice" without "not")
6. `/design-review` on sidebar (operator-grade tone, no "I'm happy to help" copy)
7. `/cso` Security pass on cost-cap bypass attempts (signed user_id, no client-side cap mutation)
8. `/codex` second-opinion on Opus prompt structure (highest cost LLM in stack)

---

### Week 7 — File upload Tier 2 + staleness + timeline UI (PLANS 02-08 + 02-09 + 02-10 in parallel)

| Ticket | Primary subagent | Secondary | Skills | MCP servers |
|---|---|---|---|---|
| **KNW-03** File upload Tier 2 (ChatGPT ZIP, Claude project MD, Notion export, .md/.txt) + Inngest parser + founder conversation-picker UI | **Backend Architect** | AI Engineer, Security Engineer | `inngest` (project), `workflow-orchestration-patterns`, `file-uploads`, `rag-implementation`, `prompt-engineering-patterns` | **context7** (Inngest step budget, multer/formidable file-uploads), **superpowers-chrome** |
| **KNW-08** Staleness prompts (>14 days, snoozable per field 7/30/never) | **Frontend Developer** | Backend Architect | `frontend-design`, `nextjs-app-router-patterns`, `react-state-management` | **superpowers-chrome** (`/qa`) |
| **XC-08b** Unified raise timeline UI (chronological, filterable by module/investor, deep-links to source) | **Frontend Developer** | UI Designer | `frontend-design`, `nextjs-app-router-patterns`, `data-storytelling`, `tailwind-design-system` | **superpowers-chrome** (`/qa`) |

**Verification loop (Week 7):**
1. ZIP parse e2e: upload 50MB fixture ChatGPT ZIP → Inngest function completes <60s p95 → confirmation UI surfaces ≥8 extracted fields
2. Conversation-picker UI: founder selects 3 of 50 conversations from ZIP → only those reach extractor (reduces noise)
3. Staleness unit test: backdate field 15 days → nudge appears; snooze 7d → nudge re-fires day 22; snooze "never" → no further nudge
4. Timeline Playwright: seed 10 events across modules → render chronological → filter by module + by investor → click event → navigates to source surface
5. PII redaction extends to file uploads (KNW-02d sanitizer reused)
6. Prompt-injection sanitizer extends to file uploads
7. `/qa` real-browser pass on all three surfaces
8. `/design-review` pass on staleness nudge + timeline (no anti-patterns; matches DESIGN-REFERENCE.md)
9. Code Reviewer + Security Engineer PR pass

---

### Week 8 — Design partner gate + Phase exit (PLAN 02-11)

| Ticket | Primary subagent | Secondary | Skills | MCP servers |
|---|---|---|---|---|
| **GATE-PHASE-2** 3 design partner interviews + 8-criteria exit gate eval + Lesson 12 capture | **Project Shepherd** (orchestrate) + **UX Researcher** (interview design) | Studio Producer | `interview-script`, `feedback-synthesizer`, `agent-evaluation` | **github** (issue tracker for any blocker findings) |

**Verification loop (Week 8 — phase exit):**
1. 3 design partners onboarded + each used Trochia ≥3 days on own data
2. 45-min structured interview each (script: `docs/phase-2-gate-interview-script.md`)
3. Quantitative eval fixture run in CI: ≥8 fields auto-fill, p50 <8s, zero fabricated citations on 50-Q corpus, "I don't know" >90% on out-of-scope, cache hit-rate non-zero in Langfuse
4. Score against the 8 criteria (§11 below) — all 8 green → GO; any red → STOP, iterate or terminate
5. Lesson 12 captured in `tasks/lessons.md`
6. Phase 2 ROADMAP entry marked ✅
7. ≥1 design partner agrees to continue as Phase 3 deck-reviewer subject
8. `/ship` `/land-and-deploy` on the final Phase 2 build (`/canary` not needed — Phase 4.5 brings the SEC stack that gates first prod traffic)

---

## 5. Cross-cutting subagent + skill rules for this phase

**Mandatory for every PR in Phase 2:**

| Gate | Subagent / Tool | When |
|---|---|---|
| Code Reviewer | `code-reviewer` agent | Every PR before merge |
| `/cso` Security pass | Security Engineer | Every PR touching `ai/`, `inngest/`, file uploads, sanitizers, prompt-injection paths |
| `/codex` second-opinion | Codex (via codex skill) | Every change to `src/ai/client.ts`, prompt caching, eval thresholds, embedding pipeline (cost-sensitive primitives) |
| `/qa` real-browser test | `superpowers-chrome` browse | Every UI surface change (Weeks 2, 3, 6, 7) |
| `/design-review` | UI Designer | Every UI surface change |
| Banned-string CI | `scripts/check-banned-strings.mjs` (Phase 1) | Every commit (already gated by Phase 1 CI) |
| RLS schema-scan | `tests/rls/schema-scan.test.ts` (Phase 1) | Every schema change (Weeks 1, 4) |
| Two-user isolation | `tests/rls/two-user-isolation.test.ts` (Phase 1 — extends with new tables) | Every schema change (Weeks 1, 4) |
| Compliance Auditor | `compliance-auditor` agent | Any UX copy change involving "fund", "advice", "guidance", or memory display surfacing third-party data |

**Skill activation policy:** Per ticket, the listed skills are **mandatory pre-reading for the executing agent**. Skill files live in `~/.claude/skills/` and `~/.claude/plugins/`. The executor invokes them via the `Skill` tool before writing code, not as agent personas.

**MCP wiring policy:** `context7` is the primary library-docs source. Every plan that touches a 3rd-party SDK (drizzle, inngest, anthropic, voyage, langfuse, shadcn, vercel ai-sdk) MUST issue a context7 lookup before implementing — locks in current API surface and avoids stale-version landmines. `github` is wired for PR ops. `superpowers-chrome` is wired for `/qa` real-browser runs. No other MCP servers needed in Phase 2.

---

## 6. Architecture invariants (Trochia-specific — enforced every ticket)

From `tasks/constraints.md` + Phase 1 lint rules:

- ✅ Every Anthropic call goes through `src/ai/client.ts` (lint-enforced)
- ✅ Prompt caching active on every production Anthropic call (Langfuse-verified)
- ✅ `safe-engine` has NO import path to `ai/` (lint-enforced — pre-Phase 9 boundary)
- ✅ `cap-table-engine` has NO import path to `ai/` (lint-enforced — pre-Phase 9 boundary)
- ✅ RLS default-deny on every new table (`business_memory`, `pipeline_entry`, `interaction`, `timeline_event`, `embeddings`)
- ✅ Two-user isolation test extended to all new tables
- ✅ No hardcoded URLs (Phase 1 ESLint rule)
- ✅ Banned-string CI check stays green
- ✅ No autonomous external sends (Q&A is read-only; no Resend calls from Phase 2 code)
- ✅ Numeric financial figures never enter logs (`SENSITIVE_FIELDS` set in `src/lib/logger.ts` from Phase 1 — extends to `mrr`, `valuation`, `runway`, `arr`)
- ✅ Customer data never enters training pipeline (no LLM call exports raw paste to external systems beyond Anthropic + Voyage; both are configured non-training)
- ✅ `_drive.file` scope only (not relevant Phase 2; reinforces for Phase 7)
- ✅ All new dependencies confirmed commercial-friendly OSS license (MIT/Apache/BSD/ISC)

---

## 7. Branch + commit strategy

- One branch per Week: `phase-2-week-1-schema`, `phase-2-week-2-paste`, etc.
- Optional sub-branches per ticket if a Week splits cleanly (e.g., Week 4 has 4 tickets across 2 subagents — KNW-04a/b/c on one branch, EVAL-01a on a parallel branch)
- Conventional commits: `feat(knw-01a): ...`, `feat(eval-01a): ...`
- Co-Authored-By Claude Opus 4.7 on every commit
- PRs use the Phase 1 PR template; require Code Reviewer + (when applicable) Security Engineer + Compliance Auditor sign-off
- Squash-merge on green CI

---

## 8. Verification cadence (per-Week summary)

Each Week ends with a **Week Close Checklist**:

```text
[ ] All Week tickets shipped & merged
[ ] CI green on main
[ ] Acceptance criteria in this Week's PLAN.md verified
[ ] Code Reviewer pass on every PR
[ ] /cso pass on any security-sensitive PR
[ ] /codex pass on any cost-sensitive PR (caching, embedding, eval thresholds)
[ ] /design-review pass on any UI PR
[ ] Banned-string CI green
[ ] RLS schema-scan green (Weeks 1, 4 only)
[ ] Two-user isolation test green (Weeks 1, 4 only)
[ ] Langfuse traces visible + tagged (Weeks 4+)
[ ] Eval fixtures run + report attached (Weeks 5–8)
[ ] Week summary written to `02-NN-SUMMARY.md`
[ ] Lessons appended to `tasks/lessons.md` if any
```

`/gsd-verify-work` runs at Week 8 against the master `must_haves` block (§10) for goal-backward verification.

---

## 9. Risks + mitigations (PLAN v1 §8 — restated)

| Risk | Likelihood | Impact | Mitigation | Owner |
|---|---|---|---|---|
| ChatGPT ZIP parsing produces shallow extraction | High | High (Pitfall 12) | Lean on Tier 1 paste; ask user to point at specific conversations in ZIP; enforce ≥8 fields bar | KNW-03 + KNW-02a |
| Solo Martins pace slips beyond 8 weeks | High | Medium | Cut KNW-03 Tier 2 to paste-only fallback if Week 7 looks tight; defer XC-08b to Phase 3 if needed | Master plan |
| Design partners not recruited by Week 5 | Medium | High (gate failure) | Start outreach Week 1; use Clockvest network; backup = Martins's own data + 1 willing founder | Week 1 todo |
| Voyage embedding cost overshoots | Low | Medium | Daily $5/user cap; Langfuse alerts at 80% | OBS-COST-01 |
| Opus 4.7 latency >8s due to context size | Medium | High (gate failure) | Cache aggressively; limit context block to top-10 chunks; Haiku tier for follow-ups | AI-CACHE-01 + KNW-05b |
| Cross-talk with Clockvest workload | High | Medium | Hard time-box Trochia to 25 hrs/week; Phase 2 = 8 weeks explicitly | Master plan |
| Prompt injection via pasted knowledge packs | Medium | High | Sanitize before LLM; never reach system-prompt position; Zod gate; banned-string check | KNW-02d |
| Schema drift during Phase 2 | Medium | High | Lock schema in Week 1; provenance JSON for flex fields not new columns; Drizzle CI check | KNW-01a |

---

## 10. Goal-backward truths (master `must_haves`)

These are the truths `/gsd-verify-work` checks at Phase exit:

```yaml
must_haves:
  truths:
    - "A founder pastes 500–5,000 words and confirms a normalized Business Memory in <5 min, with per-field source snippets, edit/accept/reject controls, conflict resolution, and PII redaction for unrelated parties"
    - "Confirmed Business Memory is the canonical relational record (`business_memory` table); curated corpus + Business Memory are embedded into pgvector via an Inngest pipeline (no request-path embeds); `embedding_model_version` is stored on every row"
    - "The ambient Q&A sidebar on every authenticated page answers grounded in corpus + Business Memory + Pipeline Memory; every answer has ≥1 real citation; median response <8s in Langfuse; out-of-scope queries return 'I don't know' ≥90% of the time"
    - "Memory-staleness prompts fire when `last_updated > 14 days` (non-blocking, snoozable per field 7d/30d/never)"
    - "The unified raise timeline renders every cross-module event chronologically, filterable by module and investor, every event deep-links to its source surface"
    - "Cross-cutting AI patterns are in place: prompt caching verified in Langfuse (non-zero `cache_read_input_tokens`), Sonnet→Opus→Haiku model tiering active, Zod-validated structured outputs across all agents, eval harness running in CI with must-not-fail thresholds, per-user cost monitoring with $5/day default cap + soft-throttle to Haiku"
    - "RLS default-deny + two-user isolation passes on all five new tables (business_memory, pipeline_entry, interaction, timeline_event, embeddings)"
    - "No new banned compliance strings introduced; banned-string CI green; numeric financial figures absent from production logs"
    - "Three design partner founders ran Trochia on their own data and rated the Q&A as 'beyond what ChatGPT gave me'"
  artifacts:
    - path: "src/db/schema/memory.ts"
      provides: "business_memory, pipeline_entry, interaction tables + RLS + provenance JSON"
    - path: "src/db/schema/timeline.ts"
      provides: "timeline_event + source_module enum + RLS"
    - path: "src/db/schema/embeddings.ts"
      provides: "embeddings table + HNSW index + embedding_model_version + RLS"
    - path: "src/ai/agents/extract-from-paste.agent.ts"
      provides: "Sonnet 4.6 extractor; Zod-typed output; ≥8 fields from 1,500-word fixture"
    - path: "src/ai/agents/qa-rag.agent.ts"
      provides: "Opus 4.7 Q&A; Zod-validated; 'I don't know' path; cited every answer"
    - path: "src/ai/rag/retrieve.ts"
      provides: "hybrid pgvector + FTS retrieval, top-k with fusion"
    - path: "src/ai/sanitizers/prompt-injection.ts"
      provides: "OWASP LLM Top 10 injection defense before LLM"
    - path: "src/ai/sanitizers/pii-redact.ts"
      provides: "unrelated-party PII redaction before save"
    - path: "src/inngest/functions/embed-memory.ts"
      provides: "idempotent embed pipeline; Voyage 'voyage-3-large'; batched"
    - path: "src/inngest/functions/parse-import-zip.ts"
      provides: "ChatGPT/Claude/Notion file upload parser; <60s p95 on 50MB ZIP"
    - path: "src/components/qa/sidebar.tsx"
      provides: "persistent Q&A sidebar mounted in (app) layout"
    - path: "src/components/memory/confirmation-card.tsx"
      provides: "per-field card UI with edit/accept/reject + source snippet"
    - path: "src/components/memory/conflict-resolver.tsx"
      provides: "multi-value conflict UI"
    - path: "src/components/memory/staleness-nudge.tsx"
      provides: ">14d nudge UI with snooze 7/30/never"
    - path: "src/app/(app)/timeline/page.tsx"
      provides: "unified chronological raise timeline UI"
    - path: "data/corpus/"
      provides: "~50 curated fundraising corpus docs as links + ≤2-sentence summaries"
    - path: "src/ai/eval/"
      provides: "eval harness scaffold: fixtures, runner, CI integration"
    - path: ".github/workflows/eval.yml"
      provides: "CI eval workflow gates ship on regression"
    - path: "docs/phase-2-gate-interview-script.md"
      provides: "structured 45-min interview script for design partner gate"
    - path: "docs/phase-2-gate-results.md"
      provides: "design partner gate results — written Week 8"
  key_links:
    - from: "src/inngest/functions/embed-memory.ts"
      to: "src/ai/integrations/voyage.adapter.ts"
      via: "import"
      pattern: "voyage\\.embed"
    - from: "src/ai/agents/qa-rag.agent.ts"
      to: "src/ai/rag/retrieve.ts"
      via: "import"
      pattern: "retrieveContext"
    - from: "src/ai/agents/qa-rag.agent.ts"
      to: "src/ai/client.ts"
      via: "anthropic via central chokepoint"
      pattern: "ai\\.complete|ai\\.stream"
    - from: "src/ai/client.ts"
      to: "langfuse"
      via: "user_id-tagged traces"
      pattern: "userId|user_id"
    - from: "src/components/qa/sidebar.tsx"
      to: "src/app/(app)/layout.tsx"
      via: "mount in app layout"
      pattern: "<QASidebar"
```

---

## 11. Hard exit gate (the moat-is-real test)

Phase 3 (Pitch Lab) **cannot start** until ALL of the following are TRUE:

| # | Gate | Method | Owner |
|---|---|---|---|
| 1 | 3 design partner founders use Trochia ambient Q&A on their own data | Recruit by Week 5; activate Week 7 | Master plan / Week 1 todo |
| 2 | Each design partner reports Q&A gives answers ChatGPT could not | Structured 45-min interview at Week 8 | UX Researcher |
| 3 | Tier 1 paste auto-fills ≥8 fields from 1,500-word paste | Eval fixture (CI) | KNW-02a + EVAL-01a |
| 4 | Cache-hit rate non-zero and monitored in Langfuse | Langfuse dashboard | AI-CACHE-01 |
| 5 | Median Q&A response <8s | Langfuse trace + eval fixture | KNW-05b + EVAL-01a |
| 6 | Q&A says "I don't know" rather than fabricating when retrieval empty/weak | Eval fixture: 10 deliberately out-of-scope questions | KNW-05b + EVAL-01a |
| 7 | Zero fabricated citations in 50 sample Q's | Eval fixture review | EVAL-01a |
| 8 | Eval harness running in CI, gates ship | EVAL-01a | AI Engineer |

If even one fails: **STOP. Do not advance.**

---

## 12. Hand-off contract to Phase 3 (Pitch Lab)

- [ ] All 8 exit gate criteria green
- [ ] Lesson 12 captured in `tasks/lessons.md`
- [ ] Eval harness running in CI with fixtures
- [ ] Prompt caching verified in Langfuse with hit-rate metric
- [ ] At least 1 design partner agrees to continue as Phase 3 deck-reviewer test subject
- [ ] Phase 2 ROADMAP entry marked ✅ in `.planning/ROADMAP.md`
- [ ] Master `02-PLAN.md` `must_haves` (§10) all green per `/gsd-verify-work`
- [ ] `02-SUMMARY.md` written (synthesizing all 11 Week summaries)
- [ ] `tasks/constraints.md` reviewed — any Phase 3 prep constraints surfaced

---

## 13. Document control

- **Author:** Claude (gsd-plan-phase orchestrator, 2026-05-19)
- **Strategic input:** `docs/Trochia_AI_Phase_2_PLAN_v1.md` (locked 2026-05-20)
- **Predecessor verification:** `.planning/phases/01-foundation/VERIFICATION.md` (status: passed, 2026-05-19)
- **For:** Martins Ejeheri + downstream subagents
- **Confidence:** HIGH on scope + sequence + tech decisions. MEDIUM on 8-week timeline (depends on Clockvest crosstalk).
- **Successor:** `02-SUMMARY.md` + Lesson 12 + Phase 2 GATE results doc

---

**End of master plan. Week 1 execution detail in `02-01-PLAN.md`. Week 1 kicks off when Martins says go.**
