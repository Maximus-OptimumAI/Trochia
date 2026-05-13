---
phase: 01-foundation
plan: 05
subsystem: infra
tags: [sentry, amplitude, langfuse, resend, react-email, observability, transactional-email, env-validation]

# Dependency graph
requires:
  - phase: 01-foundation/01 (scaffold)
    provides: env.ts prodRequired() helper, redacting logger + SENSITIVE_FIELDS, errors.ts, next.config.ts, banned-string scanText core, CI fallback pattern
  - phase: 01-foundation/02 (design system)
    provides: src/app/providers.tsx extension slot (the "wrap an AnalyticsProvider here" comment)
  - phase: 01-foundation/04 (AI chokepoint)
    provides: src/lib/langfuse.ts stub (isLangfuseConfigured/getLangfuseClient signatures), src/ai/client.ts consumes the stub
  - phase: 01-foundation/06 (compliance plumbing)
    provides: src/lib/email/data-export-ready.ts minimal sender (migrated behind the new client.ts)
provides:
  - Sentry init for client/server/edge with shared SENSITIVE_FIELDS-driven beforeSend (src/lib/sentry-scrub.ts)
  - withSentryConfig-wrapped next.config.ts (source-map upload, widenClientFileUpload, /monitoring tunnel)
  - instrumentation.ts (Next 16 hook) + onRequestError
  - src/lib/analytics.ts — typed AnalyticsEvent union + track<N>() with browser/node split + identify(userId, traits)
  - src/components/analytics-provider.tsx mounted in providers.tsx extension slot
  - filled src/lib/langfuse.ts (real isLangfuseConfigured + memoized getLangfuseClient)
  - src/lib/email/client.ts (typed sendEmail<T>() + from-address derived from SITE_URL)
  - src/lib/email/templates/{_shared,welcome,trial-ending,payment-failed,data-export-ready}.tsx + index.ts (typed registry)
  - flipped env vars (prodRequired): SENTRY_DSN, NEXT_PUBLIC_SENTRY_DSN, SENTRY_ORG, SENTRY_PROJECT, SENTRY_AUTH_TOKEN, AMPLITUDE_API_KEY, NEXT_PUBLIC_AMPLITUDE_API_KEY, LANGFUSE_PUBLIC_KEY, LANGFUSE_SECRET_KEY, LANGFUSE_HOST, RESEND_API_KEY
  - CI fallback values for all 11 newly-required vars in .github/workflows/ci.yml
affects: [01-07 (Stripe webhooks fire checkout_completed via the node analytics path; trial-ending + payment-failed email sends), 01-08 (marketing site), 01-09 (onboarding stepper emits the D-12 funnel events), all later phases (Sentry + Langfuse instrumentation are live)]

# Tech tracking
tech-stack:
  added:
    - "@sentry/nextjs (v10.53.1, already in deps) — wired"
    - "@amplitude/analytics-browser (v2.42.2, already in deps) — wired"
    - "@amplitude/analytics-node (v1.5.57, already in deps) — wired"
    - "langfuse (v3.38.20, already in deps) — stub from Plan 04 filled"
    - "resend (v6.12.3) + react-email (v6.1.3) + @react-email/components (v1.0.12) — wired"
  patterns:
    - "Single-source SENSITIVE_FIELDS — defined once in src/lib/logger.ts; src/lib/sentry-scrub.ts imports it for beforeSend deep-scrub; future redaction surfaces reuse the same set"
    - "Stub-and-fill seam for vendor clients — src/lib/langfuse.ts owns the construction; consumers (src/ai/client.ts) import the seam and were untouched when the stub was filled"
    - "From-address derived from SITE_URL host — no hardcoded trochia.* domain in src/lib/email/* (trochia.ai migration is a single NEXT_PUBLIC_SITE_URL swap)"
    - "Typed transactional registry — EMAIL_TEMPLATES + TemplateProps<T> mapped type make sendEmail call sites type-safe (unknown template = compile error)"
    - "Server-vs-browser analytics split — track() routes to @amplitude/analytics-node when window is undefined (non-spoofable revenue events fire server-side in Plan 07)"

key-files:
  created:
    - sentry.client.config.ts
    - sentry.server.config.ts
    - sentry.edge.config.ts
    - instrumentation.ts
    - src/lib/sentry-scrub.ts
    - src/lib/analytics.ts
    - src/components/analytics-provider.tsx
    - src/lib/email/client.ts
    - src/lib/email/templates/_shared.tsx
    - src/lib/email/templates/welcome.tsx
    - src/lib/email/templates/trial-ending.tsx
    - src/lib/email/templates/payment-failed.tsx
    - src/lib/email/templates/data-export-ready.tsx
    - src/lib/email/templates/index.ts
    - tests/lib/analytics.test.ts
    - tests/lib/email.test.ts
  modified:
    - next.config.ts (wrapped in withSentryConfig)
    - src/lib/env.ts (11 vars flipped prodRequired; EMAIL_FROM kept optional)
    - src/lib/langfuse.ts (Plan 04 stub filled — signatures unchanged)
    - src/app/providers.tsx (AnalyticsProvider wrapped inside extension slot)
    - src/lib/email/data-export-ready.ts (migrated behind sendEmail; call signature preserved)
    - .github/workflows/ci.yml (added CI fallbacks for the 11 newly-required vars)

key-decisions:
  - "Single SENSITIVE_FIELDS source of truth: src/lib/sentry-scrub.ts imports redactSensitive from src/lib/logger.ts rather than redefining the set — future fields added in logger.ts propagate automatically to Sentry"
  - "Browser/node SDK split is per-call (inside track()), not per-import — src/lib/analytics.ts works in both runtimes from a single import; the SDKs are lazy-imported so the browser bundle never sees @amplitude/analytics-node"
  - "EMAIL_FROM kept optional: when unset, client derives 'Trochia <system@{SITE_URL_host}>' — keeps the trochia.ai migration to a single env var change"
  - "Sentry tracesSampleRate set to 0.1 for Phase 1 (modest, per RESEARCH); session replay off by default with replaysOnErrorSampleRate at 0.1 — bump per route once we know hot paths"
  - "tunnelRoute: /monitoring on withSentryConfig to dodge ad-blockers; disableLogger: true to tree-shake Sentry's logger statements in prod"
  - "AnalyticsProvider uses module-scoped 'initialized' guard (not React state) so React 19 Strict Mode double-invoke does not double-init Amplitude"
  - "data-export-ready Plan 06 sender migrated behind sendEmail (signature preserved); src/modules/data-rights/export.ts unaffected"

patterns-established:
  - "Pattern 1 (Sentry scrub seam): src/lib/sentry-scrub.ts is the only beforeSend/beforeBreadcrumb implementation — all 3 Sentry.init calls reference the same exported functions"
  - "Pattern 2 (typed event taxonomy): AnalyticsEvent union + AnalyticsEventProps<N> means track(name, props) compile-errors on unknown names and on wrong prop shapes; future events extend the union"
  - "Pattern 3 (template registry): adding a new transactional template = (1) tsx file in templates/, (2) register in templates/index.ts + add Props row to TemplatePropsMap, (3) add subject to TEMPLATE_SUBJECTS — sendEmail picks it up automatically"
  - "Pattern 4 (CI fallback for prod-required env): when env.ts flips a var prodRequired, .github/workflows/ci.yml adds a fallback so the CI prod build stays green pre-provisioning (followed for Sentry/Amplitude/Langfuse/Resend in this plan)"

requirements-completed: [FND-07, XC-06]

# Metrics
duration: ~45min
completed: 2026-05-13
---

# Phase 01 Plan 05: Observability + Email Summary

**Sentry (client/server/edge with shared-SENSITIVE_FIELDS PII scrub + withSentryConfig source-map upload) + typed Amplitude analytics (browser + node SDKs with the D-12 onboarding-funnel taxonomy) + filled Langfuse client (Plan 04's stub now real — ai/client.ts untouched) + Resend transactional email (4 typed react-email templates, from-address derived from SITE_URL) wired Phase 1, with 11 env vars flipped prodRequired and matching CI fallbacks.**

## Performance

- **Duration:** ~45 min
- **Started:** 2026-05-13T00:55:00Z (approx)
- **Completed:** 2026-05-13T01:35:00Z (approx)
- **Tasks:** 3
- **Files created:** 16
- **Files modified:** 6

## Accomplishments

- **Sentry wired end-to-end (Task 1):** `sentry.{client,server,edge}.config.ts` all route `beforeSend` + `beforeBreadcrumb` through `src/lib/sentry-scrub.ts`, which reuses the redacting logger's exported `SENSITIVE_FIELDS` set — financial figures, deck text, transcript bodies, and PII never reach Sentry. `next.config.ts` wrapped in `withSentryConfig` with source-map upload, widened client file upload, `/monitoring` tunnel route, and `disableLogger: true`. `instrumentation.ts` (Next 16 hook) loads the runtime-appropriate Sentry config and re-exports `captureRequestError` as `onRequestError`.
- **Amplitude + Langfuse wired (Task 2):** `src/lib/analytics.ts` exposes a typed `AnalyticsEvent` union with the full D-12 onboarding funnel (`signup_started → welcome_viewed → tier_selected → checkout_started → checkout_completed → knowledge_pack_step_viewed → deck_upload_step_viewed → review_step_viewed → dashboard_viewed`) + lifecycle (`signed_in`/`signed_out`/`manage_billing_clicked`). `track<N>()` routes to `@amplitude/analytics-browser` on the client and `@amplitude/analytics-node` on the server (non-spoofable revenue path — Plan 07 fires `checkout_completed` from the Stripe webhook). `src/components/analytics-provider.tsx` is mounted **inside `src/app/providers.tsx`'s extension slot** (NOT `layout.tsx` — `git diff layout.tsx` clean) and lazy-inits the browser SDK with autocapture off and ipAddress off. `src/lib/langfuse.ts`'s Plan-04 stub is filled with the real `isLangfuseConfigured()` (true iff the 3 env vars are set) and the memoized `getLangfuseClient()` — `src/ai/client.ts` was NOT touched (it imports the same signature).
- **Resend transactional email (Task 3):** `src/lib/email/client.ts` exports `sendEmail<T extends TemplateName>({ to, template, props })` which renders the react-email component via `@react-email/render`, derives the from-address from `SITE_URL`'s host (no hardcoded trochia.* domain), and sends via Resend (logs + returns `sent: false` when `RESEND_API_KEY` is unset). 4 typed react-email templates: `welcome`, `trial-ending`, `payment-failed`, `data-export-ready` — operator voice (no emoji, no banned compliance strings, brand tokens inlined via `_shared.tsx`). Plan 06's minimal `data-export-ready` sender migrated behind the new `sendEmail` with its call signature preserved.
- **Env tightened:** 11 vars flipped `prodRequired` in `src/lib/env.ts` (Sentry × 5, Amplitude × 2, Langfuse × 3, Resend × 1). `EMAIL_FROM` deliberately kept optional (client derives from `SITE_URL`).
- **CI stays green:** `.github/workflows/ci.yml` adds CI-fallback values for all 11 newly-required vars (`SENTRY_DSN`, `NEXT_PUBLIC_SENTRY_DSN`, `SENTRY_ORG`, `SENTRY_PROJECT`, `SENTRY_AUTH_TOKEN`, `AMPLITUDE_API_KEY`, `NEXT_PUBLIC_AMPLITUDE_API_KEY`, `LANGFUSE_PUBLIC_KEY`, `LANGFUSE_SECRET_KEY`, `LANGFUSE_HOST`, `RESEND_API_KEY`) — production builds stay green before real secrets are added.

## Task Commits

Each task was committed atomically:

1. **Task 1: Sentry client/server/edge + instrumentation + withSentryConfig** — `312d31f` (feat)
2. **Task 2: Amplitude (browser+node) + filled Langfuse client + analytics-provider mount** — `759de74` (feat)
3. **Task 3: Resend client + typed react-email template registry** — `892bece` (feat)

**Plan metadata:** _(this commit)_ — `docs(01-05): complete observability + email plan`

## Files Created/Modified

**Created:**
- `sentry.client.config.ts` — Sentry browser SDK init
- `sentry.server.config.ts` — Sentry Node.js SDK init
- `sentry.edge.config.ts` — Sentry Edge runtime SDK init
- `instrumentation.ts` — Next 16 instrumentation hook (loads runtime Sentry, re-exports captureRequestError as onRequestError)
- `src/lib/sentry-scrub.ts` — single beforeSend/beforeBreadcrumb implementation; reuses SENSITIVE_FIELDS via redactSensitive from logger.ts
- `src/lib/analytics.ts` — typed AnalyticsEvent union + track<N>() + identify(); Amplitude browser/node split
- `src/components/analytics-provider.tsx` — 'use client' component; mounted in providers.tsx extension slot
- `src/lib/email/client.ts` — sendEmail<T>(); getEmailFromAddress() derives from SITE_URL host
- `src/lib/email/templates/_shared.tsx` — EmailShell + brand tokens (Ink/Paper/Signal/Graphite/Stone)
- `src/lib/email/templates/welcome.tsx` — post-signup template
- `src/lib/email/templates/trial-ending.tsx` — N days left + Customer Portal link
- `src/lib/email/templates/payment-failed.tsx` — Stripe decline + update-payment link
- `src/lib/email/templates/data-export-ready.tsx` — 48h signed URL + expiry
- `src/lib/email/templates/index.ts` — EMAIL_TEMPLATES registry, TemplatePropsMap, TEMPLATE_SUBJECTS
- `tests/lib/analytics.test.ts` — 5 tests (server/browser branch, full funnel taxonomy, unknown event ts-expect-error)
- `tests/lib/email.test.ts` — 4 tests (Resend call assertion, banned-string + no-emoji scan over all 4 templates, unknown template ts-expect-error, no-API-key fail-soft)

**Modified:**
- `next.config.ts` — wrapped in `withSentryConfig` (org/project/authToken, widenClientFileUpload, /monitoring tunnel, disableLogger)
- `src/lib/env.ts` — 11 vars flipped `prodRequired` (Sentry × 5, Amplitude × 2, Langfuse × 3, Resend × 1); EMAIL_FROM kept optional
- `src/lib/langfuse.ts` — Plan 04 stub filled: real `isLangfuseConfigured()` + memoized `getLangfuseClient()`; signatures unchanged so `src/ai/client.ts` is untouched
- `src/app/providers.tsx` — `<AnalyticsProvider>` wrapped inside the Plan 02 extension slot (layout.tsx untouched)
- `src/lib/email/data-export-ready.ts` — migrated behind `sendEmail` (call signature preserved for `src/modules/data-rights/export.ts`)
- `.github/workflows/ci.yml` — CI fallbacks for the 11 newly-required env vars

## Decisions Made

- **Single SENSITIVE_FIELDS source of truth:** `src/lib/sentry-scrub.ts` imports `redactSensitive` from `src/lib/logger.ts` rather than re-declaring the field set — adding a new sensitive field in `logger.ts` (Phase 8 will add cap-table figures; Phase 6 will add audio data) propagates to Sentry automatically with zero edits to scrub code.
- **EMAIL_FROM kept optional, host derived from `SITE_URL`:** the trochia.ai migration stays a single `NEXT_PUBLIC_SITE_URL` env-var swap; no hardcoded domain in `src/lib/email/*`.
- **Per-call browser/node split inside `track()`:** the SDKs are lazy-imported so the browser bundle never pulls in `@amplitude/analytics-node`. Module-scoped memoization for the node client; the browser SDK is its own module.
- **AnalyticsProvider module-scoped `initialized` guard:** React 19 Strict Mode double-invokes effects in dev — using a module-scoped flag rather than `useRef` ensures Amplitude.init runs exactly once.
- **Sentry traces sample 0.1, replays off, errors-replay 0.1:** modest Phase-1 defaults per RESEARCH.md. Bump per route once hot paths emerge.
- **`tunnelRoute: '/monitoring'`:** routes Sentry requests through Next so ad-blockers don't drop them.
- **Plan 06 sender migration:** `src/lib/email/data-export-ready.ts` now calls the new `sendEmail` but keeps its original signature (`{ to, downloadUrl, expiresAt: Date }`) so `src/modules/data-rights/export.ts` is unaffected.

## Deviations from Plan

None - plan executed exactly as written.

The plan called out a CI-fallback follow-up ("for ANY env var the build needs that isn't yet in the environment, just make sure the prod build stays green via the existing CI-fallback pattern in `.github/workflows/ci.yml`") — handled in Task 1 by extending the existing ANTHROPIC_API_KEY fallback pattern to all 11 newly-required vars.

## Issues Encountered

- **Resend SDK mocking:** initial `vi.fn().mockImplementation(() => ({...}))` is not a constructor — `new Resend(...)` failed in tests. Fix: swapped the mock to a real `class Resend { emails = { send: resendSend } }` declaration. Two-line fix in `tests/lib/email.test.ts`.
- **Local prod-build verification:** local `npm run build` ran with `NODE_ENV=production` and tripped the newly-required env vars (intended behavior). Verified end-to-end by passing the CI-fallback values inline in the shell command — confirms the `prodRequired` flips work AND the CI fallbacks will keep the GitHub Actions build green.

## User Setup Required

**External services require manual configuration before the Vercel deploy is meaningful.** None of these block code merges, but the dashboards will be empty until they're done:

1. **Sentry:** create the Trochia project on the Team plan (D-01b). Inject `SENTRY_DSN`, `NEXT_PUBLIC_SENTRY_DSN`, `SENTRY_ORG`, `SENTRY_PROJECT`, `SENTRY_AUTH_TOKEN` into Vercel env (Production + Preview) and `.env.local`. Verify domain on the Sentry dashboard for source-map upload.
2. **Amplitude:** create the Trochia project. Inject `NEXT_PUBLIC_AMPLITUDE_API_KEY` and `AMPLITUDE_API_KEY` (the server key for the node SDK).
3. **Langfuse:** Cloud free tier (5K traces/month) or self-host. Inject `LANGFUSE_PUBLIC_KEY`, `LANGFUSE_SECRET_KEY`, `LANGFUSE_HOST`.
4. **Resend:** create the account. Verify the sending domain (`trochia.asranest.com` now → `trochia.ai` later). Inject `RESEND_API_KEY`. `EMAIL_FROM` is optional — the client derives `Trochia <system@{SITE_URL_host}>` when unset.
5. **GitHub Actions secrets:** add real values for all 11 vars to repo secrets — the CI fallbacks keep the build green but only the real keys produce real dashboard activity.

### Post-deploy manual verification (VALIDATION.md line 119)

After the next Vercel deploy with the real keys injected, record in `01-VALIDATION.md`:

- [ ] **Sentry:** trigger a test error (e.g. throw in a server action); confirm it appears in the Sentry dashboard with `event.extra` / `event.contexts` / `event.request.data` scrubbed (no financial figures, deck text, transcript bodies, PII).
- [ ] **Amplitude:** fire a test event from the browser (sign in) and a test event from the server (Stripe webhook in Plan 07); confirm both appear in Amplitude with IDs/enums only — no free-text props.
- [ ] **Langfuse:** the deploy-time Haiku health-check (Plan 04's postbuild script) emits the first real trace; open the Langfuse dashboard → confirm an `agent:classify` trace with `cacheWrite`/`cacheRead`/`inputTokens`/`outputTokens`/`model` metadata (XC-06 — cache hit rate INSTRUMENTED, not assumed).
- [ ] **Resend:** send a test transactional email (e.g. via the `data-export-ready` flow from Plan 06); confirm delivery + that the from-address domain matches `SITE_URL`'s host.

## Next Phase Readiness

- **For Plan 07 (Walking Skeleton):** `track('checkout_completed', { tier, period })` fires server-side from the Stripe webhook; `sendEmail({ template: 'trial-ending', ... })` and `sendEmail({ template: 'payment-failed', ... })` are wired and tested.
- **For Plan 08 (marketing site):** `withSentryConfig`-wrapped `next.config.ts` already handles source-map upload — no extra config needed.
- **For Plan 09 (onboarding stepper):** the D-12 funnel event taxonomy is defined; the stepper emits `signup_started → ... → dashboard_viewed` per stage transition.
- **No blockers for the rest of Phase 1.** The dashboards remain empty until the human provisions the four vendor accounts and injects the real keys — the CI fallbacks keep the build green in the meantime.

## Self-Check: PASSED

All 17 declared files verified on disk; all 3 task commits (`312d31f`, `759de74`, `892bece`) verified in `git log`.

---
*Phase: 01-foundation*
*Completed: 2026-05-13*
