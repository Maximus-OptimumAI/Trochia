# Phase 1: Foundation - Context

**Gathered:** 2026-05-12
**Status:** Ready for planning

<domain>
## Phase Boundary

Stand up the production-grade Next.js monolith on Vercel and establish — and CI-enforce — every cross-cutting constraint the rest of the build leans on: auth (Google SSO), Stripe billing + `entitlements()`, Supabase schema with default-deny RLS + tenant-scoped tRPC context, the `ai/client.ts` chokepoint (prompt caching, model routing, Zod outputs, OpenAI fallback flag), compliance/privacy plumbing (clickwrap DPA, data export/delete, banned-string CI check, logging-scrub), observability (Resend, Sentry, Amplitude, Langfuse), the multi-region data-residency seam (`tenant.region` + `getDbForRegion()`), Inngest background jobs via a single `serve()` endpoint, the public marketing site (homepage, `/pricing`, `/manifesto`, `/legal/*`), the design system + `/styleguide` route, and the auth + onboarding + app shell.

**Walking Skeleton mode is active** (first phase of a new project, MVP mode). The planner emits `SKELETON.md` alongside `PLAN.md`; the first deliverable is the thinnest real end-to-end slice (see D-08).

**In scope:** the FND-01..12 and XC-01..07 requirements as written in `.planning/REQUIREMENTS.md`, the Phase 1 UI surfaces in `.planning/phases/01-foundation/01-UI-SPEC.md`, and the cross-cutting guardrails in `tasks/constraints.md`.

**Out of scope (later phases own these):** Business Memory ingestion logic (Phase 2), deck reviewer logic (Phase 3 — UI-SPEC: Phase 1 ships the upload screen + skeleton only), investor pipeline (Phase 4), live raise (Phase 4), voice (Phase 5), data room (Phase 6), legal stack (Phase 7), SAFE + cap table (Phase 8), F&F + e-sign (Phase 9), close mode + alumni billing + public launch (Phase 11). The unified raise timeline (XC-08) is Phase 2.

</domain>

<decisions>
## Implementation Decisions

### Framework & runtime
- **D-01 — Next.js 16.x.** Greenfield, no migration cost. Fluid Compute (default), Node 24, Turbopack stable, App Router. Pin the exact version in `package.json`; bump deliberately, not via floating range. TypeScript + Tailwind v4 + shadcn/ui per the UI-SPEC. React 19 ships with Next 16 — accept it.
- **D-01b — Hosting plans.** Vercel **Pro**, Supabase **Pro**, Sentry **Team**. (Founder-procured; planner should assume these tiers when choosing features — e.g., Vercel Pro for preview deployments + analytics, Supabase Pro for daily backups + no project pausing.)

### Billing & app gating
- **D-02 — Stripe Checkout sits inside onboarding, after the welcome screen.** Flow: Google sign-in → welcome → tier picker (Pre-Raise $49 / $39 annual · Active Raise $199 / $159 annual) → Stripe Checkout (card-on-file captured, 7-day free trial starts) → Knowledge Pack Import → deck upload → automatic deck review (skeleton) → dashboard. Card-on-file is captured before any product work, satisfying FND-05's "card-on-file at signup, no permanent free tier."
- **D-02b — `/app` is hard-gated from day 1.** No active Stripe trial-or-subscription → redirect to a "reactivate" screen. `entitlements()` (FND-06) is the single gate and is exercised end-to-end in Phase 1 (it is also the skeleton's payoff — see D-08). Tiers are extensible to Close Mode / Alumni (added at V3 / Phase 11) — `entitlements()` must be written so adding a tier is a data change, not a refactor.
- **D-02c — Stripe entitlements technical detail.** Source of truth for "what tier is this account on" is the Stripe webhook → it writes `accounts.subscription_status` (and tier/period) on `checkout.session.completed`, `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.payment_failed`, etc. Webhooks are idempotent (dedupe on Stripe event id) with a reconciliation path (a job that re-pulls subscription state from the Stripe API). `entitlements(account)` reads the persisted status, never calls Stripe inline. Self-serve Stripe Customer Portal for plan changes / cancel (the in-app trigger still shows the destructive-confirmation Dialog before redirect, per UI-SPEC).

### Schema & data
- **D-03 — Phase 1 models only what Phase 1 needs: `users`, `accounts`, `sessions`, `subscriptions`.** (Plus whatever auth bookkeeping Supabase Auth requires, and the `jobs` table for Inngest status — see D-07.) **Do not pre-model** `decks`, `investors`, `pipeline`, `businesses` (Business Memory), email, etc. — those land as new Drizzle migrations in their owning phases (2 / 3 / 4). Schemas are cheap to add, painful to remove. Drizzle 0.44 manages schema + migrations. Use current Supabase **publishable/secret** keys — never `anon`/`service_role` (per FND-02).
  - *Note for planner:* the ROADMAP/REQUIREMENTS text for FND-02 names "businesses, decks, investors, pipeline entries" as core tables. D-03 is the founder's explicit narrowing — model the bare auth/billing spine now, defer the domain tables. Carry the FND-02 "core tables exist" wording forward as *the tables this phase actually creates*, not the full list.
- **D-04 — RLS: default-deny on every tenant-scoped table.** Pattern: every tenant-scoped table has RLS enabled with a default-deny policy, and explicit policies keyed on the authenticated tenant. tRPC procedures run in a tenant-scoped DB context that carries the same isolation (the request's tenant id → set on the connection / passed to RLS). A **CI schema-scan test** fails the build if any new table is added without RLS + at least one policy. The **two-user isolation test is a Vitest integration test**: two tenant-scoped clients, seed rows for tenant A and tenant B, assert B's client reads zero of A's rows across every tenant-scoped table. (A Playwright two-session smoke check is a fine optional add on top — not instead.)

### Multi-region seam
- **D-05 — Flag + factory stub on the US DB.** `tenant.region` column with values `us | in` (`eu` reserved for V2). `getDbForRegion(region)` factory branches per region but **every branch returns the US Supabase client** until there is a real India customer. The seam is real; the second-project machinery is not built now. US + UK share the US region by design (UK handled contractually at MVP). When the first India founder signs up, provision the real India-region Supabase project and flip that branch — no other code changes. Matches FND-10's "built without over-engineering."

### CI guardrails & enforcement (what goes live in Phase 1)
- **D-06a — Banned-string CI check: live in Phase 1.** Scope: `src/**/*.{ts,tsx,md,mdx}` + `public/**/*.md`. The banned-strings list lives in `tasks/banned-strings.txt` (**this file does not exist yet — Phase 1 creates it**, seeded from `tasks/constraints.md` "Trochia-specific banned terms" + global `~/.claude/CLAUDE.md` compliance bans: "rolling fund", "investment vehicle"/"fund"/"adviser" (in F&F contexts), "investment advice"/"legal advice" without a "not"/"this is not" prefix, plus the UI-SPEC anti-pattern strings). CI fails on any match outside an allowlisted "...is **not** legal advice" pattern.
- **D-06b — Logging-scrub: redacting logger + ESLint rule, both in Phase 1.** Ship a logger wrapper that redacts known sensitive field names (cap-table figures, audio, financial amounts — the field list is small now, grows in Phase 8/9) AND an ESLint rule that bans raw `console.*` and unredacted logging of flagged fields (XC-03). Sensitive fields encrypted at rest beyond Supabase native encryption is established as a *pattern/seam* now; the actual encrypted columns appear when cap-table/audio data does (Phase 8/9).
- **D-06c — `ai/` import-boundary lints: stub the future ones now, enforce the immediate one now.** Add the ESLint import-boundary rules forbidding `safe-engine/**` and `cap-table-engine/**` from importing `ai/**` — configured for those future package paths; no-ops until the dirs exist, then they just work. **Also enforced immediately:** nothing outside `ai/**` may import the Anthropic SDK (bites from day 1 given FND-09). Near-zero cost; avoids a retrofit later.
- **D-06d — CI pipeline.** GitHub Actions: `lint` (ESLint incl. the boundary + scrub + no-Anthropic-outside-`ai/` rules) + `typecheck` + Vitest (unit + the RLS integration test + the schema-scan test + the banned-string check, or banned-string as its own step) + Playwright (smoke). Green CI is a Phase 1 exit gate (FND-01).

### Background jobs
- **D-07 — Inngest: single app, single `serve()` endpoint at `/api/inngest`, 4 retries default.** Phase 1 registers the endpoint, the `jobs` table, and Supabase Realtime status polling for the UI; it registers real (but mostly no-op/stub) job functions for the eventual workloads (deck parsing, embedding, transcription, brief enrichment, e-sign webhooks, scheduled reminders) so the wiring is proven — plus the one real job that matters now: the AI chokepoint health-check ping (D-09). Per-key concurrency limits configured.

### AI chokepoint
- **D-09 — `ai/client.ts` ships real, not dormant.** Full chokepoint: prompt caching on the stable prefix (corpus + Business Memory + taxonomy + tool schemas — most of which is empty in Phase 1, so the cached prefix is whatever stable scaffold exists), model routing by task class (Opus deep reasoning / Sonnet drafting / Haiku classification), Zod-typed structured outputs, OpenAI/Codex fallback behind a config flag. A **deploy-time health-check call** — `claude-haiku`, ~10 tokens, run via an Inngest job on deploy — exercises the path so Langfuse captures a real trace (cache hit rate, tokens, latency, cost) before Phase 2 builds on it. The lints (D-06c) enforce that this is the only path to Anthropic. The `claude-api` skill's prompt-caching mandate applies (XC-06).

### Auth
- **D-10 — Supabase Auth, Google SSO only at MVP; session config 30 / 90 / 1hr.** 1-hour access-token (JWT) expiry; 30-day idle/inactivity session timeout (session refreshes on activity → FND-04's "persist 30 days and refresh on activity"); 90-day absolute session lifetime (time-box). Magic-link sign-in and TOTP MFA are V2 (Phase 8) — not built now. *(Planner: confirm these map cleanly onto Supabase Auth's "JWT expiry limit" / "Inactivity timeout" / "Time-box user sessions" settings; if the platform can't express all three, JWT expiry + inactivity timeout are the must-haves and the absolute cap is best-effort.)*

### Compliance / privacy plumbing
- **D-11 — DPA: clickwrap acceptance + downloadable PDF + multi-regime coverage.** A GDPR / UK-GDPR / DPDP (India) / LGPD (Brazil) — grade DPA is accepted via clickwrap at signup (the `/legal/dpa` page is the target of the sign-up clickwrap line per UI-SPEC) and is downloadable as a PDF. Data-subject-rights plumbing: on-demand full data export; account deletion → 30-day soft delete → permanent purge (XC-04). XC-01 (no customer data in training) stated in product UI + ToS + DPA, backed by the vendor data-flow inventory (Anthropic no-training/7-day retention; OpenAI/Codex fallback + Claude-Code build tooling explicitly covered). XC-02 (founder approval for all external sends) — the reusable founder-approval Dialog is built in Phase 1 per UI-SPEC; no autonomous sends.

### Onboarding shell
- **D-12 — FND-12 onboarding is a 4-stage instrumented funnel; Phase 1 ships the shell, not the feature logic.** Stages: (1) Google sign-in → (2) welcome + tier picker + Stripe Checkout → (3) Knowledge Pack Import (paste textarea OR file dropzone — extraction logic is Phase 2) → (4) deck upload + automatic deck review skeleton (logic is Phase 3) → dashboard with the three CTAs ("Generate VC fit list" / "Prepare for an upcoming call" / "Draft outreach" — each links to its Phase-2/4/5 destination with a "Coming Phase N" badge where not yet built). Target completion < 5 min. Funnel instrumented in Amplitude (every stage transition is an event). Screens, navigation, skeletons, instrumentation — yes; feature logic — no.

### Observability
- **D-13 — Resend (transactional email), Sentry (errors, Team plan), Amplitude (product events incl. the onboarding funnel), Langfuse (every production Anthropic call). PostHog is deferred** (not wired in Phase 1 — Amplitude covers product analytics for now). All four wired from Phase 1 per FND-07.

### Marketing site & design system
- **D-14 — Per `01-UI-SPEC.md` (approved 2026-05-12).** Homepage (hero with animated raise timeline — **no secondary live-output card**), `/pricing` (**all 4 tiers**; Close Mode + Alumni carry a subtle "Available with the close stack" V3 badge and no purchase CTA in Phase 1), `/manifesto` (1500–2000 word draft — content authorship is the planner's call: a content subagent draft is fine, refined later), `/legal/{privacy,terms,security,dpa}`. **No `/docs` route and no `/changelog` route in Phase 1** — both deferred (`/changelog` ships Phase 11). Marketing top-bar nav = How it works / Pricing / Manifesto. Footer product-nav = Pricing / Manifesto / Status (no Changelog). Design system: shadcn/ui initialized + themed to brand tokens (Tailwind v4, Geist/Inter/Geist Mono), `/styleguide` internal route renders every themed component — a **Phase 1 exit gate**. Lighthouse > 90 on `/` — a Phase 1 exit gate.

### Claude's Discretion
- Exact Drizzle migration layout, table column names beyond what's named above, and naming conventions.
- The `/manifesto` draft's actual prose (subject to the UI-SPEC voice/anti-pattern rules and the banned-string check).
- The shape of the stub Inngest job functions (signatures, where the no-ops live).
- Whether the banned-string check runs as a Vitest test, a standalone CI step, or both — D-06d allows either.
- Repo structure (monorepo tooling vs. single-package), lint/format tooling specifics beyond the required rules, env-var management approach (subject to FND-08: site URL always from `NEXT_PUBLIC_SITE_URL` / `NEXT_PUBLIC_APP_URL`, never hardcoded).
- How `getDbForRegion()` is surfaced to tRPC (middleware, context factory, etc.) — only the behavior in D-05 is fixed.
- The exact Supabase Realtime channel design for `jobs` status polling.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Project constraints & scope (read first, always)
- `tasks/constraints.md` — Trochia-specific build constraints: URLs, banned terms, architecture guardrails (`safe-engine`/`cap-table-engine` no `ai/` import; RLS default-deny; Drive `drive.file` scope only; etc.), compliance gates per phase, UI/design rules, skill emphasis.
- `CLAUDE.md` (repo root) — Trochia project build instructions: what Trochia is, build sequence (11 phases), stack overrides, URLs+env, Trochia-specific bans, voice, workflow rules, phase-specific subagent priorities.
- `~/.claude/CLAUDE.md` (global) — operator profile, communication style, default content rules (compliance language bans), default architecture, default safety guardrails.

### Phase 1 specs
- `.planning/phases/01-foundation/01-UI-SPEC.md` — **approved** UI design contract: design system, spacing/type/color tokens, copywriting contract, component inventory, route/screen contract (marketing + auth/onboarding + app shell + `/styleguide`), motion contract, anti-patterns, registry safety. The four formerly-open questions are resolved (see its "Open Questions — RESOLVED" section). UI-track agents that don't read this AND `docs/BRAND.md` AND `docs/DESIGN-REFERENCE.md` are in violation.
- `.planning/REQUIREMENTS.md` — the 75 requirements with traceability; Phase 1 owns FND-01..12 and establishes XC-01..07 (enforced all phases). §FND-01..12, §XC-01..08.
- `.planning/ROADMAP.md` — 11-phase build sequence; "### Phase 1: Foundation" goal + success criteria + "Cross-Cutting Enforcement" section.
- `.planning/PROJECT.md` — project scope, core value (the Business Memory + Pipeline Memory spine is the moat), key decisions table.

### Design system (mandatory for every UI surface)
- `docs/BRAND.md` — brand system spec: tokens, typography, voice. **Wins on tokens/voice on any conflict.**
- `docs/DESIGN-REFERENCE.md` — Harmonic + Firecrawl aesthetic distilled into design decisions, component patterns, page briefs, anti-patterns, and the exact Tailwind config additions Phase 1 must produce. **Wins on component/layout decisions on any conflict.**
- `docs/BRAND-PACK-README.md` — brand asset inventory (`public/brand/**`, favicons, OG image) + install/usage notes.

### Strategic / build-tooling context (background)
- `.planning/intel/Trochia_AI_Build_Stack_v2.md` — build tooling + per-phase skill priorities (Phase 1 subagents: Backend Architect, DevOps Automator, Frontend Developer in parallel; skills: nextjs-app-router-patterns, nextjs-supabase-auth, stripe-integration, tailwind-design-system, saas-multi-tenant, frontend-design, shadcn, baseline-ui).
- `.planning/intel/Trochia_AI_Strategy_v1.md` — strategic context.
- `.planning/intel/Trochia_AI_PRD_v2.docx` — full product spec.
- `.planning/research/STACK.md`, `.planning/research/ARCHITECTURE.md`, `.planning/research/FEATURES.md`, `.planning/research/PITFALLS.md`, `.planning/research/SUMMARY.md` — project-level research (read by the phase researcher; planner may consult).

### Files Phase 1 must CREATE (referenced but not yet present)
- `tasks/banned-strings.txt` — the banned-strings list the CI check reads (D-06a). Does not exist yet.
- `package.json`, `src/` / `app/`, Drizzle schema + migrations, GitHub Actions workflow, `ai/client.ts`, `tasks/lessons.md` (per global CLAUDE.md self-improvement loop) — none exist yet (greenfield repo).

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `public/brand/**` (+ `public/brand/png/**`) — full brand asset set (`mark-color.svg`, `mark-mono-{dark,light}.svg`, `wordmark.svg`, `wordmark-ai.svg`, `lockup-{horizontal,stacked}.svg`, `app-icon.svg`, `social-square.svg`) plus root favicons (`favicon.svg`, `favicon-16x16.png`, `favicon-32x32.png`, `apple-touch-icon.png`, `android-chrome-{192,512}.png`, `og-image.png`). **Use these, do not regenerate.** Wire via `next/metadata`.
- `.env.local` — exists (99 bytes) — presumably the Vercel/Supabase scaffolding env. Planner: inspect, don't clobber; ensure FND-08 (no hardcoded URLs) holds.
- `.vercel/` — Vercel project is already linked.

### Established Patterns
- **None in code yet — greenfield.** No `package.json`, no `src/`/`app/`, no migrations. The patterns to establish here become the precedent for all later phases (this is the point of Phase 1 + the Walking Skeleton).
- GSD planning conventions: `.planning/phases/NN-name/` per phase; `tasks/todo.md` + `tasks/lessons.md` per global CLAUDE.md.

### Integration Points
- Vercel (deployment target — `trochia.asranest.com` now, `trochia.ai` post-acquisition, env-var swap only).
- Supabase (Postgres + pgvector + Storage + Auth + Realtime).
- Stripe (billing + Customer Portal + webhooks).
- Anthropic API via `ai/client.ts` (the only path).
- Resend / Sentry / Amplitude / Langfuse / Inngest (all wired Phase 1).
- GitHub Actions (CI).

</code_context>

<specifics>
## Specific Ideas

- **Walking-Skeleton spine (D-08, stated verbatim by the founder):** `signup → tier picker → Stripe Checkout → webhook updates Supabase accounts.subscription_status → user lands on /app showing their tier`. This is the thinnest slice that exercises auth + RLS + Stripe + webhook + tRPC + `entitlements()` end-to-end. "If this slice works, the foundation works." `SKELETON.md` is built around this; the first deliverable proves it deployed on Vercel.
- "Schemas are cheap to add, painful to remove" — the founder's stated reason for the narrow Phase-1 schema (D-03). Don't pre-model future-phase tables.
- Aesthetic target is operator-grade, near-monochromatic, single Signal accent — harmonic.ai + firecrawl.dev (per DESIGN-REFERENCE.md). "Docs feel like the product" — applies whenever `/docs` and `/changelog` eventually ship (not Phase 1).
- The founder referenced "8 supplemental items from my earlier paste" — those items were captured inline from the discussion message (auth session 30/90/1hr → D-10; DPA clickwrap+PDF+multi-regime → D-11; Stripe entitlements detail → D-02c; RLS default-deny pattern → D-04; FND-12 4-stage onboarding → D-12; Inngest `/api/inngest` single app + 4 retries → D-07; Sentry+Amplitude wired, PostHog deferred → D-13; banned-string CI scope `src/**/*.{ts,tsx,md,mdx}` + `public/**/*.md` from `tasks/banned-strings.txt` → D-06a). If the founder has a separate written paste with more detail, it should be diffed against this CONTEXT before planning.

</specifics>

<deferred>
## Deferred Ideas

- `/docs` route — deferred to V2 / Phase 5+ if design partners request help docs (UI-SPEC founder decision 2026-05-12).
- `/changelog` route — ships Phase 11 (Public Launch) with real entries (UI-SPEC founder decision 2026-05-12).
- Hero secondary "live output" card — added in a later phase once real product output exists (UI-SPEC founder decision 2026-05-12).
- Magic-link sign-in + TOTP MFA — V2 / Phase 8 (FND-04).
- Real second Supabase project for the India region — provisioned when the first India founder signs up (D-05).
- EU data-residency region — V2 (FND-10).
- PostHog analytics — not wired in Phase 1 (D-13); revisit if Amplitude proves insufficient.
- Encrypted-at-rest columns for cap-table figures / audio — pattern/seam established Phase 1, real columns appear Phase 8/9 when that data exists (XC-03 / D-06b).
- Close Mode ($399) / Alumni ($19) billing activation — Phase 11; `entitlements()` is built tier-extensible now (D-02b).
- Domain `trochia.ai` migration — env-var swap when the domain bid completes; `trochia.asranest.com` stays as a 301 indefinitely (`tasks/constraints.md`).

</deferred>

---

*Phase: 01-foundation*
*Context gathered: 2026-05-12*
