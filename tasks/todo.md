# Trochia AI — Active Todo (Week-by-week)

This file is the **active execution checklist** for the current Phase / Week. Updated at the start of each Week and again at Week close. Historical Weeks are archived in `tasks/archive/`.

Phase plans live in `.planning/phases/{phase}/`. Strategic context lives in `docs/Trochia_AI_*.md`. Cross-phase rules live in `tasks/constraints.md` and `tasks/lessons.md`.

---

## Phase 2: Knowledge Layer + Memory — Week 1 (Schema foundation)

**Status:** Plan written 2026-05-19. Awaiting Martins's go to start `/gsd-execute-phase` on **02-01-PLAN.md → KNW-01a**.

**Plan:** `.planning/phases/02-knowledge-layer/02-01-PLAN.md`
**Master plan:** `.planning/phases/02-knowledge-layer/02-PLAN.md`
**Context:** `.planning/phases/02-knowledge-layer/02-CONTEXT.md`
**Strategic input:** `docs/Trochia_AI_Phase_2_PLAN_v1.md`
**Branch:** `phase-2-week-1-schema` (create on go)
**Target close:** end of Week 1 (~2026-05-26 if start 2026-05-19)

### Build tasks (02-01-PLAN.md tasks 1–8)

- [ ] **KNW-01a • Task 1** — Create `src/db/schema/memory.ts` with `business_memory` + `pipeline_entry` + `interaction` tables, provenance JSON, co-located RLS. Owner: **Backend Architect**. Skills: `nextjs-app-router-patterns`, `drizzle-orm-expert`, `vector-database-engineer`, `database-optimizer`. MCP: **context7** (drizzle jsonb + pgvector types).
- [ ] **XC-08a • Task 2** — Create `src/db/schema/timeline.ts` with `timeline_event` table + 7-value `source_module` enum (pre-seeded for downstream phases). Owner: **Backend Architect**. Skills: `drizzle-orm-expert`, `postgresql`. MCP: **context7**.
- [ ] **KNW-01a (cont) • Task 3** — Create `src/db/schema/embeddings.ts` with `vector(1024)` column, HNSW index (cosine), dedup unique index, `embedding_model_version`. Owner: **Backend Architect** + Database Optimizer review. Skills: `vector-database-engineer`, `embedding-strategies`, `database-optimizer`, `postgresql`. MCP: **context7** (pgvector HNSW operator class — verify current Drizzle syntax).
- [ ] **Task 4** — Update `src/db/schema/index.ts` barrel to re-export the 3 new modules. Owner: **Backend Architect**. Skills: `drizzle-orm-expert`.
- [ ] **Task 5** — Run `npm run db:generate`; manually review the migration SQL for: 5 CREATE TABLEs, 5 enums, ENABLE ROW LEVEL SECURITY on each, tenant_isolation policies, HNSW index, dedup unique index, GRANTs. Owner: **Backend Architect**. MCP: **context7** (drizzle-kit current flags).
- [ ] **KNW-01b • Task 6** — Extend RLS tests: confirm `tests/rls/schema-scan.test.ts` picks up new tables; extend `tests/rls/two-user-isolation.test.ts`; create `tests/integration/rls-memory.test.ts` with ≥6 cases (two-user isolation across 5 new tables + idempotency proof + vector dim rejection + RLS default-deny with no auth context + enum rejection). Owner: **Backend Architect** + Security Engineer. Skills: `postgresql`, `saas-multi-tenant`, `secure-coding`.
- [ ] **Task 7** *(autonomous: false)* — `npm run db:push` against staging Supabase; verify HNSW + RLS in Supabase SQL editor; smoke insert with tenant context; rollback on any failure. Owner: **Backend Architect** + Martins manual confirmation.
- [ ] **Task 8** — Full Week 1 verification loop: `npm run typecheck && npm run lint && npm run check:banned && npm run build && npx vitest run && npx playwright test`; open PR; tag `/codex` second-opinion (pipeline entries adjacent to financial primitives); Code Reviewer + Security Engineer review; merge `phase-2-week-1-schema`. Owner: **Backend Architect** → **Code Reviewer** → **Security Engineer**.

### Parallel founder tasks (Martins, non-engineering)

- [ ] **Design partner outreach kickoff** — Identify 6 candidate founders from Martins's Clockvest warm-intro network; draft outreach DM template ("we're building Trochia, a fundraising operating system, looking for 3 founders to use it on their own data starting Week 7"); send 6 DMs by end of Week 1. Target: 3 confirmed by end of Week 5. Backup: Martins's own data + 1 willing founder.
- [ ] **Corpus shortlist** — Draft the 50-doc corpus list for Week 4 KNW-04c (YC Founder Manual / SAFE primer, Sam Altman playbook, Lenny's, Pari Passu, Carta benchmarks, AngelList valuation guides, NfX guides, Charles Hudson pre-seed, accelerator FAQs, public term-sheet libraries). Links + ≤2-sentence summaries; copyright-safe. Stash in `data/corpus/`.
- [ ] **Voyage API key + Langfuse Phase-2 dashboard** — Confirm Voyage API key valid (existing from Phase 1 prep) + create a "Phase 2 Knowledge Layer" Langfuse dashboard with traces by `user_id`, `cache_creation_input_tokens`, `cache_read_input_tokens`, `latency_p50`. Used Week 4+.
- [ ] **Law-firm SAFE-template partner outreach** — Critical-path non-engineering item from CLAUDE.md (must lock by Phase 9). Send 2 cold emails to candidate firms this Week. Independent of Phase 2 build.

### Week 1 close checklist (run before declaring Week 1 done)

- [ ] All 8 build tasks green
- [ ] All 4 parallel founder tasks at least started
- [ ] Schema lock declared in `02-01-SUMMARY.md`
- [ ] CI green on `main` after merge
- [ ] No new banned strings introduced
- [ ] No regression in Phase 1 Playwright smoke
- [ ] Vercel preview deploys clean
- [ ] `tasks/lessons.md` updated with any Week 1 surprises (drizzle-kit / pgvector HNSW / Supabase quirks)
- [ ] `02-01-SUMMARY.md` written using `$HOME/.claude/get-shit-done/templates/summary.md`
- [ ] Week 2 PLAN (`02-02-PLAN.md`) drafted (paste extractor + confirmation UI shell — KNW-02a + KNW-02b)

---

## Phase 2: Weeks 2–8 (placeholders — refined just-in-time)

Each Week's PLAN.md will be authored at the start of its Week via `/gsd-plan-phase 2 --continue` (or by hand following the Phase 1 PLAN convention). Strategic shape of every Week is in `.planning/phases/02-knowledge-layer/02-PLAN.md` §3–§4.

- [ ] **Week 2** — `02-02-PLAN.md`: KNW-02a (paste extractor agent, Sonnet 4.6 + Zod) + KNW-02b (confirmation UI shell). Owner: **AI Engineer** + **Frontend Developer**.
- [ ] **Week 3** — `02-03-PLAN.md`: KNW-02c (conflict resolver UI) + KNW-02d (PII redaction + prompt-injection sanitizer). Owner: **Security Engineer** + **Frontend Developer**. `/cso` mandatory.
- [ ] **Week 4** — `02-04-PLAN.md` + `02-05-PLAN.md`: KNW-04a/b/c (pgvector schema + Inngest embed pipeline + curated corpus loader) + EVAL-01a (eval harness scaffold). Owner: **Backend Architect** + **AI Engineer**.
- [ ] **Week 5** — `02-06-PLAN.md`: KNW-05a (hybrid RAG service) + AI-CACHE-01 (prompt caching wiring + Langfuse verification). Owner: **AI Engineer**. `/codex` mandatory.
- [ ] **Week 6** — `02-07-PLAN.md`: KNW-05b (qa-rag agent, Opus 4.7) + KNW-05c (ambient Q&A sidebar UI) + OBS-COST-01 (per-user cost tracking + daily cap). Owner: **AI Engineer** + **Frontend Developer**.
- [ ] **Week 7** — `02-08-PLAN.md` + `02-09-PLAN.md` + `02-10-PLAN.md` (parallel wave): KNW-03 (file upload Tier 2) + KNW-08 (staleness prompts) + XC-08b (timeline UI). Owner: **Backend Architect** + **Frontend Developer**.
- [ ] **Week 8** — `02-11-PLAN.md`: GATE-PHASE-2 (3 design partner interviews + 8-criteria exit gate + Lesson 12 capture). Owner: **Project Shepherd** + **UX Researcher**. Go/no-go to Phase 3.

---

## Cross-phase parallel work (not phase-gated)

- [ ] Domain `trochia.ai` acquisition (bid in progress) — ideally close before Phase 4 launch
- [ ] Trademark "Trochia" attorney review (parallel; not a build blocker)
- [ ] Granola/Otter API access for Phase 5 (transcripts) — open
- [ ] Hume sunset confirmation — Plan B (Deepgram + Web Audio) is primary for Phase 6

---

## Phase exit (do not advance until ALL 8 criteria green)

From `.planning/phases/02-knowledge-layer/02-PLAN.md` §11:

1. [ ] 3 design partner founders use Trochia ambient Q&A on their own data
2. [ ] Each design partner reports Q&A gives answers ChatGPT could not
3. [ ] Tier 1 paste auto-fills ≥8 fields from a typical 1,500-word paste (eval fixture in CI)
4. [ ] Cache-hit rate non-zero and monitored in Langfuse
5. [ ] Median Q&A response <8s (Langfuse + eval)
6. [ ] Q&A says "I don't know" rather than fabricating when retrieval empty/weak (eval: 10 out-of-scope Q's)
7. [ ] Zero fabricated citations in 50 sample Q's (eval fixture review)
8. [ ] Eval harness running in CI, gates ship

If even one fails: **STOP. Do not advance to Phase 3.**

---

## Review (write here at Phase close)

*(blank until Phase 2 exit gate evaluation — populated by `02-SUMMARY.md` + Lesson 12)*

---

*Authored 2026-05-19 by gsd-plan-phase orchestrator. Updated at every Week close.*
