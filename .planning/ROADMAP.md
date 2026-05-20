# Roadmap: Trochia AI

## Overview

Trochia AI is an agentic Founder Operating System for raising capital — one Next.js monolith, seven modules, one shared Business Memory + Pipeline Memory spine. This roadmap builds it end-to-end across 11 phases following the PRD v2 §13 / Build Stack v2 sequence: a hardened Foundation (RLS, billing, AI chokepoint, compliance CI, multi-region seam) → the memory spine + grounded Q&A → the Deck Reviewer (with a measured eval gate) → Investor Pipeline → the Live Raise loop (which doubles as the **MVP soft-launch go/no-go checkpoint** with 25 paying design partners) → V2 Voice Pitch Coach + Q&A Drill + browser extension → V2 Data Room → V2 Legal Stack + EU residency → V3 Raise Ops core (deterministic SAFE engine + cap table) → V3 F&F Round Manager + E-Sign → V3 Polish + Close Mode + Alumni + Public Launch (gated on ≥3 founders closing real rounds on Trochia). Deterministic-vs-LLM firewall, RLS-from-day-0, memory-spine-as-system-of-record / pgvector-as-derived-index, and the compliance-language guardrails are enforced across every phase, not bolted on.

**Pacing caveat:** The PRD's 36-week timeline assumes a dedicated operator co-founder. Solo-Martins is the Conservative track (+~6 months) — time-box phases accordingly. **Critical-path non-engineering item: the law-firm SAFE-template-review partner must be locked before Phase 9 starts.**

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

- [ ] **Phase 1: Foundation** - Deployed monolith with RLS-from-day-0, Stripe billing, AI chokepoint, compliance/privacy CI, observability, and the multi-region seam
- [ ] **Phase 2: Knowledge Layer + Memory** - Business Memory extraction/confirmation, curated corpus embeddings, grounded+cited ambient Q&A, unified raise timeline — the moat, validated on design-partner data
- [ ] **Phase 3: Pitch Lab — Deck Reviewer** - Deck parsing + Claude Opus reviewer with a Langfuse-hosted eval harness gating false-positive rate and zero fabricated slide refs
- [ ] **Phase 4: Investor Pipeline** - VC/accelerator match, application tracker, outreach drafter, warm-intro mapper, bulk actions + CSV
- [ ] **Phase 4.5: Admin Dashboard + Security Hardening + Observability — INSERTED** - Super-admin dashboard with tenant directory + AI cost view + support actions; security hardening above Phase 1 baseline (rate limiting, per-tenant token caps, admin MFA, security headers, session policy, secret rotation drill, backup-restore drill); observability layer turning Sentry/Langfuse/Amplitude silos into one agent-searchable `platform_events` log + trust-preserving error UX. **Mandatory gate before Phase 5 design partners reach prod.**
- [ ] **Phase 5: Live Raise (MVP soft-launch checkpoint)** - Pre-call briefs, transcript ingestion, follow-up drafter, Pipeline Memory kanban — go/no-go gate: 25 design partners onboarded & paying, activation thresholds met
- [ ] **Phase 6: Voice Pitch Coach + Q&A Drill + Browser Extension** - In-browser pitch capture, deterministic voice metrics + Opus structure scoring, Q&A Drill, Chrome/Edge Knowledge Pack sync
- [ ] **Phase 7: Data Room Orchestration** - Vertical-aware checklist, Drive `drive.file`-scoped orchestration, access analytics, DDQ filler, Gmail pipeline sync, cross-module fact-conflict surfacing
- [ ] **Phase 8: Legal Stack Recommender + EU Residency** - Vendor decision-tree wizard, compliance checklist, affiliate tracking, EU data residency live, TOTP MFA, pipeline custom fields
- [ ] **Phase 9: Raise Ops Core — SAFE + Cap Table** - Deterministic SAFE generator (security-audited), deterministic cap-table engine matching a 30-scenario oracle, Excel/Carta hand-off
- [ ] **Phase 10: F&F Round Manager + E-Sign** - F&F CRM (not-an-adviser copy, compliance-audited), Dropbox Sign/DocuSign e-sign, idempotent cap-table writeback within 30s
- [ ] **Phase 11: Polish + Close Mode + Alumni + Public Launch** - Investor Update Generator, all four tiers live, SOC 2 Type I prep begun, public launch gated on ≥3 real closed rounds

## Phase Details

### Phase 1: Foundation
**Goal**: A production-grade Next.js monolith is live on Vercel with tenant isolation, billing, the AI chokepoint, compliance/privacy plumbing, observability, and the multi-region seam — every cross-cutting constraint is established and CI-enforced here.
**Mode:** mvp
**Depends on**: Nothing (first phase)
**Requirements**: FND-01, FND-02, FND-03, FND-04, FND-05, FND-06, FND-07, FND-08, FND-09, FND-10, FND-11, FND-12, XC-01, XC-02, XC-03, XC-04, XC-05, XC-06, XC-07
**Success Criteria** (what must be TRUE):
  1. The marketing site + app deploy from one repo to Vercel; CI (lint + typecheck + Vitest + Playwright) is green; the Next.js 16.x-vs-15-pinned decision is made and recorded
  2. RLS default-deny is on every tenant-scoped table, a CI check fails any new table lacking RLS + a policy, and a two-user integration test proves tenant A cannot read tenant B's rows
  3. A founder can sign in with Google SSO (30-day sessions), Stripe billing is live (Pre-Raise $49 / Active Raise $199, Customer Portal, 7-day trial, card-on-file, idempotent webhooks), `entitlements()` gates features by tier, and the <5-min onboarding shell runs end-to-end instrumented in Amplitude
  4. All Anthropic calls go through `ai/client.ts` with prompt caching verified in Langfuse, model routing, Zod-typed outputs, and the OpenAI fallback flag; no production code calls Anthropic outside it
  5. The banned-string CI check runs (compliance-language guardrails), the GDPR/UK-GDPR/DPDP-grade clickwrap DPA + data-subject-rights/export/delete plumbing works, the vendor data-flow inventory + logging-scrub lint exist, the `tenant.region` seam + `getDbForRegion()` factory exist (US/UK/India), and Inngest background jobs run via a single `serve()` endpoint
**Plans**: 9 plans (+ SKELETON.md — Walking Skeleton)
  - [x] 01-01-PLAN.md — Scaffold Next.js 16.x + env contract + lib helpers + ESLint ruleset (import boundaries / no-hardcoded-URL / no-raw-console) + banned-string CI check + test infra (Vitest/Playwright/MSW) + GitHub Actions CI [FND-01, FND-08, XC-03, XC-05]
  - [x] 01-02-PLAN.md — Design system: shadcn init + Tailwind v4 brand tokens + fonts + 14 themed components + cross-cutting primitives (founder-approval Dialog, destructive-confirm Dialog, legal banner, empty/error/skeleton, app shell, marketing top bar, footer) + `/styleguide` (19 sections — exit gate) [FND-01, XC-02]
  - [x] 01-03-PLAN.md — Supabase provision + Phase-1 Drizzle schema (users/accounts/sessions/subscriptions/jobs/legal_acceptances) + RLS default-deny + tenant-scoped tRPC context + `getDbForRegion()` seam + RLS schema-scan & two-user isolation tests + `db:push` [FND-02, FND-03, FND-10] *(autonomous: false — Supabase provisioning + drizzle-kit push)*
  - [x] 01-04-PLAN.md — `ai/client.ts` chokepoint (prompt caching / model routing / Zod outputs / OpenAI fallback flag / untrusted-input pattern / Haiku health-check) + Inngest single `serve()` endpoint + jobs functions (health-check, reconcile-stripe stub, purge-soft-deleted, stubs) [FND-09, FND-11, XC-06, XC-07, XC-01]
  - [x] 01-05-PLAN.md — Observability: Sentry (PII scrub) + Amplitude (browser+node, onboarding-funnel taxonomy) + Langfuse (consumed by ai/client.ts) + Resend (typed react-email templates, system-mail-only) [FND-07, XC-06] *(autonomous: false — account provisioning)*
  - [x] 01-06-PLAN.md — Compliance plumbing: vendor data-flow inventory (docs/vendor-data-flow.md) + clickwrap DPA + downloadable PDF + data-subject-rights (export → Storage → signed URL → email; account soft-delete; restore-within-30d) + tRPC procedures [XC-01, XC-04]
  - [x] 01-07-PLAN.md — **Walking Skeleton:** Supabase Auth Google SSO + proxy.ts /app gate + Stripe billing (2 tiers, Customer Portal, 7-day trial, card-on-file, idempotent webhook + reconcile cron) + `entitlements()` (replaces the Plan-03 stub) + sign-up/sign-in/welcome/tier-picker/Checkout + /app shows tier + /reactivate + Vercel deploy + SKELETON.md [FND-04, FND-05, FND-06, FND-12] *(autonomous: false — Google OAuth config, Stripe dashboard setup, session-timer config, deploy confirmation)*
  - [x] 01-08-PLAN.md — Marketing site: homepage (8 sections, left-aligned hero + animated raise timeline, Lighthouse>90 gate) + /pricing (all 4 tiers, Active Raise featured, Close Mode/Alumni V3 badge no-CTA, monthly/annual Tabs, feature matrix, 8-Q FAQ) + /manifesto (1500–2000 words) + /legal/{privacy,terms,security,dpa} [FND-01, FND-08, XC-05]
  - [x] 01-09-PLAN.md — Onboarding stepper (Import/Deck/Review shells + funnel instrumentation + accounts.onboarding_* schema [BLOCKING: db:push]) + /app dashboard (empty state + 3 FND-12 CTA cards) + module placeholders + /app/settings (delete account + export data) + /app/billing (Customer Portal + cancel) + /styleguide session-gate [FND-12, XC-02, XC-04] *(autonomous: false — drizzle-kit push)*

### Phase 2: Knowledge Layer + Memory
**Goal**: The Business Memory + Pipeline Memory spine works — founders convert their existing ChatGPT/Claude context into a confirmed Business Memory in minutes, a grounded+cited ambient Q&A answers from the curated corpus + memory, and a unified raise timeline anchors the "one operator" feel. This phase carries the explicit "is the moat real?" gate on design partners' own data.
**Mode:** mvp
**Depends on**: Phase 1
**Requirements**: KNW-01, KNW-02, KNW-03, KNW-04, KNW-05, KNW-08, XC-08
**Success Criteria** (what must be TRUE):
  1. A design-partner founder pastes their existing ChatGPT/Claude context (or uploads a ChatGPT export ZIP / Claude Project / Notion export) and confirms a normalized Business Memory in <5 min, with per-field source snippets, conflict resolution, and PII redaction for unrelated parties
  2. Confirmed Business Memory is the canonical relational record; the curated fundraising corpus + Business Memory are embedded into pgvector via an Inngest pipeline (never embed-on-write), with the embedding model version stored in the schema
  3. The ambient Q&A sidebar on every page answers grounded in corpus + Business Memory + Pipeline Memory (pgvector retrieval + Opus synthesis), cites a real source in every answer, responds in median <8s, and says "I don't know" rather than fabricating
  4. Memory-staleness prompts surface non-blocking refresh nudges when Business Memory is >14 days old or a module references stale memory, linking to the affected section, snoozable per field
  5. The unified raise timeline shows every raise event chronologically across modules, filterable by module and investor, each event linking back to its source surface; the cross-cutting AI patterns (prompt caching verified, model tiering, Zod-validated structured outputs, eval-conformance scaffold, per-user cost monitoring) are in place
**Plans**: 11 plans (per `phases/02-knowledge-layer/02-PLAN.md` master)
Plans:
- [x] 02-01-PLAN.md — Schema spine (business_memory + pipeline_entry + interaction + timeline_event + embeddings; RLS + two-user isolation)
- [x] 02-02-PLAN.md — Paste extractor (Sonnet 4.6 + Zod) + confirmation UI shell
- [ ] 02-03-PLAN.md — Conflict resolver + PII redaction + prompt-injection sanitizer (this plan)
- [ ] 02-04-PLAN.md — Embed pipeline (pgvector HNSW + Inngest + Voyage) + curated corpus loader
- [ ] 02-05-PLAN.md — Eval harness scaffold (Langfuse + CI workflow)
- [ ] 02-06-PLAN.md — RAG retrieve service + prompt-caching wiring
- [ ] 02-07-PLAN.md — Q&A sidebar (Opus 4.7 + streamed citations) + per-user cost tracking
- [ ] 02-08-PLAN.md — File upload Tier 2 (ChatGPT ZIP / Claude / Notion) + Inngest parser
- [ ] 02-09-PLAN.md — Staleness prompts (>14d, snoozable 7/30/never)
- [ ] 02-10-PLAN.md — Unified raise timeline UI
- [ ] 02-11-PLAN.md — Design partner gate (8-criteria exit + Lesson 12)

### Phase 3: Pitch Lab — Deck Reviewer
**Goal**: A founder uploads a deck and gets a grounded, structurally-validated review with zero fabricated slide references — backed by a Langfuse-hosted eval harness that runs in CI as a phase exit gate. "Ship the reviewer, evaluate later" is never acceptable.
**Mode:** mvp
**Depends on**: Phase 2
**Requirements**: PITCH-01, PITCH-02, PITCH-03, PITCH-04, PITCH-09
**Success Criteria** (what must be TRUE):
  1. A founder uploads a deck (PDF, PPTX, Google Slides URL) and it is parsed via LlamaParse (with `pdf-parse` fallback) into structured slide JSON; image-only slides are flagged, >50-slide decks warn of latency, non-English decks give an English-only error
  2. The Deck Reviewer agent returns `{slide_number, original_text, issue_type, severity, suggested_rewrite, reasoning}` across the 6 issue types; structural validation drops any issue whose quote isn't a verbatim substring of a real slide; no review ever references a slide that doesn't exist
  3. The review dashboard supports slide/severity filters and per-issue accept/reject/edit building a "reviewed deck" exportable as annotated PDF; numeric financial figures never appear in logs or any training pipeline
  4. The Langfuse-hosted eval harness runs in CI and reports a measured false-positive rate (<25%, trending down), median review <90s for a 12-slide deck, median 5–15 issues for a typical pre-seed deck, zero fabricated slide refs; CI rejects prompt changes that regress these
  5. A founder can share a deck via a Trochia per-recipient link and see opens, time-per-slide, completion %, and forwards (each forward a separate session), surfaced on the Pitch Lab dashboard and inline on the matching Pipeline card, with founder-controlled expiry/revocation
**Plans**: TBD
**UI hint**: yes

### Phase 4: Investor Pipeline
**Goal**: A founder goes from Business Memory to a ranked, actionable investor pipeline — matched VCs/accelerators, an application tracker, personalized outreach drafts, and a warm-intro map — all founder-approved, no autonomous sends.
**Mode:** mvp
**Depends on**: Phase 2 (Business Memory)
**Requirements**: PIPE-01, PIPE-02, PIPE-03, PIPE-04, PIPE-05, PIPE-06, PIPE-07
**Success Criteria** (what must be TRUE):
  1. A founder gets a ranked ~30 VCs + ~10 accelerators list from Business Memory + geography/check-size/sector filters in <15s, scored on sector/stage/geo + recent activity + partner-thesis embedding similarity with a one-line rationale each; the top 10 contain ≥5 funds matching both sector and stage
  2. The application tracker records per-accelerator status/deadline/URL/questions/answers, ships a pre-loaded application bank for the top 15 accelerators, AI-drafts answers from Business Memory (Sonnet) in <30s citing the fields used, fires Google Calendar reminders, and auto-reminds after 3 weeks
  3. The outreach drafter produces a 4–7 sentence (<120 word) personalized email per investor enriched with the partner's recent X/LinkedIn posts + fund investments + podcasts (Exa + Firecrawl), tone-matched, with subject + 2 alternatives, in <20s — the founder approves and sends via their own Gmail
  4. The warm-intro mapper cross-references a founder's LinkedIn export against the target list and outputs `{target_investor, intro_path, intro_strength_score, suggested_intro_template}` + a drafted intro request in <60s for networks up to 5,000 contacts, with no bulk scraping
  5. A founder can multi-select pipeline rows to bulk-change stage/tag/delete, export the pipeline (or a filtered subset) to CSV in Carta/CRM column order, and CSV-import an initial pipeline with a mapped-column preview before commit
**Plans**: TBD
**UI hint**: yes

### Phase 4.5: Admin Dashboard + Security Hardening + Observability — INSERTED
**Goal**: Before exposing the product to 25 paying design partners in Phase 5, every operational surface a solo founder needs to safely run prod is built and verified — a super-admin dashboard with tenant directory + AI cost view + support actions, security hardening above Phase 1's baseline (rate limiting, per-tenant token caps, MFA for admins, security headers, session policy, backup-restore drill), and an observability layer that turns Sentry/Langfuse/Amplitude silos into one agent-searchable event log so Claude Code / Codex can debug from real history. **No design partner traffic reaches prod until Phase 4.5 ships.**
**Mode:** mvp
**Depends on**: Phase 4 (Investor Pipeline complete — admin dashboard needs real tenants/data to be meaningful)
**Requirements**: ADM-01, ADM-02, ADM-03, ADM-04, ADM-05, ADM-06, ADM-07, ADM-08, SEC-01, SEC-02, SEC-03, SEC-04, SEC-05, SEC-06, SEC-07, OBS-01, OBS-02, OBS-03, OBS-04, OBS-05, OBS-06
**Success Criteria** (what must be TRUE):
  1. A super-admin (MFA-enforced via `SUPER_ADMIN_USER_IDS` env-var list) lands on `/admin`, sees the full tenant directory, drills into any tenant, views their MTD AI cost / token usage against their tier cap / last 50 platform events / Sentry issues / Langfuse traces / Stripe state — all from one surface in <3 clicks, with a persistent "you are acting as admin" banner
  2. Rate limiting is live on Opus / auth / outreach routes via `@upstash/ratelimit` tRPC middleware (10 req/min per user on Opus-backed routes; 5/min on outreach drafter; 100/15-min on auth) and per-tenant monthly AI token caps fire 50%/80%/100% alerts with tier-aware soft-suspend at 100% (Pre-Raise 100K in / 50K out, Active Raise 1M / 500K, Close Mode 5M / 2.5M, Alumni 50K / 25K); one runaway-cost test on a sandbox tenant proves the cap holds
  3. Every meaningful platform action (tenant signup, deck upload, brief generated, follow-up sent, billing event, error, admin action) writes a typed row to `platform_events`; a super-admin can query the last 30 days by tenant/event-type/time-range; an admin-only `/api/admin/events/search` endpoint returns scoped results so Claude Code / Codex agents can pull real history into debug sessions
  4. Every user-facing error path returns a copy-reviewed, trust-preserving message via the `TrochiaError` → message mapping — zero bare 500/400/"Internal Server Error" surfaces in the product even when Anthropic/Stripe/Supabase/Inngest fail; Sentry still receives the full technical trace; a bug spotter fires Slack DMs on new error classes + error-rate spikes (>2σ over 1h baseline) + p95 latency regressions on top-10 routes
  5. Security baseline is verified: CSP/HSTS/X-Frame-Options/Referrer-Policy/Permissions-Policy headers active and enforced (CSP started in report-only mode for 1 week then enforced); idle timeout (24h access / 7d refresh, down from 30d) + refresh-token rotation + sign-out-on-password-change + sign-out-on-tenant-suspension live; TOTP MFA enforced for super-admins; secret rotation runbook exists at `docs/runbooks/secret-rotation.md` and one full rotation drill is recorded; one Supabase PITR restore-to-staging drill is recorded with RTO/RPO documented; off-platform uptime monitoring is live with page-to-founder-phone
**Plans**: TBD
**UI hint**: yes

### Phase 5: Live Raise (MVP soft-launch checkpoint)
**Goal**: The live-raise loop works end-to-end — pre-call briefs, transcript ingestion, post-call follow-ups, and a Pipeline Memory kanban that auto-updates — and the MVP soft-launches to 25 paying design partners. **This phase is an explicit go/no-go checkpoint before any V2 work begins.**
**Mode:** mvp
**Depends on**: Phase 4
**Requirements**: LIVE-01, LIVE-02, LIVE-03, LIVE-04, LIVE-05
**Success Criteria** (what must be TRUE):
  1. A founder generates a ~40-line pre-call brief from a calendar event or pipeline entry in <30s — `{partner_overview, fund_overview, recent_investments, portfolio_overlap, possible_objections, 3 smart questions, warm_intro_path}` from investor + Business Memory + deck + prior interactions + curated/Harmonic data + partner's recent posts/portfolio/podcasts — exportable as PDF, every cited item source-linked, objections referencing specific Business Memory fields
  2. A founder ingests a transcript by paste or `.txt`/`.vtt`/`.srt` upload; it's parsed, aligned with a pipeline entry, stored in Pipeline Memory, and auto-summarized into topics/concerns/commitments/next steps in <30s citing transcript moments; low-quality transcripts are flagged
  3. A founder generates an 80–150 word post-call follow-up in <20s referencing ≥2 transcript moments + addressing concerns + a promised deliverable + a next step, with subject + 2 alternatives — reviewed and sent via the founder's own Gmail
  4. Pipeline Memory is a drag-and-drop kanban across the 7 stages, auto-updating on follow-up sent / transcript ingested, with reversible manual override, loading in <2s for 100 entries, each entry showing its last-interaction summary inline
  5. **Go/no-go:** 25 design partners are onboarded and paying (Pre-Raise $49 / Active Raise $199 operational); activation thresholds are met — Knowledge Pack Import <5 min for >70%, deck uploaded within 24h for >60%, ≥1 deck issue flagged for >95% — and if not, PRD v1 (MVP-only) is surfaced as the expected fallback path before Phase 6 begins
**Plans**: TBD
**UI hint**: yes

### Phase 6: Voice Pitch Coach + Q&A Drill + Browser Extension
**Goal**: A founder rehearses their pitch and the hardest investor questions inside Trochia — in-browser audio capture with deterministic voice metrics + Opus structure scoring, a Q&A Drill, and a Chrome/Edge extension that one-click-syncs Claude/ChatGPT/Gemini context into Business Memory. **Needs phase-level research at kickoff** (the Hume-AI Expression-Measurement sunset, ~June 2026).
**Mode:** mvp
**Depends on**: Phase 5 (soft-launch gate passed or fallback chosen); Phase 3 (deck)
**Requirements**: PITCH-05, PITCH-06, PITCH-07, PITCH-08, KNW-06
**Success Criteria** (what must be TRUE):
  1. A founder records a 30–90s pitch in-browser (native MediaRecorder, auto-stop at 90s), transcribed by Deepgram Nova-3, with structure scored by Claude Opus on Hook/Problem/Solution/Why You/Why Now × clarity/specificity/conviction (1–5 each)
  2. The scorecard appears within 30s — overall 0–100, 5 structure dimensions, 4 voice metrics (pace WPM, filler count, energy 1–5, pause discipline 1–5) **computed deterministically from Deepgram word-level timestamps + a Web Audio offline RMS pass + a custom filler detector — no permanent dependency on a third-party emotion/prosody API** — with 3–5 transcript-referencing suggestions; filler detection >90% on native and non-native speakers; an accent is never penalized
  3. A founder records up to 10 takes per pitch (latest canonical), compares any two side-by-side with the improvement delta, and exports audio + transcript + scorecard as a ZIP; audio is stored in a tenant-isolated encrypted bucket (90-day default, deletable, never used for training, stated on the record screen); a text-pitch fallback with the same rubric (no voice metrics) exists for accessibility
  4. The Q&A Drill generates the 10–15 hardest investor questions from deck + Business Memory + a curated "hardest questions" corpus in <20s, each referencing a specific claim or gap; the founder practices with voice answers and gets per-answer feedback on clarity/specificity/evidence/follow-up-trap risk in <15s per question
  5. A Chrome + Edge browser extension provides one-click sync of context from Claude Projects, ChatGPT Custom GPTs, and Gemini Gems into Business Memory
**Plans**: TBD
**UI hint**: yes

### Phase 7: Data Room Orchestration
**Goal**: A founder orchestrates a real data room from inside Trochia — a vertical-aware checklist, a Drive folder structure created via `drive.file`-only OAuth, per-investor share links with access analytics, and a DDQ filler — plus Gmail pipeline sync and cross-module fact-conflict surfacing. Trochia stores only metadata, never file contents.
**Mode:** mvp
**Depends on**: Phase 5
**Requirements**: DATA-01, DATA-02, DATA-03, DATA-04, DATA-05, PIPE-08, PIPE-09, XC-09
**Success Criteria** (what must be TRUE):
  1. A founder gets a vertical-aware data-room checklist from Business Memory (sector/stage/geo) in <10s with distinct stacks for fintech/SaaS/marketplace/hardware/healthtech/consumer plus a cross-vertical baseline
  2. A founder connects Google Drive via OAuth scoped to `drive.file` only — **the actual consent screen is verified to request exactly `drive.file`, not `drive`/`drive.readonly`** — and Trochia creates a "<Company> Data Room" folder with per-category sub-folders + READMEs at "Restricted" permissions in <30s
  3. A founder generates a per-investor share link (folder/file scope, with expiry) from the Trochia UI in <5s surfaced on the Pipeline entry; revoking Drive access immediately invalidates all share links and notifies the founder; share links capture file-viewed/time-spent/downloaded/return-visit events with sub-second capture, a dashboard + inline-on-pipeline view, anomaly flags, 12-month log retention, forwarded links tracked as separate sessions — Trochia stores only metadata (file IDs, names, events)
  4. A founder uploads a DDQ (PDF/`.docx`/text), Trochia parses questions and drafts answers from Business Memory + Data Room contents with per-answer accept/reject/edit, producing a final filled DDQ preserving original formatting; a 30-question DDQ is drafted in <60s with ≥80% answers cited; scanned tables/images fall back to manual entry with a notice
  5. Gmail pipeline sync auto-attaches narrowly-scoped investor email threads to their Pipeline card (only threads the founder explicitly links, the Gmail analog of `drive.file` scoping) with founder unlink available; a founder can define custom pipeline fields (text/number/date/single-select/multi-select) exported in CSV and queryable in filters; cross-module fact-conflicts (deck vs Business Memory vs transcript) are detected and surfaced with a "which is correct?" UI that updates the source of truth and flags affected downstream surfaces with founder approval
**Plans**: TBD
**UI hint**: yes

### Phase 8: Legal Stack Recommender + EU Residency
**Goal**: A founder gets vendor recommendations and a compliance checklist across the whole legal/ops stack — vendor selections only, never legal advice, lawyer disclaimer on every screen — and EU founders get data residency via the Phase-1 region seam. A non-skippable Compliance Auditor pass clears the UPL/disclaimer surfaces.
**Mode:** mvp
**Depends on**: Phase 1 (region seam, auth)
**Requirements**: LEGAL-01, LEGAL-02, LEGAL-03, LEGAL-04, LEGAL-05
**Success Criteria** (what must be TRUE):
  1. A founder runs a "set up my legal stack" wizard that recommends 2–4 vendors per category (Incorporation, Banking, Cap Table, Legal Counsel, Compliance, Accounting, Insurance, IP/Trademark) via a decision tree on (business type × stage × geography × team size) in <5s, each card showing pros/cons/cost/fit + a visible affiliate disclosure — vendor selections only, never specific clauses/valuations/terms, never interpreting documents or naming an outcome
  2. The recommender ships with the initial partner set wired (Stripe Atlas/Clerky/Firstbase; Mercury/Brex/Rho; Pulley/Carta with a hand-off path from the V3 cap table; Cooley GO/WSGR/Gunderson/Orrick + boutiques; Vanta/Drata/Secureframe; Pilot/Bench/Kruze; Vouch/Embroker; Cognation/Goat) with affiliate referral tracking integrated for 10+ vendors
  3. A founder gets a compliance checklist per (business type × stage) in <10s, each item linking to what it is, plain-language consequences of inaction (never a legal opinion), and a recommended vendor or DIY path; unsupported jurisdictions get partial recommendations flagged "consult local counsel"; a founder requesting specific legal advice is shown "Trochia is not a law firm — here are 3 firms we recommend"
  4. A "Not legal advice — consult your lawyer" disclaimer and the affiliate disclosure are visible on every screen of the module; a non-skippable Compliance Auditor pass on the UPL/disclaimer surfaces is recorded
  5. EU data residency is live for EU founders (Supabase EU region via the Phase-1 region seam) and TOTP MFA is added to auth; a founder can define custom pipeline fields (text/number/date/single-/multi-select) that flow into CSV export and pipeline filters
**Plans**: TBD
**UI hint**: yes

### Phase 9: Raise Ops Core — SAFE + Cap Table
**Goal**: A founder generates SAFEs from vetted templates with deterministic variable substitution only (no model-generated legal language) and tracks a cap table with deterministic, unit-tested math (never an LLM). **Critical-path dependency: the law-firm SAFE-template-review partner must be locked before this phase starts. Needs phase-level research at kickoff** (SAFE template review process + the off-Vercel Gotenberg/LibreOffice doc converter).
**Mode:** mvp
**Depends on**: Phase 8 (Legal Stack hand-off path), Phase 5
**Requirements**: OPS-01, OPS-02, OPS-03, OPS-04, OPS-05, OPS-06
**Success Criteria** (what must be TRUE):
  1. A founder with a verbal commit generates a SAFE from YC standard templates (post-money cap, post-money discount, cap + discount, MFN) + Cooley GO equivalents with deterministic variable substitution only (names, amount, valuation cap, discount %, MFN flag, side letters from a fixed list — each a template, not generated language); output is a SAFE PDF + underlying `.docx`; generation completes in <10s and is 100% deterministic (same inputs → identical output)
  2. A founder must check an un-bypassable gate ("I will have a lawyer review this SAFE before signing OR I waive that protection") before downloading; every SAFE is versioned with template version, variables, founder identity, and timestamp in a founder-accessible/exportable audit trail; templates undergo a documented quarterly law-firm review with version bumps
  3. The SAFE variable-substitution engine is pure, Zod-validated, unit-tested code with **no import path to `ai/` (enforced by directory separation + a `no-restricted-imports` lint rule)** and passes a non-skippable Security Engineer audit for injection/escaping before ship
  4. A founder tracks a cap table from F&F through Seed (Founders, options pool, SAFE holders, Common, Preferred), adding an entry by selecting type → entering terms → previewing impact → confirming; it renders in <1s for 50 entries, updates in <500ms after an add, entries are immutable once a snapshot is exported (corrections require a compensating entry), and foreign-currency investments convert to USD at the investment date preserving original currency
  5. Cap-table math is deterministic unit-tested code (never an LLM) covering pre/post-money conversion, SAFE-to-equity conversion at qualifying financing, MFN cascade (lowest cap among MFN-holders, reasoning shown in UI), option-pool refresh, and the dilution waterfall — **matching a 30-scenario spreadsheet oracle 100% (oracle written TDD-first)**; a "what-if" mode previews a hypothetical priced round without committing; warnings fire for option pool <10%, founder dilution >50%, >30 SAFE holders; Excel export uses Carta/lawyer-format columns opening cleanly in Excel and Google Sheets, with a one-click guided Carta/Pulley hand-off script
**Plans**: TBD
**UI hint**: yes

### Phase 10: F&F Round Manager + E-Sign
**Goal**: A founder runs their first $250K–$1M round inside Trochia — a CRM that tracks F&F conversations (never a "fund"), pre-fills SAFEs, and routes them through ESIGN/eIDAS-compliant e-signature with the cap table writing back within 30s. A non-skippable Compliance Auditor pass verifies zero use of "rolling fund"/"fund"/"investment vehicle"/"adviser" and the not-an-adviser copy on every screen.
**Mode:** mvp
**Depends on**: Phase 9 (SAFE generator, cap table)
**Requirements**: OPS-07, OPS-08, OPS-09, OPS-10
**Success Criteria** (what must be TRUE):
  1. An F&F Round Manager tracks conversations as a CRM — `{person_name, relationship, conversation_stage (intro/discussed/committed/wired/SAFE_signed), expected_amount, actual_amount, accreditation_status (founder-attested only — Trochia does NOT verify), notes}` — with auto-progression, real-time aggregate totals (committed/wired/signed/running round size), 14-day follow-up reminders, pre-fill into the SAFE Generator from an entry, and signed F&F SAFEs auto-appearing in the cap table; loads in <1s for 30 entries
  2. The F&F module carries explicit copy on every screen ("Trochia is not an investment vehicle, broker-dealer, or investment adviser. This module is a CRM for tracking your own conversations.") and a **banned-string CI check + a non-skippable Compliance Auditor pass verify ZERO use of "rolling fund," "fund," "investment vehicle," or "adviser" anywhere in module copy or UI**; securities-law context (504/506(b)/506(c) Reg D) is surfaced for awareness only, never as advice
  3. A founder sends a generated SAFE for signature from Trochia via Dropbox Sign API (DocuSign fallback) — envelope created and sent in <10s, investor signs signature/date/printed name and the founder counter-signs in the same envelope, working on desktop and mobile (investor side), **ESIGN Act (US) + eIDAS (EU) compliant — Aadhaar-based e-sign only if via a licensed provider, not advertised otherwise**
  4. Every e-sign envelope produces a complete audit trail (timestamps, IPs, identity-verification level) embedded in the final signed PDF; signed SAFEs are stored in Supabase with a founder-accessible audit log and downloadable to the founder's own Drive/Dropbox
  5. On signature, the cap table reflects the signed SAFE within 30s **via an idempotent webhook → Inngest path** and the investor moves to the "committed" pipeline stage automatically; declines, change requests (regenerate + void), 14/28-day reminders, 60-day expiry, and founder revocation are all handled
**Plans**: TBD
**UI hint**: yes

### Phase 11: Polish + Close Mode + Alumni + Public Launch
**Goal**: The full four-tier product ships — the Alumni Investor Update Generator, Close Mode and Alumni billing, the Founder Audit add-on, the launch surfaces, and SOC 2 Type I prep — and Trochia goes public. **Public launch does not happen until ≥3 founders have closed real rounds while using Trochia.**
**Mode:** mvp
**Depends on**: Phase 10
**Requirements**: KNW-07, LAUNCH-01, LAUNCH-02, LAUNCH-03
**Success Criteria** (what must be TRUE):
  1. An Alumni-tier founder generates a 6-section investor update (TL;DR, metrics, wins, asks, lowlights, next-month focus) from Business Memory + a founder-entered/integration-pulled KPI snapshot + prior updates in <30s, every metric cited, tone-matched to prior updates, reviewed by the founder and sent via Gmail with approval
  2. Close Mode ($399/mo or $999/quarter) and Alumni ($19/mo) tier billing are live, the Alumni auto-downgrade prompt fires when Pipeline Memory marks the round closed, and the $499 Founder Audit one-time add-on line item is available (first 100 customers)
  3. All four tiers (Pre-Raise / Active Raise / Close Mode / Alumni) are live at public launch; the launch surfaces (landing page, pricing page, marketing copy) are shipped and pass the banned-string CI check
  4. SOC 2 Type I prep with Vanta is begun; the $50K MRR target (~300 paid users at ~$170 blended ARPU) and 3 accelerator partnerships are tracked as launch-readiness goals; **public launch is gated on ≥3 founders having closed real rounds while using Trochia**
**Plans**: TBD

## Progress

**Execution Order:**
Phases execute in numeric order: 1 → 2 → 3 → 4 → 4.5 → 5 → 6 → 7 → 8 → 9 → 10 → 11

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Foundation | 9/9 | Complete | 2026-05-13 |
| 2. Knowledge Layer + Memory | 0/TBD | Not started | - |
| 3. Pitch Lab — Deck Reviewer | 0/TBD | Not started | - |
| 4. Investor Pipeline | 0/TBD | Not started | - |
| 4.5. Admin Dashboard + Security Hardening + Observability (INSERTED) | 0/TBD | Not started | - |
| 5. Live Raise (MVP soft-launch checkpoint) | 0/TBD | Not started | - |
| 6. Voice Pitch Coach + Q&A Drill + Browser Extension | 0/TBD | Not started | - |
| 7. Data Room Orchestration | 0/TBD | Not started | - |
| 8. Legal Stack Recommender + EU Residency | 0/TBD | Not started | - |
| 9. Raise Ops Core — SAFE + Cap Table | 0/TBD | Not started | - |
| 10. F&F Round Manager + E-Sign | 0/TBD | Not started | - |
| 11. Polish + Close Mode + Alumni + Public Launch | 0/TBD | Not started | - |

## Phase-Level Research Flags

Phases the research flagged as needing `/gsd-research-phase` at kickoff:
- **Phase 6** — the Hume-AI Expression-Measurement sunset (~June 2026); confirm the deterministic voice-metrics path before building
- **Phase 9** — the SAFE template-review process (law-firm partner must be locked first) + the off-Vercel Gotenberg/LibreOffice `.docx`→PDF converter

## Cross-Cutting Enforcement (every phase)

Established in Phase 1, enforced in every later phase:
- Banned-string CI check (compliance-language guardrails: never "rolling fund"; never "investment advice"; never "legal advice" without "not"/"this is not")
- RLS default-deny + "no table without RLS/policy" CI check + tenant-isolation tests
- No customer data used for model training (product UI + ToS + DPA + contractual with vendors; vendor data-flow inventory current)
- Founder approves all external sends (email, intros, signature requests, payments) — no autonomous outreach at any phase
- Prompt caching active + Langfuse-instrumented on every production Anthropic call
- Untrusted-input handling (delimited, prompt-injection screened, output schema-validated; RAG cites real sources)
- DPA / data-subject-rights / export / 30-day-soft-delete-then-purge plumbing
- Encryption at rest beyond Supabase native for sensitive fields (cap-table, audio); financial figures never in logs/training; logging-scrub lint
- Every Phase 5+ mutation handler MUST call `logEvent()` to write a `platform_events` row for its meaningful state change (enforced by code review + lint rule on tRPC mutation procedures)
- Every Phase 5+ user-facing error path MUST map through `TrochiaError` (lint rule: no bare `throw new Error()` in tRPC procedures or route handlers; bare errors trip CI)
- Every Phase 5+ Opus-backed AI route MUST chain the `@upstash/ratelimit` middleware (lint rule on the tRPC procedure chain)
- Every Phase 5+ tenant-scoped mutation MUST be visible to the admin dashboard (audited via the OBS-01 helper presence in the handler)
