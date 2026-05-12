# Trochia AI — Build Stack & Tooling

**Version:** 2.0 — Claude-Code-Native
**Owner:** Martins Ejeheri (solo builder)
**Status:** Active — informs all engineering decisions
**Supersedes:** Trochia_AI_Build_Stack_v1.md
**Companion:** Claude_Code_Full_Stack_Infrastructure_Reference.pdf (the canonical infra map)

This document is rewritten to lean on Martins's Claude Code installation (1524 skills, 222 subagents, ~20 MCP servers, 22 plugins, GSD + Superpowers workflows) as the primary build platform. Every tool decision below is evaluated against "is it already in Claude Code or do we actually need to pay for it externally?"

---

## Build philosophy (v2)

1. **Claude Code is the builder, Martins is the architect.** Plan in plain English, ship in subagents.
2. **Use GSD + Superpowers as the workflow spine.** Every Trochia module follows `/gsd-plan-phase → /gsd-execute-phase → /gsd-code-review → /gsd-secure-phase → /gsd-ship`. No ad-hoc building.
3. **Subagents liberally.** Backend Architect, Frontend Developer, AI Engineer, Voice AI Integration Engineer, MCP Builder, Code Reviewer all run in parallel on isolated worktrees.
4. **Prefer MCP servers and Skills over paid tools.** Default check: "does the Claude Code infra already cover this?" before adding a line item.
5. **Buy infrastructure that's truly external.** Auth, DB, payments, transcription, voice analytics, investor data, e-sign — buy. Everything else, build with the agents/skills.
6. **One Next.js monolith.** No microservices at MVP.
7. **Type safety end-to-end.** TypeScript + tRPC + Zod.
8. **No vendor lock-in on the model layer.** Codex bridge available for GPT-5 fallback via `codex:rescue`.
9. **Prompt caching enforced from day 1.** The `claude-api` skill mandates this — saves 30–50% on production tokens.

---

## Tier 1: Models & development environment

| Tool | Role | Cost (2026) | Why |
|---|---|---|---|
| **Claude Code (Max plan)** | Primary development agent. Drives implementation, planning, debugging, code review. | Claude Max ~$200/mo (includes Opus 4.7 access, 1M context) | Covers nearly all build-time AI usage. |
| **Claude Opus 4.7 (1M ctx)** | Planning, large-codebase reasoning, multi-file refactors, deep architecture | Included in Max | Default for `/gsd-plan-phase`, schema design, architecture work |
| **Claude Opus 4.6 (Fast mode)** | Interactive coding, snappy edits | Included in Max | Toggle via `/fast` for everyday work |
| **Claude Sonnet 4.6** | High-volume subagents, production AI features | API: ~$3/M in, $15/M out | Workhorse for `gsd-executor`, Trochia's production AI |
| **Claude Haiku 4.5** | Cheap classification, status polling, fan-out subagents | API: ~$1/M in, $5/M out | Use for cost-sensitive production calls (basic Q&A, deck-issue classification) |
| **Codex bridge (GPT-5 fallback)** | Second-pass implementation, stuck-task rescue | OpenAI API ~$10/M in, $40/M out | Use sparingly via `codex:rescue` for hard problems |
| **Cursor** | Secondary IDE for fine-tuning, manual edits | $20/mo Pro | Complementary to Claude Code |
| **GitHub** | Source control + CI/CD | $4/mo + free Actions allowance | Standard. Use the `github` MCP for direct issue/PR ops. |
| **Linear** | Issue tracking | Already wired via Linear MCP | Skip the $8/mo paid plan if Linear MCP is enough for solo |
| **1Password** | Secret management | $3/mo | Non-negotiable hygiene |
| **Raycast** | Productivity hub | Free / $8/mo Pro | Friction reducer |

**Subtotal Tier 1:** ~$235/mo (was $245)

---

## Tier 2: Frontend stack

All free open source. Same as v1.

| Tool | Role | Cost |
|---|---|---|
| Next.js 15 | React framework | Free |
| TypeScript | Type safety | Free |
| Tailwind CSS | Styling | Free |
| shadcn/ui | Component library | Free |
| Radix UI | Headless primitives | Free |
| Lucide React | Icons | Free |
| react-hook-form + Zod | Forms + validation | Free |
| TanStack Query | Server state | Free |
| Framer Motion | Animations (use sparingly) | Free |

**Subtotal Tier 2:** $0/mo

**UI generation force multipliers (already in Claude Code infra):**
- `magic` MCP (21st.dev) — generate React + Tailwind + shadcn components from prompts
- `stitch` MCP (Google Stitch) — generate full app screens / design systems from text
- `figma` MCP (plugin) — design-to-code workflow with `get_design_context`, `generate_figma_design`, code-connect
- `frontend-design` skill (claude-plugins-official)
- `shadcn` skill
- `tailwind-design-system` skill
- `nextjs-app-router-patterns`, `react-nextjs-development`, `react-patterns`, `react-state-management` skills

→ **No v0 or Lovable subscription needed.** −$20/mo vs. v1.

---

## Tier 3: Backend / data layer

| Tool | Role | Cost (2026) | Why |
|---|---|---|---|
| Next.js API routes | Backend endpoints | Free | Monolith |
| tRPC | Type-safe API | Free | End-to-end TS |
| **Supabase** | Postgres + auth + storage + realtime | Free → $25/mo Pro at scale | Postgres + 1-click |
| **pgvector** | Vector search inside Postgres | Free | The `vector-database-engineer` skill enforces this — don't pay for Pinecone |
| Drizzle ORM | Type-safe SQL | Free | Lighter than Prisma |
| **Inngest** | Background jobs, queues | Free → $20/mo at scale | The `inngest` skill is wired up |
| Upstash Redis | Rate limiting, caching | Free → ~$10/mo | Pay-per-request |

**Subtotal Tier 3:** $25–$55/mo (unchanged)

**Backend skills available in Claude Code:**
- `nodejs-backend-patterns`, `nodejs-best-practices`
- `postgresql`, `postgresql-optimization`, `postgres-best-practices`
- `nextjs-supabase-auth`, `supabase-automation`
- `trpc-fullstack`
- `inngest`, `trigger-dev`, `upstash-qstash`
- `saas-multi-tenant`, `saas-mvp-launcher`

**Backend agents to spawn:**
- Backend Architect (schema design, API design)
- Database Optimizer (query tuning, index strategy)
- DevOps Automator (CI/CD)

---

## Tier 4: AI / ML stack

| Tool | Role | Cost (2026) | Why |
|---|---|---|---|
| **Anthropic API** | Production AI calls (deck reviewer, brief generator, follow-up writer, Pitch Lab scoring) | Pay-as-you-go | Same model lineup as Claude Code: Opus 4.7 / Sonnet 4.6 / Haiku 4.5 |
| **OpenAI API** | Codex bridge fallback only | Pay-as-you-go | Via `codex:rescue` for stuck tasks |
| **Voyage AI** (or Cohere Embed) | Embeddings for memory + corpus | ~$0.12/M tokens | Better than ada for retrieval |
| **Deepgram Nova-3** | Audio transcription | ~$0.0043/min | V2 voice coach + Live Raise transcript ingestion |
| **Hume AI** | Voice prosody (pace, energy, pause) | ~$0.10/min | V2 voice coach |
| **LlamaParse** | PDF / PPT extraction | Free tier → ~$20/mo | Deck reviewer, DDQ filler |

**Estimated AI cost at 100 paying users:** ~$200–$500/mo (lower than v1's $300–$800 because prompt caching is enforced via the `claude-api` skill — saves 30–50% on production tokens for repeated context like Business Memory)

**Critical AI skills available in Claude Code:**
- `claude-api` — Anthropic SDK + prompt caching (MANDATORY for cost control)
- `llm-application-dev-ai-assistant`, `llm-application-dev-prompt-optimize`
- `llm-structured-output` — for the deck reviewer, scorecard generator
- `prompt-engineering`, `prompt-engineering-patterns`, `prompt-caching`, `prompt-library`
- `rag-implementation`, `embedding-strategies`, `hybrid-search-implementation`
- `vector-database-engineer`, `vector-index-tuning`, `similarity-search-patterns`
- `llm-evaluation`, `advanced-evaluation`, `agent-evaluation` — for the Pitch Lab eval harness
- `llm-ops`, `langfuse` — production AI monitoring
- `autonomous-agent-patterns`, `multi-agent-patterns`, `agent-orchestration-patterns`
- `voice-ai-development`, `voice-ai-engine-development`, `voice-agents` — V2 voice coach

**Critical AI agents to spawn:**
- **AI Engineer** — production LLM features, eval harness setup
- **Voice AI Integration Engineer** — V2 voice coach pipeline (Whisper-style transcription, ASR cleanup, speaker handling)
- **MCP Builder** — if Trochia needs custom MCP servers for partner integrations (e.g., Granola/Otter)
- **AI Data Remediation Engineer** — production data quality on user-submitted decks
- **Identity Graph Operator** — multi-source investor identity resolution (Harmonic + LinkedIn + Crunchbase)

---

## Tier 5: Integrations & data — heavily simplified via MCP

This tier is where the Claude Code infra changes the math most.

### Already in Claude Code (zero additional cost)

| Integration | How it's wired | Use for |
|---|---|---|
| **Gmail** | `Gmail` claude.ai connector | Live Raise follow-up sending (founder-approved), warm-intro mapper |
| **Google Calendar** | `Google Calendar` claude.ai connector | Pre-call brief auto-trigger, application deadlines |
| **Google Drive** | `Google Drive` claude.ai connector | V2 Data Room orchestration |
| **GitHub** | `github` MCP server | Source control automation |
| **Linear** | `Linear` claude.ai connector | Internal task tracking |
| **Sentry** | `Sentry` claude.ai connector | Error monitoring, Seer analysis |
| **Amplitude** | `Amplitude` claude.ai connector | Product analytics, replays, feedback insights |
| **Airtable** | `Airtable` claude.ai connector | Optional founder-side CRM export |
| **Web scraping (Apify Actors)** | `apify` MCP — thousands of scrapers | Investor research, partner bios, scraping VC websites within ToS |
| **Web scraping (Firecrawl)** | `firecrawl` MCP — scrape, search, crawl, structured extract | VC partner bios, podcast transcript extraction |
| **Browser automation** | `playwright` MCP — full browser control | LinkedIn warm-intro flow, deck-export from Google Slides, e-sign envelope tracking |
| **Memory / cross-session** | `episodic-memory` + `private-journal-mcp` | Build-time memory of decisions; production memory uses pgvector |
| **Library docs** | `context7` MCP — live, version-correct docs | During build — never code from stale memory |
| **UI generation** | `magic` MCP + `stitch` MCP | UI prototyping |
| **Image generation** | `nano-banana` MCP (Gemini) + Higgsfield connector | Marketing creative, social content |
| **Design tools** | `figma` MCP + `canva` MCP + Adobe connectors | Marketing/social/brand assets |
| **Sequential reasoning** | `sequential-thinking` MCP | Hard multi-step logic (cap-table dilution waterfall) |

### Still external (real cost, not covered by Claude Code)

| Tool | Role | Cost (2026) | Why |
|---|---|---|---|
| **Harmonic API** | Investor data (funds, partners, portfolio) | ~$300–$1,500/mo | Primary investor intelligence — not in MCP set |
| **Crunchbase API** | Investor data fallback | ~$400–$1,000/mo | Skip until $50K MRR |
| **Apollo.io API** | Contact verification | $50/mo Basic | Application tracker contact data |
| **Exa** | Semantic web search | $10/mo → PAYG | Better than Google for AI; complements `apify`/`firecrawl` |
| **Dropbox Sign API** | E-signature for SAFEs (V3) | $20/mo + per-signature | Required for V3 Raise Ops |

**Subtotal Tier 5 at MVP:** ~$60/mo. **V2+:** add Harmonic ~$500/mo. **V3+:** add Dropbox Sign ~$50/mo.

→ **No Composio subscription needed.** −$49/mo vs. v1.

---

## Tier 6: Auth, payments, billing

| Tool | Role | Cost |
|---|---|---|
| **Supabase Auth** (recommended at MVP) | Auth (Google SSO + magic link) | Free | Saves $25/mo over Clerk; `nextjs-supabase-auth` skill handles wiring |
| Clerk (alternative) | If you want faster DX | $25/mo + $0.02/MAU | Skip at MVP |
| **Stripe** | Payments + subscriptions | 2.9% + $0.30/tx | Standard. `stripe-integration` skill handles wiring. |
| **Stripe Tax** | VAT/sales tax | 0.5% per tx | Necessary internationally |

**Subtotal Tier 6:** Just per-transaction fees at MVP.

→ Versus v1: −$25/mo by going Supabase Auth instead of Clerk.

---

## Tier 7: Email, comms, transactional

| Tool | Role | Cost |
|---|---|---|
| **Resend** | Transactional email | Free up to 3K/mo → $20/mo | Standard. `sendgrid-automation` and `resend`-pattern skills exist. |
| **Amplitude** (claude.ai connector) | Product analytics | Already wired | Replaces PostHog for product analytics |
| **PostHog** (optional) | Feature flags + session replay | Free up to 1M events | Only if Amplitude's replay isn't enough; otherwise skip |
| **Sentry** (claude.ai connector) | Error monitoring | Already wired | Free via connector — pay only at scale |

**Subtotal Tier 7:** ~$20/mo at MVP. Was $20–$70 in v1. PostHog is now optional.

→ Versus v1: potentially −$50/mo by leaning on Amplitude connector.

---

## Tier 8: Hosting & infrastructure

Unchanged.

| Tool | Role | Cost |
|---|---|---|
| **Vercel** | Hosting | Hobby free → $20/mo Pro at scale |
| **Cloudflare** | DNS + WAF | Free → $20/mo Pro |
| **Supabase Storage** | File storage | Included with Pro |

**Subtotal Tier 8:** $20–$45/mo

---

## Tier 9: Solo founder force multipliers

Significant overlap with Claude Code infra. Trim aggressively.

| Tool | Role | Cost | Verdict |
|---|---|---|---|
| ~~v0 by Vercel~~ | UI prototyping | ~~$20/mo~~ | **REMOVE** — `magic` + `stitch` MCP cover this |
| ~~Lovable~~ | Full-app prototyping | ~~$20/mo~~ | **REMOVE** — `magic` + Claude Code |
| **Figma** | Design refinement | Free → $15/mo Pro | Keep, paired with `figma` MCP |
| **Perplexity Pro** | Research | $20/mo | Keep — complements `firecrawl`/`exa`; better for live competitive intel |
| **Gamma** | Decks | $10/mo | Keep — your fundraising deck lives here (also has `gamma`-style skills in CC) |
| **Loom** | Demo videos | Free → $15/mo | Keep — 2-min Loom is the demo strategy |
| **CapCut** | Video editing | Free | Keep |
| **Beehiiv** (V2+) | Newsletter | Free → $39/mo | Defer to V2 |
| **Tally** | Forms (design partner intake) | Free → $29/mo | Free tier OK |
| **Cal.com** | Scheduling | Free → $15/mo | Free OK |
| **Granola** (own use) | Meeting notes for your calls | $18/mo | Keep — eat your own dog food |

**Subtotal Tier 9:** ~$70–$100/mo (was $100–$180)

→ Versus v1: −$30–$80/mo by removing v0/Lovable.

---

## Tier 10: Compliance, legal, ops

Mostly unchanged. The `compliance-auditor`, `privacy-by-design`, `privacy-policy`, `pci-compliance`, `security-audit`, and `security-compliance-compliance-check` skills will help prep for SOC 2.

| Tool | Role | Cost |
|---|---|---|
| **Vanta** | SOC 2 automation | $7K–$15K/year (start at V2/M12) |
| **Mercury** | Banking | Free |
| **Stripe Atlas / Clerky** | If Trochia incorporates separately | $500–$800 one-time |
| **Pilot.com / Bench** | Bookkeeping | $300–$700/mo (start at $25K MRR) |

**Compliance agents to spawn:**
- Compliance Auditor — SOC 2 Type I prep
- Security Engineer — threat modeling SAFE generator, e-sign flow
- `gsd-security-auditor` — verifies threat mitigations from PLAN.md against shipped code

---

## Updated cost summary

### MVP build phase (months 0–3)
- Tier 1 (dev): ~$235/mo
- Tier 2 (frontend): $0
- Tier 3 (backend): ~$25/mo
- Tier 4 (AI production): ~$50–$200/mo (low usage; prompt caching active)
- Tier 5 (integrations): ~$60/mo (down from $100 — most MCP via Claude Code)
- Tier 6 (auth/payments): just per-tx fees (Supabase Auth, not Clerk)
- Tier 7 (email/analytics): ~$20/mo (Amplitude via connector)
- Tier 8 (hosting): ~$20/mo
- Tier 9 (force multipliers): ~$70/mo (removed v0/Lovable)
- Tier 10 (compliance): ~$20/mo

**Total burn at MVP build: ~$500–$650/mo.** Was $565–$715 in v1.

### Post-launch (months 3–6, ~50 paying users)
- AI costs scale to ~$200–$400/mo (prompt caching pays off here)
- Harmonic API kicks in at V2 → +$500/mo
- Other tools stable

**Total burn at 50 customers: ~$900–$1,500/mo** against ~$5K–$10K MRR. Healthy positive contribution.

### V2/V3 launch (Weeks 23–36, ~300 paying users)
- AI costs ~$1,200/mo (V3 SAFE / cap-table workflows are deterministic — minimal LLM cost)
- Vanta SOC 2 prep kicks in (~$1,000/mo amortized)
- Dropbox Sign (~$50/mo + per-signature)

**Total burn at 300 customers: ~$3,500/mo** against ~$50K MRR.

---

## Updated build sequence — GSD-native

Every phase uses the GSD pipeline + Superpowers + specific subagents. This replaces the ad-hoc week-by-week sequence in v1.

### Project kickoff (Week 0)
```
/gsd-new-project trochia
  → spawns gsd-project-researcher × 4 in parallel
  → produces SUMMARY.md, ROADMAP.md
  → seeds .planning/intel/ with domain knowledge
```

### Phase 0: Foundation (Weeks 1–2)
- `/gsd-plan-phase foundation` → produces PLAN.md with task breakdown
- Subagents: Backend Architect, DevOps Automator
- Skills: `nextjs-app-router-patterns`, `nextjs-supabase-auth`, `stripe-integration`, `tailwind-design-system`, `saas-multi-tenant`
- MCP servers: `github` (repo), `context7` (live docs)
- Exit gate: auth + billing + marketing site live; `/gsd-verify-work` passes

### Phase 1: Knowledge Layer + Memory (Weeks 3–4)
- `/gsd-plan-phase knowledge-layer`
- Subagents: AI Engineer, Backend Architect, MCP Builder (for Knowledge Pack Import parsers)
- Skills: `claude-api` (prompt caching mandatory), `rag-implementation`, `embedding-strategies`, `vector-database-engineer`, `llm-structured-output`, `prompt-engineering-patterns`
- MCP servers: `context7` for library docs
- Exit gate: a founder pastes ChatGPT context → confirmed Business Memory in <5 min

### Phase 2: Pitch Lab — Deck Reviewer (Weeks 5–6)
- `/gsd-plan-phase pitch-lab-deck`
- Subagents: AI Engineer, Code Reviewer
- Skills: `claude-api`, `llm-structured-output`, `prompt-engineering-patterns`, `advanced-evaluation` (eval harness from day 1)
- Skills for PDF/PPT parsing: use LlamaParse or `pdf` / `pdf-official` skills
- Exit gate: 12-slide deck → 5–15 issues flagged in <90 sec; eval harness shows <25% false positive rate

### Phase 3: Investor Pipeline (Weeks 7–8)
- `/gsd-plan-phase investor-pipeline`
- Subagents: AI Engineer, Backend Architect, Identity Graph Operator (for multi-source investor identity), Email Intelligence Engineer (for outreach drafter)
- Skills: `claude-api`, `linkedin-automation` (warm-intro mapper), `gmail-automation` (via connector), `rag-implementation`
- MCP servers: `apify` (investor research scrapers), `firecrawl` (VC website + podcast scraping), `playwright` (LinkedIn flow within ToS)
- Exit gate: 30-VC fit list + outreach drafted + first application drafted in <3 min total

### Phase 4: Live Raise (Weeks 9–10) — MVP soft launch
- `/gsd-plan-phase live-raise`
- Subagents: AI Engineer, Voice AI Integration Engineer (for transcript handling)
- Skills: `claude-api`, `llm-structured-output`, `email-intelligence`
- MCP servers: `gmail` connector, `google-calendar` connector
- Exit gate: pre-call brief + transcript ingestion + follow-up + pipeline update; `/gsd-ship`; 25 design partners onboarded

### Phase 5: V2 Voice Pitch Coach (Weeks 11–14)
- `/gsd-plan-phase voice-pitch-coach`
- Subagents: **Voice AI Integration Engineer**, AI Engineer, UI Designer
- Skills: `voice-ai-development`, `voice-ai-engine-development`, `voice-agents`, `claude-api`, `llm-structured-output`
- External APIs: Deepgram Nova-3, Hume AI
- Exit gate: 60-sec pitch → scorecard in <30 sec; >90% filler-word detection accuracy

### Phase 6: V2 Data Room (Weeks 15–18)
- `/gsd-plan-phase data-room`
- Subagents: Backend Architect, AI Engineer, Frontend Developer
- Skills: `pdf` / `pdf-official` / `docx` / `xlsx` (DDQ parsing/filling), `claude-api`, `llm-structured-output`
- MCP servers: `Google Drive` connector (drive.file scope only)
- Exit gate: fintech founder generates checklist → Drive folder structure → shares with 1 investor; all <5 min

### Phase 7: V2 Legal Stack (Weeks 19–22)
- `/gsd-plan-phase legal-stack`
- Subagents: AI Engineer, Frontend Developer; **Compliance Auditor** spot-checks UPL language
- Skills: `claude-api`, `legal-advisor` (use with extra UPL caution — disclaimer scaffolding only, never specific advice), `privacy-by-design`, `privacy-policy`
- Exit gate: vendor recommender ships across 8 categories; affiliate tracking live for 10+ vendors

### Phase 8: V3 Raise Ops core — SAFE + Cap Table (Weeks 23–28)
- `/gsd-plan-phase raise-ops-core`
- Subagents: Backend Architect, Senior Project Manager (deterministic math), **Security Engineer** (audit the variable substitution engine), Compliance Auditor (UPL gate verification)
- Skills: `docx` / `docx-official` (SAFE PDF + Word generation), `xlsx` / `xlsx-official` (cap-table Excel export), `sequential-thinking` MCP (dilution math reasoning)
- Critical: cap-table math goes through unit tests (test-driven-development skill), NOT an LLM
- Exit gate: SAFE generates deterministically; cap-table math matches a 30-scenario spreadsheet; Excel export opens cleanly in Excel/Sheets

### Phase 9: V3 F&F Round Manager + E-Sign (Weeks 29–32)
- `/gsd-plan-phase ff-and-esign`
- Subagents: Backend Architect, Frontend Developer, Compliance Auditor (verify zero use of "rolling fund" anywhere)
- Skills: `stripe-integration` (for any payment hooks), `claude-api`
- External APIs: Dropbox Sign
- Exit gate: founder sends SAFE → investor signs on mobile → cap table updates in <30 sec

### Phase 10: V3 Polish + Public Launch (Weeks 33–36)
- `/gsd-ship` to production
- Subagents: Marketing/content agents from Claude Code infra for launch content (Content Creator, Growth Hacker, social platform strategists)
- Skills: `landing-page-generator`, `page-cro`, `value-prop-statements`, `pricing-strategy`
- Exit gate: all 4 tiers live; $50K MRR target; 3 accelerator partnerships locked; SOC 2 Type I prep in progress

---

## Workflow rules (from CLAUDE.md, non-negotiable)

1. **Plan-first.** Any non-trivial task starts in Plan Mode. No edits until plan is approved.
2. **Subagents liberally.** Don't pollute main context with exploration. Spawn `Explore` and `Plan` subagents in worktrees.
3. **Verify before done.** Tests pass + diffs reviewed + logs clean before any `/gsd-ship`.
4. **Self-improvement loop.** Lessons captured in `tasks/lessons.md` after each phase.
5. **Demand elegance.** Code review is mandatory via `/gsd-code-review` or `code-review` skill.
6. **Autonomous bug-fixing.** Use `/gsd-debug` for production issues.
7. **`tasks/todo.md` workflow.** Track all work in this file; agents read/write it.

---

## Things we're NOT using (and why)

Same exclusions as v1, plus:

| Tool | Why not |
|---|---|
| Composio | Native MCP servers cover everything we need |
| v0 by Vercel | `magic` + `stitch` MCP do this |
| Lovable | Same |
| Mem0 / Letta | `episodic-memory` MCP + custom Postgres memory schema |
| Pinecone / Weaviate | pgvector + `vector-database-engineer` skill |
| Algolia | pgvector full-text search is enough |
| Webflow / Framer | Marketing site in same Next.js repo |
| Auth0 | Supabase Auth handles MVP fine |
| Datadog | Sentry + Amplitude connector enough until 1K+ customers |
| Salesforce / HubSpot | Airtable connector + Linear handle CRM-lite |
| Twilio | No SMS at MVP |
| Mixpanel | Amplitude connector replaces it |
| Separate vector DB | pgvector |

---

## Critical reminders for the solo build

1. **Use `/gsd-plan-phase` before EVERY phase.** Don't improvise.
2. **`claude-api` skill is mandatory.** Enforces prompt caching — single biggest cost lever.
3. **Spawn subagents in worktrees.** Run Backend Architect + Frontend Developer + AI Engineer in parallel for each phase.
4. **Compliance Auditor spot-checks UPL language at V2 and V3.** Non-negotiable.
5. **Security Engineer audits the SAFE variable substitution engine.** A single string-injection bug here is catastrophic.
6. **Eval harness from day 1 for AI features.** `advanced-evaluation` / `llm-evaluation` / `agent-evaluation` skills set this up.
7. **No premature optimization.** Pgvector handles 10M+ vectors. Postgres handles 100K+ users. Refactor when load demands.
8. **`gsd-verify-work` before every `gsd-ship`.** Goal-backward analysis catches "tasks completed but goal not met" bugs.

---

*End of build stack v2. The Claude Code infrastructure reference (`Claude_Code_Full_Stack_Infrastructure_Reference.pdf`) is the canonical map of what's available; this document is the Trochia-specific application of it. Update version when adding/removing major tools or changing the GSD sequence.*
