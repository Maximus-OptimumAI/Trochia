# Phase 1: Foundation - Research

**Researched:** 2026-05-12
**Domain:** Multi-tenant TypeScript SaaS platform foundation — Next.js 16 monolith on Vercel, Supabase Postgres + RLS, Stripe billing, the `ai/client.ts` Anthropic chokepoint, compliance/privacy CI plumbing, observability, multi-region data-residency seam, Inngest background jobs
**Confidence:** HIGH on the stack and platform patterns (matches the 2026 mainstream, the project-level research dated 2026-05-11, and the locked decisions in `tasks/constraints.md` / `CLAUDE.md`); MEDIUM on a few CI-implementation specifics (RLS schema-scan check shape, banned-string allowlist regex) and on whether Supabase Auth expresses all three session timers (D-10) — flagged below.

> **One-line verdict:** The locked stack and architecture are correct for 2026 — Next.js 16.x is GA and stable, Turbopack is the default, React 19 ships with it. Build the Walking Skeleton spine (signup → tier picker → Stripe Checkout → webhook → `accounts.subscription_status` → `/app` shows tier) first, then layer RLS, the AI chokepoint, observability, compliance plumbing, and the region seam. The only genuine open calls are CI-check implementation details and three Supabase Auth session-timer mappings — neither blocks planning.

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Framework & runtime**
- **D-01 — Next.js 16.x.** Greenfield, no migration cost. Fluid Compute (default), Node 24, Turbopack stable, App Router. Pin the exact version in `package.json`; bump deliberately, not via floating range. TypeScript + Tailwind v4 + shadcn/ui per the UI-SPEC. React 19 ships with Next 16 — accept it.
- **D-01b — Hosting plans.** Vercel **Pro**, Supabase **Pro**, Sentry **Team**. Plan should assume these tiers (Vercel Pro for preview deployments + analytics + 800s `maxDuration`; Supabase Pro for daily backups + no project pausing).

**Billing & app gating**
- **D-02 — Stripe Checkout sits inside onboarding, after the welcome screen.** Flow: Google sign-in → welcome → tier picker (Pre-Raise $49 / $39 annual · Active Raise $199 / $159 annual) → Stripe Checkout (card-on-file captured, 7-day free trial starts) → Knowledge Pack Import → deck upload → automatic deck review (skeleton) → dashboard.
- **D-02b — `/app` is hard-gated from day 1.** No active Stripe trial-or-subscription → redirect to a "reactivate" screen. `entitlements()` (FND-06) is the single gate, exercised end-to-end in Phase 1. Tiers extensible to Close Mode / Alumni (V3 / Phase 11) — adding a tier is a data change, not a refactor.
- **D-02c — Stripe entitlements technical detail.** Source of truth for tier is the Stripe webhook → writes `accounts.subscription_status` (and tier/period) on `checkout.session.completed`, `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.payment_failed`, etc. Webhooks idempotent (dedupe on Stripe event id) with a reconciliation path (job re-pulls subscription state from Stripe API). `entitlements(account)` reads persisted status, never calls Stripe inline. Self-serve Stripe Customer Portal for plan changes / cancel.

**Schema & data**
- **D-03 — Phase 1 models only `users`, `accounts`, `sessions`, `subscriptions`** (plus auth bookkeeping Supabase Auth requires, plus the `jobs` table for Inngest status). Do NOT pre-model `decks`, `investors`, `pipeline`, `businesses`, email. Drizzle 0.44 manages schema + migrations. Use current Supabase **publishable/secret** keys — never `anon`/`service_role`. (Planner note: carry FND-02's "core tables exist" wording forward as *the tables this phase actually creates*, not the full domain-table list.)
- **D-04 — RLS: default-deny on every tenant-scoped table.** Every tenant-scoped table has RLS enabled + default-deny policy + explicit policies keyed on the authenticated tenant. tRPC procedures run in a tenant-scoped DB context carrying the same isolation. A **CI schema-scan test** fails the build if any new table lacks RLS + ≥1 policy. The **two-user isolation test is a Vitest integration test**: two tenant-scoped clients, seed rows for tenant A and B, assert B reads zero of A's rows across every tenant-scoped table. (A Playwright two-session smoke check is a fine optional add on top — not instead.)

**Multi-region seam**
- **D-05 — Flag + factory stub on the US DB.** `tenant.region` column with values `us | in` (`eu` reserved for V2). `getDbForRegion(region)` factory branches per region but **every branch returns the US Supabase client** until there's a real India customer. The seam is real; second-project machinery isn't built now. US + UK share the US region by design (UK handled contractually at MVP). When the first India founder signs up, provision the real India Supabase project and flip that branch — no other code changes.

**CI guardrails & enforcement (live in Phase 1)**
- **D-06a — Banned-string CI check: live in Phase 1.** Scope: `src/**/*.{ts,tsx,md,mdx}` + `public/**/*.md`. Banned-strings list lives in `tasks/banned-strings.txt` (**Phase 1 creates this file** — seeded from `tasks/constraints.md` "Trochia-specific banned terms" + global `~/.claude/CLAUDE.md` compliance bans: "rolling fund", "investment vehicle"/"fund"/"adviser" (in F&F contexts), "investment advice"/"legal advice" without a "not"/"this is not" prefix, plus the UI-SPEC anti-pattern strings). CI fails on any match outside an allowlisted "...is **not** legal advice" pattern.
- **D-06b — Logging-scrub: redacting logger + ESLint rule, both in Phase 1.** Ship a logger wrapper that redacts known sensitive field names (cap-table figures, audio, financial amounts — small list now, grows Phase 8/9) AND an ESLint rule banning raw `console.*` and unredacted logging of flagged fields (XC-03). Sensitive-fields-encrypted-at-rest-beyond-Supabase is established as a *pattern/seam* now; actual encrypted columns appear when cap-table/audio data does.
- **D-06c — `ai/` import-boundary lints.** Add ESLint import-boundary rules forbidding `safe-engine/**` and `cap-table-engine/**` from importing `ai/**` (configured for those future paths; no-ops until the dirs exist, then they just work). **Also enforced immediately:** nothing outside `ai/**` may import the Anthropic SDK (bites from day 1 given FND-09).
- **D-06d — CI pipeline.** GitHub Actions: `lint` (ESLint incl. boundary + scrub + no-Anthropic-outside-`ai/` rules) + `typecheck` + Vitest (unit + RLS integration test + schema-scan test + banned-string check, or banned-string as its own step) + Playwright (smoke). Green CI is a Phase 1 exit gate (FND-01).

**Background jobs**
- **D-07 — Inngest: single app, single `serve()` endpoint at `/api/inngest`, 4 retries default.** Phase 1 registers the endpoint, the `jobs` table, and Supabase Realtime status polling for the UI; registers real (mostly no-op/stub) job functions for eventual workloads (deck parsing, embedding, transcription, brief enrichment, e-sign webhooks, scheduled reminders) so wiring is proven — plus the one real job that matters now: the AI chokepoint health-check ping (D-09). Per-key concurrency limits configured.

**AI chokepoint**
- **D-09 — `ai/client.ts` ships real, not dormant.** Full chokepoint: prompt caching on the stable prefix (corpus + Business Memory + taxonomy + tool schemas — most empty in Phase 1, so the cached prefix is whatever stable scaffold exists), model routing by task class (Opus deep reasoning / Sonnet drafting / Haiku classification), Zod-typed structured outputs, OpenAI/Codex fallback behind a config flag. A **deploy-time health-check call** — `claude-haiku`, ~10 tokens, run via an Inngest job on deploy — exercises the path so Langfuse captures a real trace (cache hit rate, tokens, latency, cost) before Phase 2 builds on it. The lints (D-06c) enforce that this is the only path to Anthropic. The `claude-api` skill's prompt-caching mandate applies (XC-06).

**Auth**
- **D-10 — Supabase Auth, Google SSO only at MVP; session config 30 / 90 / 1hr.** 1-hour access-token (JWT) expiry; 30-day idle/inactivity session timeout (refreshes on activity → FND-04's "persist 30 days and refresh on activity"); 90-day absolute session lifetime (time-box). Magic-link and TOTP MFA are V2 (Phase 8) — not built now. (Planner: confirm these map onto Supabase Auth's settings; if the platform can't express all three, JWT expiry + inactivity timeout are the must-haves and the absolute cap is best-effort.)

**Compliance / privacy plumbing**
- **D-11 — DPA: clickwrap acceptance + downloadable PDF + multi-regime coverage.** A GDPR / UK-GDPR / DPDP (India) / LGPD (Brazil)-grade DPA accepted via clickwrap at signup (the `/legal/dpa` page is the clickwrap target per UI-SPEC), downloadable as PDF. Data-subject-rights plumbing: on-demand full data export; account deletion → 30-day soft delete → permanent purge (XC-04). XC-01 (no customer data in training) stated in product UI + ToS + DPA, backed by the vendor data-flow inventory (Anthropic no-training/7-day retention; OpenAI/Codex fallback + Claude-Code build tooling explicitly covered). XC-02 (founder approval for all external sends) — the reusable founder-approval Dialog is built in Phase 1 per UI-SPEC; no autonomous sends.

**Onboarding shell**
- **D-12 — FND-12 onboarding is a 4-stage instrumented funnel; Phase 1 ships the shell, not the feature logic.** Stages: (1) Google sign-in → (2) welcome + tier picker + Stripe Checkout → (3) Knowledge Pack Import (paste textarea OR file dropzone — extraction logic is Phase 2) → (4) deck upload + automatic deck review skeleton (logic is Phase 3) → dashboard with three CTAs ("Generate VC fit list" / "Prepare for an upcoming call" / "Draft outreach" — each links to its Phase-2/4/5 destination with a "Coming Phase N" badge where not yet built). Target completion < 5 min. Funnel instrumented in Amplitude (every stage transition is an event).

**Observability**
- **D-13 — Resend (transactional email), Sentry (errors, Team plan), Amplitude (product events incl. onboarding funnel), Langfuse (every production Anthropic call). PostHog is deferred** (not wired in Phase 1). All four wired from Phase 1 per FND-07.

**Marketing site & design system**
- **D-14 — Per `01-UI-SPEC.md` (approved 2026-05-12).** Homepage (hero with animated raise timeline — no secondary live-output card), `/pricing` (all 4 tiers; Close Mode + Alumni carry a subtle "Available with the close stack" V3 badge and no purchase CTA in Phase 1), `/manifesto` (1500–2000 word draft — content authorship is the planner's call), `/legal/{privacy,terms,security,dpa}`. **No `/docs` route and no `/changelog` route in Phase 1** (both deferred; `/changelog` ships Phase 11). Marketing top-bar nav = How it works / Pricing / Manifesto. Footer product-nav = Pricing / Manifesto / Status. Design system: shadcn/ui initialized + themed to brand tokens (Tailwind v4, Geist/Inter/Geist Mono), `/styleguide` internal route renders every themed component — a Phase 1 exit gate. Lighthouse > 90 on `/` — a Phase 1 exit gate.

### Claude's Discretion
- Exact Drizzle migration layout, table column names beyond what's named above, naming conventions.
- The `/manifesto` draft's actual prose (subject to UI-SPEC voice/anti-pattern rules and the banned-string check).
- Shape of the stub Inngest job functions (signatures, where the no-ops live).
- Whether the banned-string check runs as a Vitest test, a standalone CI step, or both.
- Repo structure (monorepo tooling vs. single-package), lint/format tooling specifics beyond the required rules, env-var management approach (subject to FND-08: site URL always from `NEXT_PUBLIC_SITE_URL` / `NEXT_PUBLIC_APP_URL`, never hardcoded).
- How `getDbForRegion()` is surfaced to tRPC (middleware, context factory, etc.) — only the D-05 behavior is fixed.
- The exact Supabase Realtime channel design for `jobs` status polling.

### Deferred Ideas (OUT OF SCOPE for Phase 1)
- `/docs` route — deferred to V2 / Phase 5+.
- `/changelog` route — ships Phase 11 with real entries.
- Hero secondary "live output" card — added a later phase once real product output exists.
- Magic-link sign-in + TOTP MFA — V2 / Phase 8.
- Real second Supabase project for the India region — provisioned when the first India founder signs up.
- EU data-residency region — V2.
- PostHog analytics — not wired in Phase 1.
- Encrypted-at-rest columns for cap-table figures / audio — pattern/seam established Phase 1, real columns Phase 8/9.
- Close Mode ($399) / Alumni ($19) billing activation — Phase 11; `entitlements()` is built tier-extensible now.
- Domain `trochia.ai` migration — env-var swap when the domain bid completes.
- Business Memory ingestion logic (Phase 2), deck reviewer logic (Phase 3), investor pipeline / live raise (Phase 4), unified raise timeline XC-08 (Phase 2), and everything in Phases 5–11.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| FND-01 | Next.js 15/16 + TS + Tailwind + shadcn/ui monolith deployed to Vercel (Fluid Compute), marketing site from same repo, CI (lint + typecheck + Vitest + Playwright) on GitHub Actions | Next.js 16.1.x GA + Turbopack default (verified); App Router route groups `(marketing)` / `(app)` for one-repo deploy; GitHub Actions CI structure §"CI Pipeline" |
| FND-02 | Supabase provisioned (Postgres + pgvector HNSW + Storage); Drizzle manages schema/migrations; core tables exist (per D-03 = `users`/`accounts`/`sessions`/`subscriptions`/`jobs`); current publishable/secret keys (not anon/service_role) | Supabase Pro provisioning; Drizzle 0.44 + `drizzle-kit`; pgvector 0.8.x extension pre-available (enable now even though embeddings land Phase 2); new publishable/secret API keys §"Supabase keys" |
| FND-03 | RLS on every tenant-scoped table, default-deny, tRPC tenant-scoped context, CI check fails any new table lacking RLS + policy, two-user integration test | §"RLS architecture" — Drizzle `pgPolicy` + `enable row level security` in migrations; `auth.jwt() ->> 'tenant_id'` policy pattern; CI schema-scan via `pg_catalog`/`information_schema`; Vitest two-user test |
| FND-04 | Google SSO via Supabase Auth; sessions persist 30 days, refresh on activity; magic-link + TOTP MFA at V2 | `@supabase/ssr` PKCE cookie handling in `proxy.ts` + server components; session timer config §"Auth" (D-10 mapping flag) |
| FND-05 | Stripe billing live: Pre-Raise / Active Raise, Customer Portal, 7-day trial, card-on-file at signup, no permanent free tier, idempotent webhooks + reconciliation | §"Stripe" — `trial_period_days: 7` + `payment_method_collection: 'always'`; webhook handler verifies signature → dedupe on event id → updates `accounts.subscription_status` → emits Inngest event for slow work; reconciliation Inngest cron |
| FND-06 | `entitlements()` gates module/feature access by current Stripe tier, extensible to Close Mode / Alumni | §"Entitlements" — pure function over persisted `accounts.subscription_status` + tier; `assertEntitled(ctx, feature)` tRPC middleware; tier→features map as data |
| FND-07 | Resend (transactional email), Sentry (errors), Amplitude (product events), Langfuse (every production Anthropic call: cache hit rate, tokens, latency, cost) — all wired Phase 1 | §"Observability wiring" — `@sentry/nextjs` auto-instrument App Router; Amplitude browser + node SDK; Langfuse JS SDK in `ai/client.ts`; Resend + react-email |
| FND-08 | Site URL read everywhere from `process.env.NEXT_PUBLIC_SITE_URL` (+ `NEXT_PUBLIC_APP_URL`), never hardcoded | §"Env management" — already in `.env.local`; one `env.ts` Zod-validated module; ESLint `no-restricted-syntax` rule against literal `https://trochia` URLs is a cheap optional add |
| FND-09 | Single `ai/client.ts` chokepoint: prompt caching on stable prefix, model routing by task class, Zod-typed structured outputs, OpenAI/Codex fallback behind config flag; no production code calls Anthropic outside it | §"AI chokepoint design" — `cache_control: {type:'ephemeral'}` breakpoints; `ai/router.ts`; Zod→JSON-schema tool-use; `LLMProvider` interface; ESLint `no-restricted-imports` ban on `@anthropic-ai/sdk` outside `ai/**`; deploy-time Haiku health-check via Inngest |
| FND-10 | `tenant.region` column + `getDbForRegion()` factory establish multi-region seam (US+UK share US, India exists, EU at V2), built without over-engineering | §"Multi-region seam" — `region` enum column on `accounts`/`tenants`; `getDbForRegion(region)` returns US client for all branches now; connection-string lookup; interaction with Supavisor pooler + RLS |
| FND-11 | Background jobs on Inngest via single `serve()` endpoint, per-key concurrency limits, `jobs` table + Supabase Realtime status polling | §"Inngest" — `app/api/inngest/route.ts` `serve()` handler; `maxDuration` 300–800s; stub functions for future workloads + the live Haiku health-check; `jobs` row written by functions, client subscribes via Supabase Realtime |
| FND-12 | Onboarding shell end-to-end: Google sign-in → welcome → Knowledge Pack Import → deck upload → automatic deck review → dashboard with 3 CTAs; <5 min; funnel instrumented in Amplitude | §"Onboarding shell" — stepper UI per UI-SPEC; Amplitude event per stage transition; feature logic stubbed (Phase 2/3); skeletons; the 3 dashboard CTAs link to Phase-2/4/5 destinations with "Coming Phase N" badges |
| XC-01 | No customer data used for model training — stated in UI + ToS + DPA, enforced contractually with vendors; vendor data-flow inventory covers OpenAI/Codex fallback + Claude-Code build tooling | §"Compliance plumbing" — vendor data-flow inventory artifact (a markdown doc in repo: `docs/vendor-data-flow.md` or similar); Anthropic API = no-training, 7-day retention (confirmed in PITFALLS §5); codex bridge has no DB credentials (architectural boundary) |
| XC-02 | All external actions (email, intros, signature, payments) require explicit founder approval — no autonomous outreach at any phase | Reusable founder-approval Dialog built Phase 1 per UI-SPEC + styleguide demo; the approval gate lives in the domain module / UI, never in an integration adapter |
| XC-03 | Sensitive fields (cap-table, audio) encrypted at rest beyond Supabase native (dedicated keys); financial figures never in logs/training; logging-scrub discipline + CI lint | §"Compliance plumbing" — redacting logger wrapper + ESLint rule (D-06b); field-encryption helper stub in `lib/crypto` (pattern only, real encrypted columns Phase 8/9) |
| XC-04 | Founder can export all data on demand; account deletion → 30-day soft delete → permanent purge; GDPR/UK-GDPR/DPDP-grade DPA signed clickwrap at signup with data-subject-rights plumbing | §"Compliance plumbing" — `accounts.deleted_at` soft-delete column + Inngest cron that purges rows >30 days deleted; data-export endpoint (JSON dump of the tenant's rows); clickwrap acceptance recorded (timestamp + DPA version on `accounts` or a `legal_acceptances` table) |
| XC-05 | Compliance-language guardrails hold everywhere; banned-string CI check runs from Phase 0 | §"Banned-string CI check" — D-06a implementation |
| XC-06 | Prompt caching active on every production Anthropic call from day 1; cache hit rate instrumented in Langfuse, not assumed | §"AI chokepoint design" — `cache_control` breakpoints baked into `ai/client.ts`; log `cache_creation_input_tokens` vs `cache_read_input_tokens` to Langfuse; the deploy-time Haiku health-check produces the first real trace |
| XC-07 | Uploaded content treated as untrusted — delimited, prompt-injection screened, model output schema-validated; RAG cites real sources | Phase 1 establishes the *pattern* (the screening + delimit helper in `ai/`), not the feature; real enforcement starts Phase 2 (Knowledge Pack Import) / Phase 3 (decks) — note this scoping for the planner |
</phase_requirements>

## Summary

Phase 1 stands up the Trochia monolith and bakes in every cross-cutting guardrail the next ten phases lean on. The locked stack (Next.js 16.x App Router, Tailwind v4, shadcn/ui, tRPC v11, Drizzle 0.44, Zod v4, Supabase Postgres + pgvector + Auth, Inngest v4, Anthropic SDK via `ai/client.ts`, Stripe, Resend, Sentry, Amplitude, Langfuse, Vercel Pro/Fluid Compute) is correct for 2026 — Next.js 16 went GA on 2025-10-21 with Turbopack as the default bundler for `dev` and `build`, React 19 + React Compiler 1.0 on by default, and the one migration wrinkle (`middleware.ts` → `proxy.ts`) is irrelevant on a greenfield repo. There is no risk in the stack choice; the project-level research dated 2026-05-11 already validated each pick and the founder's decisions (CONTEXT.md) re-affirm them.

The work decomposes into a **Walking Skeleton** (D-08: signup → tier picker → Stripe Checkout → webhook updates `accounts.subscription_status` → user lands on `/app` showing their tier — the thinnest slice exercising auth + RLS + Stripe + webhook + tRPC + `entitlements()` end-to-end, deployed on Vercel) followed by progressive layers: RLS default-deny + CI schema-scan + two-user Vitest test; the `ai/client.ts` chokepoint (real, with prompt caching, model routing, Zod outputs, OpenAI fallback flag, a deploy-time Haiku health-check producing the first Langfuse trace, and an ESLint rule banning Anthropic-SDK imports outside `ai/**`); observability wiring (Sentry, Amplitude, Langfuse, Resend); compliance plumbing (banned-string CI check reading `tasks/banned-strings.txt`, redacting logger + ESLint scrub rule, vendor data-flow inventory artifact, clickwrap DPA + data-export + 30-day-soft-delete-then-purge); the multi-region seam (`region` enum column + `getDbForRegion()` factory that returns the US client on every branch); Inngest single `serve()` endpoint + `jobs` table + Supabase Realtime polling + stub job functions; the marketing site + auth/onboarding + app shell + `/styleguide` per the approved UI-SPEC.

**Primary recommendation:** Build the D-08 Walking Skeleton first as `SKELETON.md`, deploy it to Vercel, prove it works; then layer RLS → AI chokepoint → observability → compliance plumbing → region seam → Inngest → UI surfaces, with the CI pipeline (lint + typecheck + Vitest incl. RLS schema-scan + two-user test + banned-string check, + Playwright smoke) growing alongside. Single Next.js package, App Router route groups for marketing-vs-app — do not split into a monorepo. Pin `next@16.x` exactly.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Marketing site (`/`, `/pricing`, `/manifesto`, `/legal/*`) | Frontend Server (Next.js SSR/SSG) | CDN (Vercel edge) | Static-ish content; SSG/ISR; Lighthouse >90 gate means server-rendered, lean JS |
| Auth (Google SSO, session cookies) | Frontend Server (Next.js `proxy.ts` + server components) | API (Supabase Auth platform) | `@supabase/ssr` handles cookies in `proxy.ts`; Supabase Auth is the identity provider; `/app` gating is server-side redirect |
| Tenant isolation (RLS) | Database (Postgres RLS policies) | API (tRPC tenant-scoped context) | RLS is the backstop that physically can't leak; tRPC `ctx.tenantId` + `assertEntitled` is the ergonomic layer. Defense in depth — never app-code-only |
| Billing / `entitlements()` | API (tRPC + webhook route handler) | Database (`accounts.subscription_status`) + Stripe (source-of-truth-of-record) | Webhook writes persisted status; `entitlements()` reads persisted status, never calls Stripe inline; Customer Portal is Stripe-hosted |
| AI calls (`ai/client.ts`) | API (server-only module) | — | The single chokepoint. Anthropic SDK never imported outside `ai/**` (lint-enforced). Long AI work goes to Inngest, not inline in a request |
| Background jobs (Inngest) | API (Inngest `serve()` route on Vercel functions) | — | Inngest cloud orchestrates; each step is a short Vercel function invocation. `jobs` table + Supabase Realtime for UI status |
| Compliance CI (banned-string, RLS scan, logging-scrub) | Build/CI (GitHub Actions) | — | Not runtime — these are gates that block merge/deploy |
| Observability (Sentry, Amplitude, Langfuse, Resend) | Spans all tiers | — | Sentry instruments client + server + route handlers; Amplitude has browser + node SDKs; Langfuse lives inside `ai/client.ts`; Resend is server-side transactional email |
| Multi-region data-residency seam | API (`getDbForRegion()` factory) + Database (`region` column) | — | `region` on the tenant row; factory picks the connection string; today all branches → US Supabase. EU/IN add a project, flip a branch |
| Onboarding funnel | Frontend Server (Next.js routes) + API (Amplitude node SDK for non-spoofable events) | — | Stepper UI in `(app)` route group; stage-transition events to Amplitude; feature logic stubbed (Phase 2/3) |

## Standard Stack

### Core

| Library | Version (May 2026) | Purpose | Why Standard |
|---------|--------------------|---------|--------------|
| `next` | **16.1.x** (pin exactly) | React framework, App Router, marketing + app one repo | [VERIFIED: nextjs.org/blog/next-16 — GA 2025-10-21, Turbopack default for dev+build, React 19 + React Compiler 1.0 stable on by default, Node ≥20.9 (D-01 says Node 24)] Greenfield ⇒ start on 16, never the previous major. `middleware.ts`→`proxy.ts` rename is the one wrinkle — irrelevant greenfield. |
| `react` / `react-dom` | 19.x | UI runtime | [CITED: nextjs.org/blog/next-16] Ships with Next 16; React Compiler 1.0 stable — free memoization. |
| `typescript` | 5.7+ (whatever ships with `create-next-app@16`) | End-to-end type safety | [ASSUMED] Standard; with tRPC + Zod this is the solved full-stack TS setup. |
| `tailwindcss` | **v4.x** | Styling, CSS-first config, OKLCH | [CITED: ui.shadcn.com/docs/tailwind-v4] 2026 default; shadcn CLI initializes v4; `@theme` directive, `data-slot` attrs. `tailwind.config.ts` must match `docs/DESIGN-REFERENCE.md` § "Tailwind config additions Phase 1 must produce" exactly. |
| `shadcn/ui` | latest (CLI-distributed, unversioned) | Component layer (copy-in, you own the code) | [CITED: ui.shadcn.com] Dominant 2026 React UI pattern. **Not yet initialized — UI-SPEC says Phase 1 task 1 is `npx shadcn init` then theme to brand tokens, not a stock preset.** Components to install per UI-SPEC §"Component Inventory": Button, Input, Label, Form, Card, Dialog, Sheet, Tabs, Sonner/Toast, NavigationMenu, Avatar, Badge, DropdownMenu, Accordion. |
| `@trpc/server` `@trpc/client` `@trpc/next` `@trpc/tanstack-react-query` | **v11.x** | Type-safe API over Next route handlers | [CITED: trpc.io/docs/client/nextjs] v11 rewrote the Next adapter for App Router + RSC + streaming + React Query hydration. `protectedProcedure` injects `ctx.tenantId`. |
| `@tanstack/react-query` | v5.x | Client server-state cache | [ASSUMED] Standard; integrates with tRPC v11 prefetch/hydration. |
| `zod` | **v4.x** | Runtime validation, shared input/output schemas, `env.ts` validation, structured-output contracts | [CITED: project STACK.md, verified against current docs] Zod 4 current — faster, smaller. Used for tRPC inputs, react-hook-form resolver, env validation, AI structured-output schemas. |
| `react-hook-form` + `@hookform/resolvers` | v7.x | Form state | [ASSUMED] Standard pairing with Zod. Per UI-SPEC the Form component wires react-hook-form + Zod. |
| `motion` (NOT `framer-motion`) | v12.x | Animations — sparingly | [CITED: project STACK.md] Framer Motion rebranded to the `motion` package; same API. Used for the hero raise-timeline animation + page/scroll reveals only (UI-SPEC motion contract). Respect `prefers-reduced-motion`. |
| `lucide-react` | latest | Icons (1.5px stroke, 16/20/24, never filled) | [CITED: UI-SPEC] Standard with shadcn. |
| `@supabase/supabase-js` + `@supabase/ssr` | v2.x / current | Postgres/Auth/Storage/Realtime client; App Router cookie handling | [CITED: supabase.com/docs/guides/auth/server-side] `@supabase/ssr` = PKCE cookies in `proxy.ts` + server components. **Use the new publishable/secret API keys** — `anon`/`service_role` work through end-2026 but are deprecated; start on the new keys (FND-02 mandates this). |
| `drizzle-orm` + `drizzle-kit` | **0.44.x** (pin; 1.0 in beta — hold) | Type-safe SQL, migrations, RLS policies in migrations | [CITED: orm.drizzle.team + supabase.com/docs/guides/database/drizzle] RLS-aware; `drizzle-orm/supabase` helpers (`authenticatedRole`, `authUid`) + `pgPolicy()` make RLS first-class. Keep RLS policies in SQL migrations alongside schema. |
| `postgres` (the `pg` driver) | v3.x | Postgres connection driver for Drizzle | [ASSUMED] Standard Drizzle + Supabase pairing. Use Supavisor (Supabase's pooler) connection string for serverless; keep request-scoped clients short-lived. |
| `pgvector` | 0.8.x (extension, pre-available in Supabase) | Vector search (HNSW) | [CITED: supabase.com/docs/guides/ai] Enable the extension now (FND-02) even though the `embeddings` table + corpus land Phase 2. Use HNSW (not IVFFlat) when it's populated. |
| `inngest` | TS SDK **v4.x** | Background jobs, crons, webhook fan-out, durable multi-step | [CITED: inngest.com/docs] Single `serve()` handler at `app/api/inngest/route.ts`; Vercel↔Inngest integration auto-wires env + endpoint on deploy. `maxDuration` 300–800s (Pro). |
| `stripe` (Node SDK) + Stripe Tax | current | Subscriptions (2 active tiers + extensible), Customer Portal, 7-day trial, card-on-file at signup, VAT/GST | [CITED: stripe.com/docs] `trial_period_days: 7` + `payment_method_collection: 'always'`; Customer Portal for self-serve; Products/Prices for Pre-Raise/Active Raise monthly+annual. Stripe Tax calculates (you still file — fine at MVP). |
| `@anthropic-ai/sdk` | current (Claude Opus 4.7 / Sonnet 4.6 / Haiku 4.5) | The Anthropic client — **imported only inside `ai/**`** | [CITED: platform.claude.com/docs] `cache_control: {type:'ephemeral'}` breakpoints on the stable prefix; 1M context flat-rate on Opus/Sonnet; prompt caching = 90% discount on cached input reads. |
| `openai` | current | **Fallback only**, behind an `LLMProvider` interface + config flag | [CITED: project STACK.md] Build a thin provider interface so a swap is config not rewrite; do NOT route production traffic by default; the codex bridge has no DB credentials (PITFALLS §5 architectural boundary). |
| `langfuse` (JS SDK) | v3.x | LLM observability + (later) eval harness — traces every Anthropic call (prompt, model, tokens, cost, cache hit, latency) | [CITED: project STACK.md] MIT-licensed; lives inside `ai/client.ts`. Self-host on a tiny Postgres or use Langfuse Cloud free tier (5K traces/mo) to start. The deploy-time Haiku health-check produces the first real trace (XC-06). |
| `@sentry/nextjs` | v9+ | Error monitoring, performance, (optional) session replay | [CITED: project STACK.md] Auto-instruments App Router, server actions, route handlers. Sentry **Team** plan (D-01b). |
| `@amplitude/analytics-browser` + `@amplitude/analytics-node` | v2.x | Product analytics, the onboarding funnel | [CITED: project STACK.md] Browser SDK for client events; node SDK for server-side revenue/lifecycle events you don't want client-spoofable. |
| `resend` + `react-email` + `@react-email/components` | current / v4.x | Transactional email (auth, billing receipts, system notifications) | [CITED: project STACK.md] Trochia→founder system mail only — founder-approved investor emails (later phases) go via the founder's own Gmail, not Resend. |
| `tsx` | latest | Run TS scripts (migrations, seeds, the eval/health-check runners) | [ASSUMED] Standard dev tool. |
| `zod-to-json-schema` | latest | Convert Zod schemas → JSON Schema for Anthropic tool-use (structured output) | [CITED: project STACK.md] Forced tool use = reliable structured output; re-parse with Zod for safety. |

### Supporting (testing + CI)

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `vitest` + `@vitest/ui` | v3.x | Unit + integration tests — incl. the **two-user RLS isolation test** and the **schema-scan test** | [CITED: vitest.dev] 2026 default; native ESM/TS. The RLS integration test seeds tenant A + B with two tenant-scoped clients and asserts B reads zero of A's rows. |
| `@testing-library/react` + `jsdom` (or `happy-dom`) | latest | Component unit tests — sparingly | [CITED: project STACK.md] Push most UI testing to Playwright; use RTL for pure-logic components. |
| `@playwright/test` | v1.5x | E2E smoke (Phase 1: the Walking-Skeleton path + onboarding flow) | [CITED: project STACK.md] ~5–10 specs in Phase 1, not hundreds. Runs against the Vercel preview URL in CI. Also the optional two-session RLS smoke check (D-04). |
| `msw` | v2.x | Mock Stripe/Anthropic/etc. in tests | [CITED: project STACK.md] Deterministic tests without burning tokens or hitting Stripe. |
| `eslint` + `@typescript-eslint/*` + `eslint-plugin-import` (or `eslint-plugin-boundaries`) | latest | Lint, **import-boundary rules** (`no-restricted-imports` for `@anthropic-ai/sdk` outside `ai/**`; `safe-engine`/`cap-table-engine` may not import `ai/**`), the **no-raw-`console.*` logging-scrub rule** | [CITED: project ARCHITECTURE.md] These rules are non-negotiable Phase 1 deliverables (D-06b, D-06c). `eslint-plugin-boundaries` is the cleaner tool for the directory-boundary rules; plain `no-restricted-imports` works for the Anthropic-SDK ban. |
| `prettier` (or `biome`) | latest | Format | [ASSUMED] Standard; Biome if you want one fast tool for lint+format — but the boundary/scrub rules above are easier in ESLint, so plain ESLint + Prettier is the safe pick. |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Next.js 16.x | Next.js 15.x (pinned) | Only if 15 scaffolding already worked; greenfield ⇒ no reason. D-01 locks 16. |
| Drizzle 0.44 | Prisma | Prisma has more mature migration tooling but a heavier generated client; Drizzle's RLS-in-migrations story is cleaner for Supabase. D-locked. |
| Supabase Auth | Clerk | Clerk = better auth DX (orgs, MFA UI) but +$25/mo + per-MAU; not needed for Google-SSO-only MVP. STATE.md records "Supabase Auth (not Clerk)". |
| Inngest v4 | Trigger.dev v4 | Trigger.dev = Apache-2.0 self-hostable, direct-invocation model; Trochia's workload is event-shaped and the `inngest` skill exists. D-locked. |
| Langfuse | Braintrust | Braintrust = fully-managed eval + CI-blocking, 1M-span/mo free tier, but proprietary; Langfuse is OSS + the `langfuse` skill exists. D-13 names Langfuse. |
| Single Next.js package + route groups | Turborepo monorepo (`apps/web` + `apps/marketing`) | A monorepo adds tooling overhead for zero benefit when marketing + app share the same brand system, components, and deploy target. **Recommendation: single package, App Router route groups `(marketing)` and `(app)`** — the project ARCHITECTURE.md already structures it this way. |
| ESLint + Prettier | Biome | Biome is one fast tool but the import-boundary + custom logging-scrub rules are more mature in the ESLint ecosystem. Recommendation: ESLint + Prettier. |

**Installation (greenfield):**
```bash
npx create-next-app@latest trochia --typescript --tailwind --app --eslint   # Next 16.x + Tailwind v4 + TS
npx shadcn@latest init                                                       # then theme to brand tokens (not a stock preset)
npm install @trpc/server @trpc/client @trpc/next @trpc/tanstack-react-query @tanstack/react-query zod
npm install drizzle-orm postgres && npm install -D drizzle-kit tsx
npm install @supabase/supabase-js @supabase/ssr
npm install react-hook-form @hookform/resolvers motion
npm install inngest
npm install stripe
npm install resend react-email @react-email/components
npm install @sentry/nextjs @amplitude/analytics-browser @amplitude/analytics-node
npm install @anthropic-ai/sdk openai langfuse zod-to-json-schema
npm install -D vitest @vitest/ui jsdom @testing-library/react @testing-library/jest-dom @playwright/test msw
npm install -D eslint-plugin-boundaries   # or rely on @typescript-eslint no-restricted-imports
```

**Version verification (run before pinning):**
```bash
npm view next version          # expect 16.1.x line — VERIFIED via web search 2026-05-12: Next 16 GA 2025-10-21, Turbopack default
npm view @trpc/server version  # expect 11.x
npm view drizzle-orm version   # pin the 0.44.x line, NOT 1.0-beta
npm view inngest version       # expect 4.x
npm view tailwindcss version   # expect 4.x
npm view zod version           # expect 4.x
npm view @anthropic-ai/sdk version
```
The project STACK.md (2026-05-11) already verified these against Context7 + official docs one day before this research — treat its version table as authoritative, but re-run `npm view` at scaffold time since the gap is small but nonzero.

## Architecture Patterns

### System Architecture Diagram

```
                          ┌──────────────────────────────────────────────────────┐
   Browser ───HTTPS──────▶│  Vercel (Fluid Compute) — Next.js 16 App Router       │
   (founder)              │                                                       │
                          │  app/(marketing)/  ──SSG/ISR──▶  /, /pricing,         │
                          │                                  /manifesto, /legal/* │
                          │  app/(app)/        ──SSR + gate──▶ /app, /onboarding,  │
                          │      ▲  proxy.ts: @supabase/ssr  /styleguide, settings │
                          │      │  PKCE cookies; redirect if no active sub        │
                          │      │                                                │
                          │  app/api/trpc/[trpc]/route.ts ──┐                      │
                          │      │  createTRPCContext:      │  one router/module   │
                          │      │  session → tenantId →    │  → appRouter         │
                          │      │  getDbForRegion(region)  │  protectedProcedure  │
                          │      │  → request-scoped Drizzle│  + assertEntitled    │
                          │      ▼  client (runs as          │                     │
                          │         `authenticated` role)  ◀┘                      │
                          │  app/api/webhooks/stripe/route.ts ── verify sig →      │
                          │      dedupe on event id → update accounts.sub_status → │
                          │      emit Inngest event (slow work)                    │
                          │  app/api/inngest/route.ts ── Inngest serve() handler   │
                          │  ai/client.ts ── ONLY place @anthropic-ai/sdk is       │
                          │      imported (lint-enforced); cache_control prefix;   │
                          │      model routing; Zod outputs; OpenAI fallback flag; │
                          │      Langfuse trace per call                           │
                          └───┬──────────────┬───────────────┬────────────────────┘
                              │              │               │
                ┌─────────────▼───┐   ┌──────▼──────┐   ┌────▼─────────────────────┐
                │ Supabase (US)   │   │  Inngest    │   │  External services        │
                │  Postgres +     │   │  cloud      │   │  Stripe (billing+portal)  │
                │  RLS (default-  │   │  orchestr.: │   │  Anthropic API (no-train) │
                │  deny on every  │   │  stub jobs  │   │  Resend (system email)    │
                │  tenant table)  │   │  + Haiku    │   │  Sentry / Amplitude /     │
                │  pgvector ext   │◀──│  health-    │   │  Langfuse (observability) │
                │  Auth (Google)  │   │  check ping │   └───────────────────────────┘
                │  Storage        │   │  + crons:   │
                │  Realtime ──────┼──▶│  reconcile  │   getDbForRegion('in'|'eu') ──▶ (today: returns US client.
                │  (jobs status)  │   │  Stripe;    │       When a real IN/EU founder signs up: provision the
                └─────────────────┘   │  purge soft-│       region's Supabase project, flip that one branch.)
                                      │  deleted    │
                                      └─────────────┘

   CI (GitHub Actions, on PR + main):  lint (incl. import-boundary + no-console + no-Anthropic-outside-ai/) →
     typecheck → Vitest (unit + RLS schema-scan + two-user isolation test) → banned-string check
     (reads tasks/banned-strings.txt over src/**/*.{ts,tsx,md,mdx} + public/**/*.md) → Playwright smoke
     (against Vercel preview: the Walking-Skeleton path).  Green CI = Phase 1 exit gate.
```

### Recommended Project Structure (single Next.js package)

```
src/
├── app/
│   ├── (marketing)/            # / /pricing /manifesto /legal/{privacy,terms,security,dpa}
│   ├── (app)/                  # /app /app/settings /app/billing /onboarding /styleguide
│   │   │                       #   + thin placeholder /app/memory /app/pitch /app/pipeline /app/live-raise
│   │   └── proxy.ts            # (was middleware.ts) @supabase/ssr cookie handling + /app gate
│   ├── (auth)/                 # /sign-up /sign-in (centered-card layout per UI-SPEC)
│   └── api/
│       ├── trpc/[trpc]/route.ts
│       ├── webhooks/stripe/route.ts        # thin: verify sig → dedupe → update sub_status → emit Inngest event
│       └── inngest/route.ts                # Inngest serve() handler
├── server/
│   ├── trpc.ts                 # initTRPC, protectedProcedure, assertEntitled middleware
│   ├── context.ts              # session → tenantId → getDbForRegion(region) → request-scoped Drizzle client
│   └── routers/                # billingRouter, accountRouter, ... → appRouter
├── db/
│   ├── schema/
│   │   ├── tenancy.ts          # users, accounts(=tenants), sessions, memberships  [Phase 1 tables]
│   │   ├── billing.ts          # subscriptions / subscription state on accounts     [Phase 1]
│   │   ├── jobs.ts             # jobs table for Inngest status + Realtime polling    [Phase 1]
│   │   └── legal.ts            # legal_acceptances (DPA/ToS clickwrap: version + ts)  [Phase 1]
│   ├── rls.ts                  # pgPolicy definitions co-located; drizzle-orm/supabase helpers
│   ├── client.ts               # request-scoped (RLS) client factory + service-role client (narrow escape hatch)
│   ├── region.ts               # getDbForRegion(region) — all branches → US client today
│   └── migrations/             # drizzle-kit; each CREATE TABLE migration also does ENABLE RLS + policy
├── ai/                         # the ONLY place @anthropic-ai/sdk is imported (lint-enforced)
│   ├── client.ts               # Anthropic wrapper; cache_control prefix mgmt; retries; Langfuse trace
│   ├── router.ts               # model routing: Opus / Sonnet / Haiku per task class
│   ├── fallback.ts             # OpenAI/Codex bridge — config-flagged, no DB credentials
│   ├── schemas/                # Zod schemas for structured outputs (mostly empty in Phase 1)
│   ├── untrusted.ts            # delimit + prompt-injection screen helper (pattern; real use Phase 2/3)
│   └── health-check.ts         # ~10-token Haiku ping; invoked by an Inngest job on deploy
├── modules/
│   └── billing/                # Stripe state ↔ tier; entitlements(account) pure function; tier→features map
├── inngest/
│   ├── client.ts
│   └── functions/              # stub: deck-parse, embed, transcribe, brief-enrich, esign-webhook, reminders;
│                               #   real: ai-health-check (on deploy), reconcile-stripe (cron), purge-soft-deleted (cron)
├── lib/
│   ├── env.ts                  # Zod-validated process.env; SITE_URL/APP_URL read here, never hardcoded
│   ├── logger.ts               # redacting logger wrapper (sensitive field names scrubbed)  [D-06b]
│   ├── crypto.ts               # field-encryption helper STUB (pattern only; real encrypted cols Phase 8/9)
│   └── errors.ts
├── components/                 # shadcn/ui themed to brand tokens + cross-cutting primitives:
│                               #   founder-approval Dialog, destructive-confirm Dialog, legal-disclaimer banner,
│                               #   empty-state, error-state, skeleton, section-divider, app shell, marketing top bar, footer
└── styles/ tailwind config etc.
docs/vendor-data-flow.md        # the vendor data-flow inventory artifact (XC-01)
tasks/banned-strings.txt        # the banned-strings list the CI check reads (D-06a) — Phase 1 creates it
tasks/lessons.md                # per global CLAUDE.md self-improvement loop — Phase 1 creates it
.github/workflows/ci.yml        # the CI pipeline (D-06d)
```

### Component Responsibilities

| Component | Owns | Notes |
|-----------|------|-------|
| `proxy.ts` (was `middleware.ts`) | Supabase session cookie refresh (PKCE) on every request; redirect unauthenticated/un-subscribed users away from `(app)` routes | Next 16 renamed `middleware.ts`→`proxy.ts` — use the new name from the start |
| `server/context.ts` | Resolve Supabase JWT → `user_id` → `account_id` (tenant) → `region` → construct a request-scoped Drizzle client that runs as the `authenticated` role so RLS applies | Service-role client is a separate, narrowly-used escape hatch (webhooks with no session, Inngest jobs that carry an explicit `tenantId`, account-deletion) |
| `db/rls.ts` + migrations | RLS enablement + policies — every tenant table has `ENABLE ROW LEVEL SECURITY`, a default-deny posture, and a `USING (account_id = (auth.jwt() ->> 'tenant_id')::uuid)` policy | Drizzle's `pgPolicy()` + `drizzle-orm/supabase` helpers make this first-class; co-locate policy defs with the table schema |
| `db/region.ts` `getDbForRegion()` | Map a tenant's `region` enum value → the correct Supabase connection string; today every branch returns the US client | The seam — when a real IN/EU founder appears, provision that project and change one branch. tRPC `context.ts` calls this with `ctx.region` |
| `modules/billing/entitlements.ts` | `entitlements(account) → { tier, features }` — pure function over the persisted `accounts.subscription_status` + `accounts.tier`; never calls Stripe inline | `assertEntitled(ctx, 'feature')` tRPC middleware consults it; tier→features map is data so adding Close Mode/Alumni is a data change |
| `app/api/webhooks/stripe/route.ts` | Verify the Stripe signature → dedupe on `event.id` (Upstash Redis or a `processed_stripe_events` table) → update `accounts.subscription_status`/`tier`/`current_period_end` → emit an Inngest event for any slow follow-up; return 200 fast | Idempotent. Handles `checkout.session.completed`, `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.payment_failed` (D-02c) |
| `inngest/functions/reconcile-stripe` (cron) | Periodically re-pull subscription state from the Stripe API and reconcile against `accounts` — webhooks are an optimization, the poller is the safety net for billing tier (PITFALLS §18) | |
| `inngest/functions/purge-soft-deleted` (cron) | Find `accounts.deleted_at` older than 30 days → permanently delete that tenant's rows (XC-04) | |
| `inngest/functions/ai-health-check` (on deploy) | Make a ~10-token Haiku call through `ai/client.ts` so Langfuse captures a real trace (cache hit rate, tokens, latency, cost) before Phase 2 builds on it (D-09, XC-06) | |
| `ai/client.ts` | The single Anthropic chokepoint — `cache_control` breakpoints on the stable prefix (system prompt → tool defs → corpus → Business Memory, mostly empty in Phase 1), model routing, Zod-validated structured output via forced tool use, one repair retry → OpenAI fallback (config-flagged), Langfuse trace with `cache_creation_input_tokens`/`cache_read_input_tokens` | ESLint forbids `import ... from '@anthropic-ai/sdk'` anywhere outside `ai/**` |
| `lib/logger.ts` | A redacting logger — scrubs known sensitive field names (financial amounts, cap-table figures, audio refs — small list now, grows Phase 8/9) before anything reaches Sentry/console; an ESLint rule bans raw `console.*` in `src/**` (D-06b, XC-03) | |
| `components/` cross-cutting primitives | Founder-approval Dialog (XC-02 — reusable, `Send {thing}` primary + "Keep editing" dismiss, styleguide demo), destructive-confirmation Dialog (`bg-danger` verb+noun confirm + "Keep {noun}" dismiss), legal-disclaimer banner (two variants), empty-state, error-state, skeleton, section divider, app shell (sidebar + top bar), marketing top bar, footer — all themed to brand tokens, all demoed on `/styleguide` | Per the approved UI-SPEC. `/styleguide` rendering all of these (themed, not stock) is a Phase 1 exit gate |

### Pattern 1: Tenant-scoped tRPC context backed by Postgres RLS (defense in depth)

**What:** Two layers of tenant isolation. (1) **Postgres RLS** is the backstop — every tenant table has `account_id` (the tenant) and a policy `USING (account_id = (auth.jwt() ->> 'tenant_id')::uuid)`; queries run as the `authenticated` Postgres role, so even a buggy query physically cannot return another tenant's rows. (2) **tRPC `protectedProcedure`** is the ergonomic layer — resolves the session, looks up the tenant, exposes `ctx.tenantId` + `ctx.region` + a request-scoped Drizzle client; application queries still filter by `ctx.tenantId` for clarity, but RLS is what makes it *safe*. The Drizzle client for the request is built by `getDbForRegion(ctx.region)` (D-05).

**When to use:** Every read/write of tenant data. The service-role (RLS-bypassing) client exists only for: Stripe webhook handlers (no user session — look up tenant from the payload), Inngest jobs (carry an explicit `tenantId` and re-assert it), account deletion. Those call sites are a short, audited list.

**Example (from project ARCHITECTURE.md, adapted):**
```typescript
// db/schema/tenancy.ts — every tenant table follows this shape
export const someTenantTable = pgTable('some_tenant_table', {
  id: uuid().primaryKey().defaultRandom(),
  accountId: uuid().notNull().references(() => accounts.id, { onDelete: 'cascade' }),
  // ...columns
}, (t) => [
  pgPolicy('tenant_isolation', {
    for: 'all',
    to: authenticatedRole,                                  // drizzle-orm/supabase helper
    using: sql`${t.accountId} = (auth.jwt() ->> 'tenant_id')::uuid`,
    withCheck: sql`${t.accountId} = (auth.jwt() ->> 'tenant_id')::uuid`,
  }),
]);
// the migration that creates this table ALSO runs: ALTER TABLE some_tenant_table ENABLE ROW LEVEL SECURITY;
// (default-deny: with RLS enabled and only this policy, no row is visible without a matching JWT claim)

// server/context.ts
export async function createTRPCContext({ req }: { req: Request }) {
  const supabase = createServerClient(/* @supabase/ssr cookies */);
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return { session: null, tenantId: null, region: null, db: null };
  const account = await resolveAccount(session.user.id);          // service-role lookup, narrow
  const db = getDbForRegion(account.region)(session.access_token); // runs as `authenticated`, JWT carries tenant_id
  return { session, tenantId: account.id, region: account.region, db };
}

// server/trpc.ts
const protectedProcedure = t.procedure.use(({ ctx, next }) => {
  if (!ctx.session || !ctx.tenantId || !ctx.db) throw new TRPCError({ code: 'UNAUTHORIZED' });
  return next({ ctx: { ...ctx, session: ctx.session, tenantId: ctx.tenantId, db: ctx.db } });
});
function assertEntitled(feature: string) {
  return protectedProcedure.use(async ({ ctx, next }) => {
    const ent = await entitlements(await ctx.db.query.accounts.findFirst(/* ctx.tenantId */));
    if (!ent.features.includes(feature)) throw new TRPCError({ code: 'FORBIDDEN' });
    return next();
  });
}
```
> Note: the exact JWT-claim plumbing for RLS (whether you `set local request.jwt.claims` on a `postgres.js` connection, or use a Supabase client whose JWT carries `tenant_id` as a custom claim, or set `tenant_id` via a Supabase Auth Hook that injects it into the JWT) is the one piece the planner must nail down with current Supabase docs — see Open Questions. The shape above is correct; the wiring detail needs a Context7/docs check at plan time.

### Pattern 2: RLS schema-scan CI check

**What:** A test (Vitest, run in CI) that connects to a fresh migrated DB and fails if **any** table outside an explicit allowlist (the curated `corpus` table, which is global/read-only and will exist Phase 2) has `rowsecurity = false` or zero policies.

```sql
-- the query the check runs (against the migrated schema):
SELECT c.relname AS table_name, c.relrowsecurity AS rls_enabled,
       count(p.polname) AS policy_count
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
LEFT JOIN pg_policy p ON p.polrelid = c.oid
WHERE n.nspname = 'public' AND c.relkind = 'r'
GROUP BY c.relname, c.relrowsecurity;
-- fail the test if any row (not in the allowlist) has rls_enabled = false OR policy_count = 0
```
**When to use:** Every CI run. New table in a migration without `ENABLE ROW LEVEL SECURITY` + a policy ⇒ red build. This is the operational form of "RLS default-deny on every table."

### Pattern 3: AI chokepoint with enforced prompt caching + model routing

**What:** Every AI capability is a function `(input) => Promise<ZodInferredOutput>` that internally (1) builds a prompt as **stable prefix + variable suffix** — the stable prefix (system instructions → tool/schema defs → curated corpus → confirmed Business Memory, mostly empty in Phase 1) gets `cache_control: { type: 'ephemeral' }` so it's billed once and reused; (2) calls Anthropic via `ai/client.ts` requesting structured output validated against the agent's Zod schema (forced tool use); (3) on parse failure, one repair retry, then the OpenAI/Codex fallback (config-flagged); (4) emits a Langfuse trace with token counts + cache-hit ratio. `ai/router.ts` picks the model by task class: Haiku (classification/polling/cheap Q&A) / Sonnet 4.6 (high-volume drafting) / Opus 4.7 (deep reasoning — deck review, brief synthesis). In Phase 1 the only live call is the deploy-time `ai/health-check.ts` Haiku ping; the chokepoint and lints exist so Phase 2 builds on a proven path.

**Anti-patterns to avoid (from PITFALLS §3, §5, §19):**
- ❌ Enforcing tenant isolation in application code alone (no RLS) — one missing `.where(eq(t.accountId, ...))` leaks a founder's data.
- ❌ Using the `service_role` key in an SSR client that also holds a user cookie, or putting it in any `NEXT_PUBLIC_*` var.
- ❌ Skipping prompt caching ("mandatory in the docs" ≠ "automatically done") — wire `cache_control` and *verify* via the response's cache-hit metrics in Langfuse.
- ❌ Routing production traffic through OpenAI by default, or giving the codex bridge DB credentials.
- ❌ Logging deck text / financial figures / transcript bodies to Sentry/Amplitude/Langfuse — IDs and event types only.
- ❌ A non-idempotent Stripe webhook handler — replaying an event must be a no-op.
- ❌ Pasting real customer data into Claude Code / Cursor / ChatGPT to debug — synthetic fixtures only (put this in `tasks/lessons.md` + CLAUDE.md).
- ❌ Centered hero text, gradient section backgrounds, drop-shadows on cards, bare "Cancel"/"Submit"/"Send" button labels, Tailwind colors/fonts outside the brand token system, hardcoded site URLs — all banned by the UI-SPEC anti-patterns list / Code Reviewer.
- ❌ Splitting into a monorepo — single Next.js package, route groups.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Auth / sessions / Google SSO | Custom OAuth + session store | Supabase Auth + `@supabase/ssr` | PKCE, cookie handling, JWT, refresh — all solved; RLS-native |
| Tenant isolation | App-code `where account_id =` everywhere | Postgres RLS policies (Drizzle `pgPolicy`) as the backstop | One forgotten `where` = existential leak; RLS is physical |
| Billing state machine | Hand-rolled subscription tracking | Stripe Billing + Customer Portal + webhooks → persisted `accounts.subscription_status` | Trials, proration, dunning, tax — Stripe's job; you persist + read |
| Background jobs / retries / crons | A `setInterval` / a bespoke queue | Inngest v4 (single `serve()` endpoint) | Retries, step memoization, concurrency caps, durable multi-step — all free; runs your code on Vercel |
| Schema migrations | Hand-written SQL files run manually | `drizzle-kit` | Diffing, ordered migrations, type-safe schema |
| LLM observability / cost tracking | Custom logging of token counts | Langfuse JS SDK inside `ai/client.ts` | Traces, cache-hit metrics, cost-per-call, datasets for the eval harness later |
| Error monitoring | `try/catch` + console | `@sentry/nextjs` (auto-instruments App Router) | Source maps, breadcrumbs, performance, session replay |
| Product analytics / funnels | Custom event table + dashboards | Amplitude (browser + node SDK) | Funnels, retention, cohorts — and the onboarding-funnel instrumentation FND-12 requires |
| Transactional email | Raw SMTP / nodemailer | Resend + `react-email` | Deliverability, typed templates, previews |
| Forms + validation | Custom controlled inputs + ad-hoc checks | react-hook-form + Zod resolver | Per UI-SPEC; one Zod schema is the input contract everywhere |
| UI components | Bespoke buttons/dialogs/dropdowns | shadcn/ui (themed to brand tokens) + Radix primitives | You own the code; accessible; matches the UI-SPEC component inventory |
| PDF generation (DPA download, later briefs) | Hand-built PDF byte streams | `@react-pdf/renderer` (Trochia-authored docs) | Declarative React → PDF, runs in a plain Node function — Phase 1 only needs the DPA-as-PDF; the SAFE/legal-fidelity path (docxtemplater → LibreOffice) is Phase 9 |
| Idempotency / dedupe / rate limiting | In-memory maps | Upstash Redis (`@upstash/ratelimit`) or a `processed_stripe_events` table | Serverless-safe; pay-per-request; also the Stripe-webhook dedupe store |

**Key insight:** Phase 1's whole job is to make the right *patterns* cheap to follow for ten more phases. Every "don't hand-roll" above is also a *boundary* — `ai/` is a wall, RLS is a backstop, Inngest is the slow-work lane, the redacting logger is the only logger, the brand token system is the only color/font source. Build the boundary once, lint-enforce it, and the rest of the build can move fast inside it.

## Common Pitfalls

### Pitfall 1: A new table ships without RLS — silent in dev, catastrophic in prod
**What goes wrong:** A Drizzle migration creates a table, `ENABLE ROW LEVEL SECURITY` is never run, every row is readable through the Supabase API by anyone with a publishable key. Or RLS is on but a policy is missing → silent empty results in dev (you don't notice). Or a query joins to a second table whose RLS you forgot — each table's policy is checked independently; the join leaks.
**Why it happens:** RLS-off is the *default* for new tables; Drizzle doesn't manage RLS for you; you don't notice in a single-tenant dev DB.
**How to avoid:** Default-deny as a migration convention — every `CREATE TABLE` migration in the same file does `ENABLE RLS` + the standard policy. The **RLS schema-scan CI check** (Pattern 2) fails the build if any table lacks RLS + a policy. The **two-user Vitest integration test** (User A creates data, User B queries every endpoint and gets zero of A's rows) is the single highest-leverage test in the codebase — write it in Phase 1, keep it green forever.
**Warning signs:** A new migration has `CREATE TABLE` but no `ENABLE ROW LEVEL SECURITY`; a logged-in user gets empty results in prod "for no reason"; the `service_role` key appears in a client component or a `NEXT_PUBLIC_*` var.

### Pitfall 2: Prompt caching "mandatory" but never actually wired
**What goes wrong:** The `ai/client.ts` chokepoint exists but `cache_control` breakpoints aren't placed, or are placed after the volatile content, so nothing caches; the bill (later, when Phase 2+ adds the corpus + memory to the prefix) is 30–50% higher than it should be and nobody notices because cache-hit rate was never instrumented.
**Why it happens:** "Mandatory" instructions get skipped under deadline; in Phase 1 the prefix is mostly empty so it *feels* like there's nothing to cache.
**How to avoid:** Bake `cache_control: {type:'ephemeral'}` breakpoints on the stable prefix into `ai/client.ts` *now*, even though the prefix is thin; log `cache_creation_input_tokens` vs `cache_read_input_tokens` to Langfuse; the deploy-time Haiku health-check (D-09) produces the first real trace so you can confirm caching took effect before Phase 2.
**Warning signs:** Langfuse traces show 0% cache reads and nobody's checked; the prefix/suffix split in `ai/prompts/` doesn't exist.

### Pitfall 3: Non-idempotent Stripe webhook → wrong billing tier
**What goes wrong:** A webhook is missed (founder's tier wrong, or churned user keeps access), or delivered twice (double-applied), or out of order. `entitlements()` reads the wrong status; a founder is locked out while paying, or has access while canceled.
**Why it happens:** Webhooks "work in testing"; the unhappy paths (missed/duplicate/out-of-order delivery) are invisible until prod; a reconciliation job feels like over-engineering.
**How to avoid:** Webhook handler verifies the signature + dedupes on `event.id` (Upstash Redis or a `processed_stripe_events` table) + applies idempotently. An Inngest **reconciliation cron** periodically re-pulls subscription state from the Stripe API and reconciles `accounts` — webhooks are an optimization, the poller is the safety net. Use the Customer Portal for self-serve changes (reduces drift surface).
**Warning signs:** The handler isn't idempotent; there's no reconciliation job; "I canceled but still charged" / "I'm paying but locked out" bug reports.

### Pitfall 4: Onboarding > 5 minutes / card-on-file spooks people / first impression is broken
**What goes wrong:** Phase 1 only ships the *shell* (feature logic is Phase 2/3), but if the shell itself is slow, has a "tell us about your company" form, or the skeleton states look broken, founders bounce — and with 25 design partners in a tight community, a bad first impression amplifies.
**Why it happens:** Onboarding is built last, fast; "card at signup" + "5-minute wow" are in tension and the wow side gets shortchanged; the skeleton states get no design love.
**How to avoid:** Ruthless step count (sign in → import → upload → review skeleton → dashboard, no "about your company" form — the import does that in Phase 2). Skeleton states use the UI-SPEC's `bg-stone/60 animate-pulse` blocks matching content layout, not spinners. Instrument the funnel in Amplitude *now* (FND-12) so Phase 2/3 can see drop-off. The three dashboard CTAs link to their destinations with "Coming Phase N" badges — never disabled with no affordance.
**Warning signs:** The onboarding shell takes >5 min in a real click-through; a "tell us about your company" form appears; Amplitude shows the funnel isn't instrumented.

### Pitfall 5: Hardcoded `https://trochia...` URL slips in
**What goes wrong:** Someone writes `https://trochia.asranest.com` (or `trochia.ai`) directly in a component, an OG-image tag, an email template, or a Stripe redirect URL — the `trochia.asranest.com` → `trochia.ai` migration (FND-08) then requires code changes instead of an env-var swap.
**Why it happens:** It's faster in the moment; the migration feels far off.
**How to avoid:** One Zod-validated `lib/env.ts` that exports `SITE_URL`/`APP_URL` from `process.env.NEXT_PUBLIC_SITE_URL`/`NEXT_PUBLIC_APP_URL` (already in `.env.local`); everything reads from there. An ESLint `no-restricted-syntax` rule matching string literals containing `https://trochia` is a cheap optional add. Code Reviewer rejects hardcoded URLs (project CLAUDE.md workflow rule 4).
**Warning signs:** `grep -r 'https://trochia' src/` returns anything outside `lib/env.ts` and test fixtures.

### Pitfall 6: Supabase Auth can't express all three D-10 session timers
**What goes wrong:** D-10 wants 1-hour JWT expiry + 30-day inactivity timeout + 90-day absolute lifetime. Supabase Auth's settings may not have a distinct "absolute session lifetime" knob separate from "inactivity timeout" — the planner could plan for three and discover only two are configurable.
**Why it happens:** Platform settings change; the three-timer model is more granular than some auth platforms expose.
**How to avoid:** The planner must confirm against current Supabase Auth docs (Context7 / supabase.com/docs/guides/auth) which of "JWT expiry limit" / "Inactivity timeout" / "Time-box user sessions" exist. D-10's fallback is explicit: JWT expiry + inactivity timeout are the must-haves; the 90-day absolute cap is best-effort. Don't block on this — flag it in PLAN.md as a verify-at-implementation item.
**Warning signs:** PLAN.md asserts three configurable timers without a docs citation.

## Runtime State Inventory

> This is a greenfield repo (no prior phases) — there is no pre-existing runtime state to migrate. The categories below are answered for completeness.

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | None — no database exists yet. Phase 1 *creates* the first tables (`users`, `accounts`, `sessions`, `subscriptions`, `jobs`, `legal_acceptances`). | None |
| Live service config | `.vercel/` exists (Vercel project already linked); `.env.local` exists (99 bytes — `NEXT_PUBLIC_SITE_URL` + `NEXT_PUBLIC_APP_URL` per inspection). Supabase project, Stripe account, Inngest app, Sentry/Amplitude/Langfuse/Resend accounts must be **provisioned** in Phase 1 (founder has Vercel Pro / Supabase Pro / Sentry Team per D-01b) and their secrets injected into Vercel env. The Vercel↔Inngest integration auto-wires the Inngest endpoint + env vars on deploy. | Provision the services; inject secrets into Vercel env (keep them in 1Password per Build Stack v2); **do not clobber** the existing `.env.local`. |
| OS-registered state | None — nothing OS-level. | None |
| Secrets / env vars | `.env.local` has `NEXT_PUBLIC_SITE_URL` + `NEXT_PUBLIC_APP_URL` (build URL = `https://trochia.asranest.com`). Phase 1 adds: Supabase publishable/secret keys + DB connection strings, Stripe secret + webhook signing secret + price IDs, Anthropic API key, OpenAI API key (fallback), Langfuse keys, Sentry DSN, Amplitude API key, Resend API key, Inngest signing key + event key, Upstash Redis URL/token (if used for dedupe/rate-limit). All via `process.env`, validated in `lib/env.ts`. **Site URL never hardcoded** (FND-08). | Add the new env vars to Vercel (Production + Preview); document them in a `.env.example`; never commit real values. |
| Build artifacts / installed packages | None yet — greenfield, no `package.json`, no `node_modules`, no `.next`. | None |

**The canonical question — "after every file is updated, what runtime systems still have stale state?":** N/A for a greenfield phase. The relevant adjacent concern is the *opposite*: making sure every external service (Supabase, Stripe, Inngest, Sentry, Amplitude, Langfuse, Resend, Vercel) is actually provisioned and wired before the Phase 1 exit gate, because "the code is written" ≠ "the webhook is registered in the Stripe dashboard" ≠ "the Inngest endpoint is registered" ≠ "the Vercel env vars are set on the Preview environment too."

## Environment Availability

> Phase 1 is greenfield: the relevant "environment" is the external SaaS accounts/services, not local CLI tools. There is no fallback for most of these — they are the stack.

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js ≥ 20.9 (D-01 says Node 24) | Next.js 16 | Assumed on the build machine + Vercel | Next 16 requires ≥20.9; Vercel Pro supports Node 24 | None — hard requirement |
| Vercel **Pro** | Hosting, preview deployments, 800s `maxDuration`, analytics | Founder-procured (D-01b) | platform | None |
| Supabase **Pro** | Postgres + pgvector + Auth + Storage + Realtime, daily backups, no project pausing | Founder-procured (D-01b) | platform | None |
| Stripe account (live + test mode) | Billing, Customer Portal, webhooks | Must be set up in Phase 1 | platform | None |
| Anthropic API key | `ai/client.ts` (deploy-time Haiku health-check) | Must be set up | Opus 4.7 / Sonnet 4.6 / Haiku 4.5 | OpenAI fallback exists but is config-flagged off by default; the codex bridge can't be the default |
| OpenAI API key | `ai/fallback.ts` (config-flagged) | Should be set up so the flag *can* flip | gpt-5.x | The fallback is itself the fallback — if absent, the flag just stays off |
| Inngest account + Vercel↔Inngest integration | Background jobs (`/api/inngest`) | Must be set up | SDK v4 | None — Inngest is the slow-work lane |
| Sentry **Team** | Error monitoring | Founder-procured (D-01b) | `@sentry/nextjs` v9+ | None |
| Amplitude (claude.ai connector exists, but instrumentation needs the SDK + an API key) | Product analytics, onboarding funnel | API key must be set up | browser SDK v2 | None |
| Langfuse (Cloud free tier 5K traces/mo, or self-hosted on a tiny Postgres) | LLM observability | Must be set up | JS SDK v3 | Self-host if Cloud free tier is too small — not a Phase 1 concern at this volume |
| Resend | Transactional email | Must be set up (free to 3K/mo) | current | None |
| Upstash Redis (optional in Phase 1) | Stripe-webhook dedupe / rate limiting | Set up if you choose Redis over a `processed_stripe_events` table | platform | A Postgres `processed_stripe_events` table works for dedupe without Redis |
| GitHub Actions | CI pipeline (D-06d) | Available (repo is on GitHub) | — | None |
| `npx create-next-app` / `npx shadcn` | Scaffolding | Available with Node | latest | None |

**Missing dependencies with no fallback:** All of Vercel Pro, Supabase Pro, Stripe, Anthropic key, Inngest, Sentry Team, Amplitude key, Langfuse, Resend, GitHub Actions must be provisioned before the Phase 1 exit gate — provisioning these is itself a set of Phase 1 tasks (likely a DevOps Automator track running parallel to the Backend/Frontend tracks per Build Stack v2).
**Missing dependencies with fallback:** Upstash Redis (→ a Postgres dedupe table); OpenAI key (→ the fallback flag just stays off); Langfuse Cloud (→ self-host).

## Project Constraints (from CLAUDE.md / tasks/constraints.md)

These have the same authority as locked decisions — research must not recommend anything that contradicts them, and the planner/plan-checker must verify them.

- **URLs:** Site URL always from `process.env.NEXT_PUBLIC_SITE_URL` / `NEXT_PUBLIC_APP_URL`, never hardcoded. Build URL = `https://trochia.asranest.com`; keep it alive as a 301 indefinitely after the `trochia.ai` migration.
- **Banned terms (extends the global ban list):** "Rolling fund" (anywhere); "investment vehicle"/"fund"/"adviser" (F&F contexts); "AI-as-call-speaker" (anywhere — no feature, no roadmap item, no copy); "Trochia provides legal advice"/"Trochia provides investment advice" (every legal-adjacent surface needs a "not legal advice" disclaimer). The banned-string CI check runs from Phase 1 and Code Reviewer rejects violations.
- **Architecture guardrails:** `safe-engine` and `cap-table-engine` have NO import path to `ai/` (lint-enforced — Phase 1 configures the rule for those future paths so it just works when they exist); all Anthropic calls via `ai/client.ts` (lint-enforced from day 1); prompt caching active on every production Anthropic call (instrumented in Langfuse); Supabase RLS default-deny on every new table (two-user isolation test required from Phase 1); Drive integration `drive.file` scope only (not Phase 1); Gmail opt-in per-thread (not Phase 1); LinkedIn no bulk scrape (not Phase 1).
- **Compliance gates (Phase 1 / "Phase 0"):** banned-string CI check live; RLS isolation test passing; DPA/privacy plumbing in place.
- **UI/design:** all UI work reads `docs/BRAND.md` AND `docs/DESIGN-REFERENCE.md` before planning/implementing; aesthetic target = harmonic.ai + firecrawl.dev (operator-grade, near-monochromatic, single Signal accent); DESIGN-REFERENCE anti-patterns are banned; no Tailwind colors/fonts outside the brand token system; `/styleguide` internal route shipped showing every themed component is a Phase 1 exit gate; Lighthouse > 90 on `/` is a Phase 1 exit gate.
- **Voice:** operator, not assistant; Trochia drafts/matches/briefs/scores/tracks — does not feel/love/want/help; no emoji in product copy unless an explicit playful context (there isn't one in Phase 1); no "AI buddy" tone.
- **`huashu-design`:** BANNED for Trochia (commercial-license violation) — no subagent may invoke it.
- **Workflow (from project CLAUDE.md):** every `/gsd-plan-phase` reads `tasks/constraints.md` + `docs/BRAND.md` + `docs/DESIGN-REFERENCE.md` and incorporates their rules into PLAN.md; plan-checker verifies constraints; verifier confirms constraints held + UI matches DESIGN-REFERENCE; Code Reviewer rejects hardcoded URLs, banned strings, DESIGN-REFERENCE anti-patterns, non-token colors/fonts, and `ai/*` imports from `safe-engine`/`cap-table-engine`.
- **Self-improvement loop (global CLAUDE.md):** Phase 1 creates `tasks/lessons.md`; update it after corrections.

## Code Examples

### Inngest single `serve()` endpoint (Next 16 App Router)
```typescript
// app/api/inngest/route.ts
import { serve } from 'inngest/next';
import { inngest } from '@/inngest/client';
import { aiHealthCheck } from '@/inngest/functions/ai-health-check';
import { reconcileStripe } from '@/inngest/functions/reconcile-stripe';
import { purgeSoftDeleted } from '@/inngest/functions/purge-soft-deleted';
import * as stubs from '@/inngest/functions/stubs'; // no-op deck-parse / embed / transcribe / brief-enrich / esign-webhook / reminders

export const maxDuration = 300; // up to 800 on Vercel Pro; keep individual steps small
export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [aiHealthCheck, reconcileStripe, purgeSoftDeleted, ...Object.values(stubs)],
});
// per-key concurrency limits + 4 default retries configured on each function definition
```
> Source: inngest.com/docs/learn/serving-inngest-functions (pattern); D-07.

### Stripe webhook handler (idempotent)
```typescript
// app/api/webhooks/stripe/route.ts
import Stripe from 'stripe';
import { headers } from 'next/headers';
import { inngest } from '@/inngest/client';
import { markEventProcessed, isEventProcessed } from '@/modules/billing/dedupe'; // Redis or processed_stripe_events table
import { applySubscriptionState } from '@/modules/billing/state';
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

export async function POST(req: Request) {
  const sig = (await headers()).get('stripe-signature')!;
  const body = await req.text();
  let event: Stripe.Event;
  try { event = stripe.webhooks.constructEvent(body, sig, process.env.STRIPE_WEBHOOK_SECRET!); }
  catch { return new Response('bad signature', { status: 400 }); }

  if (await isEventProcessed(event.id)) return new Response('ok', { status: 200 }); // idempotent
  switch (event.type) {
    case 'checkout.session.completed':
    case 'customer.subscription.updated':
    case 'customer.subscription.deleted':
    case 'invoice.payment_failed':
      await applySubscriptionState(event);              // updates accounts.subscription_status / tier / current_period_end
      await inngest.send({ name: 'billing/subscription.changed', data: { eventId: event.id } }); // slow follow-up if any
      break;
  }
  await markEventProcessed(event.id);
  return new Response('ok', { status: 200 });
}
```
> Source: stripe.com/docs/webhooks (pattern); D-02c; PITFALLS §18.

### `ai/client.ts` chokepoint skeleton (prompt caching + model routing + Langfuse)
```typescript
// ai/client.ts — the ONLY file that imports @anthropic-ai/sdk (ESLint-enforced)
import Anthropic from '@anthropic-ai/sdk';
import { Langfuse } from 'langfuse';
import { pickModel, type TaskClass } from './router';
import { fallbackToOpenAI } from './fallback'; // config-flagged
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });
const langfuse = new Langfuse();

export async function runAgent<T>(opts: {
  taskClass: TaskClass;                  // 'classify' | 'draft' | 'reason'
  stablePrefix: { system: string; toolDefs: unknown; corpus?: string; businessMemory?: string };
  variableSuffix: unknown;               // this deck / this investor / this turn — NOT cached
  schema: import('zod').ZodType<T>;
}): Promise<T> {
  const model = pickModel(opts.taskClass); // Haiku / Sonnet 4.6 / Opus 4.7
  const trace = langfuse.trace({ name: `agent:${opts.taskClass}` });
  // place cache_control breakpoints on the stable prefix blocks, in order, BEFORE the volatile suffix:
  //   system → toolDefs → corpus → businessMemory   each ending with cache_control: { type: 'ephemeral' }
  // ...build the messages array with those breakpoints...
  let res;
  try { res = await anthropic.messages.create(/* model, system w/ cache_control, tools w/ forced tool use, messages */); }
  catch (e) { trace.update({ level: 'ERROR' }); throw e; }
  // log cache metrics — XC-06: cache hit rate is INSTRUMENTED, not assumed:
  trace.update({ metadata: {
    cacheWrite: res.usage.cache_creation_input_tokens,
    cacheRead:  res.usage.cache_read_input_tokens,
    inputTokens: res.usage.input_tokens, outputTokens: res.usage.output_tokens, model,
  }});
  const parsed = opts.schema.safeParse(/* extract tool-use args */);
  if (!parsed.success) { /* one repair retry, then fallbackToOpenAI(...) if the config flag is on */ }
  return parsed.success ? parsed.data : await fallbackToOpenAI(opts);
}
```
> Source: platform.claude.com/docs/build-with-claude/prompt-caching (pattern); project ARCHITECTURE.md Pattern 3; D-09 / FND-09 / XC-06.

### Banned-string CI check (D-06a)
```bash
# scripts/check-banned-strings.sh — runnable as a CI step or wrapped in a Vitest test
# reads tasks/banned-strings.txt; scans src/**/*.{ts,tsx,md,mdx} + public/**/*.md;
# fails on any match EXCEPT the allowlisted "...is not legal advice" / "this is not legal advice" pattern.
# (the exact allowlist regex and whether it runs as a Vitest test or a standalone step is Claude's discretion per D-06d)
```
> Source: D-06a; project CLAUDE.md workflow rules; `tasks/constraints.md` banned-terms table.

## State of the Art

| Old Approach | Current Approach (May 2026) | When Changed | Impact |
|--------------|------------------------------|--------------|--------|
| `middleware.ts` for edge logic in Next.js | `proxy.ts` (renamed to clarify the network boundary) | Next.js 16 (Oct 2025) | Greenfield ⇒ just use `proxy.ts` from the start; `@supabase/ssr` cookie handling goes here |
| Webpack as the default bundler | Turbopack stable & default for `dev` AND `build` | Next.js 16 | Faster builds; nothing to configure on a new project |
| Manual `useMemo`/`useCallback` | React Compiler 1.0 stable, on by default in Next 16 | Next.js 16 / React 19.x | Free memoization — don't hand-roll memo churn |
| `tailwind.config.js` JS config | Tailwind v4 CSS-first config (`@theme` directive, OKLCH, `data-slot`) | Tailwind v4 (2025) | `tailwind.config.ts` still exists but the design tokens live in CSS; match `docs/DESIGN-REFERENCE.md` exactly |
| Supabase `anon` / `service_role` keys | Supabase **publishable** / **secret** API keys | 2025 (old keys deprecated end-2026) | FND-02 mandates the new keys — start on them |
| Sync `params` / `searchParams` in App Router | Async `params` / `searchParams` (required) | Next.js 16 | `await params` everywhere; greenfield ⇒ no migration |
| Vercel Postgres / Vercel KV | Discontinued — use Supabase (DB) + Upstash (Redis/KV) | 2024–25 | Already excluded in `tasks/constraints.md` |
| `framer-motion` package | `motion` package (rebranded, same API) | 2024–25 | Install `motion`, not `framer-motion` |
| Pinecone/Weaviate for vectors at this scale | pgvector 0.8.x with HNSW inside Postgres | ongoing | Already excluded; enable the extension Phase 1, populate Phase 2 |
| Hume AI Expression Measurement for voice prosody | Sunsetting ~June 14, 2026 — compute metrics deterministically from Deepgram word timings + Web Audio RMS | Hume's own deprecation | **Not a Phase 1 concern** — flagged here only because Phase 6 must research it; CONTEXT.md/ROADMAP already plan the deterministic path |

**Deprecated / outdated — do not use:** `middleware.ts` (use `proxy.ts`), Webpack config tweaks for Next (Turbopack default), `framer-motion` (use `motion`), Supabase `anon`/`service_role` keys (use publishable/secret), Vercel Postgres/KV (use Supabase + Upstash), synchronous `params`/`searchParams`.

## Validation Architecture

> `workflow.nyquist_validation` is `true` in `.planning/config.json` — this section is included.

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest v3.x (unit + integration) + Playwright v1.5x (E2E smoke) + MSW v2.x (mocking external APIs) |
| Config file | `vitest.config.ts` + `playwright.config.ts` — **none yet — Wave 0 creates them** (greenfield) |
| Quick run command | `npx vitest run` (unit + integration; fast) |
| Full suite command | `npx vitest run && npx playwright test` (against the Vercel preview URL in CI) |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| FND-01 | Monolith deploys to Vercel; marketing + app from one repo | smoke (CI) | `npx playwright test e2e/smoke.spec.ts` (loads `/`, `/pricing`, `/sign-up`, `/app` redirect) | ❌ Wave 0 |
| FND-01 | CI green (lint + typecheck + Vitest + Playwright) | CI gate | the `.github/workflows/ci.yml` job set | ❌ Wave 0 |
| FND-03 | RLS on every tenant-scoped table; default-deny | integration | `npx vitest run tests/rls/schema-scan.test.ts` (the `pg_catalog` query in Pattern 2) | ❌ Wave 0 |
| FND-03 | Tenant A cannot read tenant B's rows | integration | `npx vitest run tests/rls/two-user-isolation.test.ts` | ❌ Wave 0 |
| FND-04 | Google SSO sign-in works; session persists | smoke | `npx playwright test e2e/auth.spec.ts` (mock Google OAuth via MSW or a test Supabase user) | ❌ Wave 0 |
| FND-05 | Stripe webhook is idempotent; updates `accounts.subscription_status` | unit | `npx vitest run tests/billing/webhook-idempotency.test.ts` (replay an event → no-op; MSW-mock Stripe) | ❌ Wave 0 |
| FND-05 | 7-day trial + card-on-file at signup | unit | `npx vitest run tests/billing/checkout-session.test.ts` (assert `trial_period_days: 7`, `payment_method_collection: 'always'`) | ❌ Wave 0 |
| FND-06 | `entitlements()` gates by tier; extensible | unit | `npx vitest run tests/billing/entitlements.test.ts` (table test over each tier + a hypothetical Close Mode tier) | ❌ Wave 0 |
| FND-08 | No hardcoded site URLs | lint/CI | `npm run lint` (ESLint `no-restricted-syntax` rule) or `grep -rn 'https://trochia' src/` in CI | ❌ Wave 0 |
| FND-09 | No production code imports `@anthropic-ai/sdk` outside `ai/**` | lint/CI | `npm run lint` (ESLint `no-restricted-imports`) | ❌ Wave 0 |
| FND-09 | `ai/client.ts` does prompt caching, model routing, Zod outputs, OpenAI fallback flag | unit | `npx vitest run tests/ai/client.test.ts` (MSW-mock Anthropic; assert `cache_control` breakpoints present, model picked per task class, Zod parse, fallback path on flag) | ❌ Wave 0 |
| FND-09 / XC-06 | Cache hit rate instrumented in Langfuse (deploy-time Haiku health-check produces a trace) | integration | `npx vitest run tests/ai/health-check.test.ts` (assert the health-check emits a Langfuse trace with cache-metric metadata) — or verify the trace appears in Langfuse post-deploy (manual) | ❌ Wave 0 |
| FND-10 | `getDbForRegion()` returns a client for `us` and `in`; both → US client today | unit | `npx vitest run tests/db/region.test.ts` | ❌ Wave 0 |
| FND-11 | Inngest `serve()` endpoint responds; `jobs` row written + readable via Realtime | integration | `npx vitest run tests/inngest/serve.test.ts` + a Playwright check that a job-status UI updates | ❌ Wave 0 |
| FND-12 | Onboarding shell runs end-to-end; Amplitude event per stage | smoke | `npx playwright test e2e/onboarding.spec.ts` (click through all 4 stages; assert Amplitude `track` calls via MSW) | ❌ Wave 0 |
| XC-04 | Data export returns the tenant's rows; account deletion sets `deleted_at`; purge cron removes rows >30d deleted | unit + integration | `npx vitest run tests/compliance/data-rights.test.ts` | ❌ Wave 0 |
| XC-05 | Banned-string check fails on a planted banned term, passes on the allowlisted "not legal advice" | unit/CI | `npx vitest run tests/compliance/banned-strings.test.ts` (or the standalone script in CI) | ❌ Wave 0 |
| XC-03 | Logger redacts sensitive field names; raw `console.*` is lint-banned | unit + lint | `npx vitest run tests/lib/logger.test.ts` + `npm run lint` | ❌ Wave 0 |
| D-14 / UI | `/styleguide` renders every themed component | smoke | `npx playwright test e2e/styleguide.spec.ts` (assert each section heading + a representative component renders) | ❌ Wave 0 |
| D-14 / UI | Lighthouse > 90 on `/` | smoke (CI) | `npx playwright test` + `@lhci/cli` (Lighthouse CI) against the preview URL | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** `npx vitest run` (unit + integration — fast; < ~30s for the suite Phase 1 will have)
- **Per wave merge:** `npx vitest run && npx playwright test` (full suite incl. E2E against the Vercel preview) + `npm run lint && npm run typecheck`
- **Phase gate:** full suite green + Lighthouse > 90 on `/` + `/styleguide` renders all sections + the banned-string check + the RLS schema-scan + the two-user isolation test, all green, before `/gsd-verify-work`

### Wave 0 Gaps
- [ ] `vitest.config.ts` + `playwright.config.ts` + `tests/` directory + `e2e/` directory — none exist (greenfield)
- [ ] `tests/setup.ts` + MSW server setup + shared fixtures (a test Supabase project / a test Postgres for the RLS tests, a test Stripe mode)
- [ ] `tests/rls/schema-scan.test.ts` — covers FND-03 (the `pg_catalog` RLS query)
- [ ] `tests/rls/two-user-isolation.test.ts` — covers FND-03 (the highest-leverage test in the codebase)
- [ ] `tests/billing/*.test.ts` — covers FND-05, FND-06
- [ ] `tests/ai/*.test.ts` — covers FND-09, XC-06
- [ ] `tests/compliance/*.test.ts` — covers XC-04, XC-05
- [ ] `tests/lib/logger.test.ts` — covers XC-03
- [ ] `tests/db/region.test.ts` — covers FND-10
- [ ] `tests/inngest/serve.test.ts` — covers FND-11
- [ ] `e2e/{smoke,auth,onboarding,styleguide}.spec.ts` — cover FND-01, FND-04, FND-12, D-14
- [ ] `.github/workflows/ci.yml` — the CI pipeline (lint → typecheck → Vitest → banned-string → Playwright → Lighthouse CI)
- [ ] Framework install: `npm install -D vitest @vitest/ui jsdom @testing-library/react @testing-library/jest-dom @playwright/test msw @lhci/cli`
- [ ] `scripts/check-banned-strings.sh` (or a Vitest test) + `tasks/banned-strings.txt`

## Security Domain

> `security_enforcement` is not explicitly `false` (the config has no such key — treat as enabled). This section is included.

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | yes | Supabase Auth (Google SSO via OIDC + PKCE), `@supabase/ssr` cookie handling in `proxy.ts`; 1h JWT expiry + 30d inactivity timeout (D-10); TOTP MFA deferred to Phase 8 |
| V3 Session Management | yes | Supabase Auth sessions — HttpOnly Secure cookies via `@supabase/ssr`; JWT expiry + inactivity timeout (+ best-effort 90d absolute cap, D-10); sign-out clears the session |
| V4 Access Control | yes | Postgres RLS default-deny on every tenant table (the backstop) + tRPC `protectedProcedure` + `assertEntitled` (the ergonomic layer) + `/app` server-side redirect gate. Service-role client is a narrow, audited escape hatch (webhooks, Inngest jobs, account deletion) — never in an SSR client with a user cookie, never in `NEXT_PUBLIC_*` |
| V5 Input Validation | yes | **Zod v4** on every tRPC input + react-hook-form resolver + `env.ts` + AI structured-output contracts. Uploaded content (Phase 2/3) treated as untrusted — delimited + prompt-injection screened + output schema-validated (XC-07 — pattern established Phase 1 in `ai/untrusted.ts`, enforced Phase 2/3) |
| V6 Cryptography | yes (seam) | Never hand-roll. Phase 1: a `lib/crypto.ts` field-encryption *helper stub* (pattern only — real encrypted columns for cap-table figures/audio land Phase 8/9, XC-03). Stripe handles card data (Trochia never sees full PAN — card-on-file is a Stripe payment method id). Supabase provides at-rest encryption for the DB; the app-layer dedicated-key encryption is the *additional* layer for sensitive fields, established as a seam now |
| V7 Error/Logging | yes | The redacting logger (`lib/logger.ts`) + ESLint ban on raw `console.*` (D-06b) — PII/financials/transcript bodies never reach logs or Sentry/Amplitude/Langfuse; IDs and event types only. Sentry for errors; never log secrets |
| V9 Communications | yes | HTTPS everywhere (Vercel + Cloudflare); Stripe & Inngest webhook signature verification; `@supabase/ssr` cookies are Secure |
| V12 Files/Resources | partial | Supabase Storage (tenant-isolated buckets) — Phase 1 has no real file uploads yet (deck upload UI is a skeleton; extraction is Phase 2/3); establish the tenant-isolated-bucket pattern |
| V14 Configuration | yes | `env.ts` Zod-validated; secrets in 1Password → Vercel env (Production + Preview); `service_role`/secret keys server-only; no secrets in client bundles or `NEXT_PUBLIC_*`; `.env.example` documents required vars; `.gitignore` excludes `.env*` |

### Known Threat Patterns for this stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Multi-tenant data leak via missing/incomplete RLS | Information Disclosure | RLS default-deny on every table; RLS schema-scan CI check; two-user isolation Vitest test; `gsd-security-auditor` reviews RLS coverage at the phase exit (PITFALLS §3) |
| `service_role` / secret key leaked to client bundle or used in an SSR client with a user cookie | Elevation of Privilege | Server-only secret keys; a separate narrow "admin client" for the audited cross-tenant operations; CI/Code-Reviewer check that `service_role`/secret never appears in a client component or `NEXT_PUBLIC_*` |
| Stripe webhook forgery / replay | Spoofing / Tampering | `stripe.webhooks.constructEvent` signature verification + dedupe on `event.id` (idempotent handler) + reconciliation cron (PITFALLS §18) |
| Prompt injection via uploaded decks/transcripts/knowledge packs | Tampering / Information Disclosure | (pattern in Phase 1, enforced Phase 2/3) delimit untrusted input; screen for injection payloads; validate model output against the Zod schema before use; never let model output trigger an external action without the founder-approval Dialog (XC-02, XC-07) |
| Customer data trains a model via a default API setting | Information Disclosure / Repudiation | Anthropic API = no-training, 7-day retention (confirmed); OpenAI fallback only with a documented no-training/ZDR posture or it stays a build-time tool with no DB credentials; vendor data-flow inventory artifact; never paste customer data into Claude Code/Cursor/ChatGPT (PITFALLS §5) |
| Hardcoded site URL breaks the `trochia.ai` migration / leaks the wrong host in emails | Tampering (config) | All URLs from `env.ts`; ESLint rule + Code-Reviewer check |
| Unbounded AI cost from a runaway tenant | Denial of Service (economic) | `@upstash/ratelimit` tRPC middleware on AI-backed routes; Inngest per-key concurrency caps; bounded retries; per-tenant cost tracking in Langfuse — pattern established Phase 1, bites Phase 2+ (PITFALLS §19) |
| OAuth scope creep (Drive `drive.file` → `drive`) | Information Disclosure / verification cliff | Not a Phase 1 surface (Drive is Phase 7) — but the OAuth-scope-as-reviewed-constant pattern should be noted now (PITFALLS §4) |

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `typescript` 5.7+ ships with `create-next-app@16`; exact version not pinned-checked | Standard Stack | Low — whatever Next 16 bundles is fine; re-check at scaffold time |
| A2 | `react-hook-form` v7.x + `@hookform/resolvers` is the form pairing | Standard Stack | Low — standard, unchanged for years |
| A3 | `postgres` (postgres.js) v3.x is the Drizzle+Supabase driver pairing; Supavisor pooler connection string for serverless | Standard Stack, Pattern 1 | Medium — the RLS-JWT-claims plumbing depends on how the connection carries the claim; planner must verify against current Supabase docs (see Open Questions Q1) |
| A4 | ESLint + `eslint-plugin-boundaries` / `no-restricted-imports` is the cleanest way to do the `ai/` import-boundary lints and the no-raw-`console.*` rule | Standard Stack, Don't Hand-Roll | Low — both are mature; Biome could do it but with more effort |
| A5 | Stripe `payment_method_collection: 'always'` + `trial_period_days: 7` is the current way to capture card-on-file with a trial | Standard Stack, Code Examples | Low-Medium — Stripe's API is stable here but re-check the current API version's parameter names at plan time |
| A6 | A Postgres `processed_stripe_events` table is an acceptable dedupe store if Upstash Redis isn't provisioned in Phase 1 | Component Responsibilities, Code Examples | Low — both work; Redis is faster but a table is fine at this volume |
| A7 | Langfuse Cloud free tier (5K traces/mo) is enough for Phase 1 (one deploy-time Haiku ping per deploy + no production AI traffic yet) | Standard Stack, Environment Availability | Low — Phase 1 has effectively zero AI traffic |
| A8 | The `region` enum column lives on `accounts` (the tenant row); `getDbForRegion()` takes the enum value and returns a connection-string-keyed Drizzle client | Pattern 1, Component Responsibilities, FND-10 | Low — D-05 fixes the behavior; the exact column placement is Claude's discretion |
| A9 | The DPA-as-downloadable-PDF (D-11) uses `@react-pdf/renderer` (Trochia-authored doc, no legal-template fidelity needed in Phase 1) | Don't Hand-Roll | Low — could also be a static pre-rendered PDF in `public/`; either is fine |
| A10 | `@lhci/cli` (Lighthouse CI) is the standard way to enforce the "Lighthouse > 90 on `/`" gate in GitHub Actions | Validation Architecture | Low — standard tool; alternative is the Lighthouse GitHub Action |

**These `[ASSUMED]` claims need a quick verification by the planner (Context7 / official docs) before becoming locked plan decisions — none of them block planning, and the project-level STACK.md (2026-05-11) already verified the heavier version claims.**

## Open Questions (RESOLVED)

> All four resolved during planning (plan set 01-01-PLAN.md … 01-09-PLAN.md, 2026-05-12). Each carries an inline RESOLVED marker pointing at the plan that locks it.

1. **How exactly does the request-scoped Drizzle client carry `tenant_id` for RLS?**
   - What we know: RLS policies must read the tenant id from the request; the standard Supabase pattern is `auth.jwt() ->> 'tenant_id'` (or `auth.uid()` + a `memberships` lookup). The query must run as the `authenticated` role.
   - What's unclear: whether to (a) inject `tenant_id` as a custom JWT claim via a Supabase Auth Hook and use a Supabase client, (b) use `postgres.js` and `set local request.jwt.claims = '...'` per request, or (c) key the policy on `auth.uid()` and join to `memberships`. All three work; (a) is cleanest if a one-business-per-account model holds (it does in Phase 1 per D-03). 
   - Recommendation: planner picks the approach with current Supabase docs (Context7: `supabase` → "RLS with Drizzle" / "custom claims" / "Auth Hooks"); document it in PLAN.md as a locked sub-decision. Lean toward (a) — a custom `tenant_id` claim via an Auth Hook — because it makes the RLS policy a one-liner and the two-user test trivial.
   - **RESOLVED: Plan 03 (`01-03-PLAN.md`) — Task 1 resolves this against current Supabase docs (Context7), leaning toward option (a) (custom `tenant_id` JWT claim via a Supabase Auth Hook, one-business-per-account in Phase 1 per D-03), records the exact wiring in `01-03-SUMMARY.md`, and adds `NON_TENANT_TABLES` to `src/db/rls.ts`.**

2. **Does Supabase Auth expose three distinct session timers (JWT expiry / inactivity timeout / absolute lifetime)?**
   - What we know: D-10 wants 1h / 30d / 90d; D-10's own fallback says JWT expiry + inactivity timeout are must-haves and the 90d absolute cap is best-effort.
   - What's unclear: whether the current Supabase dashboard/config has a separate "time-box user sessions" knob.
   - Recommendation: planner verifies against supabase.com/docs/guides/auth (Context7); if only two timers exist, ship those and note the 90d cap as best-effort per D-10. Don't block.
   - **RESOLVED: Plan 07 (`01-07-PLAN.md`) — Task 1 confirms which of the three timers the current Supabase dashboard exposes, sets JWT expiry = 1h + inactivity = 30d (+ 90d absolute if exposed), and records the result in `01-07-SUMMARY.md` (also a Manual-Only check in `01-VALIDATION.md`).**

3. **Where does the vendor data-flow inventory live, and what's its exact format?**
   - What we know: XC-01 requires it; it must cover Anthropic (no-training, 7-day retention), the OpenAI/Codex fallback, Claude-Code build tooling, and every other data-touching vendor (Resend, Sentry, Amplitude, Langfuse, Inngest, Stripe, Supabase).
   - What's unclear: whether it's a markdown table in `docs/`, a section of the DPA, or both.
   - Recommendation: a living markdown artifact (`docs/vendor-data-flow.md`) with columns {vendor, what data touches it, trains on inputs?, retention, DPA signed?, notes}, referenced from the DPA. Planner decides the exact path; the artifact existing is the Phase 1 deliverable.
   - **RESOLVED: Plan 06 (`01-06-PLAN.md`) — Task 1 ships `docs/vendor-data-flow.md` as the living markdown artifact (columns: Vendor · What data touches it · Trains on inputs? · Retention · DPA/contract status · Notes), referenced from `/legal/dpa`.**

4. **`/styleguide` auth-gating — is it inside `(app)` (so `entitlements()` gates it) or just session-gated?**
   - What we know: UI-SPEC says "auth-gated internal route." It's a Phase 1 exit gate that it renders all themed components.
   - Recommendation: session-gated (any logged-in user) is enough — it shouldn't require an active subscription, since it's an internal dev tool. Planner confirms; minor.
   - **RESOLVED: session-gated (logged-in user, no active subscription required). Plan 02 ships `/styleguide` open under `(app)` with a TODO; Plan 07's `proxy.ts` session-gates it (logged-in only, NOT behind `entitlements()`); Plan 09's e2e asserts authed → renders / unauthed → `/sign-in`.**

## Sources

### Primary (HIGH confidence)
- `nextjs.org/blog/next-16`, `nextjs.org/docs/app/guides/upgrading/version-16`, `nextjs.org/docs/app/api-reference/turbopack` — Next.js 16 GA 2025-10-21, Turbopack default for dev+build, React 19 + React Compiler 1.0 stable, `middleware.ts`→`proxy.ts`, async `params`/`searchParams`, Node ≥20.9 — **VERIFIED via WebSearch 2026-05-12**
- `.planning/research/STACK.md` (2026-05-11) — full stack validation against Context7 + official docs one day before this research; version table for Next 16.1.x / tRPC 11 / Drizzle 0.44 / Tailwind v4 / Zod 4 / Inngest v4 / pgvector 0.8.x / Anthropic SDK / Vitest 3 / Playwright — treat as authoritative; re-run `npm view` at scaffold time
- `.planning/research/ARCHITECTURE.md` (2026-05-11) — the monolith structure, the tenant-scoped tRPC+RLS pattern, the `ai/` chokepoint pattern, the deterministic-vs-LLM boundary, the Inngest-for-slow-work pattern, the project directory layout
- `.planning/research/PITFALLS.md` (2026-05-11) — Pitfall 3 (RLS leak), 5 (model-training default), 18 (webhook reliability), 19 (model-cost blowup), 20 (onboarding friction), 21 (solo-builder traps) — the Phase-1-relevant ones
- `ui.shadcn.com/docs/tailwind-v4`, `supabase.com/docs/guides/auth/server-side`, `supabase.com/docs/guides/database/drizzle`, `inngest.com/docs`, `vercel.com/docs/fluid-compute`, `stripe.com/docs/webhooks`, `platform.claude.com/docs/build-with-claude/prompt-caching` — referenced for the patterns above (cited via the project STACK.md which fetched them 2026-05-11)
- Project canon: `CLAUDE.md` (root + global), `tasks/constraints.md`, `.planning/REQUIREMENTS.md`, `.planning/ROADMAP.md`, `.planning/STATE.md`, `.planning/intel/Trochia_AI_Build_Stack_v2.md`, `.planning/phases/01-foundation/01-CONTEXT.md`, `.planning/phases/01-foundation/01-UI-SPEC.md`, `docs/BRAND.md` + `docs/DESIGN-REFERENCE.md` (referenced for the UI-SPEC's tokens/anti-patterns)

### Secondary (MEDIUM confidence)
- `makerkit.dev/blog/tutorials/nextjs-16`, `infoq.com/news/2025/12/nextjs-16-release`, `strapi.io/blog/next-js-16-features` — corroborate the Next 16 feature set (used only to cross-check the official docs)

### Tertiary (LOW confidence)
- None — every claim in this research is either VERIFIED against a tool/the official docs, CITED from the project-level research (which itself verified against Context7/official docs the day before), or tagged `[ASSUMED]` in the Assumptions Log.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — Next 16 GA + Turbopack default verified via web search 2026-05-12; the rest matches the project STACK.md (verified 2026-05-11) and the founder's locked decisions
- Architecture: HIGH — the monolith + RLS + `ai/` chokepoint + Inngest patterns are well-trodden and align with the project ARCHITECTURE.md and `tasks/constraints.md`
- Pitfalls: HIGH — drawn from the project PITFALLS.md (the catastrophic ones — RLS leak, model-training default, webhook reliability — are stated non-negotiables, not judgment calls)
- CI-check implementation details (RLS schema-scan query, banned-string allowlist regex, Supabase RLS-JWT-claims plumbing): MEDIUM — the *approach* is clear; the exact wiring needs a Context7/docs check at plan time (Open Questions Q1, Q2)

**Research date:** 2026-05-12
**Valid until:** ~2026-06-11 (30 days — stable stack; the one fast-moving item, Next.js minor versions, is pinned anyway). Re-verify if Next.js ships a 16.2/17 or if Drizzle 1.0 goes stable before planning starts.
