# Trochia AI — Phase 2 PLAN v1
## Knowledge Layer + Memory

**Status**: Planning complete, ready for build kickoff
**Phase**: 2 of 11
**Depends on**: Phase 1 (foundation, AI chokepoint, RLS, tenant scoping) — ✅ closed 2026-05-19
**Gates**: Phase 3 (Pitch Lab) cannot start until Phase 2 exit gate clears
**Estimated effort**: 8 weeks solo (Conservative pace)
**Authored**: 2026-05-20

---

## 1. The verdict

This phase builds the moat. Every other Trochia module reads from and writes to Business Memory. If the import + confirmation UX is weak, every downstream module degrades. If the ambient Q&A doesn't outperform vanilla ChatGPT on the founder's own data, there is no defensible product.

**Critical context for this phase**: Some founders will not have pitch decks yet, or will have completely unstructured ones. Business Memory must stand alone as a valuable asset *before* Phase 3 deck context is layered on. Ambient Q&A must deliver value from memory alone. This drives the founder direction that the eval harness ships in Phase 2, not Phase 3.

---

## 2. Goal

The Business Memory + Pipeline Memory spine works:
- Founders convert existing ChatGPT/Claude/Notion context into a confirmed Business Memory in <5 minutes
- A grounded, cited ambient Q&A sidebar answers questions from the curated corpus + memory in median <8s
- A unified raise timeline anchors the "one operator" feel
- Cross-cutting AI patterns (caching, model tiering, eval, cost monitoring) are in place for Phase 3+

---

## 3. Hard exit gate (the moat-is-real test)

**Phase 3 (Pitch Lab) cannot start until ALL of the following are TRUE**:

| # | Gate | Method |
|---|---|---|
| 1 | 3 design partner founders use Trochia ambient Q&A on their own data | Recruit by Week 5 |
| 2 | Each design partner reports the Q&A gives answers ChatGPT could not — cites their confirmed traction, pipeline state, narrative | Structured interview at Week 8 |
| 3 | Tier 1 paste auto-fills ≥8 fields from a typical 1,500-word paste | Eval fixture; runs in CI |
| 4 | Cache-hit rate is non-zero and monitored in Langfuse | Langfuse dashboard |
| 5 | Median Q&A response <8s | Langfuse trace; eval fixture |
| 6 | Q&A says "I don't know" rather than fabricating when retrieval is empty/weak | Eval fixture: 10 deliberately out-of-scope questions |
| 7 | Zero fabricated citations in 50 sample Q's | Eval fixture review |
| 8 | Eval harness running in CI, gates ship | EVAL-01 ticket |

If even one fails: STOP. Do not advance.

---

## 4. Scope

### In scope

| Requirement | Deliverable |
|---|---|
| KNW-01 | Business Memory schema, Pipeline Memory schema, provenance JSON, RLS |
| KNW-02 | Knowledge Pack Import Tier 1 (paste text, 500–5,000 words) |
| KNW-03 | Knowledge Pack Import Tier 2 (ChatGPT ZIP, Claude Project MD, Notion export, .md/.txt) |
| KNW-04 | Inngest embedding pipeline (chunk → Voyage embed → pgvector upsert) + curated corpus |
| KNW-05 | Ambient Q&A sidebar with hybrid RAG + Opus synthesis + citations |
| KNW-08 | Memory-staleness prompts (>14 days, non-blocking, snoozable per field) |
| XC-08 | Unified raise timeline (chronological cross-module event view) |
| EVAL-01 | Eval harness with fixtures, CI integration, gates ship |

### Out of scope (deferred)

| Item | Phase |
|---|---|
| Knowledge Pack Import Tier 3 (browser extension auto-pull) | Phase 5/6 |
| Deck context grounding | Phase 3 |
| Pipeline auto-stage updates from transcripts | Phase 4 |
| Multi-region embeddings (EU) | V2 |
| Cross-module fact-conflict surfacing | Phase 7 |

---

## 5. Tech decisions (locked)

| Decision | Value | Why |
|---|---|---|
| Embedding provider | Voyage `voyage-3-large` | Better quality at lower cost than Cohere; multilingual; ARCHITECTURE-approved |
| Extraction model | Claude Sonnet 4.6 | Structured output via Zod; cheap for paste flow; PRD §6.1.3 |
| Synthesis model | Claude Opus 4.7 | Required for Q&A quality per ROADMAP; non-negotiable |
| Chunk size | 800 tokens, 200 overlap | Standard RAG default; tune after eval |
| Cache strategy | Corpus + Business Memory as cached prefix; 1-hour cache tier for corpus | Per Build Stack doc; measure hit rate in Langfuse |
| ChatGPT ZIP parsing | Inngest function, NOT request path | 800s ceiling on Pro plan; 1GB+ ZIPs possible |
| Curated corpus | Links + ≤2-sentence summaries (no verbatim long quotes); founder discretion to expand selectively only where it materially helps users | Copyright-safe by default; founder value priority |
| Design partner recruitment | Martins's existing startup network (Clockvest warm intros); 3 founders by Week 5 | Solo founder constraint; warm > cold |
| Eval harness | Ships in Phase 2 (Week 4 forward) — founder direction | Some founders won't have decks; eval cannot wait for Phase 3 |

---

## 6. Pitfalls + mitigations

| # | Pitfall | Mitigation | Owner ticket |
|---|---|---|---|
| 8 | Prompt injection via pasted knowledge packs | Sanitize input before LLM. Never let pasted content reach system-prompt position. Structured-output Zod gate. Banned-string check on extracted fields. | Week 3 KNW-02d |
| 11 | Schema drift | Lock Business Memory schema in Week 1. Drizzle migration discipline + CI check. Provenance JSON for flex fields, not new columns. | Week 1 KNW-01a |
| 12 | Shallow memory ("we couldn't extract much, fill in these 12 fields") | Hard quality bar: ≥8 fields from 1,500-word paste. Eval against fixtures from Week 2. If extractor falls below bar, ship blocker. | Week 2–4 eval loop |
| 19 | Model cost blowup | Prompt caching (corpus + memory cached prefix). Model routing (Sonnet for extraction, Opus only for Q&A synthesis). Per-user cost monitoring with daily caps. | Week 5 AI-CACHE-01, Week 6 OBS-COST-01 |

---

## 7. Build sequence (8 weeks, Conservative pace)

### Week 1 — Schema foundation
**Tickets**: KNW-01a, KNW-01b, XC-08a
**Goal**: Business Memory + Pipeline Memory + timeline tables exist with RLS; schema locked.

| Ticket | Action | Acceptance |
|---|---|---|
| KNW-01a | Drizzle schema for `business_memory`, `pipeline_entry`, `interaction`, `timeline_event` tables with provenance JSON columns | Schema migration green; columns match PRD §6.1.5 |
| KNW-01b | RLS policies (default-deny) on all four tables; two-user isolation test | RLS CI check green; two-user test passes |
| XC-08a | `timeline_event` table: source_module, source_id, event_type, event_at, founder_visible | Schema migration green |

**Files involved**:
- `src/db/schema/memory.ts` (new)
- `src/db/schema/timeline.ts` (new)
- `src/db/migrations/0XXX_business_memory.sql`
- `tests/integration/rls-memory.test.ts` (new)

---

### Week 2 — Paste extractor + confirmation UI shell
**Tickets**: KNW-02a, KNW-02b
**Goal**: Founder pastes 1,500 words → sees extracted fields with source snippets.

| Ticket | Action | Acceptance |
|---|---|---|
| KNW-02a | `extractFromPaste` agent in `ai/agents/`: Sonnet 4.6 + Zod schema. Takes raw text → returns `{ field: { value, source_snippet, confidence } }` | Zod-parsed output; ≥8 fields filled for fixture paste; <30s p50 |
| KNW-02b | Confirmation UI: per-field cards with source snippet, edit/confirm/reject controls; persistent across browser refresh | Manual: paste your ChatGPT context, see ≥8 fields populated with snippets |

**Files involved**:
- `src/ai/agents/extract-from-paste.agent.ts` (new)
- `src/ai/schemas/business-memory.zod.ts` (new)
- `src/app/(app)/onboarding/import/paste/page.tsx`
- `src/components/memory/confirmation-card.tsx` (new)

---

### Week 3 — Conflict resolution + PII redaction + prompt-injection defense
**Tickets**: KNW-02c, KNW-02d
**Goal**: Confirmation UI handles real founder docs with contradictions and unrelated-party PII.

| Ticket | Action | Acceptance |
|---|---|---|
| KNW-02c | Conflict surfacing: when extractor returns multiple values for same field, UI shows both with sources; founder picks one | Paste with "$40k MRR" and "$25k MRR" shows both, founder resolves |
| KNW-02d | PII redaction pass on unrelated-party PII. Prompt-injection sanitizer on paste input | Paste with "John Doe, john@example.com" gets flagged. "Ignore previous instructions" sanitized. |

**Files involved**:
- `src/ai/sanitizers/prompt-injection.ts` (new)
- `src/ai/sanitizers/pii-redact.ts` (new)
- `src/components/memory/conflict-resolver.tsx` (new)

---

### Week 4 — Embed pipeline + curated corpus + eval harness scaffold
**Tickets**: KNW-04a, KNW-04b, KNW-04c, EVAL-01a
**Goal**: `memory.confirmed` → embeds in pgvector. Curated corpus loaded. Eval harness running.

| Ticket | Action | Acceptance |
|---|---|---|
| KNW-04a | pgvector `embeddings` table: tenant_id, source_type, source_id, chunk_text, embedding, model_version, embedded_at. HNSW index. | Schema migration green; HNSW index exists |
| KNW-04b | Inngest `embed-memory` function: triggered on `memory.confirmed`. Chunks (800/200), Voyage call, upsert. Idempotent. | Confirm memory → see embeddings in DB via Inngest dashboard |
| KNW-04c | Load curated corpus: 50 docs (YC SAFE primer, Carta benchmarks, AngelList valuation guides, accelerator FAQs) as links + ≤2-sentence summaries. Embed all on cold start. | Embeddings table has rows with `source_type='corpus'` |
| EVAL-01a | Eval harness scaffold: `ai/eval/` with fixtures, runner, CI integration. Must-not-fail checks: no fabricated citations, latency p50, false-positive rate. | CI runs eval; fails build on regression |

**Files involved**:
- `src/db/schema/embeddings.ts` (new)
- `src/inngest/functions/embed-memory.ts` (new)
- `src/ai/integrations/voyage.adapter.ts` (new)
- `data/corpus/` (new directory with markdown files)
- `src/scripts/load-corpus.ts` (new)
- `src/ai/eval/` (new directory)
- `.github/workflows/eval.yml` (update)

---

### Week 5 — RAG service + prompt caching verification
**Tickets**: KNW-05a, AI-CACHE-01
**Goal**: Hybrid retrieval works. Prompt caching verified in Langfuse.

| Ticket | Action | Acceptance |
|---|---|---|
| KNW-05a | RAG service `ai/rag/retrieve.ts`: (query, tenantId, scope) → top-k chunks with source_type/source_id. Hybrid: pgvector cosine + Postgres FTS, fused. | Query "what's my MRR" returns Business Memory chunk; "what's a SAFE" returns corpus chunk |
| AI-CACHE-01 | Wire prompt caching in `ai/client.ts`: corpus + Business Memory as cached prefix with `cache_control`. 1-hour cache tier for corpus block. Langfuse logs `cache_creation_input_tokens` vs `cache_read_input_tokens`. | Langfuse shows non-zero cache_read_tokens within 10 min of repeat queries |

**Files involved**:
- `src/ai/rag/retrieve.ts` (new)
- `src/ai/rag/fuse.ts` (new)
- `src/ai/client.ts` (update — add cache_control)

---

### Week 6 — Ambient Q&A sidebar + qa-rag agent + cost tracking
**Tickets**: KNW-05b, KNW-05c, OBS-COST-01
**Goal**: Sidebar on every page. Cited answers in <8s median. Per-user cost tracked.

| Ticket | Action | Acceptance |
|---|---|---|
| KNW-05b | `qa-rag.agent.ts`: Opus 4.7, (query, retrievedContext) → `{ answer, citations: [{source_type, source_id, snippet}] }`. Zod-validated. Says "I don't know" if context is empty/weak (similarity score < threshold). | 10 in-scope Q's cited; 10 out-of-scope Q's get "I don't know" |
| KNW-05c | Ambient Q&A sidebar UI: persistent on every authenticated page. Input → streamed answer with inline citation chips. | Median response <8s in Langfuse; cite chip click navigates to source |
| OBS-COST-01 | Per-user cost tracking in Langfuse: tag each LLM call with `user_id`. Daily cost cap per user ($5/day default). | Langfuse shows cost-per-user; over-cap user gets soft-throttled |

**Files involved**:
- `src/ai/agents/qa-rag.agent.ts` (new)
- `src/components/qa/sidebar.tsx` (new)
- `src/components/qa/citation-chip.tsx` (new)
- `src/app/(app)/layout.tsx` (update — mount sidebar)
- `src/ai/client.ts` (update — Langfuse user_id tagging)

---

### Week 7 — File upload Tier 2 + staleness prompts + timeline UI
**Tickets**: KNW-03, KNW-08, XC-08b
**Goal**: ChatGPT/Claude/Notion uploads work. Staleness nudges fire. Timeline renders.

| Ticket | Action | Acceptance |
|---|---|---|
| KNW-03 | File upload: ChatGPT Data Export ZIP, Claude Project MD, Notion page export, .md/.txt. Parsed via Inngest. ZIP up to 50MB. Founder points at specific conversations within ChatGPT export to reduce noise. | 50MB ChatGPT ZIP parses <60s; extracted fields appear in confirmation UI |
| KNW-08 | Staleness prompts: fields with `last_updated > 14 days` get non-blocking nudges ("Update your MRR — last set 18 days ago"). Snoozable per field for 7/30/never. | Backdate field 15 days → nudge appears |
| XC-08b | Unified raise timeline UI: chronological cross-module event view, filterable by module/investor, each event links to source. At Phase 2 only memory events; surface ready for Phase 3+. | Timeline renders 10+ events; filter works; click navigates to source |

**Files involved**:
- `src/inngest/functions/parse-import-zip.ts` (new)
- `src/ai/parsers/chatgpt-export.ts` (new)
- `src/ai/parsers/claude-project.ts` (new)
- `src/ai/parsers/notion-export.ts` (new)
- `src/components/memory/staleness-nudge.tsx` (new)
- `src/app/(app)/timeline/page.tsx` (new)

---

### Week 8 — Design partner gate + exit decision
**Tickets**: GATE-PHASE-2
**Goal**: Determine if the moat is real. Go/no-go to Phase 3.

| Ticket | Action | Acceptance |
|---|---|---|
| GATE-PHASE-2 | 3 design partner founders test Trochia on own data for 1 week. Structured 45-min interview each. Score against 8 exit gate criteria (§3). | All 8 criteria met → Go to Phase 3. <8/8 → iterate or stop. |

**Files involved**:
- `docs/phase-2-gate-interview-script.md` (new)
- `docs/phase-2-gate-results.md` (new, after interviews)
- `tasks/lessons.md` (update — Lesson 12)

---

## 8. Risks

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| ChatGPT ZIP parsing produces shallow extraction | High | High (Pitfall 12) | Lean on Tier 1 paste; ask user to point at specific conversations in ZIP; enforce ≥8 fields bar |
| Solo Martins pace slips beyond 8 weeks | High | Medium | Cut KNW-03 Tier 2 to paste-only fallback if Week 7 looks tight |
| Design partners not recruited by Week 5 | Medium | High (gate failure) | Start outreach Week 1; use Clockvest network; backup = Martins's own data + 1 willing founder |
| Voyage embedding cost overshoots | Low | Medium | Daily $5/user cap; Langfuse alerts at 80% |
| Opus 4.7 latency >8s due to context size | Medium | High (gate failure) | Cache aggressively; limit context block to top-10 chunks; Haiku tier for follow-ups |
| Cross-talk with Clockvest workload | High | Medium | Hard time-box Trochia to 25 hrs/week; Phase 2 = 8 weeks not 4 explicitly |

---

## 9. Open questions for resolution during build

| # | Question | When to answer |
|---|---|---|
| 1 | Curated corpus governance: who updates, how often, version control? | Week 4 |
| 2 | What counts as "shallow" memory beyond <8 fields? (Quality, not just quantity) | Week 2 eval design |
| 3 | Staleness prompt cadence: daily check or per-page check? | Week 7 |
| 4 | Should ambient Q&A support follow-up questions in same session (conversation state)? | Week 6 |

---

## 10. Hand-off contract to Phase 3 (Pitch Lab)

Phase 3 cannot start until:

- [ ] All 8 exit gate criteria green
- [ ] Lesson 12 captured in `tasks/lessons.md`
- [ ] Eval harness running in CI with fixtures
- [ ] Prompt caching verified in Langfuse with hit rate metric
- [ ] At least 1 design partner agrees to continue as Phase 3 deck-reviewer test subject
- [ ] Phase 2 ROADMAP entry marked ✅ in `.planning/ROADMAP.md`

---

## 11. Document control

- **Author**: Claude (claude.ai chat, 2026-05-20)
- **For**: Martins Ejeheri + future-Claude
- **Confidence**: HIGH on scope + sequence + tech decisions; MEDIUM on 8-week timeline (depends on Clockvest crosstalk)
- **Successor**: Phase 2 GATE results doc + Lesson 12

---

**End of plan. Week 1 kicks off when Martins says go.**
