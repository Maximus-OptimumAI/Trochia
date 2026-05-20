# Phase 2: Knowledge Layer + Memory — Context

**Gathered:** 2026-05-19
**Status:** Ready for planning
**Source:** PRD Express Path (`docs/Trochia_AI_Phase_2_PLAN_v1.md` — authored 2026-05-20; treated here as locked PRD input)
**Predecessor:** Phase 1 (Foundation) — closed 2026-05-19 with `status: passed`
**Successor gate:** Phase 3 (Pitch Lab) cannot start until §8 hard exit gate clears

---

<domain>

## Phase Boundary

Phase 2 builds the **Business Memory + Pipeline Memory spine** — the system-of-record that every downstream Trochia module reads from and writes to. It delivers:

1. A normalized, founder-confirmed **Business Memory** record per tenant (extracted from pasted AI context or uploaded export files in <5 min)
2. A **curated fundraising corpus** + Business Memory embedded into pgvector via an Inngest pipeline (never embed-on-write)
3. A **grounded, cited ambient Q&A sidebar** on every authenticated page (median <8s, "I don't know" rather than fabricate)
4. **Memory-staleness prompts** (>14 days, non-blocking, snoozable)
5. A **unified raise timeline** rendering chronological cross-module events
6. The **eval harness** (CI-integrated) — ships in Phase 2 per founder direction, not Phase 3

In scope per `.planning/REQUIREMENTS.md` Phase 2 row: **KNW-01, KNW-02, KNW-03, KNW-04, KNW-05, KNW-08, XC-08** + EVAL harness scaffold (foundation for PITCH-04 in Phase 3) + AI cost monitoring tightening.

**Out of scope (deferred):**
- Knowledge Pack Import Tier 3 (browser extension auto-pull) → Phase 6
- Deck context grounding → Phase 3
- Pipeline auto-stage updates from transcripts → Phase 4
- Multi-region embeddings (EU) → V2
- Cross-module fact-conflict surfacing → Phase 7

</domain>

---

<decisions>

## Implementation Decisions (all LOCKED from PLAN v1)

### Embedding + retrieval

- **Embedding provider:** Voyage `voyage-3-large` (ARCHITECTURE-approved; multilingual; better quality/cost than Cohere)
- **Vector store:** Supabase pgvector with **HNSW** index (not IVFFlat)
- **Chunk size:** 800 tokens, 200 overlap (standard RAG default; tune after eval)
- **Retrieval:** Hybrid — pgvector cosine + Postgres full-text search (FTS), fused
- **Embed timing:** Inngest background pipeline only — NEVER embed-on-write in the request path (800s ceiling on Vercel Pro; 1GB+ ZIPs possible)
- **Model version persistence:** `embedding_model_version` column on every embedding row (forward-compat for re-embeds)
- **Idempotency:** Inngest `embed-memory` must be safely re-runnable per (`tenant_id`, `source_type`, `source_id`)

### LLM model tiering

- **Extraction:** Claude **Sonnet 4.6** (`claude-sonnet-4-6`) with Zod structured output — cheap, high-quality for paste flow
- **Synthesis (Q&A):** Claude **Opus 4.7** (`claude-opus-4-7`) — non-negotiable per ROADMAP for grounded Q&A quality
- **Follow-ups / cheap reads:** Claude **Haiku 4.5** (`claude-haiku-4-5-20251001`) reserved for staleness checks + low-stakes summaries
- **All calls go through `src/ai/client.ts`** (existing Phase 1 chokepoint — no new bypass paths)
- **Prompt caching:** Corpus + Business Memory as **cached prefix** with `cache_control: ephemeral`; **1-hour cache tier** for corpus block; verify non-zero `cache_read_input_tokens` in Langfuse within Phase 2 ship

### Compliance + safety (Trochia constraints — see `tasks/constraints.md`)

- **Banned-string CI** stays green (Phase 1's check) — no "investment advice," no "legal advice" without "not" prefix, no "rolling fund"
- **No autonomous external sends** — every outgoing email/message requires founder approval (Q&A is read-only, no sends from this phase)
- **Customer data never enters training pipeline**
- **Numeric financial figures never appear in logs** (extends Phase 3 PITCH-04 — pre-applies in Phase 2 for memory extraction logs)
- **PII redaction:** Unrelated-party PII (names, emails, phones of third parties in paste content) flagged and redacted before save
- **Prompt-injection sanitizer** on all paste input + uploaded text — sanitize before LLM, never let pasted content reach system-prompt position; structured-output Zod gate; banned-string check on extracted fields
- **RLS default-deny** on every new table (Phase 1 rule extends) with two-user isolation test
- **No hardcoded URLs** — every reference uses `process.env.NEXT_PUBLIC_SITE_URL` / `NEXT_PUBLIC_APP_URL`

### Curated corpus governance

- ~50 docs (YC Founder Manual / SAFE primer, Sam Altman's playbook, Lenny's, Pari Passu, Carta benchmarks, AngelList valuation guides, NfX guides, Charles Hudson pre-seed, accelerator FAQs, public term-sheet libraries)
- **Links + ≤2-sentence summaries** by default; no verbatim long quotes (copyright-safe)
- Founder discretion to expand selectively only where it materially helps users
- Stored in `data/corpus/` as Markdown; embedded once on cold start via `src/scripts/load-corpus.ts`
- Version-controlled in repo; updates re-trigger Inngest re-embed of `source_type='corpus'` rows

### Eval harness

- **Ships in Phase 2 (Week 4 forward)** — founder direction; cannot wait for Phase 3
- Langfuse-hosted (consistent with Phase 1 observability stack)
- Fixtures live in `src/ai/eval/fixtures/`
- Runner triggered by `.github/workflows/eval.yml` on PR + nightly
- **Must-not-fail checks:**
  - Zero fabricated citations in 50 sample Q's
  - Latency p50 <8s for Q&A
  - ≥8 fields extracted from 1,500-word paste fixture
  - "I don't know" rate ≥90% on 10 deliberately out-of-scope questions
- CI rejects prompt changes that regress these

### Per-user cost monitoring

- Tag every Anthropic call in Langfuse with `user_id` (extends Phase 1 client)
- Daily soft cap: **$5/user/day default**; over-cap → soft-throttle to Haiku tier with founder-visible banner
- Reuses Phase 4.5 SEC-02 pattern (tier-aware caps) — Phase 2 lays groundwork at user granularity

### Schema (Drizzle)

- **`business_memory`** table: tenant-scoped, jsonb provenance field per attribute (source_snippet, confidence, extracted_at, last_updated, snooze_until)
- **`pipeline_entry`** table: tenant-scoped — surface shape only this phase; Phase 4 fills CRUD
- **`interaction`** table: tenant-scoped — captures Q&A queries + answers + citations for audit
- **`timeline_event`** table: tenant-scoped — source_module, source_id, event_type, event_at, founder_visible
- **`embeddings`** table: tenant-scoped, `tenant_id + source_type + source_id` unique; `chunk_text`, `embedding vector(1024)`, `embedding_model_version`, `embedded_at`; **HNSW index** on `embedding`
- All four tables ship with **RLS default-deny + tenant-scoped tRPC context + two-user isolation test** (Phase 1 pattern)
- Schema lock at end of Week 1 — provenance JSON for flex fields, never new columns mid-phase (Pitfall 11)

### File upload — Tier 2

- Accepted formats: ChatGPT Data Export ZIP (≤50MB), Claude Project Markdown export, Notion page export, `.md`/`.txt`
- Inngest function — never request path
- Founder points at **specific conversations** within ChatGPT export to reduce noise (UI gate)
- Parse acceptance: 50MB ZIP <60s p95
- ZIP up to **50MB** (cap enforced at upload + Inngest entry)

### Ambient Q&A UX

- Persistent sidebar on every authenticated page (`src/app/(app)/layout.tsx` mount point)
- Streamed answers with inline citation chips
- Citation chip click → navigates to source surface (memory field, corpus doc, pipeline event)
- **No conversation state across queries** in Phase 2 (open question §10 — deferred to Phase 4 unless eval demands it earlier)
- Empty/weak retrieval (max similarity score <threshold) → explicit "I don't know" + suggested clarifications

### Design partner gate (Week 8)

- 3 founders from Martins's existing startup network (Clockvest warm intros)
- Recruit by Week 5; backup = Martins's own data + 1 willing founder
- Structured 45-min interview each
- All 8 exit gate criteria (§8 below) must be TRUE → Go to Phase 3
- <8/8 → iterate or stop; do NOT advance

### Claude's Discretion (not pinned in PLAN v1)

- Concrete Drizzle column types for provenance JSON (suggest `jsonb` with TS-typed via Zod)
- Specific similarity score threshold for "I don't know" (start at 0.6 cosine; tune via eval)
- Inngest concurrency / step budget per function (use Phase 1 patterns)
- Streaming protocol for sidebar (SSE vs Vercel AI SDK `streamText` — pick whichever already exists in Phase 1 client)
- Citation chip styling (inherit Phase 1 design tokens; no new colors/fonts)
- Test framework split (unit = Vitest, integration = Vitest + msw, e2e Q&A = Playwright)

</decisions>

---

<canonical_refs>

## Canonical References

**Every downstream agent MUST read these before planning or implementing.**

### Strategic + scope
- `docs/Trochia_AI_Phase_2_PLAN_v1.md` — Locked Phase 2 plan; this CONTEXT.md is a structured projection of it
- `.planning/PROJECT.md` — Trochia scope + goals
- `.planning/ROADMAP.md` — 11-phase build sequence (Phase 2 row + dependencies)
- `.planning/REQUIREMENTS.md` — Canonical req IDs (KNW-01 / KNW-02 / KNW-03 / KNW-04 / KNW-05 / KNW-08 / XC-08)

### Project-wide rules (non-skippable)
- `tasks/constraints.md` — Banned strings, architecture guardrails, compliance gates, URL handling
- `tasks/lessons.md` — Phase 1 lessons (read before planning; especially RLS + Stripe + Vercel CLI quirks)
- `tasks/banned-strings.txt` — CI banned-string list
- `CLAUDE.md` (project root) — Project-specific Claude instructions (extends `~/.claude/CLAUDE.md`)

### Brand + design (UI surfaces this phase: paste flow, confirmation UI, sidebar, timeline)
- `docs/BRAND.md` — Brand tokens, typography, voice ("operator, not assistant"; product **drafts/matches/cites**, does not **feel/love/want**)
- `docs/DESIGN-REFERENCE.md` — Harmonic + Firecrawl aesthetic; anti-patterns
- `.planning/phases/01-foundation/01-UI-SPEC.md` — Phase 1 UI contract; Phase 2 surfaces extend this
- `docs/BRAND-PACK-README.md` — Asset inventory + install/usage

### Phase 1 implementation (predecessor context)
- `.planning/phases/01-foundation/01-CONTEXT.md` — Phase 1 locked decisions (read for AI chokepoint, RLS, Inngest, Stripe patterns)
- `.planning/phases/01-foundation/VERIFICATION.md` — Phase 1 exit verification (status: passed)
- `.planning/phases/01-foundation/01-09-SUMMARY.md` (and 01-01 through 01-09) — Phase 1 shipped artifacts (reuse patterns; avoid duplication)
- `src/ai/client.ts` — **AI chokepoint** (Phase 2 extends, never bypasses)
- `src/db/schema/*.ts` — Drizzle schema directory (Phase 2 adds `memory.ts`, `timeline.ts`, `embeddings.ts`)
- `src/inngest/functions/*.ts` — Inngest function directory (Phase 2 adds `embed-memory.ts`, `parse-import-zip.ts`)

### Intel (strategic background)
- `.planning/intel/Trochia_AI_Strategy_v1.md` — Strategic context
- `.planning/intel/Trochia_AI_Build_Stack_v2.md` — Per-phase skill priorities (Phase 2 row)
- `.planning/intel/Trochia_AI_PRD_v2.docx` — §6.1 (Business Memory schema), §6.1.3 (extraction), §6.1.5 (provenance), §6.2 (Q&A), §6.4 (timeline)

### MCP servers (wire into per-ticket plans)
- **context7** — Live library docs lookup. Wire on every plan that touches: `pgvector` (HNSW tuning), `drizzle-orm` (jsonb + vector type), `@inngest/sdk` (function signatures), `@anthropic-ai/sdk` (prompt caching `cache_control`), `voyageai` SDK (embeddings batch API), Langfuse SDK (tracing + cache metrics).
- **github** — PR + issue ops (already wired Phase 1)
- **superpowers-chrome** — `/qa` real-browser testing for Q&A sidebar + confirmation UI (Week 6 + Week 7)

</canonical_refs>

---

<specifics>

## Specific Files To Create (per PLAN v1 §7)

**Week 1 — Schema foundation**
- `src/db/schema/memory.ts` (new)
- `src/db/schema/timeline.ts` (new)
- `src/db/schema/embeddings.ts` (new — moved up from Week 4 for one-shot schema lock)
- `src/db/migrations/0XXX_business_memory.sql`
- `tests/integration/rls-memory.test.ts` (new)

**Week 2 — Paste extractor + confirmation UI shell**
- `src/ai/agents/extract-from-paste.agent.ts` (new)
- `src/ai/schemas/business-memory.zod.ts` (new)
- `src/app/(app)/onboarding/import/paste/page.tsx`
- `src/components/memory/confirmation-card.tsx` (new)

**Week 3 — Conflict + PII + injection defense**
- `src/ai/sanitizers/prompt-injection.ts` (new)
- `src/ai/sanitizers/pii-redact.ts` (new)
- `src/components/memory/conflict-resolver.tsx` (new)

**Week 4 — Embed pipeline + corpus + eval scaffold**
- `src/inngest/functions/embed-memory.ts` (new)
- `src/ai/integrations/voyage.adapter.ts` (new)
- `data/corpus/` (new directory with ~50 markdown files)
- `src/scripts/load-corpus.ts` (new)
- `src/ai/eval/` (new directory: fixtures, runner, CI integration)
- `.github/workflows/eval.yml` (update)

**Week 5 — RAG + prompt caching verification**
- `src/ai/rag/retrieve.ts` (new)
- `src/ai/rag/fuse.ts` (new)
- `src/ai/client.ts` (update — add `cache_control` for corpus + memory prefix blocks)

**Week 6 — Q&A sidebar + cost tracking**
- `src/ai/agents/qa-rag.agent.ts` (new)
- `src/components/qa/sidebar.tsx` (new)
- `src/components/qa/citation-chip.tsx` (new)
- `src/app/(app)/layout.tsx` (update — mount sidebar)
- `src/ai/client.ts` (update — Langfuse `user_id` tag)

**Week 7 — Upload Tier 2 + staleness + timeline UI**
- `src/inngest/functions/parse-import-zip.ts` (new)
- `src/ai/parsers/chatgpt-export.ts` (new)
- `src/ai/parsers/claude-project.ts` (new)
- `src/ai/parsers/notion-export.ts` (new)
- `src/components/memory/staleness-nudge.tsx` (new)
- `src/app/(app)/timeline/page.tsx` (new)

**Week 8 — Design partner gate**
- `docs/phase-2-gate-interview-script.md` (new)
- `docs/phase-2-gate-results.md` (new, post-interviews)
- `tasks/lessons.md` (update — Lesson 12)

## Ticket → Requirement-ID mapping (resolves PLAN v1 §4 ambiguity)

The strategic doc's §4 "In scope" table conflates *plan tickets* with *canonical requirement IDs*. Authoritative mapping (canonical IDs from `.planning/REQUIREMENTS.md`):

| Strategic ticket | Canonical REQ IDs delivered |
|---|---|
| KNW-01a (Drizzle schema) | Cross-cutting — supports KNW-01, KNW-04, KNW-05, KNW-08, XC-08 |
| KNW-01b (RLS + isolation test) | Cross-cutting (Phase 1 RLS rule extends) |
| XC-08a (timeline schema) | XC-08 (schema portion) |
| KNW-02a (paste extractor agent) | **KNW-01** (paste 500–5,000 words → Business Memory <30s) |
| KNW-02b (confirmation UI shell) | **KNW-01 + KNW-03** (UI portion) |
| KNW-02c (conflict resolver) | **KNW-03** (conflict surfacing) |
| KNW-02d (PII + injection defense) | **KNW-03** (PII redact + non-English handling) |
| KNW-04a (pgvector schema + HNSW) | **KNW-04** (schema portion) |
| KNW-04b (Inngest embed function) | **KNW-04** (pipeline portion) |
| KNW-04c (curated corpus loader) | **KNW-04** (corpus portion) |
| EVAL-01a (eval harness) | Phase exit gate — supports all KNW-XX quality bars |
| KNW-05a (RAG retrieve service) | **KNW-05** (retrieval portion) |
| AI-CACHE-01 (prompt caching wiring) | XC cross-cutting (verifies Phase 1 FND-09 prompt-caching contract end-to-end) |
| KNW-05b (qa-rag agent) | **KNW-05** (synthesis + "I don't know" portion) |
| KNW-05c (Q&A sidebar UI) | **KNW-05** (UX portion) |
| OBS-COST-01 (per-user cost tracking) | XC cross-cutting (sets up SEC-02 tier-aware caps in Phase 4.5) |
| KNW-03 (file upload Tier 2) | **KNW-02** (50MB ZIP <60s) |
| KNW-08 (staleness nudges) | **KNW-08** |
| XC-08b (timeline UI) | **XC-08** (UI portion) |
| GATE-PHASE-2 (design partner interviews) | Phase exit |

Every plan file MUST include the **canonical REQ IDs** from this column in its frontmatter `requirements:` field. Strategic ticket IDs are used as plan filenames (`02-KNW-01a-PLAN.md`) for traceability with `docs/Trochia_AI_Phase_2_PLAN_v1.md`.

</specifics>

---

<scope_fence>

## Hard exit gate (the moat-is-real test)

Phase 3 (Pitch Lab) **cannot start** until ALL eight are TRUE:

| # | Gate | Method |
|---|---|---|
| 1 | 3 design partner founders use Trochia ambient Q&A on their own data | Recruit by Week 5 |
| 2 | Each design partner reports Q&A gives answers ChatGPT could not (cites their confirmed traction, pipeline state, narrative) | Structured 45-min interview at Week 8 |
| 3 | Tier 1 paste auto-fills ≥8 fields from a typical 1,500-word paste | Eval fixture (CI) |
| 4 | Cache-hit rate non-zero and monitored in Langfuse | Langfuse dashboard |
| 5 | Median Q&A response <8s | Langfuse trace + eval fixture |
| 6 | Q&A says "I don't know" rather than fabricating when retrieval empty/weak | Eval fixture: 10 deliberately out-of-scope questions |
| 7 | Zero fabricated citations in 50 sample Q's | Eval fixture review |
| 8 | Eval harness running in CI, gates ship | EVAL-01a ticket |

If even one fails: **STOP. Do not advance.**

## Hand-off contract to Phase 3

- [ ] All 8 exit gate criteria green
- [ ] Lesson 12 captured in `tasks/lessons.md`
- [ ] Eval harness running in CI with fixtures
- [ ] Prompt caching verified in Langfuse with hit-rate metric
- [ ] At least 1 design partner agrees to continue as Phase 3 deck-reviewer test subject
- [ ] Phase 2 ROADMAP entry marked ✅ in `.planning/ROADMAP.md`

</scope_fence>

---

<deferred>

## Deferred Ideas

- **Knowledge Pack Import Tier 3** (browser extension auto-pull) → Phase 6 (browser extension phase)
- **Deck context grounding** → Phase 3 (deck reviewer)
- **Pipeline auto-stage updates from transcripts** → Phase 4 (pipeline)
- **Multi-region embeddings (EU residency)** → V2 (Phase 7 + 8)
- **Cross-module fact-conflict surfacing** → Phase 7 (data room)
- **Conversation state in Q&A sidebar (multi-turn)** → Defer to Phase 4 unless eval insists earlier
- **Voyage re-embed at higher dim** → Defer (only revisit if eval shows retrieval quality cap)

## Pitfalls + mitigations (PLAN v1 §6)

| # | Pitfall | Mitigation | Owner ticket |
|---|---|---|---|
| 8 | Prompt injection via pasted knowledge packs | Sanitize input before LLM; never let pasted content reach system-prompt position; structured-output Zod gate; banned-string check on extracted fields | KNW-02d |
| 11 | Schema drift | Lock Business Memory schema Week 1; Drizzle migration discipline + CI check; provenance JSON for flex fields, not new columns | KNW-01a |
| 12 | Shallow memory ("we couldn't extract much") | Hard quality bar: ≥8 fields from 1,500-word paste; eval against fixtures from Week 2; if extractor falls below bar, ship blocker | Week 2–4 eval loop |
| 19 | Model cost blowup | Prompt caching (corpus + memory cached prefix); model routing (Sonnet extract, Opus only synthesis); per-user daily caps | AI-CACHE-01, OBS-COST-01 |

</deferred>

---

*Phase: 02-knowledge-layer*
*Context gathered: 2026-05-19 via PRD Express Path from `docs/Trochia_AI_Phase_2_PLAN_v1.md`*
