# Trochia AI

## What This Is

Trochia AI is an agentic Founder Operating System for raising capital — it runs alongside a founder through the whole raise, from Friends & Family through Series A. One product, seven modules, one shared memory: it reviews the deck, finds and matches the right investors and accelerators, drafts outreach and application answers, prepares pre-call briefs, ingests transcripts, writes 24-hour follow-ups, orchestrates the data room, recommends the legal/vendor stack, generates SAFEs, and tracks the cap table — all grounded in the founder's business memory and pipeline memory. Target user: solo or two-person pre-seed/seed founders in an active raise ($250K–$5M targets) in the US, UK, EU, and India who already use ChatGPT or Claude daily.

## Core Value

A founder can run their entire raise from inside one tool whose shared memory knows their business and their pipeline better than any general AI — and that memory + workflow ownership across the whole raise journey is the moat. If everything else fails, the unified Business Memory + Pipeline Memory spine that every module reads from and writes to must work.

## Requirements

### Validated

<!-- Shipped and confirmed valuable. -->

(None yet — ship to validate)

### Active

<!-- Current scope. Building toward these. Full product = MVP + V2 + V3 built end-to-end, with the MVP slice soft-launching to design partners mid-build (PRD v2 §13). -->

**Foundation & platform (MVP — Weeks 0–2)**
- [ ] Next.js 15 + TypeScript + Tailwind + shadcn/ui monolith deployed on Vercel, with the marketing site in the same repo
- [ ] Supabase (Postgres + pgvector + storage) provisioned; Drizzle ORM; core schema (users, businesses, decks, investors, pipeline) with row-level tenant isolation (RLS)
- [ ] Supabase Auth with Google SSO (magic link + MFA added at V2)
- [ ] Stripe billing skeleton: Pre-Raise $49/mo and Active Raise $199/mo tiers, Customer Portal, 7-day trial, card-on-file at signup, no permanent free tier
- [ ] Resend transactional email; Sentry + Amplitude wired for error monitoring and product analytics
- [ ] Site URL read everywhere from `process.env.NEXT_PUBLIC_SITE_URL` (currently `https://trochia.asranest.com`, migrating mid-build to `https://trochia.ai`) — never hardcoded
- [ ] Onboarding flow shell: Google sign-in → welcome → Knowledge Pack Import → deck upload → auto deck review → dashboard with three CTAs, target under 5 minutes

**Knowledge Layer + Memory (MVP — Weeks 3–4)**
- [ ] Business Memory schema + confirmation UI: founder pastes/uploads existing AI context, Claude Sonnet extracts a normalized record with source snippets, founder confirms/edits each field, conflicting facts surfaced for resolution
- [ ] Knowledge Pack Import Tier 1 (paste text: plain/Markdown) and Tier 2 (file upload: ChatGPT Data Export ZIP, Claude Project Markdown, Notion export, .md/.txt) — paste under 30s, ZIP up to 50MB under 60s
- [ ] pgvector embeddings of confirmed memory + curated fundraising corpus (YC Founder Manual, Sam Altman's playbook, Lenny's, Pari Passu, public term-sheet libraries, Charles Hudson on pre-seed, NfX guides)
- [ ] Ambient Q&A sidebar on every page, grounded in curated corpus + Business Memory + Pipeline Memory, RAG via pgvector retrieval + Claude Opus synthesis, citation in every answer, median response under 8s, says "I don't know" rather than fabricating

**Pitch Lab — Deck Reviewer (MVP — Weeks 5–6)**
- [ ] Deck upload accepting PDF, PPTX, Google Slides URL (Figma deck URL at V2), parsed via LlamaParse into structured slide JSON
- [ ] Deck Reviewer agent (Claude Opus + structured output over deck + Business Memory + defect taxonomy) returning `{slide_number, original_text, issue_type, severity, suggested_rewrite, reasoning}`; issue types: factual contradiction, internal contradiction, unsupported claim, vague language, missing context, structural issue
- [ ] Review dashboard with slide/severity filters; per-issue accept/reject/edit building a "reviewed deck" version; export reviewed deck as annotated PDF (clean rewritten PDF at V2)
- [ ] Eval harness from day 1: median review under 90s for a 12-slide deck, median 5–15 issues for a typical pre-seed deck, false-positive rate under 25% (tracked and tuned), no fabricated slide references

**Investor Pipeline (MVP — Weeks 7–8)**
- [ ] VC + accelerator match: ranked list of ~30 VCs + ~10 accelerators from Business Memory + filters (geography, check size, sector), scored on sector/stage/geography match + recent activity + partner-thesis embedding similarity, one-line rationale per match; founder marks interested / not interested / already met
- [ ] Investor data source at MVP = curated internal top-200 fund list + 30+ accelerators (YC, Antler, Techstars, On Deck, AngelPad, 500 Global, SeedCamp, etc.) with stage/sector/geo tags; Harmonic API integration deferred to V2
- [ ] Application tracker: per-accelerator status (todo/in_progress/submitted/interview/accepted/rejected), deadlines, pre-loaded application bank for top 15 accelerators, AI-drafted answers from Business Memory (Claude Sonnet), Google Calendar reminders, auto-reminder after 3 weeks of no response
- [ ] Outreach drafter: 4–7 sentence personalized email per investor, enriched with the partner's recent X/LinkedIn posts + recent fund investments + podcasts/talks (Exa + Firecrawl), tone-matched to founder's writing, under 120 words, subject line + 2 alternatives, founder approves and sends via their own Gmail (no autonomous send)
- [ ] Warm-intro mapper: founder pastes LinkedIn export (cookie-based access at V2), cross-references 1st-degree network against target investor list, outputs `{target_investor, intro_path, intro_strength_score, suggested_intro_template}`, drafts the intro request — no LinkedIn ToS violation, no bulk scrape

**Live Raise (MVP — Weeks 9–10, soft launch)**
- [ ] Pre-call brief: ~40-line dossier from investor + Business Memory + deck + prior interactions + Harmonic-or-curated data + partner's recent posts/portfolio/podcast transcripts → `{partner_overview, fund_overview, recent_investments, portfolio_overlap, possible_objections, 3 smart questions, warm_intro_path}`, exportable PDF, generated under 30s, sources cited
- [ ] Transcript ingestion: paste, file upload (.txt/.vtt/.srt), Granola/Otter API at V2; parse → align with pipeline entry → store in Pipeline Memory; auto-summarize topics/concerns/commitments/next steps with cited transcript moments
- [ ] Post-call follow-up drafter: thank-you + 2–3 sentences referencing specific conversation moments + addressing concerns + promised deliverable + next step, 80–150 words, subject + 2 alternatives, founder reviews and sends via own Gmail (no autonomous send), references ≥2 transcript moments
- [ ] Pipeline Memory: kanban with drag-and-drop, stages researched/contacted/first_meeting/follow_up/diligence/committed/passed, auto-updates on follow-up sent / transcript ingested / SAFE generated (V3), manual override always available, loads under 2s for 100 entries
- [ ] MVP soft launch: 25 design partners onboarded; Pre-Raise $49 + Active Raise $199 tiers operational

**Pitch Lab — Voice Pitch Coach + Q&A Drill (V2 — Weeks 11–14)**
- [ ] In-browser 30–90s audio capture (WebRTC/MediaRecorder, auto-stop at 90s), Deepgram Nova-3 transcription, Hume AI prosody (pace/energy/pause) + custom filler-word detector ("um/uh/like/you know/so/basically"), Claude Opus structure scoring on Hook/Problem/Solution/Why You/Why Now × clarity/specificity/conviction (1–5 each)
- [ ] Scorecard within 30s: overall 0–100, 5 structure dimensions, 4 voice metrics (pace WPM, filler count, energy 1–5, pause discipline 1–5), 3–5 specific transcript-referencing suggestions; filler-word detection >90% on native + non-native speakers (never penalize accent); up to 10 takes per pitch, side-by-side compare, ZIP export; accessibility fallback to text-pitch input with same rubric (no voice metrics); audio in tenant-isolated encrypted storage, never used for model training
- [ ] Q&A Drill: Claude Opus generates 10–15 hardest investor questions from deck + Business Memory + curated "hardest questions" corpus (each referencing a specific claim or gap), practice mode with voice answers, per-answer feedback on clarity/specificity/evidence/follow-up-trap risk
- [ ] Knowledge Pack Import Tier 3: browser extension (Chrome + Edge) one-click sync from Claude Projects, ChatGPT Custom GPTs, Gemini Gems

**Data Room Orchestration (V2 — Weeks 15–18)**
- [ ] Vertical-aware checklist generator from Business Memory (sector/stage/geography), with distinct stacks for fintech, SaaS, marketplace, hardware, healthtech, consumer, plus a cross-vertical baseline; generated under 10s
- [ ] Google Drive orchestration: OAuth scoped to `drive.file` only, creates "<Company> Data Room" folder with per-category sub-folders + README in each, "Restricted" default permissions (no public/anyone-with-link), per-investor share links via Trochia UI; folder structure created under 30s
- [ ] Access analytics: per-investor tracking IDs, file-viewed / time-spent / downloaded / return-visit events, dashboard + inline-on-pipeline-entry view, anomaly flags; Trochia stores only metadata (file IDs, names, events), not file contents; access logs retained 12 months
- [ ] DDQ filler: founder uploads a DDQ (PDF/.docx/text), Trochia parses questions and drafts answers from Business Memory + Data Room contents, per-answer accept/reject/edit, final filled DDQ download preserving original formatting; 30-question DDQ under 60s with ≥80% answers cited

**Legal Stack Recommender (V2 — Weeks 19–22)**
- [ ] Vendor recommender as a decision tree by (business type × stage × geography × team size) across Incorporation, Banking, Cap Table, Legal Counsel, Compliance, Accounting/Bookkeeping, Insurance, IP/Trademark — 2–4 vendors per category with pros/cons/cost/fit signal and a visible affiliate disclosure on every recommendation; output under 5s
- [ ] Compliance checklist per business type × stage: each item links to what it is, plain-language consequences of inaction (never a legal opinion), and recommended vendor or DIY path; "Not legal advice — consult your lawyer" disclaimer visible on every screen; never recommends specific clauses/valuations/terms, never interprets documents, never names an outcome
- [ ] Affiliate referral tracking integrated with each vendor's partner program for 10+ vendors
- [ ] EU data residency for EU founders (Supabase EU region); MFA added to auth

**Raise Ops — SAFE + Cap Table + F&F + E-Sign (V3 — Weeks 23–32)**
- [ ] SAFE generator using YC standard SAFE templates (post-money cap, post-money discount, cap + discount, MFN) + Cooley GO equivalents; deterministic variable substitution only (company/investor name, amount, valuation cap, discount %, MFN flag, side letters from a fixed list) — model-generated legal language prohibited; outputs SAFE PDF + underlying .docx; mandatory un-bypassable gate "I will have a lawyer review this SAFE before signing OR I waive that protection" before download; quarterly law-firm template review; full audit trail (template version, variables, founder identity, timestamp); generation under 10s, 100% deterministic
- [ ] Cap-table orchestrator: deterministic (non-LLM) math — pre/post-money conversion, SAFE-to-equity conversion at qualifying financing, MFN cascade (lowest cap among MFN-holding SAFEs), option pool refresh, dilution waterfall; add-entry flow (SAFE/priced/common/option grant → terms → preview impact → confirm); "what-if" mode; warnings (option pool <10%, founder dilution >50%, >30 SAFE holders → suggest graduation to Carta); Excel export matching Carta/lawyer format, one-click Carta/Pulley hand-off with guided import script; renders under 1s for 50 entries, add-entry under 500ms, math 100% matches a 30-scenario spreadsheet test suite, all math unit-tested
- [ ] F&F Round Manager: a CRM/tracker for the first $250K–$1M — conversation stages (intro/discussed/committed/wired/SAFE_signed) with auto-progression, expected vs actual amounts, founder-attested-only accreditation status (Trochia does NOT verify), aggregate totals (committed/wired/signed/round size), 14-day follow-up reminders, integrates with SAFE Generator (pre-fill) and Cap Table (signed F&F SAFEs auto-appear); explicit copy "Trochia is not an investment vehicle, broker-dealer, or investment adviser" on every screen; ZERO use of "rolling fund," "fund," "investment vehicle," or "adviser" anywhere
- [ ] E-Sign integration: Dropbox Sign API (primary), DocuSign fallback; generated SAFE → "Send for signature" → investor email → tracked envelope; investor signature/date/printed name + founder counter-sign in the same envelope; ESIGN Act (US) + eIDAS (EU) compliant, Aadhaar-based e-sign optional (India); timestamp + IP-logged audit trail in the final PDF; signed SAFEs stored in Supabase with founder-accessible audit log + downloadable to own Drive/Dropbox; cap table reflects signed SAFE within 30s; investor moves to "committed" stage automatically; works on desktop and mobile (investor side)

**Knowledge Layer — Investor Update Generator + Alumni / Close Mode launch (V3 — Weeks 33–36)**
- [ ] Investor Update Generator (Alumni tier): 6-section update (TL;DR, metrics, wins, asks, lowlights, next-month focus) from Business Memory + founder-entered/integration-pulled KPI snapshot + prior updates, all metrics cited, tone-matched to prior updates, draft under 30s, founder reviews and sends via Gmail (with approval)
- [ ] Close Mode tier billing live ($399/mo or $999/quarter); Alumni tier billing live ($19/mo); auto-downgrade prompt when Pipeline Memory marks the round closed; $499 Founder Audit one-time add-on line item (first 100 customers)
- [ ] Public launch: all four tiers live (Pre-Raise / Active Raise / Close Mode / Alumni), $50K MRR target (~300 paid users at ~$170 blended ARPU), 3 accelerator partnerships locked, SOC 2 Type I prep with Vanta begun

**Cross-cutting (all phases)**
- [ ] No customer data used for model training — stated in product, ToS, and DPA; enforced contractually with API providers
- [ ] Founder approves all external sends (email, intros, signature requests) — no autonomous outreach at any phase
- [ ] Tenant isolation via Supabase RLS; encryption at rest (Supabase native + dedicated keys for sensitive fields like cap-table); data export on demand; account deletion → 30-day soft delete → permanent purge
- [ ] DPA signed automatically at signup (clickwrap); compliance-language guardrails enforced everywhere (see Constraints)
- [ ] Prompt caching enforced from day 1 on all production Anthropic API calls (the `claude-api` skill mandates this)

### Out of Scope

<!-- Explicit boundaries. Includes reasoning to prevent re-adding. -->

- **"Rolling fund" terminology — anywhere in product, UI, or marketing copy** — regulated SEC term tied to AngelList's 506(c) Investment Advisers Act vehicle; permanent regulatory landmine. The F&F module is a CRM/tracker, never a "fund."
- **AI joins a call as the primary speaker / pitches with the founder's or its own voice** — buyers reject this category outright (Air.ai, Bland, Tavus speaker mode all stalled); also a liability surface.
- **Autonomous external action** (sending emails, posting, booking calls, signing/paying) without explicit founder approval — even at V3. Founder-approved external action only.
- **Avatar / "name your AI" persona UX** — cosmetic; doesn't move retention.
- **Mobile app** — founders raise from laptops; V4 at earliest, possibly never.
- **Legal advice of any kind** — UPL exposure; Trochia is templates + vendor recommendations only, always with a lawyer disclaimer. Never recommends specific clauses, valuations, or terms; never interprets documents; never names an outcome.
- **Investment advice** — Trochia never recommends whether to take a deal.
- **Cap-table system of record** — Trochia is "pre-Carta"; it hands off to Carta/Pulley when the founder graduates.
- **Multi-vertical positioning** (creators, designers, marketers, generic "AI for everyone") — narrowly founder-fundraise only; broad ICP = no ICP.
- **Crypto/web3 token-raise founders** — regulatory complexity we don't take on.
- **Investor-side product** (matching/scouting for VCs, portfolio management) — V4+ at earliest.
- **Cap-table math via LLM** — all dilution/conversion/MFN-cascade math is deterministic, unit-tested code; an LLM never computes the cap table.
- **Model-generated legal language in the SAFE generator** — deterministic variable substitution against vetted templates only.
- **Generic browser-controlling operator agent / GitHub-repo skill absorption / autonomous overnight research briefings** — Anthropic Computer Use / OpenAI Operator will eat the first; the others aren't why founders pay.
- **Permanent free tier** — 7-day trial only; free dilutes the buyer pool with founders who'll never raise.
- **Enterprise pricing at MVP** — if a fund/accelerator wants portfolio seats, flat $20K/year for 25 seats; no customization.
- **Bulk scraping of LinkedIn or investor sites** — use Harmonic/Crunchbase APIs and founder-supplied LinkedIn exports/cookies; stay within ToS via `apify`/`firecrawl`/`playwright`.
- **Mem0/Letta, Pinecone/Weaviate, Algolia, v0/Lovable, Composio, Auth0, Datadog, Salesforce/HubSpot, Twilio, Mixpanel** — covered by pgvector, Supabase Auth, Sentry+Amplitude, the `magic`/`stitch` MCPs, native MCP servers, Airtable+Linear, and (no SMS at MVP). Don't re-add.

## Context

**Strategic source of truth.** `.planning/intel/` contains the canonical docs that must be read before any product decision: `Trochia_AI_Strategy_v1.md` (strategy & decision log — wins until explicitly updated), `Trochia_AI_Build_Stack_v2.md` (Claude-Code-native tooling + the 11-phase GSD build sequence), and `Trochia_AI_PRD_v2.docx` (full-product PRD: MVP + V2 + V3 with per-feature user stories, functional requirements, acceptance criteria, data models, edge cases, and the 36-week build sequence). PRD v1 (MVP-only) is the staged-ship fallback if scope must be cut.

**Why now (2026).** MCP + Claude/OpenAI agent infrastructure make integrated agents trivially possible; investor-data APIs (Harmonic, Crunchbase) are accessible; voice transcription/analytics are commodities; model labs won't build vertical fundraise software. Vertical depth + memory + workflow ownership = the moat.

**Why founders pay.** A botched investor meeting costs ~$25K–$250K of expected value per missed second meeting; $49–$199/mo during a 3–6 month raise window is rounding error. Founders self-select into acute, time-bounded pain. The buyer is the user — card on file, decision in under 10 minutes, no procurement.

**What customers must believe to pay:** (1) "this won't embarrass me with investors" — proven by deck-review + pre-call-brief quality; (2) "this knows my business better than ChatGPT" — proven by felt memory depth; (3) "it saves me 5+ hours a week" — proven by the live-raise loop; (4) "it's defensibly mine, not training someone else's model" — proven by privacy posture.

**Build approach.** Solo build (Martins Ejeheri) with Claude Code as the primary builder, GSD + Superpowers as the workflow spine — every module follows `/gsd-plan-phase → /gsd-execute-phase → /gsd-code-review → /gsd-secure-phase → /gsd-ship`. Subagents (Backend Architect, Frontend Developer, AI Engineer, Voice AI Integration Engineer, MCP Builder, Code Reviewer, Compliance Auditor, Security Engineer) run liberally on isolated worktrees. Buy boring infra (auth, DB, payments, transcription, voice analytics, investor data, e-sign); build the moat (deck reviewer, investor matching, pipeline memory, business memory). One Next.js monolith; no microservices at MVP; refactor when load demands.

**GTM (informs no build work but frames priorities).** Founder-led: deck teardowns on LinkedIn/X, VC explainers, pitch-coaching reels (V2+); accelerator partnerships (Antler / On Deck / AngelPad) as the primary distribution channel; founder communities; founder podcasts. First 10 paid = Martins's warm circle; first 100 by month 4 via 3 accelerator partnerships + 12 LinkedIn teardowns + 1 podcast.

**Infra already wired into Claude Code (zero added cost):** Gmail / Google Calendar / Google Drive / GitHub / Linear / Sentry / Amplitude / Airtable connectors; `apify` + `firecrawl` (scraping within ToS); `playwright` (browser automation); `context7` (live docs); `magic` + `stitch` (UI generation); `episodic-memory` (build-time memory); `sequential-thinking` (hard multi-step logic). Still external/paid: Harmonic API (V2+), Apollo.io, Exa, Dropbox Sign (V3), Deepgram Nova-3 + Hume AI (V2 voice), LlamaParse, Voyage/Cohere embeddings, Vanta (V2/M12).

**Known build-environment notes:** repo cloned at `C:\Users\ejehe\trochia\Trochia`, connected to Vercel project `trochia` (org `ejeherimartins-9592s-projects`); subdomain `trochia.asranest.com` live via Namecheap CNAME → Vercel; `NEXT_PUBLIC_SITE_URL` and `NEXT_PUBLIC_APP_URL` set on Production/Preview/Development; `.env.local` holds the same; `.gitignore` excludes `.env*` and `.vercel`. The URL migrates mid-build to `https://trochia.ai`.

## Constraints

- **Scope**: Full product — MVP (Weeks 0–10) + V2 (Weeks 11–22) + V3 (Weeks 23–36) — built end-to-end before the public launch, per PRD v2. The MVP slice soft-launches to 25 design partners at ~Week 10. PRD v1 (MVP-only staged ship) is the fallback if scope must be cut.
- **Tech stack**: Next.js 15 + TypeScript + Tailwind + shadcn/ui + Radix + Lucide + react-hook-form + Zod + TanStack Query + Framer Motion (sparingly); Next.js API routes + tRPC; Supabase Postgres + pgvector + storage; Drizzle ORM; Inngest (background jobs); Upstash Redis (rate limiting); Supabase Auth; Stripe + Stripe Tax; Resend; Sentry + Amplitude; Vercel + Cloudflare hosting. Anthropic API (Opus 4.7 / Sonnet 4.6 / Haiku 4.5) for production AI, OpenAI/Codex bridge as fallback only. Type safety end-to-end (TypeScript + tRPC + Zod). — Chosen in the Build Stack v2 doc; don't re-litigate without updating it.
- **Auth provider**: Supabase Auth (not Clerk) at MVP — free, RLS-native, one fewer vendor. Google SSO at MVP; magic link + MFA at V2. — Decision locked at project init.
- **Investor data at MVP**: curated internal top-200 fund list + 30+ accelerators (free); Harmonic API integration deferred to V2. — Decision locked at project init.
- **Geography at MVP**: US + UK + India simultaneously (English-language fundraise) — so multi-region data-residency and compliance handling is in scope from the start; EU residency added with the EU founder push at V2. — Decision locked at project init (deviates from the docs' US-only recommendation by explicit choice).
- **Site URL**: always read from `process.env.NEXT_PUBLIC_SITE_URL`; never hardcoded anywhere. Currently `https://trochia.asranest.com`; migrates mid-build to `https://trochia.ai` with zero code changes required.
- **Compliance language (non-negotiable, every phase)**: never use "rolling fund"; never use "investment advice"; never use "legal advice" without "not"/"this is not" prefixed; Legal Stack carries a visible "Not legal advice — consult your lawyer" disclaimer on every screen; SAFE generation has an un-bypassable "have your lawyer review or I waive" gate; F&F Round Manager carries "Trochia is not an investment vehicle, broker-dealer, or investment adviser"; e-sign is ESIGN/eIDAS compliant only.
- **Security**: SOC 2 Type I within ~12 months (Vanta prep starts at V2/M12); encryption at rest; tenant isolation via RLS; no training on customer data; written DPAs; the SAFE variable-substitution engine gets a Security Engineer audit (a string-injection bug there is catastrophic); cap-table math is unit-tested deterministic code, never an LLM.
- **AI cost**: prompt caching enforced from day 1 (`claude-api` skill); Haiku for cheap classification/polling, Sonnet for high-volume production, Opus for deep reasoning (deck review, brief synthesis, scoring); target gross margin >75% (AI cost ~$8–$15 per active user once V3 features are in use).
- **Workflow (from CLAUDE.md, non-negotiable)**: plan-first (Plan Mode for any non-trivial task, no edits until approved); subagents liberally in worktrees; verify before done (tests pass + diffs reviewed + logs clean before any `/gsd-ship`); lessons captured in `tasks/lessons.md` after each phase; mandatory code review via `/gsd-code-review`; `/gsd-debug` for production issues; `/gsd-verify-work` before every `/gsd-ship`; track work in `tasks/todo.md`.
- **Timeline / capacity**: realistic 36 weeks assumes a dedicated operator co-founder on Trochia; solo-Martins is the Conservative timeline (+~6 months). Operator assignment is unresolved (see Open Questions).

## Key Decisions

<!-- Decisions that constrain future work. Add throughout project lifecycle. -->

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Project scope = full product (MVP + V2 + V3, ~11 phases) rather than MVP-only first milestone | Founder chose to plan the full 36-week sequence up front (PRD v2); MVP still soft-launches mid-build per PRD §13 | — Pending |
| Auth = Supabase Auth, not Clerk | Free vs ~$25/mo + per-MAU; RLS-native; one fewer vendor; `nextjs-supabase-auth` skill handles wiring | — Pending |
| Investor data at MVP = curated internal top-200 list, Harmonic deferred to V2 | Zero vendor cost during the pre-revenue build phase; all three intel docs recommend it | — Pending |
| Geography at MVP = US + UK + India simultaneously | Founder's explicit choice for wider launch TAM, accepting the multi-region data-residency/compliance work up front | ⚠️ Revisit (deviates from docs' US-only recommendation) |
| One Next.js monolith, marketing site in the same repo, no microservices at MVP | Solo builder; refactor when load demands; pgvector handles 10M+ vectors, Postgres handles 100K+ users | — Pending |
| GSD + Superpowers as the build workflow spine for every module | Disciplined plan → execute → review → secure → ship loop; subagents in worktrees | — Pending |
| E-sign provider defaulted to Dropbox Sign (DocuSign fallback) | Cost-preferred per PRD; final call before Week 23 | — Pending |
| Granola/Otter API integration defaulted to V2 | MVP uses paste / .txt/.vtt/.srt upload; promote to MVP only if APIs prove stable | — Pending |

## Open Questions

<!-- Business/strategic decisions parked at init — resolve as the build reaches them. -->

- **Operator assignment**: Martins solo (Conservative, +~6 months) vs. a co-founder full-time on Trochia (realistic 36-week timeline)? Affects timeline, not roadmap structure.
- **Legal entity**: Trochia as a separate entity from Clockvest, or run inside the existing entity? Implications for fundraising and IP.
- **Law-firm SAFE-template partner**: who reviews YC/Cooley GO templates quarterly? Must be locked by Phase 8 / ~Week 23.
- **Pre-Raise tier price test**: $39 vs $49 vs $59 — A/B test in months 3–6 ($49 default).
- **Founder Audit limit**: first 100 (recommended) vs first 50 vs unlimited.
- **Accelerator anchor partner**: Antler vs On Deck vs AngelPad — pick one and build the relationship deep.
- **Trademark + domain**: confirm `trochia.ai` (vs `.com` / `usetrochia.com`) and clear trademark in US + UK + EU + India before the URL migration.
- **Granola/Otter API**: promote transcript ingestion to MVP if the APIs are stable, else V2 (current default).

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `/gsd-transition`):
1. Requirements invalidated? → Move to Out of Scope with reason
2. Requirements validated? → Move to Validated with phase reference
3. New requirements emerged? → Add to Active
4. Decisions to log? → Add to Key Decisions
5. "What This Is" still accurate? → Update if drifted

**After each milestone** (via `/gsd-complete-milestone`):
1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state

---
*Last updated: 2026-05-11 after initialization*
