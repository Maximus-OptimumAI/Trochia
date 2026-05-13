---
phase: 01-foundation
plan: 06
subsystem: compliance-privacy-plumbing
tags: [compliance, dpa, clickwrap, data-rights, gdpr, data-export, soft-delete, vendor-inventory, xc-01, xc-04, trpc]

requires:
  - phase: 01-01
    provides: "scripts/check-banned-strings.mjs scanText core; src/lib/{env,logger,errors}.ts; ESLint guardrails; Vitest infra; @react-pdf/renderer + resend + @supabase/supabase-js deps"
  - phase: 01-03
    provides: "src/db/schema/{tenancy,billing,legal,jobs}.ts (accounts.dpa_accepted_at/dpa_version/deleted_at, legal_acceptances); src/db/client.ts getServiceClient(); RequestDb (.rls()); src/server/{trpc,context}.ts protectedProcedure + ctx.{tenantId,db,account,session}; src/server/routers/index.ts registry"
provides:
  - "docs/vendor-data-flow.md — the vendor data-flow inventory (every data-touching vendor: training posture, retention, contract status); the XC-01 evidence base, referenced from the DPA"
  - "src/lib/compliance/dpa-sections.ts — DPA_VERSION ('2026-05') + DPA_SECTIONS (the single-source DPA text, GDPR/UK-GDPR/DPDP/LGPD-grade) + dpaPlainText()"
  - "src/lib/compliance/dpa-content.tsx — <DpaContent/> React view over dpa-sections (Plan 08's /legal/dpa page renders this); re-exports DPA_SECTIONS/DpaSection/dpaPlainText"
  - "src/lib/compliance/dpa.ts — DPA_VERSION (re-export) + recordDpaAcceptance (legal_acceptances 'dpa' row + accounts.dpa_accepted_at/dpa_version, idempotent at the version) + recordTosAcceptance/recordPrivacyAcceptance + TOS_VERSION/PRIVACY_VERSION"
  - "public/legal/dpa.pdf — the downloadable DPA (3pp, generated from dpa-sections via scripts/generate-dpa-pdf.ts / @react-pdf/renderer; committed artifact)"
  - "scripts/generate-dpa-pdf.ts + npm run gen:dpa-pdf — regenerates public/legal/dpa.pdf from the single source"
  - "src/modules/data-rights/export.ts — buildAccountDataExport(accountId) (JSON dump of every tenant-scoped table, forbidden columns stripped) + exportAccountData(accountId) (-> Supabase Storage exports/{accountId}/{ts}.json, private; 48h signed URL; data-export-ready email) + EXPORTS_BUCKET/EXPORT_URL_TTL_SECONDS"
  - "src/modules/data-rights/delete-account.ts — softDeleteAccount(accountId) (sets accounts.deleted_at via getServiceClient, revokes owner Supabase sessions, emits account/soft-deleted) + restoreAccount(accountId) (clears deleted_at within 30 days, refuses after) + SOFT_DELETE_WINDOW_DAYS=30; the Plan-04 purge-soft-deleted cron finishes the job"
  - "src/lib/email/data-export-ready.ts — sendDataExportReadyEmail() minimal Resend sender (Plan 05 owns the full email layer; signature is stable for export.ts to depend on)"
  - "src/server/routers/compliance.ts — complianceRouter: acceptDpa, dpaStatus, requestDataExport, requestAccountDeletion, restoreAccount (all protectedProcedure); registered as appRouter.compliance"
affects: [01-07-walking-skeleton-auth-billing (acceptDpa on sign-up), 01-08-marketing-site (/legal/dpa renders DpaContent + links public/legal/dpa.pdf), 01-09-settings (requestDataExport/requestAccountDeletion/restoreAccount wired to the Settings screen), all-future-vendors (must be added to docs/vendor-data-flow.md)]

tech-stack:
  added: []
  patterns:
    - "DPA single-source: text lives ONLY in src/lib/compliance/dpa-sections.ts (dependency-free data module); dpa-content.tsx is the React view; scripts/generate-dpa-pdf.ts renders the PDF — the PDF and the /legal/dpa page can never drift"
    - "clickwrap acceptance: recordDpaAcceptance writes the append-only legal_acceptances row AND the denormalised accounts.dpa_accepted_at/dpa_version; idempotent at DPA_VERSION; bumping DPA_VERSION makes dpaStatus report stale -> UI re-prompts"
    - "data export: tenant-scoped reads explicitly filtered to one accountId via getServiceClient (RLS is the backstop); forbidden columns (*_secret/*_key/token/password + SENSITIVE_FIELDS keys) stripped; uploaded to a tenant-isolated private Storage path with a 48h signed URL; emailed to the founder"
    - "account deletion: soft-delete (accounts.deleted_at) via getServiceClient (audited call site #4 — not the user's RLS client, since deleted_at makes ctx treat the tenant as gone mid-op); 30-day restore window; the purge-soft-deleted Inngest cron (Plan 04) does the permanent purge; delete-account.ts and purge-soft-deleted.ts agree on accounts.deletedAt"
    - "vendor inventory as a living markdown artifact (docs/vendor-data-flow.md) — the XC-01 evidence chain: product copy -> DPA (names it as the sub-processor inventory) -> ToS -> this inventory; new vendors added here before they touch customer data"

key-files:
  created:
    - docs/vendor-data-flow.md
    - src/lib/compliance/dpa-sections.ts
    - src/lib/compliance/dpa-content.tsx
    - src/lib/compliance/dpa.ts
    - scripts/generate-dpa-pdf.ts
    - public/legal/dpa.pdf
    - src/lib/email/data-export-ready.ts
    - src/modules/data-rights/export.ts
    - src/modules/data-rights/delete-account.ts
    - src/server/routers/compliance.ts
    - tests/compliance/dpa.test.ts
    - tests/compliance/data-rights.test.ts
  modified:
    - src/server/routers/index.ts
    - package.json

key-decisions:
  - "DPA text extracted into a dependency-free src/lib/compliance/dpa-sections.ts (plain .ts) — dpa-content.tsx re-exports it + adds the React view. Forced by tooling: importing a `.tsx`/`.ts` source module AND @react-pdf/renderer in the same tsx-run script fails ('does not provide an export'); a plain `.ts` data module without React imports loads cleanly. The plan's `dpa-content.tsx` is still the single source for the page (it re-exports), and the data module is what the PDF generator + tests + the page all ultimately consume — no drift."
  - "DPA_VERSION = '2026-05' (also TOS_VERSION/PRIVACY_VERSION). It lives in dpa-sections.ts (it versions the content); dpa.ts re-exports it as the plan specified. Bump on a material revision -> re-acceptance prompt."
  - "PDF is committed (public/legal/dpa.pdf, 3pp) and regenerated via `npm run gen:dpa-pdf` — NOT a build-time prebuild step (keeps `next build` deterministic + dependency-light, per the plan's 'either is fine')."
  - "The 'data-export-ready email from Plan 05' does not exist yet (Plan 05 hasn't run; this plan depends_on [1,3] only). Built a minimal src/lib/email/data-export-ready.ts that uses Resend when RESEND_API_KEY+EMAIL_FROM are set and logs+returns otherwise. Plan 05 can replace it with the React Email template — the call signature is what export.ts depends on, so keep it stable. [Rule 3 — referenced file absent]"
  - "softDeleteAccount writes accounts.deleted_at via getServiceClient() (NOT the user's RLS request client): the authenticated tRPC mutation authenticates the actor, but setting deleted_at makes createTRPCContext treat the tenant as gone, so the request client would lose access mid-op. Documented in the file header as getServiceClient caller #4 ('account deletion')."
  - "Data export columns are whitelisted-by-exclusion: any key matching /_secret$/i, /_key$/i, /secret/i, /password/i, /token/i is dropped from every row, in addition to the SENSITIVE_FIELDS set. The test asserts no such key appears in the dump (T-1-32)."
  - "exportAccountData is synchronous in Phase 1 (almost no data). If a tenant's dump ever gets large, move the body into an Inngest function and have requestDataExport enqueue it (noted in the file)."
  - "restoreAccount throws RESTORE_WINDOW_EXPIRED (410) after 30 days and ACCOUNT_NOT_DELETED (409) if not soft-deleted; the deletion is irreversible by design after the window (T-1-34)."

requirements-completed: [XC-01, XC-04]

metrics:
  duration: ~55 min
  completed: 2026-05-12
---

# Phase 1 Plan 06: Compliance / Privacy Plumbing Summary

**The compliance/privacy plumbing for XC-01 + XC-04: the vendor data-flow inventory (`docs/vendor-data-flow.md` — every data-touching vendor with its training posture, retention, contract status; Anthropic no-training/7-day, the config-flagged OpenAI fallback with no DB credentials, Claude-Code build tooling explicitly covered) backing the no-customer-data-in-training claim; the clickwrap DPA (a GDPR/UK-GDPR/DPDP/LGPD-grade addendum — text in a single dependency-free `dpa-sections.ts`, the `<DpaContent/>` React view over it for Plan 08's `/legal/dpa`, a committed `public/legal/dpa.pdf` regenerated via `npm run gen:dpa-pdf`, `recordDpaAcceptance` writing the append-only `legal_acceptances` row + the denormalised `accounts.dpa_*` snapshot, idempotent at `DPA_VERSION`); the data-subject-rights plumbing (on-demand full data export → JSON dump of every tenant table with forbidden columns stripped → tenant-isolated private Supabase Storage → 48h signed URL → the data-export-ready email; account soft-delete → `accounts.deleted_at` via `getServiceClient` + owner-session revocation + an `account/soft-deleted` event, with the Plan-04 `purge-soft-deleted` cron doing the 30-day permanent purge; restore-within-30-days); and the `complianceRouter` (`acceptDpa`/`dpaStatus`/`requestDataExport`/`requestAccountDeletion`/`restoreAccount`, all `protectedProcedure`) registered as `appRouter.compliance` — Plan 07's sign-up clickwrap line calls `acceptDpa`; Plan 09's Settings screen calls the data-rights procedures; Plan 08 renders `<DpaContent/>` + links the PDF. 21 new compliance tests pass; full suite 61 passed / 5 skipped. Banned-string clean.**

## Task Commits

1. **Task 1: the vendor data-flow inventory (`docs/vendor-data-flow.md`)** — `2fcb7d9` (docs)
2. **Task 2: the clickwrap DPA — `dpa-sections.ts`/`dpa-content.tsx`/`dpa.ts`, the PDF + generator, `acceptDpa`/`dpaStatus`, registered** — `c3afab0` (feat)
3. **Task 3: data-subject-rights — `export.ts`/`delete-account.ts`/email helper, the 3 data-rights tRPC procedures, `data-rights.test.ts`** — *(this commit batch — see git log)* (feat)

Plan metadata: this SUMMARY commit.

## The vendor inventory (`docs/vendor-data-flow.md`)

A living markdown table — columns **Vendor · What data touches it · Trains on inputs? · Retention · DPA/contract status · Notes** — covering: **Anthropic API** (no-training; ~7-day retention; calls only via `src/ai/client.ts`), **OpenAI API (fallback only)** (no-training; `AI_FALLBACK_ENABLED` off by default; `ai/fallback.ts` has no DB credentials), **Claude Code / Cursor (build tooling)** (no customer data flows here; synthetic-fixtures-only rule), **Supabase** (all stored data; 30-day soft-delete then purge for accounts; RLS default-deny; EU region in Phase 8), **Stripe** (billing tokens, never the PAN), **Resend** (founder system mail only), **Sentry** (scrubbed error contexts), **Amplitude** (ids+enums only), **Langfuse** (LLM traces), **Inngest** (job payloads), **Vercel** (logs/builds), **Upstash Redis** (dedupe/rate-limit). Closes with an **XC-01 traceability** section (product copy → DPA → ToS → this inventory) and the rule that any new vendor must be added here before it touches customer data.

**`[VERIFY]` follow-ups (need confirmation before the relevant phase ships):**
- **OpenAI ZDR enrollment + current API retention** — confirm zero-data-retention is in effect before `AI_FALLBACK_ENABLED` is ever turned on in production.
- **Resend retention window** — confirm against Resend's current DPA/docs (Plan 05 wiring).
- **Langfuse Cloud retention + data region** — or document self-hosting if chosen (Plan 05 wiring).

## The DPA

- **`DPA_VERSION = '2026-05'`** (also `TOS_VERSION` / `PRIVACY_VERSION`). Lives in `src/lib/compliance/dpa-sections.ts`; `dpa.ts` re-exports it.
- **Single source:** `src/lib/compliance/dpa-sections.ts` exports `DPA_SECTIONS` (13 sections — parties/scope, subject-matter & duration, nature & purpose, categories of data subjects & personal data, sub-processors [references `docs/vendor-data-flow.md`], **no use of customer data for model training (XC-01)**, confidentiality & security measures, breach notification, assistance & data-subject rights, deletion [30-day soft-delete then purge], international transfers & data residency [US/India today, EU planned; SCCs + UK IDTA], audit rights, general). It is dependency-free (no React, no `server-only`) so the PDF generator + tests + the page all import it. `dpaPlainText()` flattens it.
- **`src/lib/compliance/dpa-content.tsx`** — `<DpaContent/>` (unstyled `<article>` of `<section>`s, one per `DPA_SECTIONS` entry; Plan 08's `/legal/dpa` page wraps it in the marketing layout) + re-exports `DPA_SECTIONS`/`DpaSection`/`dpaPlainText`.
- **`public/legal/dpa.pdf`** — a 3-page PDF, generated from `DPA_SECTIONS` via `scripts/generate-dpa-pdf.ts` (`@react-pdf/renderer`), committed. Regenerate with `npm run gen:dpa-pdf`. Plan 08's `/legal/dpa` page links it for download.
- **`src/lib/compliance/dpa.ts`** — `recordDpaAcceptance(accountId, db, acceptedByUserId?)`: inserts a `legal_acceptances` row `{ accountId, document: 'dpa', version: DPA_VERSION, acceptedByUserId? }` (skipped if one already exists at that exact version — idempotent) AND, if a new row was written, updates `accounts.dpa_accepted_at = now()`, `dpa_version = DPA_VERSION`. Runs inside the caller's request-scoped `db.rls(...)` — no service-client write. `recordTosAcceptance` / `recordPrivacyAcceptance` are the history-row-only companions for the "Terms and Privacy" clickwrap line.

## Data-subject-rights

- **`src/modules/data-rights/export.ts`** — `buildAccountDataExport(accountId)` SELECTs (`getServiceClient`, every query explicitly filtered to the one `accountId`) the `accounts` row, `subscriptions`, `legal_acceptances`, `jobs`, `sessions`; strips any column matching `/_secret$/i`, `/_key$/i`, `/secret/i`, `/password/i`, `/token/i` (plus `SENSITIVE_FIELDS` keys); returns `{ exportedAt, schemaNote, account, subscriptions, legalAcceptances, jobs, sessions }`. **Future-phase tables (businesses, decks, investors, pipeline, transcripts) get added to this function as those phases ship.** `exportAccountData(accountId)` then JSON-stringifies it, uploads to a private Supabase Storage path **`exports/{accountId}/{timestamp}.json`**, creates a **48-hour** signed download URL (`EXPORT_URL_TTL_SECONDS`), sends the **`data-export-ready`** email with the URL + expiry, and returns `{ downloadUrl, expiresAt }`. Synchronous in Phase 1 (negligible data).
- **`src/modules/data-rights/delete-account.ts`** — `softDeleteAccount(accountId)` sets `accounts.deleted_at = now()` via **`getServiceClient()`** (audited service-role caller #4 — see the file header for why this is NOT the user's RLS client), revokes the owner's Supabase sessions (`auth.admin.signOut`, best-effort — no-op if the admin client isn't configured), and emits an `account/soft-deleted` Inngest event. The permanent purge happens 30 days later via the Plan-04 `purge-soft-deleted` cron (it scans `accounts.deleted_at` — same column). `restoreAccount(accountId)` clears `deleted_at` if the account is still within `SOFT_DELETE_WINDOW_DAYS = 30` (throws `RESTORE_WINDOW_EXPIRED` / `ACCOUNT_NOT_DELETED` otherwise).
- **`src/lib/email/data-export-ready.ts`** — `sendDataExportReadyEmail({ to, downloadUrl, expiresAt })`: a minimal Resend sender (uses `RESEND_API_KEY` + `EMAIL_FROM` when both set, else logs and returns; never throws). Plan 05 owns the full email layer and can replace this with a React Email template — the signature is stable.

## `complianceRouter` (`appRouter.compliance`)

| Procedure | Kind | Behavior |
|---|---|---|
| `acceptDpa` | `protectedProcedure.mutation` | `recordDpaAcceptance(ctx.tenantId, ctx.db, ctx.session.user.id)` → `{ accepted: true, version }`. Plan 07's sign-up clickwrap calls this. |
| `dpaStatus` | `protectedProcedure.query` | `{ accepted: ctx.account.dpaVersion === DPA_VERSION, version, currentVersion, acceptedAt }`. |
| `requestDataExport` | `protectedProcedure.mutation` | `exportAccountData(ctx.tenantId)` → `{ downloadUrl, expiresAt }`. |
| `requestAccountDeletion` | `protectedProcedure.mutation` | `softDeleteAccount(ctx.tenantId)` → `{ deleted: true }`. The typed-`DELETE`-confirm UI gate is Plan 02's Dialog + Plan 09's screen. |
| `restoreAccount` | `protectedProcedure.mutation` | `restoreAccount(ctx.tenantId)` → `{ restored: true }`. |

## `getServiceClient` call sites added

- **`src/modules/data-rights/delete-account.ts`** — `softDeleteAccount` (the `accounts.deleted_at` write) and `restoreAccount` (the lookup + the `deleted_at` clear). Documented in the file header as caller #4 ("account deletion"). `export.ts` also uses `getServiceClient()` for the tenant-scoped reads, each explicitly filtered to one `accountId` (RLS is the backstop) — also an "account deletion / data rights" usage, in the same audited family.

## Verification

| Check | Result |
|-------|--------|
| `npm run lint` | ✅ exit 0 (0 errors, 0 warnings) |
| `npm run typecheck` | ✅ exit 0 |
| `npm run build` (with `ANTHROPIC_API_KEY` set; NODE_ENV=production) | ✅ exit 0 (`/api/trpc`, `/api/inngest`, `/`, `/styleguide` in the build output) |
| `npm run check:banned` | ✅ "no violations" (the DPA text uses no banned compliance strings; "does not constitute legal advice" is the allowlisted form) |
| `npx vitest run tests/compliance/` | ✅ 3 files, 21 tests passed |
| `npx vitest run --fileParallelism=false` (full suite) | ✅ 11 files / 61 tests passed, 2 files / 5 skipped (RLS tests skip without `TEST_DATABASE_URL`) |
| `npx tsx scripts/generate-dpa-pdf.ts` | ✅ writes `public/legal/dpa.pdf` (3 pages, ~10 KB) |
| `deleted_at` column agreement | ✅ `delete-account.ts` and `purge-soft-deleted.ts` both use `accounts.deletedAt` |
| `complianceRouter` registered | ✅ `appRouter.compliance` includes `acceptDpa`, `dpaStatus`, `requestDataExport`, `requestAccountDeletion`, `restoreAccount` |

### What the tests assert
- **`tests/compliance/dpa.test.ts` (8):** `DPA_VERSION` is a non-empty string; the DPA text matches `/training/`, contains the no-training commitment + references `docs/vendor-data-flow.md`; covers GDPR / UK GDPR / DPDP / LGPD + a 30-day window + SCCs; `scanText(dpaPlainText())` → `[]` (banned-string clean); `DpaContent()` renders one `<section>` per `DPA_SECTIONS` entry; `public/legal/dpa.pdf` exists and is > 1 KB. `recordDpaAcceptance` inserts the `legal_acceptances` `document:'dpa'` row + sets `accounts.dpaVersion`/`dpaAcceptedAt`; idempotent at the same version (no insert, no update).
- **`tests/compliance/data-rights.test.ts` (13):** `buildAccountDataExport` SELECTs `accounts`/`subscriptions`/`legal_acceptances`/`jobs`/`sessions` for the account; no key in the dump matches the forbidden patterns or `SENSITIVE_FIELDS` (the planted `someApiSecret` column is stripped; the account email survives). `exportAccountData` uploads to `exports/{accountId}/...`, mints a signed URL with `EXPORT_URL_TTL_SECONDS` TTL, returns an expiry in the future, and emails the founder. `softDeleteAccount` sets `deletedAt` (a `Date`), revokes the owner's sessions, emits `account/soft-deleted`. `restoreAccount` clears `deletedAt` within 30 days, rejects after the window, rejects when not soft-deleted.

## Deviations from Plan

### Auto-fixed / forced by tooling reality

**1. [Rule 3 — Blocking tooling] DPA text extracted into a dependency-free `src/lib/compliance/dpa-sections.ts`.**
- **Found during:** Task 2 (the PDF generator failed to load the content module).
- **Issue:** A `tsx`-run script that imports BOTH a TypeScript source module (`.ts`/`.tsx`) AND `@react-pdf/renderer` fails with `SyntaxError: ... does not provide an export named 'DPA_SECTIONS'` — `@react-pdf/renderer`'s presence in the module graph breaks tsx's resolution of sibling TS source modules. A plain `.ts` data module (no React imports) loads cleanly.
- **Fix:** Moved `DPA_SECTIONS` / `DpaSection` / `dpaPlainText` / `DPA_VERSION` into `src/lib/compliance/dpa-sections.ts` (dependency-free). `dpa-content.tsx` re-exports them and adds the `<DpaContent/>` React view. The PDF generator (`scripts/generate-dpa-pdf.ts`, a `.ts` file run via `tsx` with an async-IIFE because `.ts` is CJS-mode under tsx — no top-level await) and the tests import `dpa-sections.ts`; Plan 08's page imports `dpa-content.tsx`. Still one source of truth — `dpa-content.tsx` re-exports it, so the plan's "single `dpa-content.tsx` consumed by the PDF and the page" intent holds.

**2. [Rule 3 — referenced file absent] Built a minimal `src/lib/email/data-export-ready.ts` sender.**
- **Found during:** Task 3.
- **Issue:** The plan references "the `data-export-ready` email template from Plan 05" — but Plan 05 (observability + email) has not run (this plan `depends_on: [1, 3]` only), so `src/lib/email/*` did not exist.
- **Fix:** Created `src/lib/email/data-export-ready.ts` with `sendDataExportReadyEmail({ to, downloadUrl, expiresAt })` — uses Resend when `RESEND_API_KEY` + `EMAIL_FROM` are set, otherwise logs and returns (never throws). Plan 05 can replace it with a React Email template; the call signature is what `export.ts` depends on, so it's stable. Documented in the file.

**3. [Rule 3 — Blocking CI/build] None new.** `npm run build` runs `NODE_ENV=production` and `env.ts` already requires `ANTHROPIC_API_KEY` (Plan 04). CI has the `ci-anthropic-key` fallback (Plan 04). Locally the build was verified with `ANTHROPIC_API_KEY=ci-anthropic-key`. No workflow change needed.

**Total:** 2 Rule-3 deviations (a tooling-forced file split that preserves the single-source intent; a forward-compatible email-helper stub for a not-yet-built Plan-05 dependency). No scope creep, no architectural change. All `mitigate` items in the threat register (T-1-31 tenant-scoped+filtered export reads, T-1-32 forbidden-column stripping + test, T-1-33 expiring signed URL on a private tenant-isolated path, T-1-34 `protectedProcedure` + window-limited restore, T-1-35 `DPA_VERSION` on both `legal_acceptances` + `accounts`, T-1-36 the living vendor inventory referenced from the DPA, T-1-37 `check:banned` as a verify step) are implemented as designed.

## Known Stubs

- **`src/lib/email/data-export-ready.ts`** — minimal Resend sender; logs+returns when email isn't configured (dev / test / pre-Plan-05). Intentional: Plan 05 owns the transactional email layer (React Email templates, the shared client, retries) and can swap this implementation behind the same signature. Does not block this plan's goal — the export module produces the JSON + signed URL regardless; the email is the delivery channel.
- **`docs/vendor-data-flow.md` `[VERIFY]` markers** — OpenAI ZDR/retention, Resend retention, Langfuse Cloud retention/region. Standing follow-ups before the relevant phase ships (listed in the doc's `[VERIFY] follow-ups` table). Not blockers — Phase 1 only sends Anthropic the trivial health-check ping; the OpenAI fallback is off; Langfuse is stubbed (Plan 04).
- **Future-phase tables in `exportAccountData`** — the export currently dumps the 6 Phase-1 tenant tables; a `schemaNote` in the JSON and a comment in `export.ts` flag that businesses/decks/investors/pipeline/transcripts get added as those phases ship. Intentional — those tables don't exist yet.

## TDD Gate Compliance

N/A — this plan is `type: execute` (not `type: tdd`); no tasks carry `tdd="true"`. Tests for the DPA acceptance plumbing, the DPA content, the data export, and the soft-delete/restore flow were written alongside their implementations and pass.

## Next Phase Readiness

- **Plan 05** (observability + email) fills `src/lib/langfuse.ts` and can replace `src/lib/email/data-export-ready.ts` with a React Email template (same signature).
- **Plan 07** (walking skeleton: auth + billing + entitlements) wires the sign-up clickwrap line that calls `complianceRouter.acceptDpa` (+ optionally `recordTosAcceptance` / `recordPrivacyAcceptance`).
- **Plan 08** (marketing site) builds `/legal/dpa` (renders `<DpaContent/>` + a download link to `public/legal/dpa.pdf` + references the vendor inventory and the no-training claim), `/legal/privacy`, `/legal/terms`, `/legal/security`.
- **Plan 09** (settings/onboarding schema) wires the Settings screen's "Export my data" / "Delete account" (typed-`DELETE`-confirm Dialog) to `requestDataExport` / `requestAccountDeletion` / `restoreAccount`.
- **Operational follow-up:** create the private `exports` Supabase Storage bucket (the export module uploads to `exports/{accountId}/...` — a missing bucket surfaces as `EXPORT_UPLOAD_FAILED`). To be done when Plan 09's UI goes live, or recorded for the founder.

## Self-Check: PASSED

All created files exist on disk (`docs/vendor-data-flow.md`, `src/lib/compliance/{dpa-sections.ts,dpa-content.tsx,dpa.ts}`, `scripts/generate-dpa-pdf.ts`, `public/legal/dpa.pdf`, `src/lib/email/data-export-ready.ts`, `src/modules/data-rights/{export.ts,delete-account.ts}`, `src/server/routers/compliance.ts`, `tests/compliance/{dpa.test.ts,data-rights.test.ts}`); commits `2fcb7d9` (vendor doc), `c3afab0` (DPA), and the Task-3 feat commit are present in branch history.

---
*Phase: 01-foundation*
*Completed: 2026-05-12*
