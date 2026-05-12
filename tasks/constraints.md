# Trochia AI — Project-Specific Build Constraints

This file extends `~/.claude/CLAUDE.md` (global rules) with Trochia-specific constraints. All global rules still apply. Project rules override global on conflict. All subagents MUST read this file before planning or executing any phase.

---

## URLs

| Stage | URL | Status |
|---|---|---|
| Build phase | `https://trochia.asranest.com` | Active (subdomain on Namecheap, CNAME → Vercel) |
| Production (post-acquisition) | `https://trochia.ai` | Pending domain bid completion |
| Migration plan | Documented; ~45 min wall-clock swap | Triggered when `trochia.ai` lands |

Both URLs already read from `process.env.NEXT_PUBLIC_SITE_URL` / `NEXT_PUBLIC_APP_URL` per global rule. Migration day = change env var + redeploy + update Supabase/Stripe webhooks. Keep `trochia.asranest.com` alive as a 301 redirect indefinitely.

---

## Trochia-specific banned terms (extends global ban list)

| Term | Why banned | Where it must never appear |
|---|---|---|
| "Rolling fund" | SEC regulatory exposure (also global ban — reinforced here) | Any module, code, copy, UI, marketing, comments |
| "Investment vehicle," "fund," "adviser" | UPL/securities exposure in F&F context | F&F module copy, F&F marketing, F&F UI |
| "AI-as-call-speaker" | Trochia does NOT speak in calls. AI handles transcripts and post-call drafts only. Liability + trust ban. | Anywhere — no feature, no roadmap item, no copy, no marketing claim |
| "Trochia provides legal advice" / "Trochia provides investment advice" | UPL exposure — every legal-adjacent surface must carry "not legal advice" disclaimer | All Legal Stack + SAFE generator surfaces |

**Banned-string CI check** runs from Phase 0 per Build Stack v2. Code Reviewer rejects any PR violating this list.

---

## Architecture guardrails (Trochia-specific)

| Rule | Enforcement |
|---|---|
| `safe-engine` has NO import path to `ai/` | Lint-enforced |
| `cap-table-engine` has NO import path to `ai/` | Lint-enforced |
| Cap-table math goes through unit tests, NEVER an LLM | TDD-first; 30-scenario oracle test set must match 100% before Phase 9 ship |
| SAFE substitution engine receives Security Engineer audit | Mandatory before Phase 9 ship |
| All Anthropic API calls via `ai/client.ts` chokepoint | Lint-enforced (also global rule) |
| Prompt caching active on every production Anthropic call | Mandatory; instrumented in Langfuse |
| Supabase RLS default-deny on every new table | Two-user isolation test required from Phase 0 |
| Drive integration: `drive.file` scope ONLY | No full-drive access |
| Gmail integration: opt-in per-thread | No mailbox-wide access |
| LinkedIn integration: no bulk scrape | ToS-compliant only |

---

## Compliance gates (non-skippable)

| Phase | Required gate |
|---|---|
| Phase 0 (Foundation) | Banned-string CI check live; RLS isolation test passing; DPA/privacy plumbing in place |
| Phase 3 (Pitch Lab) | Langfuse eval harness FP rate <25%; deck reviewer never fabricates slide references |
| Phase 5 (Live Raise MVP) | **Hard go/no-go gate.** 25 design partners onboarded + activation thresholds hit. If not met, ship PRD v1 fallback (MVP-only); do NOT proceed to V2/V3. |
| Phase 6 (Voice Coach) | Phase research at kickoff — Hume sunset ~June 2026. Plan B: deterministic metrics from Deepgram + Web Audio. No permanent third-party prosody dependency. |
| Phase 8 (Legal Stack) | Compliance Auditor pass on UPL/disclaimer surfaces; non-skippable |
| Phase 9 (SAFE + Cap Table) | Security Engineer audit of SAFE engine + Compliance Auditor pass + `/codex` second-opinion review + 30-scenario cap-table oracle 100% match; all non-skippable. Law-firm SAFE-template partner must be locked before this phase. |
| Phase 10 (F&F + E-Sign) | Compliance Auditor verifies zero "rolling fund" / "fund" / "investment vehicle" / "adviser" anywhere |
| Phase 11 (Launch) | Final Compliance Auditor sweep on launch copy; SOC 2 Type I prep begun |

---

## UI / design system (Trochia-specific)

| Rule | Enforcement |
|---|---|
| All UI subagents MUST read `docs/BRAND.md` AND `docs/DESIGN-REFERENCE.md` before planning or implementing any surface | Plan-checker verifies; Verifier confirms shipped UI matches |
| Aesthetic target: harmonic.ai + firecrawl.dev (operator-grade, near-monochromatic, single Signal accent) | Documented in DESIGN-REFERENCE.md |
| Anti-patterns in DESIGN-REFERENCE.md are banned | Code Reviewer rejects PRs violating |
| Tailwind colors / fonts outside the brand token system | Code Reviewer rejects |
| Phase 1 exit gate: `/styleguide` internal route shipped showing every themed component | Mandatory |

---

## Skill emphasis for Trochia (overrides + reinforces global)

| System | Role for Trochia |
|---|---|
| **GSD** | Primary phase orchestrator. Build sequence per `.planning/intel/Trochia_AI_Build_Stack_v2.md`. |
| **gstack** | Within-phase tools. Heavy use: `/design-shotgun`, `/design-html`, `/design-review`, `/review`, `/cso`, `/qa`, `/codex`, `/ship`, `/land-and-deploy`. |
| **agency-agents** | Persona library. Activate by name when a task needs deep specialization. |
| **Anthropic + Obra skills** | Auto-discovered per phase. Build Stack v2 enumerates which skills per phase. |
| **huashu-design** | **BANNED for Trochia.** Personal-use-only license; Trochia is commercial. Revisit only if commercial license obtained AND task involves pitch-deck animation or investor explainer (none of which are in Phase 0–11). |

---

## Strategic context (background for planning)

| Item | Status |
|---|---|
| Operator pacing | Solo founder (also running Clockvest). 36-week roadmap assumes co-founder operator; solo = realistic ~42–50 weeks. Don't recommit timeline externally yet. |
| Law-firm SAFE-template partner | Critical path. Lock by ~Week 18 (mid-Phase 6) to unblock Phase 9. Start outreach in parallel during Phase 1. |
| Trademark clearance for "Trochia" | Parallel track. Brand and build proceed without waiting on attorney clearance per founder's "ship + manage risk in parallel" decision style. |
| Trochia as separate entity vs. inside Clockvest | Open business question. Doesn't block build. |

---

*Trochia constraints v1 — 2026-05-11. Layered on top of global ~/.claude/CLAUDE.md.*
