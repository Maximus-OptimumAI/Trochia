---
phase: 1
slug: foundation
status: draft
nyquist_compliant: true
wave_0_complete: false
created: 2026-05-12
updated: 2026-05-12
---

# Phase 1 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution. Filled by the planner alongside the 9 PLAN.md files + SKELETON.md.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest (unit/integration) + Playwright (e2e, against the Vercel preview in CI) + MSW (network mocking) + `@lhci/cli` (Lighthouse CI on `/`) |
| **Config file** | `vitest.config.ts`, `playwright.config.ts`, `.lighthouserc.json` — **Wave 0 (Plan 01) creates them** (greenfield) |
| **Quick run command** | `npm run test` (= `vitest run` — unit + integration; fast) |
| **Full suite command** | `npm run test && npm run test:e2e` (Vitest + Playwright) + `npm run lint && npm run typecheck && npm run check:banned` |
| **Estimated runtime** | ~30–60s for the Vitest suite Phase 1 will have; e2e ~2–5 min against the preview; Lighthouse ~30s |
| **Test DB** | RLS integration tests need `TEST_DATABASE_URL` (a separate Supabase test project / local Postgres) — set as a GitHub Actions secret; tests `describe.skip` cleanly when it's unset locally |

---

## Sampling Rate

- **After every task commit:** `npm run test` (unit + integration — fast, < ~60s)
- **After every plan wave:** `npm run test && npm run test:e2e` + `npm run lint && npm run typecheck && npm run check:banned`
- **Before `/gsd-verify-work` (phase gate):** the full suite green + Lighthouse > 90 on `/` + `/styleguide` renders all 19 sections + the banned-string check + the RLS schema-scan + the two-user isolation test, all green; the live Vercel deploy confirmed; the manual post-deploy checks (below) done
- **Max feedback latency:** < ~60s for the per-commit Vitest run

---

## Per-Task Verification Map

> Plan = `01-NN`. Wave from the PLAN frontmatter. "File Exists" = does the test/check file exist yet (✅ once the plan that creates it ships; ❌ = Wave-0-style gap created within the owning plan's tasks).

| Task | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| Scaffold + env + lib helpers | 01-01 T1 | 1 | FND-01, FND-08, XC-03 | T-1-01, T-1-02, T-1-04 | env validated at load; no hardcoded URLs; redacting logger | build + unit | `npm run build && npm run typecheck && npx vitest run tests/lib/env.test.ts tests/lib/logger.test.ts` | ❌→✅(01-01) | ⬜ pending |
| ESLint ruleset + banned-string check | 01-01 T2 | 1 | XC-05, FND-09, FND-08, XC-03 | T-1-02, T-1-03, T-1-04 | import-boundary lints; no-hardcoded-URL; no-raw-console; banned-string allowlist | lint + unit | `npm run lint && node scripts/check-banned-strings.mjs && npx vitest run tests/compliance/banned-strings.test.ts` | ❌→✅(01-01) | ⬜ pending |
| Test infra + CI pipeline | 01-01 T3 | 1 | FND-01 | T-1-01, T-1-06 | green CI is the phase exit gate; secrets never echoed | config + CI | `npx vitest run && npx playwright test --list` | ❌→✅(01-01) | ⬜ pending |
| shadcn init + Tailwind brand config + fonts + 14 components | 01-02 T1 | 2 | FND-01 | T-1-10 | only the official shadcn registry | build | `npm run build && npm run lint && npm run typecheck` | ❌→✅(01-02) | ⬜ pending |
| Cross-cutting UI primitives + app shell + top bar + footer | 01-02 T2 | 2 | XC-02 | T-1-07, T-1-08, T-1-11 | founder-approval Dialog = noun-bearing `Send {thing}`; destructive Dialog = "Keep {noun}" | unit (jsdom) | `npm run build && npm run lint && npm run check:banned && npx vitest run tests/components/primitives.test.tsx` | ❌→✅(01-02) | ⬜ pending |
| /styleguide — 19 sections | 01-02 T3 | 2 | FND-01 (D-14 gate) | T-1-09 | not behind `entitlements()`; styleguide demos are placeholder | e2e | `npm run build && npx playwright test e2e/styleguide.spec.ts` | ❌→✅(01-02) | ⬜ pending |
| Supabase provision + schema + RLS + region + DB clients | 01-03 T1 | 2 | FND-02, FND-10 | T-1-12, T-1-14, T-1-15, T-1-16, T-1-17 | RLS default-deny on every tenant table; service-role client narrow + audited; the seam | typecheck + migration + grep | `npm run typecheck && npm run db:generate && grep -rl "ENABLE ROW LEVEL SECURITY" src/db/migrations/` | ❌→✅(01-03) | ⬜ pending |
| Tenant-scoped tRPC context + protectedProcedure + accountRouter | 01-03 T2 | 2 | FND-03 | T-1-13, T-1-15 | queries run as `authenticated` with the tenant_id claim; assertEntitled stub for Plan 07 | build | `npm run build && npm run typecheck && npm run lint` | ❌→✅(01-03) | ⬜ pending |
| RLS schema-scan + two-user isolation + region tests | 01-03 T3 | 2 | FND-03 | T-1-12, T-1-13 | no table without RLS+policy; tenant A ≠ tenant B | integration + unit | `npx vitest run tests/db/region.test.ts && npx vitest run tests/rls/ (CI w/ TEST_DATABASE_URL)` | ❌→✅(01-03) | ⬜ pending |
| ai/client.ts chokepoint + untrusted + health-check | 01-04 T1 | 2 | FND-09, XC-06, XC-07 | T-1-18, T-1-19, T-1-20, T-1-22 | @anthropic-ai/sdk only in ai/client.ts; cache_control on the stable prefix; Zod structured output; config-flagged fallback w/ no DB creds | lint + unit | `npm run lint && npx vitest run tests/ai/client.test.ts tests/ai/untrusted.test.ts` | ❌→✅(01-04) | ⬜ pending |
| Inngest serve() + real + stub functions | 01-04 T2 | 2 | FND-11, XC-04 | T-1-21, T-1-24 | signing-key-verified invocations; purge-soft-deleted fully implemented (>30d) | build + unit | `npm run build && npx vitest run tests/inngest/serve.test.ts` | ❌→✅(01-04) | ⬜ pending |
| AI health-check → Langfuse trace test | 01-04 T3 | 2 | FND-09, XC-06 | T-1-23 | the deploy-time Haiku ping emits a trace w/ cache metrics | unit | `npx vitest run tests/ai/health-check.test.ts` | ❌→✅(01-04) | ⬜ pending |
| Sentry config + PII scrub | 01-05 T1 | 2 | FND-07 | T-1-25 | beforeSend reuses the redacting logger's SENSITIVE_FIELDS | build | `npm run build && npm run lint && npm run typecheck` | ❌→✅(01-05) | ⬜ pending |
| Amplitude (browser+node) + funnel taxonomy + Langfuse client | 01-05 T2 | 2 | FND-07, XC-06 | T-1-26, T-1-27 | revenue events server-side; IDs/enums only; getLangfuseClient consumed by ai/client.ts | build + unit | `npm run build && npx vitest run tests/lib/analytics.test.ts` | ❌→✅(01-05) | ⬜ pending |
| Resend transactional email + templates | 01-05 T3 | 2 | FND-07 | T-1-28, T-1-29, T-1-30 | system mail only — never founder emails; from-address from SITE_URL | build + unit | `npm run build && npm run check:banned && npx vitest run tests/lib/email.test.ts` | ❌→✅(01-05) | ⬜ pending |
| Vendor data-flow inventory | 01-06 T1 | 2 | XC-01 | T-1-36 | every data-touching vendor + training posture + retention; OpenAI fallback + Claude-Code covered | doc + check | `node scripts/check-banned-strings.mjs && test -f docs/vendor-data-flow.md && grep -qi "training" docs/vendor-data-flow.md` | ❌→✅(01-06) | ⬜ pending |
| Clickwrap DPA + PDF + acceptDpa | 01-06 T2 | 2 | XC-04, XC-01 | T-1-35, T-1-37 | versioned acceptance on legal_acceptances+accounts; the PDF; banned-string clean | build + unit | `npm run build && npm run check:banned && test -f public/legal/dpa.pdf && npx vitest run tests/compliance/dpa.test.ts` | ❌→✅(01-06) | ⬜ pending |
| Data-rights — export + soft-delete + tRPC | 01-06 T3 | 2 | XC-04 | T-1-31, T-1-32, T-1-33, T-1-34 | export = the requesting tenant's rows only, no secrets; soft-delete via the audited service client; restore-within-30d | build + unit | `npm run build && npm run typecheck && npx vitest run tests/compliance/data-rights.test.ts` | ❌→✅(01-06) | ⬜ pending |
| Auth Google SSO + proxy.ts gate + sign-up/sign-in/welcome | 01-07 T1 | 3 | FND-04, FND-12 | T-1-39, T-1-40, T-1-44, T-1-45 | /app hard-gated → /reactivate; /styleguide session-gated; HttpOnly Secure cookies; DPA recorded | build + e2e | `npm run build && npm run typecheck && npx playwright test e2e/auth.spec.ts` | ❌→✅(01-07) | ⬜ pending |
| Stripe billing — tiers + entitlements + Checkout + Portal + webhook | 01-07 T2 | 3 | FND-05, FND-06 | T-1-38, T-1-41, T-1-42, T-1-43 | idempotent webhook (dedupe on event id) + reconcile cron; entitlements() pure, Stripe-free, extensible; replaces the Plan-03 stub | build + unit | `npm run build && npm run check:banned && npx vitest run tests/billing/` | ❌→✅(01-07) | ⬜ pending |
| Walking-Skeleton e2e + Vercel deploy + SKELETON.md | 01-07 T3 | 3 | FND-04, FND-05, FND-06, FND-12 | T-1-38, T-1-39, T-1-46 | the full slice works deployed; the Stripe webhook points at the deploy; env on Production+Preview | e2e + deploy | `npm run build && npx playwright test e2e/skeleton.spec.ts e2e/auth.spec.ts && test -f .planning/phases/01-foundation/SKELETON.md` | ❌→✅(01-07) | ⬜ pending |
| Marketing layout + homepage + hero timeline + sections | 01-08 T1 | 3 | FND-01, FND-08, XC-05 | T-1-47, T-1-48, T-1-50, T-1-51 | left-aligned hero; `motion` not framer-motion; reduced-motion-aware; no anti-patterns; no hardcoded URLs | build + check | `npm run build && npm run lint && npm run check:banned && npm run typecheck` | ❌→✅(01-08) | ⬜ pending |
| /pricing + FAQ + feature matrix + marketing e2e + Lighthouse gate | 01-08 T2 | 3 | FND-01, XC-05, D-14 | T-1-47, T-1-51 | all 4 tiers, Close Mode/Alumni no-checkout; the nav/footer contracts; Lighthouse ≥0.9 on / required | build + e2e + Lighthouse | `npm run build && npm run check:banned && npx playwright test e2e/marketing.spec.ts` | ❌→✅(01-08) | ⬜ pending |
| /manifesto + /legal/{privacy,terms,security,dpa} | 01-08 T3 | 3 | FND-01, XC-05 | T-1-47, T-1-49, T-1-50 | banned-string clean; /legal/dpa shares Plan 06's content + links to the PDF | build + e2e | `npm run build && npm run check:banned && npx playwright test e2e/marketing.spec.ts` | ❌→✅(01-08) | ⬜ pending |
| Onboarding stepper + 3 steps + funnel + onboarding_* schema [BLOCKING: db:push] | 01-09 T1 | 4 | FND-12 | T-1-55, T-1-58, T-1-59 | every stage transition an Amplitude event; SkeletonBlock not a spinner; no "about your company" form; schema pushed | build + e2e | `npm run build && npm run typecheck && npm run db:generate && npx playwright test e2e/onboarding.spec.ts` | ❌→✅(01-09) | ⬜ pending |
| /app dashboard + CTA cards + module placeholders | 01-09 T2 | 4 | FND-12 | T-1-58 | CTA cards link to real placeholder destinations (never dead); /styleguide session-gated | build + e2e | `npm run build && npm run check:banned && npx playwright test e2e/app-shell.spec.ts` | ❌→✅(01-09) | ⬜ pending |
| Settings (delete + export) + Billing (Portal + cancel) | 01-09 T3 | 4 | FND-12, XC-02, XC-04 | T-1-53, T-1-54, T-1-56, T-1-57 | requestAccountDeletion/requestDataExport are protectedProcedures; Portal URL server-generated; "Keep {noun}" dismiss | build + e2e | `npm run build && npm run check:banned && npx playwright test e2e/app-shell.spec.ts` | ❌→✅(01-09) | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

**Sampling continuity check:** no run of 3 consecutive tasks lacks an `<automated>` verify — every task above has a build/lint/unit/integration/e2e command. ✅

---

## Wave 0 Requirements

> Greenfield repo — there is no prior test infra. Wave 0 is folded into **Plan 01** (the scaffold plan), which creates the test runner config + the first tests; subsequent plans create their own test files (each plan's tasks include the Vitest/Playwright specs that prove their requirements — they are not deferred to a separate wave). Per RESEARCH.md §"Wave 0 Gaps":

- [ ] `vitest.config.ts` + `playwright.config.ts` + `.lighthouserc.json` — Plan 01 T3
- [ ] `tests/setup.ts` (MSW Node server, shared fixtures) — Plan 01 T3
- [ ] `tests/db/test-db.ts` (real-Postgres harness; `describe.skip` when `TEST_DATABASE_URL` unset; mints test JWTs / creates test users) — Plan 03 T3
- [ ] Framework install: `npm install -D vitest @vitest/ui @vitest/coverage-v8 jsdom @testing-library/react @testing-library/jest-dom @playwright/test msw @lhci/cli` — Plan 01 T1
- [ ] `scripts/check-banned-strings.mjs` + `tasks/banned-strings.txt` — Plan 01 T2
- [ ] `.github/workflows/ci.yml` (lint → typecheck → check:banned → vitest [incl. RLS w/ `TEST_DATABASE_URL`] → playwright [vs the Vercel preview] → lhci) — Plan 01 T3; the `lhci` step flips from `continue-on-error: true` to required in Plan 08 T2 (once `/` ships)
- [ ] Per-requirement test stub files (created within their owning plans, not a separate wave): `tests/lib/{env,logger,analytics,email}.test.ts` (Plans 01, 05); `tests/compliance/{banned-strings,dpa,data-rights}.test.ts` (Plans 01, 06); `tests/components/primitives.test.tsx` (Plan 02); `tests/rls/{schema-scan,two-user-isolation}.test.ts` + `tests/db/region.test.ts` (Plan 03); `tests/ai/{client,health-check,untrusted}.test.ts` (Plan 04); `tests/inngest/serve.test.ts` (Plan 04); `tests/billing/{tiers,entitlements,checkout-session,webhook-idempotency}.test.ts` (Plan 07); `e2e/{styleguide,auth,skeleton,marketing,onboarding,app-shell}.spec.ts` (Plans 02, 07, 08, 09)
- [ ] GitHub Actions secrets the CI workflow expects: `TEST_DATABASE_URL` (the RLS test DB), `PLAYWRIGHT_BASE_URL` (the Vercel preview URL), plus the build env vars mirrored from Vercel as needed

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| The deploy-time Haiku health-check trace appears in the Langfuse dashboard with real cache metrics (cache hit rate / tokens / latency / cost) | FND-09, XC-06 | post-deploy; the test asserts the trace is *emitted*, but confirming it *landed* in Langfuse Cloud is a dashboard check | After a Vercel deploy, trigger the `ai/health-check.requested` Inngest event (or the postbuild hook fires it); open the Langfuse dashboard → confirm a `agent:classify` trace with `cacheWrite`/`cacheRead`/`inputTokens`/`outputTokens`/`model` metadata |
| A real Stripe test-mode Checkout completes and the webhook flips the account to `trialing` | FND-05 | requires driving the Stripe-hosted Checkout page with the test card `4242 4242 4242 4242` end-to-end | In Stripe test mode: sign up → pick Active Raise → complete Checkout with the test card → confirm the founder lands on `/app` showing "Active Raise" and `accounts.subscription_status = 'trialing'` (Supabase dashboard) |
| The Stripe Customer Portal opens and allows plan switch / cancel | FND-05 | the Portal is Stripe-hosted | From `/app/billing` → "Manage billing" → confirm the Stripe Customer Portal loads with plan-switch + cancel options |
| The Vercel deploy is live at `trochia.asranest.com` | FND-01 | a real deploy, not a build | After the deploy: `https://trochia.asranest.com/` loads (the homepage); `/sign-up`, `/pricing`, `/styleguide` (when authed), `/api/inngest` (Inngest's introspection) all respond; the Stripe webhook endpoint in the dashboard points at `https://trochia.asranest.com/api/webhooks/stripe` |
| Google SSO sign-in works end-to-end against the real Supabase Auth + Google OAuth | FND-04 | requires the real Google consent screen | Click "Continue with Google" → complete the Google consent → land back on `/onboarding` (or `/app`) signed in; confirm an `accounts` row was created with `region = 'us'` |
| Sentry captures a test error; Amplitude receives a test event; Resend sends a test email | FND-07 | post-deploy dashboard checks | Trigger a test error → confirm it appears in Sentry (with PII scrubbed); fire a test Amplitude event → confirm it appears; send a test transactional email → confirm delivery via Resend |
| The Supabase Auth session-timer config matches D-10 (or its documented fallback) | FND-04 | a dashboard config check | In the Supabase Auth settings, confirm: JWT expiry = 1h, inactivity timeout = 30d, and (if the platform exposes it) absolute lifetime = 90d — record which timers exist (per RESEARCH.md Q2) in `01-07-SUMMARY.md` |
| The OAuth consent screen for Google requests the minimal scopes (email/profile, not Drive/Gmail) | FND-04 | inspecting the real consent screen | During sign-in, confirm the Google consent screen requests only basic profile/email scopes — no Drive/Gmail scopes (those are Phase 7) |

---

## Validation Sign-Off

- [x] All tasks have an `<automated>` verify or a Wave-0 dependency (folded into Plan 01 / each owning plan's tasks)
- [x] Sampling continuity: no 3 consecutive tasks without an automated verify
- [x] Wave 0 covers all MISSING references (Plan 01 creates the runner config + first tests; each plan creates its own specs)
- [x] No watch-mode flags (`npm run test` = `vitest run`; `npm run test:watch` is the opt-in)
- [x] Feedback latency < ~60s for the per-commit Vitest run
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** pending (planner-filled 2026-05-12; awaiting plan-checker)
