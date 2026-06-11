# Trochia AI — Project Build Instructions

This file extends `~/.claude/CLAUDE.md` (global). Global rules apply. Project rules override on conflict.

---

## What Trochia is

The agentic operator for a founder's raise — from F&F through Series A. One product, seven modules (Knowledge Layer, Pitch Lab, Investor Pipeline, Live Raise, Data Room, Legal Stack, Raise Ops), one shared memory spine. Solo build over ~36–50 weeks. Soft launch to 25 design partners at Phase 5 (Week ~10–14).

**Pricing tiers:** $49 Pre-Raise / $199 Active Raise / $399 Close Mode / $19 Alumni.

---

## Canonical source documents (subagents MUST read before planning)

Every `/gsd-plan-phase` and every UI/architecture subagent reads these in order:

| File | Purpose |
|---|---|
| `tasks/constraints.md` | Non-negotiable Trochia-specific build constraints |
| `.planning/PROJECT.md` | Project scope + goals |
| `.planning/ROADMAP.md` | 11-phase build sequence |
| `.planning/REQUIREMENTS.md` | 75 requirements with traceability |
| `.planning/intel/Trochia_AI_Strategy_v1.md` | Strategic context |
| `.planning/intel/Trochia_AI_Build_Stack_v2.md` | Build tooling + per-phase skill priorities |
| `.planning/intel/Trochia_AI_PRD_v2.docx` | Full product spec |
| `docs/BRAND.md` | Brand system spec (tokens, typography, voice) — v1.1 |
| `docs/design/DESIGN.md` | **Canonical design system** — Dialog layout/experience system on Trochia tokens: components, motion, conflict register. Supersedes `docs/DESIGN-REFERENCE.md` (deprecated, history only). |
| `docs/BRAND-PACK-README.md` | Asset inventory + install/usage notes |

**Any UI-track subagent that does not read both `BRAND.md` AND `docs/design/DESIGN.md` before planning is in violation.**

---

## Build sequence

Per `Trochia_AI_Build_Stack_v2.md`, 11 vertical-MVP phases:

| # | Phase | Mode |
|---|---|---|
| 0 | Foundation (auth, billing, schema, infra, design system, marketing site, app shell) | MVP |
| 1 | (was renamed Phase 1 in roadmap) Knowledge Layer + Memory | MVP |
| 2 | Pitch Lab — Deck Reviewer | MVP |
| 3 | Investor Pipeline | MVP |
| 4 | Live Raise — **MVP soft-launch checkpoint (HARD go/no-go)** | MVP |
| 5 | Voice Pitch Coach + Q&A Drill + Browser Ext | V2 |
| 6 | Data Room Orchestration | V2 |
| 7 | Legal Stack Recommender + EU Residency | V2 |
| 8 | Raise Ops Core — SAFE + Cap Table | V3 |
| 9 | F&F Round Manager + E-Sign | V3 |
| 10 | Polish + Close Mode + Alumni + Public Launch | V3 |

**Phase 4 (Live Raise) is the MVP soft-launch checkpoint.** If 25 design partners don't hit activation thresholds, fall back to PRD v1 (MVP-only) — don't proceed to V2/V3.

---

## Stack (Trochia-specific overrides to global defaults)

| Layer | Choice |
|---|---|
| Framework | Next.js 16.x (or 15 pinned, upgrade before V2) |
| Database | Supabase Postgres + pgvector (HNSW) |
| ORM | Drizzle 0.44 |
| Schemas | Zod v4 |
| API | tRPC v11 |
| Background jobs | Inngest v4 |
| AI | Anthropic via single `ai/client.ts` chokepoint; prompt caching mandatory |
| Embeddings | Voyage |
| Observability | Langfuse + Sentry + Amplitude (via connectors) |
| Auth | Supabase Auth (Google SSO + magic link) |
| Payments | Stripe |
| Email | Resend |
| Hosting | Vercel |
| Testing | Vitest + Playwright + MSW |
| Doc generation | docxtemplater + Gotenberg/LibreOffice (SAFE PDF); @react-pdf/renderer (briefs/scorecards); ExcelJS (cap-table) |
| Voice (Phase 5) | Deepgram Nova-3 + Web Audio MediaRecorder + custom filler detector. **No Hume** (sunset ~June 2026). |

---

## URLs + env

| Stage | URL |
|---|---|
| Build | `https://trochia.asranest.com` |
| Post-domain-acquisition | `https://trochia.ai` |

All references via `process.env.NEXT_PUBLIC_SITE_URL` or `NEXT_PUBLIC_APP_URL`. NEVER hardcoded (also global rule). Migration day = env-var swap + Supabase + Stripe webhook updates.

---

## Trochia-specific bans (extends global ban list — see `tasks/constraints.md` for full list)

- **huashu-design**: BANNED. Commercial product, no author license.
- **AI-as-call-speaker**: NEVER. Trochia handles transcripts and follow-ups only; does not speak in calls.
- **"Rolling fund"**: NEVER (also global; reinforced especially for F&F module).
- **"Investment advice" / "Legal advice"** without "not"/"this is not" prefixed: NEVER.

---

## Voice (per `docs/BRAND.md`)

Operator, not assistant. Direct, founder-grade. No emoji in product copy unless explicit playful context.

Trochia **drafts**, **matches**, **briefs**, **scores**, **tracks**. Trochia does NOT feel, love, want, or "help."

---

## Workflow rules (Trochia-specific layer over global)

1. Every `/gsd-plan-phase` MUST begin by reading `tasks/constraints.md` + `docs/BRAND.md` + `docs/design/DESIGN.md` and incorporating their rules into `PLAN.md`.
2. Plan-checker MUST verify all `tasks/constraints.md` rules are honored before plan approval.
3. Verifier MUST confirm constraints held in shipped code AND that UI deliverables match `docs/design/DESIGN.md`.
4. Code Reviewer MUST reject any PR that:
   - Hardcodes a site URL
   - Uses banned compliance strings
   - Violates a §11 Don't or spends Signal more than once per surface (per `docs/design/DESIGN.md`)
   - Adds a Tailwind color or font outside the brand token system
   - Imports `ai/*` from `safe-engine` or `cap-table-engine`

---

## Phase-specific subagent priorities

Per Build Stack v2:

| Phase | Required subagents | Key skills pulled |
|---|---|---|
| 0 — Foundation | Backend Architect, DevOps Automator, Frontend Developer (parallel) | nextjs-app-router-patterns, nextjs-supabase-auth, stripe-integration, tailwind-design-system, saas-multi-tenant, frontend-design, shadcn, baseline-ui |
| 1 — Knowledge Layer | AI Engineer, Backend Architect, MCP Builder | claude-api (prompt caching), rag-implementation, embedding-strategies, vector-database-engineer, llm-structured-output |
| 2 — Pitch Lab | AI Engineer, Code Reviewer | claude-api, llm-structured-output, prompt-engineering-patterns, advanced-evaluation (eval harness from day 1) |
| 3 — Investor Pipeline | AI Engineer, Backend Architect, Identity Graph Operator, Email Intelligence Engineer | claude-api, linkedin-automation, gmail-automation, rag-implementation |
| 4 — Live Raise | AI Engineer, Voice AI Integration Engineer | claude-api, llm-structured-output, email-intelligence |
| 5 — Voice Coach | Voice AI Integration Engineer, AI Engineer, UI Designer | voice-ai-development, voice-agents, claude-api |
| 6 — Data Room | Backend Architect, AI Engineer, Frontend Developer | pdf, docx, xlsx, claude-api |
| 7 — Legal Stack | AI Engineer, Frontend Developer + Compliance Auditor spot-checks | legal-advisor (UPL-cautious), privacy-by-design |
| 8 — Raise Ops Core | Backend Architect, Senior Project Manager, **Security Engineer (mandatory)**, Compliance Auditor | docx, xlsx, sequential-thinking, test-driven-development |
| 9 — F&F + E-Sign | Backend Architect, Frontend Developer, Compliance Auditor | stripe-integration, claude-api |
| 10 — Polish + Launch | Marketing/content agents | landing-page-generator, page-cro, value-prop-statements |

---

## Critical-path items outside the code (founder-tracked, parallel work)

| Item | Deadline | Status |
|---|---|---|
| Domain `trochia.ai` acquisition | Before Phase 4 launch ideally | Bid in progress |
| Trademark "Trochia" attorney review | Parallel; not a build blocker | Open |
| Law-firm SAFE-template partner | Locked by ~Week 18 (mid-Phase 5) | Open — start outreach during Phase 0 |
| Trochia-as-separate-entity decision | Pre-Phase 11 | Open |
| Granola/Otter API access (transcripts) | Phase 4 or defer to V2 | Open |
| Hume sunset confirmation | Phase 5 kickoff | Plan B (Deepgram + Web Audio) is primary |

---

*Trochia project CLAUDE.md v1 — 2026-05-11. Layered on top of global ~/.claude/CLAUDE.md.*
