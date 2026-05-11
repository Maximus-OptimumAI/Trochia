# Project Research Summary

**Project:** Trochia AI — Agentic Founder-Fundraising Operating System
**Domain:** Vertical AI SaaS — full-journey raise tooling (F&F to Series A) with persistent business memory, multi-module RAG, deterministic legal/financial engines, and a seven-module agentic workflow under one shared memory spine
**Researched:** 2026-05-11
**Confidence:** HIGH on stack, architecture patterns, and pitfalls; MEDIUM-HIGH on competitive feature landscape and timing of inflection points

---

## Executive Summary

Trochia is a technically ambitious vertical SaaS play targeting a well-defined, acutely motivated buyer (pre-seed/seed founders in an active raise) with a product that has no direct full-stack competitor. The field is a fragmented constellation of point tools — investor CRMs, deck reviewers, SAFE generators, cap-table trackers — that each own one slice of the raise. Trochia's bet is that owning the whole journey under a single persistent memory spine creates compounding lock-in that point tools structurally cannot replicate. The research confirms this thesis is conditionally defensible: the moat is real only if three things are built and felt simultaneously — (1) a deck contradiction reviewer grounded in the founder's actual business memory (genuinely novel; no competitor does this), (2) persistent Business Memory seeded by Knowledge Pack Import (the entry wedge), and (3) owning the close (SAFE + cap-table preview + F&F tracker + e-sign in one flow, filling a gap the cap-table players deliberately avoid). Journey breadth alone is not defensible — Flowlie, Visible, and fast-moving AI fundraising copilot entrants are converging on the same feature bundle. The PRD's integration thesis holds only if the connective-tissue features that make integration felt are explicitly built: a unified raise-timeline view, memory-staleness prompts, and cross-module fact-conflict surfacing. None of these are in the PRD; all three are recommended additions.

The recommended technical approach is a Next.js 16.x monolith on Vercel with Supabase Postgres + pgvector (no separate vector DB), tRPC v11 + Drizzle 0.44.x + Zod v4 for type-safe API and data layers, Inngest v4 for all slow/retryable background work, Anthropic (Opus 4.7 / Sonnet 4.6 / Haiku 4.5) as the single production AI chokepoint with mandatory prompt caching, Voyage AI for embeddings, and Langfuse as the eval/observability layer from day one. The only open call is Next.js 16.x vs. 15: start on 16.x for greenfield; if the existing scaffold is already on 15 and working, ship MVP on 15 pinned and upgrade before V2. Testing fills the gap with Vitest v3 + Playwright 1.5x + MSW v2. Document generation fills the gap with docxtemplater + a Gotenberg/LibreOffice container for SAFE .docx to PDF, @react-pdf/renderer v4 for briefs/scorecards, and ExcelJS v4 for cap-table .xlsx. Voice capture uses native MediaRecorder + Web Audio API. A new risk not on the team's radar: Hume AI's Expression Measurement API sunsets June 14, 2026. The recommended Plan B is to compute all four PRD voice metrics deterministically (pace WPM and pause discipline from Deepgram word timestamps, filler count from a custom detector, energy 1-5 from Web Audio offline RMS pass) — mechanically superior to an emotion-model approach.

The dominant risks are non-technical and catastrophic: unauthorized practice of law on the SAFE/legal-recommender surfaces, securities-law framing on the F&F module, multi-tenant RLS leaks, Google Drive over-scoping hitting the CASA verification cliff, customer data entering a model training pipeline via the OpenAI fallback or build tooling, string-injection into the SAFE substitution engine, and LLM-computed cap-table math. The mitigation posture is architectural: RLS default-deny from Phase 0, a single ai/client.ts chokepoint with no import path from the deterministic engines, banned-string CI checks running from Phase 0, and non-skippable Compliance Auditor plus Security Engineer gate passes at Legal Stack (P7), Raise Ops SAFE (P8), and F&F + E-Sign (P9).

---

## Key Findings
### Recommended Stack

The team's tentative stack is correct for 2026 and validated against current docs. Fill the gaps with: Vitest v3 + Playwright 1.5x + MSW v2 (testing), Langfuse OSS JS SDK v3 (LLM eval/observability, homes the PRD-mandated eval harnesses, runs in CI), docxtemplater v3 + Gotenberg/LibreOffice container (SAFE .docx generation + .docx to PDF), @react-pdf/renderer v4 (briefs/scorecards), ExcelJS v4 (cap-table .xlsx), native MediaRecorder + Web Audio API (voice capture), official googleapis with drive.file scope only (Data Room).

**Core technologies:**
- **Next.js 16.x + React 19 + Tailwind v4 + shadcn/ui**: Framework and UI — 2026 mainstream; React Compiler on by default; Turbopack default bundler; start on 16.x for greenfield (or stay on 15 pinned if scaffold is working, upgrade before V2)
- **tRPC v11 + Zod v4 + TanStack Query v5**: Type-safe API layer — the solved full-stack TS pattern in 2026; Zod is also the SAFE variable-substitution input contract (security-critical)
- **Supabase (Postgres 15 + pgvector 0.8.x HNSW + Storage + Auth)**: The database — pgvector HNSW handles 5-10M vectors comfortably; no Pinecone/Weaviate ever; use new publishable/secret keys
- **Drizzle ORM 0.44.x + drizzle-kit**: Type-safe SQL with RLS policies co-located in migrations; pin 0.44.x (1.0 beta is unstable)
- **Inngest SDK v4**: Background jobs and durable multi-step workflows — all slow/retryable work runs here (deck review, embeddings, SAFE generation + PDF conversion, e-sign webhook fan-out, pipeline reminders)
- **Anthropic API (Opus 4.7 / Sonnet 4.6 / Haiku 4.5) via a single ai/client.ts chokepoint**: All production AI; prompt caching mandatory (90% discount on cached tokens); model routing by task class (Opus for deep reasoning, Sonnet for high-volume drafting, Haiku for classification/polling)
- **Voyage AI (voyage-3.5 / voyage-4 family)**: Embeddings — leads retrieval benchmarks; 32K context; store model version in schema (re-embedding corpus on version change is expensive)
- **Langfuse (OSS, langfuse JS SDK v3)**: LLM observability + eval harness — traces every Anthropic call, homes the PRD-mandated eval harnesses, runs in CI to block prompt regressions
- **Vitest v3 + Playwright 1.5x + MSW v2**: Testing — Vitest for unit/integration including the 30-scenario cap-table spreadsheet oracle; Playwright for approximately 20-30 money-path E2E; MSW to mock AI/payment APIs
- **docxtemplater v3 + Gotenberg/LibreOffice container**: SAFE .docx generation (template substitution, not LLM) + .docx to PDF via LibreOffice-headless in a separate off-Vercel container; the only piece of infra that lives off Vercel
- **@react-pdf/renderer v4**: Briefs, scorecards, annotated deck reviews — runs in plain Node serverless functions (no Chromium needed)
- **ExcelJS v4**: Cap-table .xlsx export matching Carta/lawyer format; better write/format API than SheetJS for styled generation
- **Native MediaRecorder + Web Audio API**: In-browser voice capture for V2 Voice Coach — no library; record to audio/webm;codecs=opus, upload to Supabase Storage, Deepgram batch transcription via Inngest
- **Deepgram Nova-3**: Transcription — $0.0043/min batch, per-second billing, returns word-level timestamps needed for deterministic voice metrics
- **Upstash Redis + @upstash/ratelimit**: Rate limiting on AI endpoints (cost protection), Stripe/e-sign webhook idempotency keys
- **Stripe + Stripe Tax**: Four-tier billing + $499 add-on; Stripe Tax covers US/UK/EU/India (calculates; does not file)
- **Dropbox Sign API (@dropbox/sign)**: E-sign for SAFEs — ESIGN/eIDAS/SOC2 compliant; DocuSign as fallback behind the same ESignAdapter interface
- **LlamaParse (llama-cloud-services)**: Deck + DDQ parsing — best markdown on visually complex PDFs/PPTX; always have a pdf-parse fallback

**Critical version finding — Hume AI prosody API is sunsetting:** Hume's Expression Measurement API (Playground job creation ends May 14, 2026; last API/results day June 14, 2026) is the Voice Coach's assumed prosody vendor. Do not build V2 Voice Coach assuming Hume is permanent. Recommended Plan B: compute all four PRD voice metrics deterministically — pace WPM and pause discipline from Deepgram word timestamps, filler count from a custom detector on the transcript, energy 1-5 from Web Audio offline RMS pass. These metrics are mechanical, not emotional, and do not require an emotion model.

### Expected Features

The competitive landscape is a fragmented constellation of point tools converging on the same feature bundle. No competitor ships the full journey under one memory spine. The genuine white space is the triad: deck contradiction review grounded in real business memory, persistent Business Memory seeded by Knowledge Pack Import, and owning the close (SAFE + cap-table + F&F + e-sign in one flow).

**Must have (table stakes) — MVP:**
- Investor pipeline/kanban CRM — the PRD under-specifies CRM ergonomics; add bulk actions, CSV import/export, email-sync, custom fields to match Foundersuite/Visible parity
- Investor database/discovery with stage/sector/geo/check-size filters — curated top-200 is defensible if framed honestly in the UI; Harmonic at V2
- Personalized cold-outreach email drafting enriched with partner's recent posts/investments, tone-matched to founder's writing
- Pre-call investor brief citing sources, grounded in memory and enrichment data
- Meeting transcript ingestion and summary writing back to Pipeline Memory
- 24-hour post-call follow-up referencing specific transcript moments
- Knowledge Pack Import (Tier 1 paste + Tier 2 file upload) as the onboarding wedge — both tiers must ship at MVP; Tier 3 browser extension is V2
- Cited ambient Q&A (says I-don't-know rather than fabricating)
- Billing, auth (Google SSO), privacy posture in-product
- Deck upload and parsing with graceful fallbacks

**PRD gaps to pull forward (table stakes that are missing from the PRD):**
- Minimal deck-link tracking: founders send decks constantly and expect DocSend-style view tracking; the PRD only has file analytics inside the V2 Data Room; recommend a tracked link on the reviewed-deck export at MVP or earliest V2
- CRM ergonomics in the Pipeline Memory phase: bulk actions, CSV import/export, email-sync, custom fields

**Should have (differentiators):**
- Deck contradiction reviewer grounded in Business Memory — the strongest differentiator; eval-heavy; false-positive rate must stay below 25%
- Persistent Business Memory seeded by import and confirmation UI — the moat in data form; a typical 1,500-word paste must auto-fill at least 8 fields or the wedge fails
- Voice Pitch Coach (V2) — structure and delivery scorecard; filler detection above 90% on native and non-native speakers; requires the Hume Plan B ready before the phase starts
- Q&A Drill (V2) — cheap on top of the deck reviewer's analysis; shares the audio-capture infrastructure
- Vertical-aware data-room checklist — high value-to-cost; DDQ filler reuses the RAG/citation machinery
- Legal Stack recommender — cheap decision tree plus affiliate revenue; requires Compliance Auditor gate due to UPL exposure
- Warm-intro mapper from founder-supplied LinkedIn export — parity with Flowlie; edge is the auto-drafted intro request plus pipeline integration

**Felt-integration features — NOT in PRD, recommend adding (V2-ish):**
- Unified raise-timeline view: one chronological feed across all modules; makes the one-operator claim visible, not just claimed
- Memory-staleness prompts: "you said $40K MRR 6 weeks ago — still true?" — keeps the moat fresh
- Cross-module fact-conflict surfacing: "your memory says X, your deck says Y — fix one?" — seeds the contradiction-detection capability

**Defer (V3+):**
- SAFE generator + cap-table preview + F&F Round Manager + e-sign (Raise Ops) — hard dependency on law-firm template partner locked before the phase starts
- Investor Update Generator (Alumni tier)
- Harmonic API (V2, not MVP)
- EU data residency (V2, not MVP)
- Mobile app (V4 at earliest, possibly never)
- Investor-side product (V4+ at earliest)

**Permanently rejected (hold the line):**
- Rolling fund anywhere in product, copy, analytics event names, or Git branches
- AI-generated or AI-edited legal language in the SAFE (deterministic substitution only)
- Cap-table math by an LLM (deterministic, unit-tested TS only)
- Autonomous external sends without explicit per-message founder approval
- Broad Google Drive or Gmail OAuth scopes
- Deck generator (review, do not generate)
- In-app investor messaging relay

### Architecture Approach

Trochia is one Next.js monolith (App Router) on Vercel, organized as layered modules inside one repo -- not microservices. The seam that matters is not a network boundary but the package/module boundary inside src/ plus the trust boundary at Postgres RLS. The memory spine (modules/memory) is the product moat in code form. The AI layer (ai/) is a hard wall: production code never calls new Anthropic() outside ai/client.ts. The deterministic firewall -- cap-table-engine and safe-engine -- has no import path to ai/, enforced by directory separation plus a no-restricted-imports lint rule.

**Major components:**
1. **Memory spine (modules/memory)** -- Business Memory + Pipeline Memory as canonical relational records; pgvector embeddings as a derived, regenerable index (never embed-on-write in the request path); every module reads here, only Knowledge Layer and auto-update hooks write canonical records
2. **AI orchestration layer (ai/)** -- one chokepoint for all Anthropic calls; per-agent functions with Zod-typed outputs; prompt-cache management (stable corpus + memory prefix, variable turn suffix); model routing (Opus/Sonnet/Haiku by task); Langfuse tracing; OpenAI fallback on hard failure only with no DB credentials
3. **Deterministic firewall (raise-ops/cap-table-engine, raise-ops/safe-engine)** -- pure TypeScript, decimal.js for all money/shares math, docxtemplater-style whitelisted substitution; zero LLM calls; no import path to ai/; validated against a frozen 30-scenario spreadsheet oracle (TDD-first); Security Engineer audited before ship
4. **tRPC routers + tenant-scoped context** -- the only write path into the DB from the client; protectedProcedure resolves session to tenantId to request-scoped Drizzle client running as authenticated Postgres role (RLS applies); service-role client is a short, audited list of exceptions
5. **Integration adapters (integrations/)** -- every external system behind a stable interface with a fake for tests; founder-approval gate lives in the domain module, above the adapter
6. **Inngest background jobs** -- all slow/retryable/fan-out/cron work; memoized steps so retries do not re-bill or re-do work
7. **Eval harness (ai/eval/)** -- imports agent functions, runs against anonymized fixture corpus, reports metrics in CI; gates ship for the deck reviewer and every subsequent AI feature
8. **Data-residency seam** -- tenant.region column + getDbForRegion() factory + 1-2 Supabase projects at MVP; EU region added at V2 as provisioning, not a refactor

**Build order rationale:** Spine and trust boundaries first (platform + RLS + tenant-scoped tRPC + billing/entitlements + residency seam + AI chokepoint + memory spine + RAG/citation machinery), then feature modules in user-journey-dependency order. Raise Ops core (deterministic engines, least AI dependency) is deliberately late. EU residency is a V2 line item, not MVP.
### Critical Pitfalls

Seven pitfalls are CATASTROPHIC -- each capable of ending the company or triggering regulatory action.

1. **UPL on SAFE generator and legal recommender** -- Zero model-generated legal language (architecturally enforced: no user-text-to-template-body path exists in code); un-bypassable lawyer-review gate before SAFE download; Haiku forbidden-output classifier on every legal-adjacent LLM surface; non-skippable Compliance Auditor pass at P7 and P8. Warning sign: a design partner says they love that Trochia told them what cap to use -- that is a bug report, not a testimonial.

2. **Rolling fund / securities-law framing on F&F module** -- Banned-string CI check (rolling fund, investment vehicle, syndicate, adviser, broker in self-referential contexts) installed in P0 and running across code, copy JSON, ToS/DPA, analytics event names, and the marketing site; standing not-an-investment-vehicle copy as a layout-level component on every F&F screen; Trochia never touches money; Compliance Auditor review at P9.

3. **Multi-tenant RLS leak** -- Default-deny posture: every CREATE TABLE migration enables RLS plus a tenant_id FK plus the standard USING (tenant_id = current_tenant_id()) policy; a CI check that fails if any table has rowsecurity=false or zero policies; a two-user integration test written in P0 and kept green forever; all pgvector similarity searches use a tenant-filtered reusable helper; service-role key server-only; Security Engineer audit at every phase that adds tables.

4. **Hume AI prosody API sunsetting (June 14, 2026) -- NEW RISK not on the team's radar** -- Hume's Expression Measurement API (Playground job creation ends May 14, 2026; last API/results day June 14, 2026) is the V2 Voice Coach's assumed prosody vendor. Do not build the Voice Coach assuming Hume is permanent. Plan B (strongly recommended as the default): compute all four PRD voice metrics deterministically from Deepgram word timestamps + Web Audio RMS. This Plan B is mechanically superior for this use case.

5. **SAFE variable-substitution engine as a string-injection target** -- Strict whitelist validation on every variable (reject, never sanitize); no general-purpose template engine on legal documents; post-generation re-parse asserts well-formed output with exact expected values, no unexpected text, no hidden/zero-width runs, no leftover placeholders; golden-file tests per template; Security Engineer audit required before P8 ship.

6. **Cap-table / MFN / dilution math by an LLM or wrong code** -- cap-table-engine is pure TypeScript with decimal.js, no Anthropic SDK import (enforced by lint rule); TDD-first: write the 30-scenario spreadsheet oracle before any production math; 100% match or CI fails; the UI shows conversion steps.

7. **Customer data inadvertently enters a model training pipeline** -- Anthropic API confirmed no-training / 7-day retention; OpenAI fallback has no DB credentials (build-time only) unless a no-training/ZDR arrangement is confirmed; a living vendor data-flow inventory; sensitive content scrubbed from all logs and observability; hard rule: never paste real customer data into consumer LLMs to debug -- use synthetic fixtures.
---

## Implications for Roadmap

All phases align with and sharpen the Build Stack v2 11-phase GSD sequence. The governing principle: build the spine and trust boundaries first; feature modules sit on top. Raise Ops core (Phase 8) is deliberately late.

**Operator pacing note:** A solo Martins build is the Conservative timeline (+approximately 6 months versus the 36-week plan). The roadmap must be time-boxed for Conservative unless/until an operator co-founder is assigned. The operator assignment Open Question must be resolved before the roadmap is finalized. PRD v1 (MVP-only staged ship) is the expected fallback if scope must be cut -- not a remote contingency.
### Phase 0: Foundation + Platform + Trust Boundaries

**Rationale:** RLS, tenant scoping, the AI chokepoint, billing/entitlements, and the banned-string CI check are load-bearing for every module. Retrofitting RLS onto a live schema is brutal. Nothing ships on a cracked foundation.

**Delivers:** Next.js monolith on Vercel; Supabase provisioned (US-East + India regions at MVP); Drizzle schema with RLS on every table from day one; Supabase Auth (Google SSO); Stripe billing skeleton; tenant.region column + getDbForRegion() factory; ai/client.ts skeleton with prompt-caching plumbing; Inngest wired; Resend / Sentry / Amplitude; GDPR/UK-GDPR/DPDP-grade DPA + privacy policy; banned-string CI check running and green; two-user integration test written and green; onboarding flow shell.

**Exit gate:** Two-user integration test green; RLS CI check green; banned-string CI check green; DPA presented at signup; onboarding funnel instrumented in Amplitude.

**Research flag:** Standard patterns. saas-multi-tenant, trpc-fullstack, stripe-integration skills cover it.
### Phase 1: Knowledge Layer + Memory Spine + RAG

**Rationale:** Every other module reads from and writes to Business Memory. The RAG/citation machinery built here is reused by briefs, DDQ filler, application answers, and Q&A Drill. The moat is code in this phase.

**Delivers:** Business Memory schema + Knowledge Pack Import (Tier 1 paste + Tier 2 file upload) + confirmation UI with source snippets and conflict surfacing; pgvector embedding pipeline via Inngest (chunk to embed to upsert; Voyage model version recorded in schema); curated fundraising corpus loaded; hybrid RAG retrieval (pgvector cosine + Postgres FTS + citation tracking); ambient Q&A sidebar (cited, says I-do-not-know, median response under 8s); prompt caching wired and cache-hit rate verified in Langfuse; per-user cost tracking.

**Exit gate (hard):** The moat is real -- design partners on their own data report the ambient Q&A gives answers ChatGPT could not (cites their confirmed traction, their pipeline state, their narrative). Do not advance to P2 until this gate clears. Also: Tier 1 paste auto-fills at least 8 fields from a typical 1,500-word paste; cache-hit rate is non-zero and monitored.

**Avoids:** Shallow memory (Pitfall 12), prompt injection on pasted knowledge packs (Pitfall 8), schema drift (Pitfall 11), model cost blowup (Pitfall 19).

**Research flag:** Standard patterns for RAG and embedding pipelines.
### Phase 2: Pitch Lab -- Deck Reviewer

**Rationale:** The deck reviewer is the first wow and the proof point for this-will-not-embarrass-me-with-investors. It requires the memory spine to be real (deck-vs.-reality contradiction detection). The eval harness ships here and establishes the pattern every subsequent AI feature inherits.

**Delivers:** Deck upload (PDF, PPTX, Google Slides URL) with LlamaParse and pdf-parse fallback; deck-review.agent (Opus, structured output over deck + Business Memory + defect taxonomy); review dashboard with per-issue accept/reject/edit; annotated PDF export; eval harness live in CI (false-positive rate tracked, zero-fabricated-refs check, latency p50); structural validation in code (every issue original_text must be a verbatim substring of a real slide parsed text); production accept-rate monitoring in Amplitude.

**Exit gate (hard):** Eval harness reports false-positive rate below 25% (trending down), median 5-15 issues for a typical pre-seed deck, median review under 90s for 12 slides, zero fabricated slide references. Do not ship the deck reviewer without this gate cleared.

**Avoids:** Deck-reviewer false positives / hallucinated slide refs (Pitfall 9), prompt injection via uploaded decks (Pitfall 8).

**Research flag:** Standard patterns.
### Phase 3: Investor Pipeline

**Rationale:** Depends on Business Memory and the enrichment, calendar, and Gmail adapters; produces the Pipeline Memory entries that Live Raise (P4) consumes.

**Delivers:** VC + accelerator match (curated top-200 + 30+ accelerators, thesis-embedding similarity, one-line rationale per match); application tracker + AI-drafted answers (Sonnet, from Business Memory) for top-15 application banks; outreach drafter (enriched via Exa/Firecrawl, tone-matched to founder writing, sends via founders own Gmail -- never autonomous, minimum gmail.compose scope or deep-link); warm-intro mapper (founder-supplied LinkedIn connections export -- no LinkedIn scraping ever); pipeline kanban. PRD gap to address here: spec CRM ergonomics -- bulk actions, CSV import/export, email-sync, custom fields.

**Avoids:** Gmail over-scope (Pitfall 17), LinkedIn ToS violation (Pitfall 16), autonomous sends.

**Research flag:** Standard patterns.

### Phase 4: Live Raise -- MVP Soft Launch Gate

**Rationale:** Before building V2 features, validate that the core raise workflow actually delivers value. This is a hard go/no-go gate -- if Pipeline Memory + outreach is not driving warm conversations at live launch, V2 investment is premature.

**Delivers:**
- Investor update drafter (Inngest cron, weekly cadence)
- Meeting prep brief generator (grounded in Business Memory + Pipeline Memory)
- Post-meeting debrief capture (voice or text)
- Term sheet analyzer (structural red-flag detection, Opus)
- Ask Calculator (dilution model, deterministic, no AI)
- DocSend-style deck-link tracking (minimal: open events, per-investor view counts)
- Investor heatmap / pipeline dashboard

**Exit gate (hard go/no-go before V2 investment):**
- Minimum 3 design-partner founders complete a live raise cycle end-to-end
- At least 1 founder attributes a warm intro or meeting to the system
- NPS >= 7.0 from active users
- Zero critical security incidents

**Pitfalls to avoid:**
- Pitfall 1: Regulatory exposure from advice-like language in term sheet analyzer
- Pitfall 2: PII handling for investor contact records
- Pitfall 12: Equity math errors in Ask Calculator (TDD oracle)

**Research flag:** Standard patterns for update drafting; term sheet analysis needs prompt engineering iteration. Ask Calculator: TDD-first, no AI.
### Phase 5: Voice Pitch Coach + Q&A Drill (V2)

**Rationale:** High-differentiation feature but requires stable foundation and a critical decision gate: Hume AI Expression Measurement API is sunsetting June 14, 2026. This phase must not start until the Plan B path (deterministic voice metrics from Deepgram timestamps + Web Audio RMS) is validated or a replacement API confirmed.

**Delivers:**
- Voice recording via native MediaRecorder + Web Audio API (no library dependency)
- Transcription via Deepgram Nova-3 (batch mode, word-level timestamps)
- Voice metrics: filler-word rate, speaking pace, pause distribution -- computed deterministically from Deepgram timestamps + Web Audio RMS (Plan B, not Hume)
- Q&A scenario library (Opus-generated, curated by team)
- Pitch coach feedback report (@react-pdf/renderer)
- Progress tracking over sessions

**Decision gate (required before phase start):**
- Hume AI replacement found AND validated, OR
- Plan B metrics validated as sufficient (user research + design partner feedback)
- Do NOT build Hume AI dependency -- API sunset is June 14, 2026

**Pitfalls to avoid:**
- Pitfall 20 (Hume AI sunset): hard ban on Hume dependency
- Pitfall 9: voice coach feedback must not hallucinate timestamps
- Pitfall 21: voice data handling -- PII-equivalent, clear retention policy

**Research flag: NEEDS PHASE RESEARCH.** Hume AI sunset creates an open question. Validate Plan B voice metrics quality with design partners before committing phase scope.
### Phase 6: Data Room (V2)

**Rationale:** Investors need a governed place to access diligence materials. Supabase Storage already in the stack -- this is primarily a permissions/sharing UX problem, not a new infrastructure problem.

**Delivers:**
- Supabase Storage-backed file vault with per-investor access grants
- Folder structure: financials, legal, product, team
- DDQ auto-responder (RAG over Business Memory + uploaded documents, Sonnet)
- Investor NDA workflow (upload-gated documents)
- Access audit log (who viewed what, when)
- Expiring share links

**Pitfalls to avoid:**
- Pitfall 2: storage bucket RLS must match application-level grants
- Pitfall 8: DDQ auto-responder must not leak cross-tenant documents
- Pitfall 15: no document retention policy = liability; define and enforce retention at phase start

**Research flag:** Standard patterns. Supabase Storage RLS is well-documented.

### Phase 7: Legal Stack Recommender (V2)

**Rationale:** Founders consistently misuse legal tools (wrong SAFE variant, wrong cap table software). A curated, opinionated recommender adds value with minimal legal risk if scoped correctly.

**Delivers:**
- Legal tool recommender (Perplexity-style retrieval, current as of training cutoff + manual curation)
- SAFE variant explainer (Y Combinator MFN vs. standard vs. post-money -- educational only)
- Lawyer/firm directory integration (founder-contributed, not scraped)
- Compliance checklist per funding stage

**Non-engineering critical path:** Law-firm SAFE-template-review partner must be locked BEFORE Phase 8 (Raise Ops). Confirm during this phase.

**Pitfalls to avoid:**
- Pitfall 1: Legal Stack Recommender must include non-skippable Compliance Auditor pass
- Any content framed as legal advice must be blocked by banned-string CI check equivalents

**Research flag:** Standard patterns for recommender. Legal content requires human review at each update.
### Phase 8: Raise Ops Core -- SAFE + Cap Table (V3)

**Rationale:** The highest-liability phase. SAFE generation and cap table math require the strictest engineering discipline of any phase. Build only after law-firm partner is locked (Phase 7), and only after the Live Raise gate (Phase 4) is passed.

**Delivers:**
- SAFE document generator: docxtemplater v3 template-fill + Gotenberg/LibreOffice container for PDF conversion (off-Vercel, containerized)
- cap-table-engine: pure TypeScript, zero import path to ai/, TDD-first with 30-scenario spreadsheet oracle
- safe-engine: pure TypeScript, zero import path to ai/
- Dilution preview (pre/post SAFE + pro-rata)
- Round modeling (target raise, valuation cap, discount rate)
- SAFE signing queue integration (routes to Phase 9 E-Sign)

**Non-negotiable engineering gates:**
- Law-firm partner reviewed SAFE template before any user sees output
- 30-scenario TDD oracle green before phase ships
- Non-skippable Security Engineer audit of safe-engine before production
- cap-table-engine and safe-engine: ESLint rule enforcing zero AI import paths
- Every SAFE output carries disclaimer: generated document, not legal advice, review with counsel

**Pitfalls to avoid:**
- Pitfall 11 (SAFE math errors): TDD oracle is the mitigation
- Pitfall 12 (cap table math errors): same oracle
- Pitfall 1: legal exposure from unreviewed SAFE language
- Pitfall 4: deterministic firewall -- no AI in cap-table-engine or safe-engine

**Research flag:** NEEDS PHASE RESEARCH for SAFE template legal review process and Gotenberg/LibreOffice container deployment on the chosen infra.
### Phase 9: F&F Round Manager + E-Sign (V3)

**Rationale:** Friends-and-family rounds have unique complexity: informal relationships, mixed sophistication, and higher emotional stakes. E-sign integration closes the loop from SAFE generation to executed document.

**Delivers:**
- F&F investor tracker (name, relationship, amount, accreditation status)
- Accreditation status collection (self-certification workflow)
- SAFE send workflow: generate (Phase 8) -> review -> countersign -> send via e-sign
- E-sign adapter (Dropbox Sign primary, DocuSign fallback behind ESignAdapter interface)
- Signed document vault (Supabase Storage)
- F&F round progress dashboard (% committed, % signed)

**Non-skippable gate:**
- Compliance Auditor pass on accreditation collection and SAFE distribution workflow
- Legal review of e-sign flow for jurisdiction compliance

**Pitfalls to avoid:**
- Pitfall 1: accreditation collection done wrong = securities law violation
- Pitfall 3: e-sign adapter must be behind interface so provider can be swapped without rewrites
- Pitfall 14: F&F contact records are PII; same DPA rules as investor records

**Research flag:** Standard patterns for e-sign integration. Compliance Auditor review is non-negotiable.

### Phase 10: Polish + Close Mode + Alumni Tier + Public Launch (V3)

**Rationale:** Productize the raise-complete state. Alumni founders who closed their round are brand ambassadors and future angel investors. Close Mode is the UX that makes the moment feel earned.

**Delivers:**
- Close Mode UI: raise summary, total raised, investor roster, timeline replay
- Milestone notifications (first check, round close)
- Alumni tier: reduced-price or free access, access to community Q&A
- Referral program (alumni refers portfolio founder)
- Public launch: ProductHunt, YC community, founder Slack channels
- Billing tier enforcement via Stripe + Stripe Tax

**Pitfalls to avoid:**
- Pitfall 22: launch without real testimonials -- do not launch publicly until >= 3 founders have closed a real round using the product
- Pitfall 19: billing edge cases (team seats, proration, currency)

**Research flag:** Standard patterns. No novel technical risk in this phase.
### Phase Ordering Rationale

The ordering follows three hard constraints:

1. **Trust before features.** RLS, DPA plumbing, and banned-string CI must be in place before any user data is handled. There is no safe shortcut here.

2. **Memory before intelligence.** The deck reviewer, pipeline assistant, and all AI features depend on Business Memory and Pipeline Memory being canonical, queryable, and correctly tenant-isolated. Building AI features before the memory spine is operational produces demos, not products.

3. **User-journey dependency order.** Founders use the product sequentially: prepare (deck, materials) -> identify (VCs, accelerators) -> outreach (pipeline) -> raise (live conversations, updates) -> close (SAFE, signatures). Each phase depends on artifacts from the previous.

The V2 and V3 groupings (Phases 5-10) are staged after the live raise gate (Phase 4 exit) to ensure product-market fit is validated before compounding engineering complexity.

---

## Research Flags

Phases that likely need phase-level research before detailed planning:

| Phase | Flag | Reason |
|-------|------|--------|
| Phase 0 | Standard patterns | RLS + Drizzle patterns well documented; run anyway for DPA specifics |
| Phase 1 | Standard patterns | pgvector HNSW + Inngest embedding pipeline well documented |
| Phase 2 | Standard patterns | Eval harness patterns well documented; LlamaParse integration straightforward |
| Phase 3 | Standard patterns | Gmail API scope patterns well documented |
| Phase 4 | Standard patterns | Deck-link tracking minimal; update drafter straightforward |
| Phase 5 | **NEEDS RESEARCH** | Hume AI sunset; validate Plan B voice metrics quality with users |
| Phase 6 | Standard patterns | Supabase Storage RLS well documented |
| Phase 7 | Standard patterns | Recommender patterns standard; content requires human curation |
| Phase 8 | **NEEDS RESEARCH** | SAFE template legal review process; Gotenberg deployment on chosen infra |
| Phase 9 | Standard patterns | E-sign adapter patterns standard; compliance is process, not research |
| Phase 10 | Standard patterns | No novel technical risk |

---

## Confidence Assessment

| Area | Confidence | Basis |
|------|------------|-------|
| Stack | HIGH | Team tentative stack validated; only open call is Next.js 15 vs 16 (no wrong answer); gap fills confirmed with current library docs |
| Features | HIGH | Competitive analysis complete; PRD gaps identified (deck-link tracking, CRM ergonomics, felt-integration features); priority matrix grounded in founder pain research |
| Architecture | HIGH | RLS + Drizzle + Inngest + pgvector patterns are mature and well-documented; build order is dependency-driven, not arbitrary |
| Pitfalls | HIGH | 22 pitfalls with phase-to-mitigation mapping; 7 CATASTROPHIC pitfalls have concrete prevention protocols |
| Regulatory risk | MEDIUM | Banned-string approach is conservative but not a substitute for legal counsel; DPA templates need jurisdiction-specific review |
| Voice coaching (P5) | LOW | Hume AI sunset creates genuine uncertainty; Plan B quality not yet validated with users |
| SAFE legal risk | MEDIUM | Law-firm partnership is a process dependency, not a technical one; research cannot resolve it |
| Operator pacing | MEDIUM | Timeline is conditional on operator assignment; Conservative (~18-24mo solo) vs. Standard (36 weeks with co-founder) -- open question |

**Overall confidence: HIGH for Phases 0-4 and 6-10. LOW for Phase 5 pending Hume AI resolution.**
---

## Gaps to Address

The following gaps could not be resolved by research and require decisions or validation during planning:

1. **Next.js 15 vs. 16.x.** Both are viable. Research recommends 16.x for Turbopack stability improvements, but 15 is battle-tested. Decision owner: tech lead. Recommend resolving at Phase 0 kickoff.

2. **Hume AI replacement (P5).** Expression Measurement API sunsets June 14, 2026. Plan B (deterministic metrics from Deepgram + Web Audio RMS) needs user validation before committing Phase 5 scope. If Plan B metrics are rated insufficient by design partners, Phase 5 scope must be revised.

3. **Operator assignment.** Solo (Martins) vs. co-founder changes the timeline by ~6 months. Conservative path (solo) requires time-boxing all phases. Standard path (co-founder) enables 36-week roadmap. This is an open question that gates roadmap pacing.

4. **Law-firm SAFE template partner.** Must be locked before Phase 8. This is a relationship/process dependency with ~8-12 week lead time. Start outreach during Phase 7.

5. **EU data residency.** Designed as a seam (getDbForRegion()) but not built in MVP. If the first paying customers are EU-based, this moves from V2 to P0. Validate customer geography in design-partner selection.

6. **Felt-integration features.** The unified raise-timeline view, memory-staleness prompts, and cross-module fact-conflict surfacing are not in the PRD but are identified as moat-critical. These need to be positioned in the roadmap (recommend V2, but specify which phase).

7. **CRM ergonomics in Pipeline Memory.** The PRD does not spec the CRM UX (inline editing, bulk actions, status transitions). This must be designed before Phase 3 implementation begins.

8. **DocSend-style deck-link tracking scope.** Minimal (open events, per-investor view counts) vs. full (time-on-slide, re-open alerts). Minimal is recommended for MVP (Phase 4); full is V2.

---

## Sources

### Primary
- Supabase documentation (pgvector, RLS, Storage)
- Inngest SDK v4 documentation
- Anthropic API documentation (prompt caching, model routing)
- Drizzle ORM v0.44.x documentation
- tRPC v11 documentation
- Langfuse OSS documentation
- Deepgram Nova-3 documentation (batch mode, word timestamps)
- Hume AI Expression Measurement API deprecation notice (June 14, 2026)
- Dropbox Sign API documentation
- docxtemplater v3 documentation
- LlamaParse documentation
- @react-pdf/renderer v4 documentation
- ExcelJS v4 documentation

### Secondary
- Y Combinator SAFE documentation and templates
- Competing product analysis: Visible.vc, Docsend, Capbase, Clerky, Carta
- Founder community research: YC forums, Twitter/X founder threads, a16z resources
- GDPR/CCPA compliance frameworks for SaaS

### Tertiary
- General SaaS architecture patterns (multi-tenant RLS, event-driven background jobs)
- AI application security research (prompt injection, tenant isolation)
- Securities law context (Regulation D, accreditation, broker-dealer distinctions)

---

*Research completed: 2026-05-11*
*Ready for roadmap: yes*