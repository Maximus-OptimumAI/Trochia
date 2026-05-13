# Requirements: Trochia AI

**Defined:** 2026-05-11
**Core Value:** A founder can run their entire raise from inside one tool whose shared Business Memory + Pipeline Memory spine knows their business and pipeline better than any general AI — that memory + workflow ownership across the whole raise journey is the moat.
**Scope:** Full product — MVP (Weeks 0–10) + V2 (Weeks 11–22) + V3 (Weeks 23–36), built end-to-end before public launch (PRD v2). The MVP slice soft-launches to design partners at ~Week 10. PRD v1 (MVP-only) is the staged-ship fallback.

> **Phase tags:** `[MVP]`, `[V2]`, `[V3]` mark the PRD's target phase for each requirement. All `[MVP]`/`[V2]`/`[V3]` requirements are in scope for this milestone (the roadmapper maps them to phases). `[XC]` = cross-cutting, applies across all phases.

---

## v1 Requirements

Requirements for the full product (this milestone). Each maps to a roadmap phase via Traceability below.

### Foundation & Platform — `FND`

- [x] **FND-01** `[MVP]`: A Next.js 15/16 + TypeScript + Tailwind + shadcn/ui monolith is deployed to Vercel (Fluid Compute), with the public marketing site served from the same repo and a working CI pipeline (lint + typecheck + Vitest + Playwright) on GitHub Actions
- [x] **FND-02** `[MVP]`: Supabase is provisioned (Postgres + pgvector HNSW + Storage); Drizzle ORM manages the schema and migrations; core tables exist — users/accounts, businesses (Business Memory), decks, investors, pipeline entries — using current Supabase publishable/secret keys (not anon/service_role)
- [x] **FND-03** `[MVP]`: Row-Level Security is enabled on every tenant-scoped table with default-deny policies; tRPC procedures run in a tenant-scoped context that enforces the same isolation; a CI check fails any new table that lacks RLS + a policy; a two-user integration test proves tenant A cannot read tenant B's rows
- [x] **FND-04** `[MVP]`: A founder can sign in with Google SSO (Supabase Auth); sessions persist 30 days and refresh on activity; magic-link sign-in and TOTP MFA are added at V2
- [x] **FND-05** `[MVP]`: Stripe billing is live with Pre-Raise ($49/mo, $39/mo annual) and Active Raise ($199/mo, $159/mo annual) tiers, a self-serve Stripe Customer Portal, a 7-day free trial, card-on-file required at signup, and no permanent free tier; webhooks are idempotent with a reconciliation path
- [x] **FND-06** `[MVP]`: An `entitlements()` function gates module/feature access by the founder's current Stripe tier (extensible to the Close Mode and Alumni tiers added at V3)
- [x] **FND-07** `[MVP]`: Resend sends transactional email; Sentry captures errors; Amplitude tracks product events; Langfuse traces every production Anthropic call (cache hit rate, tokens, latency, cost per user) — all wired from Phase 0
- [x] **FND-08** `[MVP]`: The site URL is read everywhere from `process.env.NEXT_PUBLIC_SITE_URL` (and `NEXT_PUBLIC_APP_URL`); it is never hardcoded, so the planned `trochia.asranest.com` → `trochia.ai` migration requires zero code changes
- [x] **FND-09** `[MVP]`: A single `ai/client.ts` chokepoint wraps all Anthropic calls — prompt caching on the stable prefix (corpus + Business Memory + taxonomy + tool schemas), model routing by task class (Opus deep reasoning / Sonnet drafting / Haiku classification), Zod-typed structured outputs, and the OpenAI/Codex fallback behind a config flag; no production code calls Anthropic outside it
- [x] **FND-10** `[MVP]`: A `tenant.region` column + `getDbForRegion()` factory establish the multi-region data-residency seam (US + UK share a US region with UK handled contractually at MVP; an India region exists; an EU region is added at V2) — the seam is built without over-engineering full multi-region machinery
- [x] **FND-11** `[MVP]`: Background jobs run on Inngest via a single `serve()` endpoint — deck parsing, embedding, transcription, brief enrichment, e-sign webhooks, scheduled reminders — with per-key concurrency limits; a `jobs` table + Supabase Realtime gives the UI status polling
- [x] **FND-12** `[MVP]`: The onboarding flow shell works end-to-end: Google sign-in → welcome → Knowledge Pack Import → deck upload → automatic deck review → dashboard with three CTAs ("Generate VC fit list," "Prepare for an upcoming call," "Draft outreach"); target completion under 5 minutes; the funnel is instrumented in Amplitude

### Knowledge Layer & Memory — `KNW`

- [ ] **KNW-01** `[MVP]`: A founder can paste 500–5,000 words of existing AI context (plain text or Markdown — ChatGPT custom instructions, Claude project notes, Notion brief) and get a normalized Business Memory record extracted via Claude Sonnet in under 30 seconds
- [ ] **KNW-02** `[MVP]`: A founder can upload a Knowledge Pack file (ChatGPT Data Export ZIP up to 50MB, Claude Project Markdown export, Notion page export, `.md`/`.txt`) and have it parsed into a Business Memory record in under 60 seconds
- [ ] **KNW-03** `[MVP]`: The extracted Business Memory is shown in a confirmation UI where every field displays its source snippet; the founder can edit, accept, or reject each field; conflicting facts (e.g., two different MRR figures) are both surfaced for the founder to resolve; PII for unrelated parties is flagged and redacted before save; empty/<200-word input prompts for more or falls back to manual entry; non-English input gives a clear English-only error
- [ ] **KNW-04** `[MVP]`: Confirmed Business Memory is the canonical relational record; a curated fundraising corpus (YC Founder Manual, Sam Altman's playbook, Lenny's, Pari Passu, public term-sheet libraries, Charles Hudson on pre-seed, NfX guides) and the Business Memory are embedded into pgvector via an Inngest pipeline (never embed-on-write in the request path); the embedding model version is stored in the schema
- [ ] **KNW-05** `[MVP]`: A persistent Q&A sidebar on every page answers fundraising questions grounded in the curated corpus + Business Memory + Pipeline Memory (pgvector retrieval + Claude Opus synthesis), with a citation in every answer, a median response under 8 seconds, and an explicit "I don't know" rather than fabrication when the answer isn't grounded
- [ ] **KNW-06** `[V2]`: A Chrome + Edge browser extension provides one-click sync of context from Claude Projects, ChatGPT Custom GPTs, and Gemini Gems into Business Memory
- [ ] **KNW-07** `[V3]`: An Alumni-tier founder can generate a 6-section investor update (TL;DR, metrics, wins, asks, lowlights, next-month focus) from Business Memory + a founder-entered/integration-pulled KPI snapshot + prior updates, in under 30 seconds, with every metric cited, tone-matched to prior updates, reviewed by the founder and sent via Gmail with approval
- [ ] **KNW-08** `[MVP]`: Memory-staleness prompts — when Business Memory is >14 days old, or when a module action references stale memory (e.g., the MRR figure in a deck contradicts a 30+ day-old memory entry, or a pre-call brief is generated against memory not updated since the last raise milestone), Trochia surfaces a non-blocking prompt to refresh the relevant fields; the prompt links directly to the affected memory section and can be snoozed per field

### Pitch Lab — `PITCH`

- [ ] **PITCH-01** `[MVP]`: A founder can upload a deck as PDF, PPTX, or a Google Slides URL; it is parsed via LlamaParse (with a `pdf-parse` fallback) into structured slide JSON (slide number, title, body text, image presence)
- [ ] **PITCH-02** `[MVP]`: The Deck Reviewer agent (Claude Opus + structured output over deck + Business Memory + a defect taxonomy) returns issues as `{slide_number, original_text, issue_type, severity, suggested_rewrite, reasoning}`, with issue types factual contradiction / internal contradiction / unsupported claim / vague language / missing context / structural issue; image-only slides are flagged "image content not analyzed"; decks >50 slides warn of 3+ minute latency; non-English decks give an English-only error
- [ ] **PITCH-03** `[MVP]`: The review dashboard lets a founder filter issues by slide and severity and accept / reject / edit each issue; accepted edits build a "reviewed deck" version exportable as an annotated PDF (a clean rewritten PDF is added at V2); no review ever references a slide that doesn't exist; numeric financial figures never appear in debug logs or any training pipeline
- [ ] **PITCH-04** `[MVP]`: An eval harness (Langfuse-hosted, run in CI as a phase exit gate) measures and tracks the deck reviewer's quality: median review under 90 seconds for a 12-slide deck, median 5–15 issues for a typical pre-seed deck, false-positive rate under 25% (tracked and tuned), zero fabricated slide references; CI rejects prompt changes that regress these
- [ ] **PITCH-05** `[V2]`: A founder can record a 30–90s pitch in-browser (native MediaRecorder, auto-stop at 90s); it is transcribed by Deepgram Nova-3; structure is scored by Claude Opus on Hook / Problem / Solution / Why You / Why Now × clarity / specificity / conviction (1–5 each)
- [ ] **PITCH-06** `[V2]`: The pitch scorecard appears within 30s of stopping with an overall score (0–100), the 5 structure dimensions, 4 voice metrics (pace WPM, filler count, energy 1–5, pause discipline 1–5), and 3–5 specific transcript-referencing suggestions; voice metrics are computed deterministically from Deepgram word-level timestamps + a Web Audio offline RMS pass + a custom filler-word detector (no dependency on a third-party emotion/prosody API — see RES-04); filler detection accuracy >90% on native and non-native speakers; an accent is never penalized
- [ ] **PITCH-07** `[V2]`: A founder can record up to 10 takes per pitch (latest is canonical), compare any two takes side-by-side (showing the improvement delta), and export audio + transcript + scorecard as a ZIP; audio is stored in a tenant-isolated encrypted Supabase Storage bucket, defaults to 90-day retention, is deletable any time, and is never used for model training (stated visibly on the record screen); a text-pitch fallback with the same structure rubric (no voice metrics) is available for accessibility
- [ ] **PITCH-08** `[V2]`: A Q&A Drill generates the 10–15 hardest investor questions about the deck (Claude Opus over deck + Business Memory + a curated "hardest questions" corpus), each referencing a specific deck claim or memory gap, in under 20 seconds; the founder practices by recording voice answers and gets per-answer feedback on clarity / specificity / evidence usage / follow-up-trap risk in under 15 seconds per question
- [ ] **PITCH-09** `[MVP]`: Deck-link tracking — a founder can share a deck via a Trochia-generated per-recipient link and see opens, time-per-slide, completion %, and forwards (each forward = a separate tracked session); analytics surface on the Pitch Lab dashboard and inline on the matching Pipeline card; the founder controls link expiration, revocation, and per-recipient access; no PII beyond what the recipient enters is captured; this is the deck-level analog of `DATA-04` (which covers V2 data-room files only)

### Investor Pipeline — `PIPE`

- [ ] **PIPE-01** `[MVP]`: A founder gets a ranked list of ~30 VCs + ~10 accelerators from Business Memory + explicit filters (geography, check size, sector), scored on sector match + stage match + geography match + recent activity + partner-thesis embedding similarity, each with a one-line rationale, in under 15 seconds; the top 10 contain ≥5 funds with both sector and stage match
- [ ] **PIPE-02** `[MVP]`: The MVP investor data source is a curated internal list of ~200 funds + 30+ accelerators (YC, Antler, Techstars, On Deck, AngelPad, 500 Global, SeedCamp, etc.) with stage/sector/geo tags; Harmonic API integration is added at V2 (multi-source investor identity resolution deferred with it)
- [ ] **PIPE-03** `[MVP]`: A founder can mark each match interested / not interested / already met, which feeds Pipeline Memory
- [ ] **PIPE-04** `[MVP]`: An application tracker records per-accelerator status (todo / in_progress / submitted / interview / accepted / rejected), deadline, application URL, questions, and drafted answers; a pre-loaded application bank covers the top 15 accelerators; AI drafts application answers from Business Memory (Claude Sonnet) in under 30 seconds for a 10-question application, citing the Business Memory fields used; Google Calendar reminders fire on deadlines; an auto-reminder fires after 3 weeks of no response
- [ ] **PIPE-05** `[MVP]`: An outreach drafter produces a 4–7 sentence personalized email per investor — enriched with the partner's recent X/LinkedIn posts, recent fund investments, and podcasts/talks (Exa + Firecrawl) — tone-matched to the founder's writing, under 120 words, with a subject line + 2 alternatives, in under 20 seconds, containing at least one specific reference to the partner's recent activity; the founder approves and sends via their own Gmail (no autonomous send)
- [ ] **PIPE-06** `[MVP]`: A warm-intro mapper takes a founder's LinkedIn export (cookie-based access added at V2), cross-references the 1st-degree network against the target investor list, and outputs `{target_investor, intro_path, intro_strength_score, suggested_intro_template}` plus a drafted intro request (<100 words) — completing in under 60 seconds for networks up to 5,000 contacts, with no bulk scraping and no LinkedIn ToS violation
- [ ] **PIPE-07** `[MVP]`: Pipeline bulk actions + CSV — a founder can multi-select rows in the Pipeline kanban/list view to bulk-change stage, bulk-tag, or bulk-delete; export the full pipeline (or any filtered subset) to CSV in Carta/standard-CRM column order; and CSV-import an initial pipeline from an existing spreadsheet with a mapped-column preview before commit
- [ ] **PIPE-08** `[V2]`: Pipeline Gmail sync — bidirectional Gmail integration auto-attaches investor email threads to their Pipeline card, scoped narrowly (only emails the founder has explicitly threaded to an investor, e.g., by labeling or via a "link this thread to <investor>" action) — the Gmail equivalent of `drive.file` scoping; outgoing follow-ups sent via Trochia are automatically threaded to the matching card; founder can unlink any thread
- [ ] **PIPE-09** `[V2]`: Pipeline custom fields — a founder can define their own fields per investor row (e.g., "fund stage focus," "personal connection notes," "last touchpoint quality") with types (text / number / date / single-select / multi-select); custom-field values are exported in CSV (`PIPE-07`) and queryable in pipeline filters

### Live Raise — `LIVE`

- [ ] **LIVE-01** `[MVP]`: A founder can generate a pre-call brief from a calendar event or pipeline entry — a ~40-line dossier `{partner_overview, fund_overview, recent_investments, portfolio_overlap, possible_objections, 3 smart questions, warm_intro_path}` from the investor + Business Memory + current deck + prior interactions + curated/Harmonic data + the partner's recent posts/portfolio/podcast transcripts — in under 30 seconds, exportable as PDF and emailed to the founder, with every cited investment and post carrying a source link and objections referencing specific Business Memory fields
- [ ] **LIVE-02** `[MVP]`: A founder can ingest a meeting transcript by paste or file upload (`.txt`/`.vtt`/`.srt`; Granola/Otter API at V2); it is parsed, aligned with a pipeline entry, stored in Pipeline Memory, and auto-summarized into topics / concerns / commitments / next steps in under 30 seconds, citing specific transcript moments; low-quality transcripts are flagged for founder verification
- [ ] **LIVE-03** `[MVP]`: A founder can generate a post-call follow-up — thank-you + 2–3 sentences referencing specific conversation moments + addressing concerns + a promised deliverable + a concrete next step, 80–150 words, with a subject line + 2 alternatives — in under 20 seconds, referencing ≥2 transcript moments; the founder reviews and sends via their own Gmail (no autonomous send)
- [ ] **LIVE-04** `[MVP]`: Pipeline Memory is a kanban with drag-and-drop across stages (researched / contacted / first_meeting / follow_up / diligence / committed / passed), auto-updating on follow-up sent / transcript ingested / SAFE generated (V3), with a manual stage override always available, loading in under 2 seconds for up to 100 entries, each entry showing its last-interaction summary inline; stage transitions are reversible
- [ ] **LIVE-05** `[MVP]`: The MVP soft launch is achieved: 25 design partners onboarded; Pre-Raise $49 and Active Raise $199 tiers operational; the activation/retention thresholds (e.g., Knowledge Pack Import <5 min for >70%, deck uploaded within 24h for >60%, ≥1 deck issue flagged for >95%) are tracked — this phase is an explicit go/no-go checkpoint before V2 work begins

### Data Room Orchestration — `DATA` `[V2]`

- [ ] **DATA-01** `[V2]`: A founder gets a vertical-aware data-room checklist generated from Business Memory (sector/stage/geography) in under 10 seconds, with distinct document stacks for fintech, SaaS, marketplace, hardware, healthtech, and consumer, plus a cross-vertical baseline (incorporation docs, cap table, financials, deck, team bios, key metrics, customer references, IP-assignment agreements, advisor agreements)
- [ ] **DATA-02** `[V2]`: A founder connects Google Drive via OAuth scoped to `drive.file` only (never `drive`/`drive.readonly`); Trochia creates a "<Company> Data Room" folder with per-category sub-folders, each containing a README explaining what goes there, with "Restricted" default permissions (no public/anyone-with-link), in under 30 seconds; the actual consent screen is verified to request exactly `drive.file`
- [ ] **DATA-03** `[V2]`: A founder can generate a per-investor share link (folder or file scope, with expiry) from the Trochia UI in under 5 seconds, surfaced on the corresponding Pipeline entry; revoking Google Drive access immediately invalidates all share links and notifies the founder
- [ ] **DATA-04** `[V2]`: Per-investor share links capture access events (file viewed, time spent, downloaded yes/no, return visits) with sub-second event capture; a dashboard plus inline-on-pipeline-entry view shows who looked at what for how long, with anomaly flags; Trochia stores only metadata (file IDs, names, events), never file contents; access logs are retained 12 months then purged; a forwarded link is tracked as a separate session and can be revoked
- [ ] **DATA-05** `[V2]`: A founder can upload a DDQ (PDF, `.docx`, or pasted text); Trochia parses the questions and drafts answers from Business Memory + Data Room contents with per-answer accept/reject/edit, and produces a final filled DDQ for download preserving the original formatting; a 30-question DDQ is drafted in under 60 seconds with ≥80% of answers cited from Business Memory or Data Room files; DDQs with scanned tables/images fall back to manual entry for those sections with a clear notice

### Legal Stack Recommender — `LEGAL` `[V2]`

- [ ] **LEGAL-01** `[V2]`: A founder runs a "set up my legal stack" wizard that recommends 2–4 vendors per category (Incorporation, Banking, Cap Table, Legal Counsel, Compliance, Accounting/Bookkeeping, Insurance, IP/Trademark) via a decision tree on (business type × stage × geography × team size) in under 5 seconds, each vendor card showing pros/cons/cost/fit signal and a visible affiliate disclosure; recommendations are vendor selections only — never specific clauses, valuations, or terms; the system never interprets legal documents or names an outcome
- [ ] **LEGAL-02** `[V2]`: The recommender ships with the initial partner set wired (Incorporation: Stripe Atlas/Clerky/Firstbase; Banking: Mercury/Brex/Rho; Cap Table: Pulley/Carta with a hand-off path from the Trochia V3 cap-table; Legal: Cooley GO/WSGR Launch/Gunderson/Orrick Founders + 2–3 boutique fintech/SaaS/healthtech firms; Compliance: Vanta/Drata/Secureframe; Accounting: Pilot/Bench/Kruze; Insurance: Vouch/Embroker; IP/Trademark: Cognation/Goat Trademarks); affiliate referral tracking is integrated with each vendor's partner program for 10+ vendors
- [ ] **LEGAL-03** `[V2]`: A founder gets a compliance checklist per (business type × stage) in under 10 seconds, each item linking to what it is, plain-language consequences of inaction (never a legal opinion), and a recommended vendor or DIY path; founders in unsupported jurisdictions get partial recommendations flagged "consult local counsel"; a founder requesting specific legal advice is shown "Trochia is not a law firm — here are 3 firms we recommend"
- [ ] **LEGAL-04** `[V2]`: A "Not legal advice — consult your lawyer" disclaimer and the affiliate disclosure are visible on every screen of the module
- [ ] **LEGAL-05** `[V2]`: EU data residency goes live for EU founders (Supabase EU region via the Phase-0 region seam); TOTP MFA is added to auth

### Raise Ops — SAFE, Cap Table, F&F, E-Sign — `OPS` `[V3]`

- [ ] **OPS-01** `[V3]`: A founder with a verbal commit can generate a SAFE for that investor from YC standard templates (post-money cap, post-money discount, cap + discount, MFN) + Cooley GO equivalents, with deterministic variable substitution only (company/investor name, amount, valuation cap, discount %, MFN flag, side-letter clauses from a fixed list — each a template, not generated language); model-generated legal language is prohibited; output is a SAFE PDF + the underlying `.docx`; generation completes in under 10 seconds and is 100% deterministic (same inputs → identical output)
- [ ] **OPS-02** `[V3]`: A founder must check an un-bypassable gate ("I will have a lawyer review this SAFE before signing OR I waive that protection") before downloading any generated SAFE; every generated SAFE is versioned with template version, variables, founder identity, and timestamp in an audit trail accessible to and exportable by the founder; the templates undergo a documented quarterly law-firm review with version bumps
- [ ] **OPS-03** `[V3]`: The SAFE variable-substitution engine is implemented as pure, Zod-validated, unit-tested code with no import path to the AI layer (enforced by directory separation + a `no-restricted-imports` lint rule) and passes a Security Engineer audit for injection/escaping before ship
- [ ] **OPS-04** `[V3]`: A founder can track a cap table from F&F through Seed (Founders, Employees/options pool, SAFE holders, Common holders, Preferred holders), adding an entry by selecting type (SAFE / priced round / common / option grant) → entering terms → previewing the impact → confirming; the cap table renders in under 1 second for up to 50 entries and updates in under 500ms after an add; entries are immutable once a snapshot is exported (corrections require a compensating entry); foreign-currency investments convert to USD at the investment date while preserving the original currency
- [ ] **OPS-05** `[V3]`: Cap-table math is deterministic, unit-tested code (never an LLM) covering pre/post-money conversion, SAFE-to-equity conversion at qualifying financing, MFN cascade (lowest cap among MFN-holding SAFEs, with the cascade reasoning shown in the UI), option-pool refresh (as a separate entry), and the dilution waterfall; it matches a 30-scenario spreadsheet oracle 100% (the oracle is written TDD-first); a "what-if" mode previews a hypothetical priced round without committing; warnings fire for option pool <10%, founder dilution >50%, and >30 SAFE holders (suggest graduating to Carta)
- [ ] **OPS-06** `[V3]`: A founder can export the cap table to Excel (Carta/lawyer-format columns: Holder, Type, Date, Amount, Shares/SAFE terms, Pre-Conversion %, Post-Conversion %, Notes) in under 5 seconds, opening cleanly in Excel and Google Sheets, and can one-click hand off to Carta/Pulley with a guided import script for each platform
- [ ] **OPS-07** `[V3]`: An F&F Round Manager tracks F&F conversations as a CRM — entries with `{person_name, relationship, conversation_stage (intro/discussed/committed/wired/SAFE_signed), expected_amount, actual_amount, accreditation_status (founder-attested only — Trochia does NOT verify), notes}` — with auto-progression (e.g., "SAFE signed via Trochia" → SAFE_signed stage), aggregate totals (committed/wired/signed/running round size) updating in real time, 14-day follow-up reminders, pre-fill into the SAFE Generator from an entry, and signed F&F SAFEs auto-appearing in the cap table; the UI loads in under 1 second for up to 30 entries
- [ ] **OPS-08** `[V3]`: The F&F module carries explicit copy on every screen ("Trochia is not an investment vehicle, broker-dealer, or investment adviser. This module is a CRM for tracking your own conversations.") and contains ZERO use of "rolling fund," "fund," "investment vehicle," or "adviser" anywhere in module copy or UI; securities-law context (504/506(b)/506(c) Reg D) is surfaced for founder awareness only, never as advice; a banned-string CI check enforces this
- [ ] **OPS-09** `[V3]`: A founder can send a generated SAFE for signature from Trochia via Dropbox Sign API (DocuSign fallback) — envelope created and sent in under 10 seconds, investor signs signature/date/printed name and the founder counter-signs in the same envelope, the flow works on desktop and mobile (investor side), and the signing is ESIGN Act (US) + eIDAS (EU) compliant with Aadhaar-based e-sign optional (India)
- [ ] **OPS-10** `[V3]`: Every e-sign envelope produces a complete audit trail (timestamps, IPs, identity-verification level) embedded in the final signed PDF; signed SAFEs are stored in Supabase with a founder-accessible audit log and are downloadable to the founder's own Drive/Dropbox; on signature, the cap table reflects the signed SAFE within 30 seconds (via an idempotent webhook → Inngest path) and the investor moves to the "committed" pipeline stage automatically; declines, change requests (regenerate + void), 14/28-day reminders, 60-day expiry, and founder revocation are all handled

### Launch & Tiering — `LAUNCH` `[V3]`

- [ ] **LAUNCH-01** `[V3]`: Close Mode ($399/mo or $999/quarter) and Alumni ($19/mo) tier billing go live; the Alumni tier auto-downgrade prompt fires when Pipeline Memory marks the round closed; the $499 Founder Audit one-time add-on line item is available (first 100 customers)
- [ ] **LAUNCH-02** `[V3]`: All four tiers (Pre-Raise / Active Raise / Close Mode / Alumni) are live at public launch; the launch surfaces (landing page, pricing page, marketing copy) are shipped and pass the banned-string CI check
- [ ] **LAUNCH-03** `[V3]`: SOC 2 Type I prep with Vanta is begun; the $50K MRR target (~300 paid users at ~$170 blended ARPU) and 3 accelerator partnerships are the launch-readiness goals; public launch does not happen until ≥3 founders have closed real rounds while using Trochia

### Cross-Cutting — `XC` `[XC]`

- [x] **XC-01** `[XC]`: No customer data is used for model training — stated in the product UI, ToS, and DPA, and enforced contractually with API providers (Anthropic confirmed no-training/7-day retention; the OpenAI/Codex fallback and Claude-Code build tooling are explicitly covered in a vendor data-flow inventory)
- [x] **XC-02** `[XC]`: All external actions (email sends, intro requests, signature requests, payments) require explicit founder approval — there is no autonomous outreach at any phase
- [ ] **XC-03** `[XC]`: Sensitive fields (cap-table data, audio) are encrypted at rest beyond Supabase's native encryption (dedicated keys); financial figures never appear in logs or training pipelines; a logging-scrub discipline + CI lint enforce this
- [x] **XC-04** `[XC]`: A founder can export all their data on demand; account deletion triggers a 30-day soft delete then permanent purge; a GDPR/UK-GDPR/DPDP-grade DPA is signed automatically at signup (clickwrap) with data-subject-rights plumbing in place (UK and India founders are onboarded from MVP)
- [x] **XC-05** `[XC]`: The compliance-language guardrails hold everywhere: never "rolling fund"; never "investment advice"; never "legal advice" without "not"/"this is not" prefixed; Legal Stack carries its disclaimer on every screen; SAFE generation has its un-bypassable lawyer-review gate; F&F carries its not-an-adviser copy; e-sign is ESIGN/eIDAS-compliant only — a banned-string CI check runs from Phase 0
- [x] **XC-06** `[XC]`: Prompt caching is active on every production Anthropic call from day 1 (the `claude-api` skill mandates it); cache hit rate is instrumented in Langfuse, not assumed
- [x] **XC-07** `[XC]`: Uploaded content (decks, transcripts, pasted knowledge packs) is treated as untrusted input — delimited, screened for prompt-injection payloads, and the model's output is validated against the expected schema before use; RAG answers cite real sources and never invent them
- [ ] **XC-08** `[MVP]`: Unified raise timeline — a single chronological view across all modules showing every raise event (deck reviewed, investor added, application submitted, call held, transcript ingested, follow-up sent, SAFE generated/signed, cap-table update, etc.), filterable by module and investor, with each event linking back to its source surface; this anchors the "one operator" feel from day one and is the cross-module read-side of the memory spine
- [ ] **XC-09** `[V2]`: Cross-module fact-conflict surfacing — when the same fact appears differently across modules (e.g., the deck says MRR is X, Business Memory says Y, an investor-call transcript references Z), Trochia detects the conflict and surfaces it to the founder for resolution with a "which is correct?" UI that updates the source of truth in Business Memory and (with founder approval) flags the affected downstream surfaces (current deck slide, in-flight outreach drafts, queued pre-call briefs)

### Research-recommended additions — Resolved ✓

All research-recommended additions have been integrated into the requirements above with explicit IDs and phase tags:

| Research recommendation | Integrated as | Phase |
|---|---|---|
| RES-01 deck-link tracking | `PITCH-09` | `[MVP]` |
| RES-02a pipeline bulk actions + CSV | `PIPE-07` | `[MVP]` |
| RES-02b pipeline Gmail sync | `PIPE-08` | `[V2]` |
| RES-02c pipeline custom fields | `PIPE-09` | `[V2]` |
| RES-03a unified raise timeline | `XC-08` | `[MVP]` |
| RES-03b memory-staleness prompts | `KNW-08` | `[MVP]` |
| RES-03c cross-module fact-conflict surfacing | `XC-09` | `[V2]` |
| RES-04 deterministic voice metrics | folded into `PITCH-06` | `[V2]` |

---

## v2 Requirements

Deferred beyond this milestone (post-V3). Tracked, not in the current roadmap.

### Future modules — `FUT`

- **FUT-01**: Mobile app — V4 at earliest, possibly never (founders raise from laptops)
- **FUT-02**: Investor-side product — warm-intro routing, portfolio-readiness scoring, scouting tools for VCs (V4+)
- **FUT-03**: Post-raise KPI reporting / dashboards beyond the Alumni investor-update generator (V4+, decide based on V3 traction)
- **FUT-04**: Granola/Otter native API integration for transcript ingestion — promote to MVP only if those APIs prove stable (current default: paste / `.txt`/`.vtt`/`.srt` upload at MVP, API at V2)
- **FUT-05**: Cookie-based LinkedIn access for the warm-intro mapper — only if the founder-account-ban risk is judged acceptable; the founder-export path may be the permanent answer (revisit at the V2 era)
- **FUT-06**: Multi-source investor identity resolution (Harmonic + LinkedIn + Crunchbase) — lands with the Harmonic API integration at V2

---

## Out of Scope

Explicitly excluded. Documented to prevent scope creep. (See PROJECT.md "Out of Scope" for the full list with reasoning.)

| Feature | Reason |
|---------|--------|
| "Rolling fund" terminology anywhere in product/UI/marketing | Regulated SEC term (AngelList's 506(c) Advisers Act vehicle) — permanent regulatory landmine |
| AI as the primary speaker on a call / pitching in the founder's or its own voice | Buyers reject the category outright; liability surface |
| Autonomous external action (sending, posting, booking, signing, paying) without founder approval — even at V3 | Founder-approved external action only |
| Avatar / "name your AI" persona UX | Cosmetic; doesn't move retention |
| Legal advice of any kind (specific clauses, valuations, terms, document interpretation, outcome statements) | UPL exposure — Trochia is templates + vendor recommendations only, always with a lawyer disclaimer |
| Investment advice (recommending whether to take a deal) | Out of scope by design |
| Cap-table system of record | Trochia is "pre-Carta"; hands off to Carta/Pulley at graduation |
| Cap-table math or SAFE legal language generated by an LLM | All dilution/conversion/MFN-cascade math and SAFE substitution is deterministic, unit-tested code |
| Multi-vertical positioning (creators, designers, marketers, generic "AI for everyone") | Narrow founder-fundraise only; broad ICP = no ICP |
| Crypto/web3 token-raise founders | Regulatory complexity we don't take on |
| Bulk scraping of LinkedIn or investor sites | Use Harmonic/Crunchbase APIs + founder-supplied exports/cookies, within ToS |
| Permanent free tier | 7-day trial only; free dilutes the buyer pool |
| Enterprise pricing customization at MVP | Flat $20K/year for 25 portfolio seats if asked; no customization |
| A deck *generator* (vs. reviewer); AI-fluffed/amplified metrics in the reviewer; async video-pitch recorder; in-app investor-messaging relay; OpenVC-style inbound investor marketplace | Research-added rejections — out of category or invite the wrong incentives |
| Generic browser-controlling operator agent; GitHub-repo skill absorption; autonomous overnight research briefings | Anthropic Computer Use / OpenAI Operator will eat the first; the others aren't why founders pay |
| Mem0/Letta, Pinecone/Weaviate, Algolia, v0/Lovable, Composio, Auth0, Datadog, Salesforce/HubSpot, Twilio, Mixpanel, Vercel Postgres/KV | Covered by owned Postgres memory schema, pgvector, Supabase Auth, Sentry+Amplitude+Langfuse, the `magic`/`stitch` MCPs, native MCP servers + `googleapis`, Airtable+Linear, TOTP MFA (no SMS) |
| Permanent dependency on a third-party emotion/prosody API for voice metrics | Hume's Expression Measurement API is sunsetting (~June 2026); voice metrics are computed deterministically instead |

---

## Traceability

Which phases cover which requirements. Roadmap: `.planning/ROADMAP.md` (11 phases, created 2026-05-11).

| Requirement | Phase | Status |
|-------------|-------|--------|
| FND-01 | Phase 1 — Foundation | Complete |
| FND-02 | Phase 1 — Foundation | Complete |
| FND-03 | Phase 1 — Foundation | Complete |
| FND-04 | Phase 1 — Foundation | Complete |
| FND-05 | Phase 1 — Foundation | Complete |
| FND-06 | Phase 1 — Foundation | Complete |
| FND-07 | Phase 1 — Foundation | Complete |
| FND-08 | Phase 1 — Foundation | Complete |
| FND-09 | Phase 1 — Foundation | Complete |
| FND-10 | Phase 1 — Foundation | Complete |
| FND-11 | Phase 1 — Foundation | Complete |
| FND-12 | Phase 1 — Foundation | Complete |
| XC-01 | Phase 1 — Foundation (enforced all phases) | Complete |
| XC-02 | Phase 1 — Foundation (enforced all phases) | Complete |
| XC-03 | Phase 1 — Foundation (enforced all phases) | Pending |
| XC-04 | Phase 1 — Foundation (enforced all phases) | Complete |
| XC-05 | Phase 1 — Foundation (enforced all phases) | Complete |
| XC-06 | Phase 1 — Foundation (enforced all phases) | Complete |
| XC-07 | Phase 1 — Foundation (enforced all phases) | Complete |
| KNW-01 | Phase 2 — Knowledge Layer + Memory | Pending |
| KNW-02 | Phase 2 — Knowledge Layer + Memory | Pending |
| KNW-03 | Phase 2 — Knowledge Layer + Memory | Pending |
| KNW-04 | Phase 2 — Knowledge Layer + Memory | Pending |
| KNW-05 | Phase 2 — Knowledge Layer + Memory | Pending |
| KNW-08 | Phase 2 — Knowledge Layer + Memory | Pending |
| XC-08 | Phase 2 — Knowledge Layer + Memory | Pending |
| PITCH-01 | Phase 3 — Pitch Lab Deck Reviewer | Pending |
| PITCH-02 | Phase 3 — Pitch Lab Deck Reviewer | Pending |
| PITCH-03 | Phase 3 — Pitch Lab Deck Reviewer | Pending |
| PITCH-04 | Phase 3 — Pitch Lab Deck Reviewer | Pending |
| PITCH-09 | Phase 3 — Pitch Lab Deck Reviewer | Pending |
| PIPE-01 | Phase 4 — Investor Pipeline | Pending |
| PIPE-02 | Phase 4 — Investor Pipeline | Pending |
| PIPE-03 | Phase 4 — Investor Pipeline | Pending |
| PIPE-04 | Phase 4 — Investor Pipeline | Pending |
| PIPE-05 | Phase 4 — Investor Pipeline | Pending |
| PIPE-06 | Phase 4 — Investor Pipeline | Pending |
| PIPE-07 | Phase 4 — Investor Pipeline | Pending |
| LIVE-01 | Phase 5 — Live Raise (soft-launch checkpoint) | Pending |
| LIVE-02 | Phase 5 — Live Raise (soft-launch checkpoint) | Pending |
| LIVE-03 | Phase 5 — Live Raise (soft-launch checkpoint) | Pending |
| LIVE-04 | Phase 5 — Live Raise (soft-launch checkpoint) | Pending |
| LIVE-05 | Phase 5 — Live Raise (soft-launch checkpoint) | Pending |
| PITCH-05 | Phase 6 — Voice Pitch Coach + Q&A Drill + Browser Ext | Pending |
| PITCH-06 | Phase 6 — Voice Pitch Coach + Q&A Drill + Browser Ext | Pending |
| PITCH-07 | Phase 6 — Voice Pitch Coach + Q&A Drill + Browser Ext | Pending |
| PITCH-08 | Phase 6 — Voice Pitch Coach + Q&A Drill + Browser Ext | Pending |
| KNW-06 | Phase 6 — Voice Pitch Coach + Q&A Drill + Browser Ext | Pending |
| DATA-01 | Phase 7 — Data Room Orchestration | Pending |
| DATA-02 | Phase 7 — Data Room Orchestration | Pending |
| DATA-03 | Phase 7 — Data Room Orchestration | Pending |
| DATA-04 | Phase 7 — Data Room Orchestration | Pending |
| DATA-05 | Phase 7 — Data Room Orchestration | Pending |
| PIPE-08 | Phase 7 — Data Room Orchestration | Pending |
| PIPE-09 | Phase 7 — Data Room Orchestration | Pending |
| XC-09 | Phase 7 — Data Room Orchestration | Pending |
| LEGAL-01 | Phase 8 — Legal Stack + EU Residency | Pending |
| LEGAL-02 | Phase 8 — Legal Stack + EU Residency | Pending |
| LEGAL-03 | Phase 8 — Legal Stack + EU Residency | Pending |
| LEGAL-04 | Phase 8 — Legal Stack + EU Residency | Pending |
| LEGAL-05 | Phase 8 — Legal Stack + EU Residency | Pending |
| OPS-01 | Phase 9 — Raise Ops Core (SAFE + Cap Table) | Pending |
| OPS-02 | Phase 9 — Raise Ops Core (SAFE + Cap Table) | Pending |
| OPS-03 | Phase 9 — Raise Ops Core (SAFE + Cap Table) | Pending |
| OPS-04 | Phase 9 — Raise Ops Core (SAFE + Cap Table) | Pending |
| OPS-05 | Phase 9 — Raise Ops Core (SAFE + Cap Table) | Pending |
| OPS-06 | Phase 9 — Raise Ops Core (SAFE + Cap Table) | Pending |
| OPS-07 | Phase 10 — F&F Round Manager + E-Sign | Pending |
| OPS-08 | Phase 10 — F&F Round Manager + E-Sign | Pending |
| OPS-09 | Phase 10 — F&F Round Manager + E-Sign | Pending |
| OPS-10 | Phase 10 — F&F Round Manager + E-Sign | Pending |
| KNW-07 | Phase 11 — Polish + Close Mode + Alumni + Launch | Pending |
| LAUNCH-01 | Phase 11 — Polish + Close Mode + Alumni + Launch | Pending |
| LAUNCH-02 | Phase 11 — Polish + Close Mode + Alumni + Launch | Pending |
| LAUNCH-03 | Phase 11 — Polish + Close Mode + Alumni + Launch | Pending |

**Coverage:**
- v1 requirements: 75 total (FND ×12, KNW ×8, PITCH ×9, PIPE ×9, LIVE ×5, DATA ×5, LEGAL ×5, OPS ×10, LAUNCH ×3, XC ×9) — all RES additions integrated
- Phase split: `[MVP]` ×36, `[V2]` ×18, `[V3]` ×14 (incl. 3 LAUNCH), `[XC]` cross-cutting ×7
- Mapped to phases: 75 / 75 ✓
- Unmapped: 0 ✓
- Per-phase counts: P1 ×19 · P2 ×7 · P3 ×5 · P4 ×7 · P5 ×5 · P6 ×5 · P7 ×8 · P8 ×5 · P9 ×6 · P10 ×4 · P11 ×4 (sum = 75)
- `[XC]` requirements (XC-01..07) are assigned to Phase 1 as the place they are *established*; they are enforced across all subsequent phases (see ROADMAP.md "Cross-Cutting Enforcement").

---
*Requirements defined: 2026-05-11*
*Last updated: 2026-05-11 — traceability populated by the roadmapper (ROADMAP.md created, 11 phases, 75/75 mapped)*
