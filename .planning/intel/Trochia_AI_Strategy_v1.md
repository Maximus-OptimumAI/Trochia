# Trochia AI — Strategy & Source of Truth

**Version:** 1.0
**Owner:** Martins Ejeheri
**Status:** Active — informs all build decisions
**Last updated:** May 2026

This is the single source of truth for Trochia AI. It captures the strategic conclusions reached across product, GTM, pricing, build, and risk decisions. Any future chat or contributor should read this first before making product decisions.

---

## 1. Executive Summary

**Product:** Trochia AI — an agentic Founder Operating System for raising capital, covering Friends & Family through Series A.

**Wedge:** Founders raising rounds operate without an operator. Trochia is the operator — it reviews their deck, finds the right investors, drafts their outreach, prepares them for every call, writes the follow-up, manages the data room, generates SAFEs, and tracks the cap table. Everything they need to run a raise, in one tool with shared memory.

**Why now (2026):** MCP and the Claude/OpenAI agent infrastructure make integrated agents trivially possible. Investor-data APIs (Harmonic, Crunchbase) are accessible. Voice transcription and analytics are commodity. The model labs will not build vertical fundraise software. Vertical depth + memory + workflow ownership = the moat.

**Target:** Pre-seed and seed founders in active raise — solo or two-person teams, $250K–$5M targets, US / UK / EU / India.

**Pricing:** $49 Pre-Raise → $199 Active Raise → $399 Close Mode → $19 Alumni. Annual discounts. $499 Founder Audit add-on. Affiliate revenue from Legal Stack vendors.

**Path to $5M ARR:** Realistic 22 months. Conservative 30 months. Aggressive 16 months. Honest Martins-bandwidth scenario: Conservative + 6 months unless an operator co-founder is assigned.

**Brand:** "Trochia AI — the agentic operator for your raise." From Greek τροχιά (trochiá): track, path, trajectory. The metaphor: we orchestrate the trajectory of your raise.

---

## 2. Vision & Thesis

### Product thesis

Most founders raise badly. They send decks with contradictions they can't see, walk into investor meetings without knowing the partner's portfolio, and send mediocre 24-hour follow-ups that lose them the second meeting. They don't know which VCs fit, which accelerators to apply to, or which legal stack to set up. They duct-tape ChatGPT, Granola, Notion, Pitchbook, Carta, and ten other tools — none of which talk to each other.

Trochia replaces the duct tape with a single agent that holds your business memory, knows your raise stage, and operates across the whole journey.

### Long-term vision

Trochia becomes the default founder OS — the place where every raise is run from F&F through Series B. Eventually expands to investor-side (warm intro routing, portfolio-readiness scoring) and post-raise (investor updates, KPI reporting). But that's V4+.

### What Trochia is NOT

- Not a generic AI assistant ("name your AI / give it an avatar" was rejected as cosmetic).
- Not a voice agent that pitches *for* the founder (buyers reject this category — Air.ai, Bland, Tavus speaker mode all hit graveyards).
- Not a horizontal AI productivity tool ("for everyone learning AI" was rejected as undifferentiated against ChatGPT/Claude/Copilot/Operator).
- Not a cap-table system of record (we are pre-Carta; we hand off to Carta/Pulley at the right stage).
- Not a legal-advice product (UPL exposure — we are templates + recommendations only).
- Not a "rolling fund" — that is a regulated SEC term tied to AngelList. Permanently banned from product copy.

---

## 3. Target Customer

**Primary ICP:** Pre-seed / seed founders in active raise.

**Profile:**
- Solo or two-person founder team
- Raising $250K–$5M
- Pre-revenue or <$50K MRR
- US, UK, EU, or India
- English-language fundraise
- Comfortable with AI tools (uses ChatGPT or Claude already)
- No previous unicorn exit (founders with prior exits don't need this product)

**The buyer is the user.** No procurement, no committee. Card on file. Decision in <10 minutes.

**Urgency:** Acute and time-bounded — the active raise window is 3–6 months. Founders self-select into pain.

**Why they pay:** A botched investor meeting costs ~$25K–$250K of expected value per missed second meeting. $99–$199/mo during the raise is rounding error. They already pay for Carta, DocSend, Pitchbook access.

**Total addressable market:** ~5,000–25,000 active fundraisers in primary geographies at any given time, plus the inflow of new founders entering raise mode each month (~1,500–3,000/mo globally).

**Secondary ICP (V3+):** Pre-Series-A founders preparing for institutional rounds. Higher ARPU, more demanding product expectations.

**Anti-ICP (do not market to):**
- Operators not raising (no urgency)
- Founders post-Series A (Carta + dedicated finance team replaces us)
- Bootstrapped founders (no fit)
- Crypto/web3 token-raise founders (regulatory complexity we don't want)

---

## 4. Product Architecture

Trochia is **one product, seven modules, one shared memory.** Modules map to phases of the raise.

```
TROCHIA AI — FOUNDER OS FOR RAISING
│
├── PITCH LAB           — deck reviewer + 60-sec voice coach + Q&A drill
├── INVESTOR PIPELINE   — VC/accelerator match + applications + outreach + warm intros
├── LIVE RAISE          — pre-call brief + meeting transcript + post-call follow-up
├── RAISE OPS           — SAFE generator + cap-table preview + F&F tracker + e-sign
├── DATA ROOM           — vertical-aware checklist + Drive orchestration + access analytics
├── LEGAL STACK         — vendor recommender + compliance checklist by business type
└── KNOWLEDGE LAYER     — fundraising Q&A grounded in user's business memory + KNOWLEDGE PACK IMPORT
```

### Shared spine

Two persistent stores read by every module:

1. **Business Memory** — company facts (name, sector, stage, geography, traction metrics, team, deck), current raise target, fundraise narrative.
2. **Pipeline Memory** — every investor spoken to, current stage, what was said, what's next, attachments.

This integration is the moat. Features can be copied; the unified memory across the whole raise journey cannot.

### The seven modules

#### Pitch Lab
- **Deck reviewer (text):** Contradiction detection, weak-claim flagging, line-item rewrite suggestions. Reads PDF/PPTX/Google Slides.
- **60-sec voice pitch coach (V2):** Founder records pitch → AI scores hook / problem / solution / why-you / why-now × clarity / specificity / conviction. Voice metrics: pace, filler words, energy, pause discipline.
- **Q&A drill:** Generates likely investor questions for the deck and lets the founder rehearse with feedback.

#### Investor Pipeline
- **VC + accelerator match:** Generates a fit list based on business type, stage, geography, sector. Decision-maker contacts (LinkedIn, public email, Twitter handle).
- **Application tracker:** YC, Antler, On Deck, Techstars, AngelPad — applied / submitted / interview / response status.
- **AI-drafted application answers:** Pulls from Business Memory to draft application questions.
- **Cold outreach drafter:** Personalized to each investor based on their public footprint.
- **Warm-intro mapper:** Cross-references founder's network (LinkedIn cookie, Gmail) against investor list to surface warm paths.

#### Live Raise
- **Pre-call brief:** 40-line dossier on the investor — partner, fund, recent deals, portfolio overlap, public posts, possible objections.
- **Meeting transcript ingestion:** Imports from Granola, Otter, Fireflies, Fellow via API or paste.
- **Post-call follow-up writer:** Drafts a personalized 24-hour email referencing actual conversation content.
- **Pipeline memory update:** Auto-updates investor stage, next steps, last-contact date.

#### Raise Ops (V3)
- **SAFE generator:** YC standard SAFE templates (post-money, MFN, valuation cap, discount variants) + Cooley GO templates. Variable substitution only — NO model-generated legal language. UPL-clean disclaimer.
- **Cap-table orchestrator (V3, NEW):** Position as "Pre-Carta cap table." Add investor + investment type → deterministic dilution math (founders, options, SAFEs, common). **Excel export** as primary output. Hand-off path to Carta/Pulley when founder graduates.
- **F&F Round Manager:** Pre-Carta tracker for the messy first $250K–$1M. Conversation stages, commitment tracker, side-letter management. **Explicitly NOT a "rolling fund."**
- **E-sign integration:** Dropbox Sign API or DocuSign API.

#### Data Room (V2)
- **Vertical-aware checklist generator:** Different stack for fintech (BSA/MTL), SaaS (DPA/SOC 2), marketplace (payment-flow audit), hardware, healthtech, consumer.
- **Google Drive orchestration:** Auto-creates folder structure, sets permissions, populates with templates.
- **Access analytics:** Who viewed what, for how long.
- **DDQ filler:** AI completes investor due-diligence questionnaires from Business Memory.

#### Legal Stack (V2)
- **Vendor recommender:** Decision-tree taxonomy by (business type × stage × geography). Recommends incorporation (Stripe Atlas, Clerky, Firstbase), banking (Mercury, Brex), cap table (Pulley, Carta), legal (Cooley GO, Wilson Sonsini WSGR Launch, Gunderson, Orrick), compliance (Vanta, Drata).
- **Compliance checklist:** What you actually need at this stage in your jurisdiction.
- **Affiliate revenue:** Standard rev-share with vendor partners.
- **Disclaimer:** "Recommendations only. Not legal advice. Consult your lawyer."

#### Knowledge Layer (MVP, ambient)
- **Fundraising Q&A grounded in user's memory.** Surfaces inside every module via a sidebar. Not a separate tab.
- **Knowledge Pack Import (NEW, MVP):** Founders import existing AI context from ChatGPT, Claude, Gemini, Notion AI to seed their Business Memory. Removes the #1 onboarding friction. Tiers:
  - **Tier 1 (day 1):** Paste-text — founder pastes their existing custom instructions / project notes / system prompt.
  - **Tier 2 (week 2):** File upload — supports ChatGPT Data Export ZIP, Claude Project Markdown export, Notion page export, Gemini Gem JSON.
  - **Tier 3 (V2):** Browser-extension auto-pull from Claude Projects, ChatGPT Custom GPTs, Gemini Gems with one-click sync.
- **Curated knowledge corpus:** YC Founder Manual, Sam Altman's startup playbook, Lenny's Newsletter, Pari Passu, public terms-sheet libraries, Charles Hudson on pre-seed, NfX guides. RAG over corpus + user's business memory + pipeline memory.

---

## 5. Build Sequencing — MVP / V2 / V3

### MVP (Weeks 0–10) — "Pitch + Pipeline + Live Raise"

The smallest end-to-end loop a founder can run a raise inside.

| Module | What's in MVP | What's NOT |
|---|---|---|
| Pitch Lab | Deck contradiction reviewer (text) | Voice coach, Q&A drill |
| Investor Pipeline | VC/accelerator match list, application tracker, AI-drafted outreach, AI-drafted application answers, basic warm-intro mapper | Advanced enrichment, contact verification |
| Live Raise | Pre-call brief, transcript ingestion, post-call follow-up, pipeline memory | Live transcription (use existing tools' export) |
| Knowledge Layer | Ambient Q&A inside every module, Knowledge Pack Import (paste-text + file upload) | Browser extension auto-pull |
| Raise Ops | — | SAFE, cap table, F&F tracker |
| Data Room | — | Full module deferred to V2 |
| Legal Stack | — | Full module deferred to V2 |

**Acceptance criteria for MVP:** A founder can sign up, paste their existing AI context to seed memory, upload a deck, get a contradiction review, generate a fit list of 30 VCs and 10 accelerators, draft 5 outreach emails, prepare a pre-call brief for an upcoming meeting, ingest a transcript, and generate a follow-up — all in one session, all under one $49/mo or $199/mo subscription.

### V2 (Weeks 11–22) — "Voice + Data Room + Legal"

| Module | Additions |
|---|---|
| Pitch Lab | Voice pitch coach (60-sec recording, hook/problem/solution/why-you/why-now scoring, voice metrics) |
| Knowledge Layer | Browser-extension auto-pull |
| Data Room | Full module — checklist, Drive orchestration, access analytics, DDQ filler |
| Legal Stack | Full module — vendor recommender, compliance checklist, affiliate links |

### V3 (Weeks 23–36) — "Close the Round"

| Module | Additions |
|---|---|
| Raise Ops | SAFE generator with YC/Cooley templates, cap-table preview (Pre-Carta), Excel export, F&F Round Manager, e-sign integration |
| Knowledge Layer | Investor update generator (post-raise) |

**V4 and beyond (not in scope yet):** Mobile app, investor-side product, post-raise KPI reporting. Decide based on V3 traction.

---

## 6. Pricing Model

### Tiers

| Tier | Price | Audience | Includes |
|---|---|---|---|
| **Pre-Raise** | $49/mo ($39/mo annual) | Founders 30–60 days from raising | Pitch Lab (deck reviewer), Knowledge Layer, Investor Pipeline (browse-only), 5 pre-call briefs/mo |
| **Active Raise** | $199/mo ($159/mo annual, $1,499/quarter) | Founders in active raise | Everything + full Pipeline (outreach + applications) + Live Raise (unlimited briefs + follow-ups) + Pitch Lab voice coach (V2+) + Data Room (V2+) |
| **Close Mode** | $399/mo ($999/quarter) | Founders past first commits | Everything + Raise Ops (SAFE, e-sign, cap-table, F&F tracker) + Legal Stack (V3+) |
| **Alumni** | $19/mo | Closed founders | Investor update generator + memory archive + alumni community access (V3+) |

### Add-ons

- **$499 Founder Audit** — 30-min human-in-the-loop deck + pitch + pipeline review at signup. Available to first 100 customers and beyond. Doubles as dataset/training loop and high-touch onboarding.
- **Affiliate revenue** from Legal Stack vendor partnerships (10-15% of recommended vendor MRR for first 12 months).

### What customers must believe to pay

1. *"This won't embarrass me with investors"* — proof via deck review and pre-call brief quality.
2. *"This knows my business better than ChatGPT"* — proof via memory layer felt depth.
3. *"It saves me 5+ hours a week"* — proof via the live raise loop.
4. *"It's defensibly mine, not training someone else's model"* — proof via privacy posture.

### What we don't do

- **No permanent free tier.** 7-day trial only. Free dilutes the buyer pool with founders who'll never raise.
- **No enterprise pricing at MVP.** If a VC fund or accelerator wants seats for portfolio, charge $20K/year for 25 seats. Don't customize.

---

## 7. GTM Strategy

### Three content pillars (3–5 posts/week between them)

1. **Deck teardowns** — Martins reviews real (anonymized, with consent) decks publicly on LinkedIn/X. Each post = a Trochia output. Highest-shared content category in founder Twitter/LinkedIn.
2. **VC explainers** — "How [Partner X] at [Fund Y] actually evaluates pre-seed deals" — sourced from public posts, podcasts, Trochia's investor data.
3. **Pitch coaching reels (V2+)** — when voice coach ships. Founders share their own scored pitches. Viral surface.

### Distribution channels (priority order)

1. **Accelerator partnerships.** Lock 3 in 90 days: Antler, On Deck Founders, AngelPad. 25–80 active fundraisers per cohort. Free seats for cohort, paid post-demo-day.
2. **Founder communities.** YC Bookface, Indie Hackers, r/startups, founder Slacks/Discords. Build-in-public posts, deck-teardown content.
3. **Founder-facing podcasts.** Lenny's, My First Million, 20VC, Indie Hackers, This Week in Startups.
4. **VC-side partnerships (V2+).** Once we have 1,000 founders, propose "founder readiness" integration with funds that scout pre-seed.
5. **Cooley GO / Stripe Atlas / Mercury.** Affiliate-style integrations — they recommend Trochia in founder onboarding, we recommend them in Legal Stack.

### Sales motion

- **First 10 paid users:** Martins's warm circle (10 founders he knows raising right now). Free for them in exchange for 8 weeks of biweekly structured feedback.
- **First 100 paid users:** 3 accelerator partnerships + 12 LinkedIn deck teardowns + 1 founder podcast appearance. Realistic by month 4.
- **First 1,000 paid users:** Content engine humming + 1 viral moment (voice coach reel or Lenny feature) + 5 accelerator partnerships. M6–M12.

### Founder-led sales script (30-second version)

> "If you're raising, Trochia is your operator. Reviews your deck for contradictions before you send it, builds an investor brief before each call, drafts the follow-up using the actual transcript, and tracks which VCs and accelerators fit your business with auto-drafted application answers. Imports your existing AI context in 30 seconds — you don't rebuild a thing. $49 for the basics, $199 in raise mode. 5-minute setup."

### Proof points before scaling

- $10K MRR
- 30+ founders who closed a round while using Trochia
- 3 named testimonials with logo + headshot
- NPS > 50
- Monthly retention >80% during active raise

---

## 8. Build Approach — Solo with Claude Code

Martins is the sole builder for MVP. The build philosophy is:

1. **Claude Code is the primary builder.** Martins drives, Claude Code writes. Cursor is the secondary IDE for fine-tuning.
2. **AI-native every step.** v0/Lovable for UI prototypes, Perplexity/Exa for research, Gamma for decks, Loom for demos.
3. **Buy boring infra, build the moat.** Auth, payments, transcription, e-sign, monitoring — buy. Deck reviewer, investor matching, pipeline memory, business memory — build.
4. **Ship MVP in 8–10 weeks.** Realistic for a focused solo builder using Claude Code at 2026 capability.
5. **Don't over-engineer.** No microservices at MVP. Single Next.js app + Supabase + a queue. Refactor when load demands.

See `Trochia_AI_Build_Stack_v1.md` for the full tool list and rationale.

---

## 9. Tech Stack Summary

(Full version in build stack doc.)

- **Frontend:** Next.js 15 + TypeScript + Tailwind + shadcn/ui
- **Backend:** Next.js API routes + tRPC + Postgres (Supabase) + pgvector
- **Auth:** Clerk (Google SSO only at MVP)
- **Payments:** Stripe
- **AI:** Claude Opus 4.7 + Sonnet 4.6 + Haiku 4.5 (Anthropic API), GPT-5 fallback
- **Transcription:** Deepgram Nova-3
- **Voice analytics (V2):** Hume AI prosody
- **Memory infra:** pgvector + custom schema (don't rely on Mem0/Letta — own the spine)
- **Integrations:** MCP servers for Gmail, Calendar, Drive, Notion + Composio fallback
- **Investor data:** Harmonic API (primary), Crunchbase (secondary)
- **E-sign (V3):** Dropbox Sign API
- **Hosting:** Vercel + Supabase (US + EU regions)
- **Observability:** PostHog + Sentry
- **Email:** Resend

---

## 10. Risks & Compliance Posture

### Critical risks

| Risk | Mitigation |
|---|---|
| **UPL exposure on SAFE generator** | YC standard templates only. Deterministic variable substitution. Quarterly law-firm review. UPL-clean disclaimer in product. Founder e-signs only after explicit "I have reviewed / I have a lawyer" gate. |
| **"Rolling fund" regulatory landmine** | Permanently banned from product copy. Use "F&F Round Manager," "First $500K Tracker," "Pre-Carta cap table." Explicit copy: "Trochia is not an investment vehicle, broker-dealer, or investment adviser." |
| **Legal Stack interpreted as legal advice** | Vendor recommender framing only. Never recommend specific clauses. Affiliate disclosure visible. |
| **Founder distraction from Clockvest** | Either operator co-founder is assigned by week 4, or Conservative timeline (30 months) is accepted. |
| **Investor data scraping (LinkedIn, etc.)** | Use Harmonic/Crunchbase APIs. Founders bring their own LinkedIn cookies for warm-intro mapping. No bulk-scrape. |
| **Carta/Pulley ships founder-side AI module** | Move faster, own the founder narrative, integrate before they do. |
| **OpenAI/Anthropic ship a fundraise template** | Vertical depth + proprietary investor data + community keep us ahead. Be first and be specific. |
| **Customer privacy breach (deck or investor data leaked)** | SOC 2 Type I within 12 months. Encryption at rest. Tenant isolation. No training on customer data. Written DPAs. |

### Compliance principles (non-negotiable)

1. **No legal advice, ever.** Always "templates and recommendations" + lawyer disclaimer.
2. **No "rolling fund," ever.** Regulated SEC term. Banned.
3. **No "investment advice," ever.** We don't recommend whether to take a deal or not.
4. **No customer data in model training.** Stated publicly. Enforced contractually with API providers.
5. **Founder approves all external sends.** No autonomous outreach to investors at MVP.
6. **GDPR + DPDP compliant.** EU founders get EU data residency from M6. Indian founders get DPDP-compliant data handling.

---

## 11. Naming & Brand Notes

**Name:** Trochia AI

**Etymology:** Greek τροχιά (trochiá) — track, path, trajectory, orbit, course. Root family with τροχός (wheel) and τροχιλεία (pulley). The metaphor: Trochia orchestrates the trajectory of your raise.

**Tagline:** *"Trochia AI — the agentic operator for your raise."*

**Pronunciation:** TROH-kee-ah (preferred). Alternative: TROH-shuh.

**Action items before commitment:**
- Trademark search (USPTO + EU + India) — 30 minutes.
- Domain availability check — trochia.ai or trochia.com primary.
- Verify no fundraising/legaltech/fintech competitor uses this name.

**Brand voice:** Operator, not assistant. Direct, founder-grade. No emoji-spam. No "AI buddy" tone.

**Visual identity (TBD):** Decide post-MVP-validation. Not at MVP — placeholder mark only.

---

## 12. Action Plan

### First 30 days

1. Trademark + domain check on "Trochia" (24 hours).
2. Decide the operator: Martins part-time or co-founder full-time. **No code before this is resolved.**
3. Interview 25 founders currently raising. Validate pain ranking across the 7 modules. Don't pitch — diagnose.
4. Write v1 deck-reviewer prompt + investor-match algorithm spec + application-drafter prompt. Test on 10 anonymized real cases.
5. Set up dev environment: Claude Code + Cursor + Supabase + Vercel + Anthropic API key.
6. Land 5 design partners willing to use a v0 free for 8 weeks.
7. Open conversation with Cooley GO and one fintech-friendly boutique law firm for eventual SAFE template partnership.
8. Reserve trademark and domain.

### First 90 days

1. Ship MVP (Pitch Lab text + Investor Pipeline + Live Raise + Knowledge Layer with Knowledge Pack Import).
2. Convert 25 design partners to paid at $39/$159 introductory pricing.
3. Lock 1 accelerator partnership (Antler or On Deck most realistic).
4. Publish 12 LinkedIn deck teardowns (Martins-led, 1×/week).
5. Hit $15K MRR.
6. Begin V2 voice-coach prototype (Deepgram + Hume + Claude scoring).

### First 180 days

1. Ship V2 (voice coach + Data Room + Legal Stack).
2. 700 paying founders → ~$1.4M ARR run-rate.
3. 3 accelerator partnerships.
4. SOC 2 Type I in motion.
5. Begin V3 prototype (SAFE + cap table) with law-firm partner review.

---

## 13. Open Decisions

These are unresolved and need explicit calls before / during the first 30 days:

1. **Operator assignment.** Martins part-time or dedicated co-founder? Resolves before any code.
2. **Trochia name lock-in.** Trademark + domain check pass → commit. Fail → pivot within 24 hours.
3. **Geography focus at launch.** US-first or US + UK + India simultaneously? Recommendation: US-first for MVP, expand at V2.
4. **Pre-Raise tier price test.** $49 vs. $39 vs. $59. A/B test M3–M6.
5. **Free Founder Audit limit.** First 100 (recommended) vs. first 50 vs. unlimited. Recommendation: first 100 only.
6. **Accelerator anchor partner.** Antler vs. On Deck vs. AngelPad. Pick one, build the relationship deep.
7. **Law-firm template partner.** Cooley GO (free, scaleable) vs. boutique (custom, more flexible). Recommendation: Cooley GO at MVP, boutique at V3 when SAFE generator ships.

---

## 14. What We Killed (Decision Log)

For posterity — these were proposed and rejected:

- **Avatar / "name your AI" UX** — cosmetic, doesn't move retention.
- **Mobile app at MVP** — founders raise from laptops. Defer to V4.
- **AI joins call as primary speaker / pitches with own voice** — buyers reject category.
- **GitHub repo skill absorption** — not a consumer feature.
- **Autonomous browser operator** — Anthropic Computer Use / OpenAI Operator will eat this.
- **Multi-vertical positioning at MVP** — beginners + intermediates + founders + marketers + creators + designers + operators = "no one."
- **Document loophole / legal-language detector** — legaltech is its own war (Harvey, Spellbook, Ironclad).
- **Autonomous overnight research with morning briefings** — cute, not why people pay.
- **"Rolling fund" feature naming** — regulated SEC term, never use.
- **Generic fundraising Q&A as standalone feature** — demoted to ambient layer inside other modules.

---

## 15. Decision-Making Rules (for future chats)

When future product or build decisions arise, default to these rules:

1. **Narrow > broad.** When tempted to expand ICP or feature set, don't.
2. **Frequency > value-per-event.** Build for daily-use features first, high-stakes-but-rare features later.
3. **Memory is the moat.** Every feature must read from and write to the shared spine.
4. **Founder-approved external action.** No autonomous send/post/payment until V4+.
5. **Buy infra, build moat.** If a category has 3+ proven vendors, buy. If not, build.
6. **Ship in weeks, not months.** Default to the lightest version that proves the loop.
7. **Compliance first on regulated language.** When in doubt, the lawyer's word > the marketer's word.

---

*End of strategy document. This is the canonical reference. When in conflict with a future chat output, this document wins until explicitly updated.*
