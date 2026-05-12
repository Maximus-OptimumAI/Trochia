# Phase 1: Foundation - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-05-12
**Phase:** 01-foundation
**Areas discussed:** Next.js version, Paywall/Stripe placement, Multi-region seam depth, CI guardrail scope, Walking-Skeleton spine, Schema depth, AI-chokepoint depth

---

## Next.js version

| Option | Description | Selected |
|--------|-------------|----------|
| 16.x | Greenfield — no migration cost. Fluid Compute default, Node 24, Turbopack stable, App Router. Vercel guidance treats 16 as default. Pin exact version. | ✓ |
| 15.x pinned | Most battle-tested ecosystem/plugin compat today; plan a 15→16 upgrade before V2. | |

**User's choice:** 16.x
**Notes:** Pin exact version in `package.json`; bump deliberately. → D-01

---

## Paywall / Stripe placement

| Option | Description | Selected |
|--------|-------------|----------|
| Inside onboarding, after welcome | Sign-in → welcome → pick tier → Stripe Checkout (card-on-file, trial starts) → import context → deck → review → dashboard. | ✓ |
| App-first, checkout deferred | Straight into app; prompt for tier+card on first gated action / after grace window. Weakens "card-on-file at signup". | |
| Pricing page → Checkout → then sign in | Choose tier on `/pricing` logged out → Checkout → account created on return. | |

**User's choice:** Inside onboarding, after welcome
**Notes:** → D-02

| Option | Description | Selected |
|--------|-------------|----------|
| Yes — hard gate via `entitlements()` | No active trial/sub → reactivate screen. Exercises `entitlements()` (FND-06) from day 1. | ✓ |
| Soft gate | Read-only access / banner if trial lapsed; block only specific actions. | |

**User's choice:** Hard gate
**Notes:** `entitlements()` written tier-extensible (Close Mode / Alumni later). → D-02b, D-02c

---

## Multi-region seam depth

| Option | Description | Selected |
|--------|-------------|----------|
| Flag + factory stub on US DB | `tenant.region` (`us`\|`in`, `eu` reserved); `getDbForRegion()` branches but returns US client until first India customer. | ✓ |
| Real second Supabase project now | Provision an actual India-region project in Phase 1; genuinely different client per region. | |

**User's choice:** Flag + factory stub on US DB
**Notes:** Provision the real India project when the first India founder signs up. → D-05

---

## CI guardrail scope

| Option | Description | Selected |
|--------|-------------|----------|
| Logging-scrub: lint + scrub helper now | Redacting logger wrapper + ESLint rule banning raw `console.*` / unredacted logging of flagged fields. | ✓ |
| Defer the lint, ship only the logger wrapper | Logger now; enforcing lint in Phase 8. | |

**User's choice:** Lint + scrub helper now → D-06b

| Option | Description | Selected |
|--------|-------------|----------|
| Stub the `ai/` import-boundary rule now | ESLint boundary rules for `safe-engine`/`cap-table-engine` (no-op until dirs exist) + enforce "nothing outside `ai/` imports Anthropic SDK" now. | ✓ |
| Defer to Phase 8 | Only the "nothing outside `ai/` imports Anthropic SDK" rule now. | |

**User's choice:** Stub now → D-06c

| Option | Description | Selected |
|--------|-------------|----------|
| Vitest integration test | Two tenant-scoped DB clients; seed A/B; assert B reads zero of A's rows across every tenant-scoped table. + schema-scan test for "new table without RLS+policy fails CI". | ✓ |
| Playwright end-to-end test | Two real browser sessions; assert UI never surfaces the other tenant's data. (Fine as optional add, not instead.) | |

**User's choice:** Vitest integration test → D-04, D-06d

---

## Walking-Skeleton spine (raised by founder in the "explore more" turn)

**User's choice (stated verbatim):** `signup → tier picker → Stripe Checkout → webhook updates Supabase accounts.subscription_status → user lands on /app showing their tier`. Thinnest slice exercising auth + RLS + Stripe + webhook + tRPC + `entitlements()` end-to-end. → D-08, `<specifics>`

## Schema depth (raised by founder)

**User's choice:** Model only `users`, `accounts`, `sessions`, `subscriptions` in Phase 1. Defer `decks`/`investors`/`pipeline`/email schemas to phases 2/3/4 as new migrations. "Schemas are cheap to add, painful to remove." → D-03

## AI-chokepoint depth (raised by founder)

**User's choice:** Real health-check call, not dormant. Deploy-time ping (`claude-haiku`, ~10 tokens) via Inngest; exercises prompt caching; Langfuse captures the trace. Lints enforce the chokepoint. → D-09

## Supplemental items (folded in from the founder's discussion message)

- Auth session 30 / 90 / 1hr → D-10
- DPA clickwrap + PDF + GDPR/UK-GDPR/DPDP/LGPD → D-11
- Stripe entitlements technical detail → D-02c
- RLS default-deny pattern → D-04
- FND-12 4-stage onboarding → D-12
- Inngest `/api/inngest` single app + 4 retries → D-07
- Sentry + Amplitude wired; PostHog deferred → D-13
- Banned-string CI scope `src/**/*.{ts,tsx,md,mdx}` + `public/**/*.md` from `tasks/banned-strings.txt` → D-06a
- Resend (transactional email); Vercel Pro + Supabase Pro + Sentry Team plans → D-13, D-01b

---

## Claude's Discretion

Drizzle migration layout & column naming beyond named tables; `/manifesto` prose; stub Inngest job-function shapes; whether banned-string check is a Vitest test or standalone CI step or both; repo structure / lint-format tooling specifics beyond required rules; env-var management (subject to FND-08); how `getDbForRegion()` is surfaced to tRPC; Supabase Realtime channel design for `jobs` polling.

## Deferred Ideas

`/docs` route (V2/Phase 5+); `/changelog` route (Phase 11); hero secondary live-output card (later phase); magic-link + TOTP MFA (V2/Phase 8); real India Supabase project (on first India customer); EU region (V2); PostHog (revisit later); encrypted-at-rest cap-table/audio columns (Phase 8/9); Close Mode + Alumni billing (Phase 11); `trochia.ai` domain migration (on bid completion).
