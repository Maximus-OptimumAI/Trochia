---
phase: 01-foundation
plan: 01
subsystem: foundation-scaffold
tags: [scaffold, nextjs, eslint, ci, env-contract, testing, compliance]
requires: []
provides:
  - "Next.js 16.2.6 App Router monolith (TS, Tailwind v4, src dir)"
  - "src/lib/env.ts — Zod env contract over every Phase-1 var (site URLs required; rest optional with Plan-0N flip-here comments); exports env, SITE_URL, APP_URL"
  - "src/lib/logger.ts — redacting logger + exported SENSITIVE_FIELDS + redactSensitive (Sentry beforeSend reuses these in Plan 05)"
  - "src/lib/crypto.ts — field-encryption STUB (real AES-GCM lands Phase 8/9); src/lib/errors.ts — typed AppError classes"
  - "eslint.config.mjs — no-hardcoded-URL, no-raw-console, AI-SDK chokepoint, safe-engine/cap-table-engine import boundaries"
  - "scripts/check-banned-strings.mjs — reusable scanText/scanFiles/loadBannedList + 'not legal/investment advice' allowlist; tasks/banned-strings.txt"
  - "vitest.config.ts + tests/setup.ts (shared MSW server); playwright.config.ts; .lighthouserc.json"
  - ".github/workflows/ci.yml — lint -> typecheck -> check:banned -> vitest -> build -> playwright -> lhci"
  - ".env.example — full Phase-1 var list; tasks/lessons.md seeded"
affects:
  - "All later Phase-1 plans build on this scaffold; Plans 02/03/04/05/07 each flip individual src/lib/env.ts vars to required-in-prod via disjoint edits"
tech-stack:
  added:
    - "next@16.2.6, react@19.2.4, react-dom@19.2.4 (exact-pinned)"
    - "@trpc/{server,client,next,tanstack-react-query}@^11.17.0, @tanstack/react-query@^5.100.10"
    - "drizzle-orm@0.44.7, drizzle-kit@0.31.10 (pinned to the 0.44/0.31 line, NOT 1.0-beta)"
    - "zod@^4.4.3, zod-to-json-schema@^3.25.2"
    - "@supabase/supabase-js@^2.105.4, @supabase/ssr@^0.10.3, postgres@^3.4.9"
    - "@anthropic-ai/sdk@0.95.2 (exact-pinned), openai@^6.37.0, langfuse@^3.38.20"
    - "stripe@^22.1.1, resend@^6.12.3, react-email@^6.1.3, @react-email/components@^1.0.12"
    - "inngest@^4.4.0, @upstash/ratelimit@^2.0.8, @upstash/redis@^1.38.0"
    - "@sentry/nextjs@^10.53.1, @amplitude/analytics-{browser@^2.42.2,node@^1.5.57}"
    - "motion@^12.38.0, lucide-react@^1.14.0, react-hook-form@^7.75.0, @hookform/resolvers@^5.2.2, @react-pdf/renderer@^4.5.1"
    - "dev: vitest@^4.1.6 (+@vitest/ui,@vitest/coverage-v8), jsdom@^29.1.1, @testing-library/react@^16.3.2, @testing-library/jest-dom@^6.9.1, msw@^2.14.6, @playwright/test@^1.60.0, @lhci/cli@^0.15.1, prettier@^3.8.3, eslint-plugin-boundaries@^6.0.2, tsx@^4.21.0, typescript@^5"
  patterns:
    - "All site URLs read from @/lib/env (SITE_URL/APP_URL) — never hardcoded; ESLint-enforced"
    - "Everything logs through @/lib/logger (redacting wrapper); raw console.* lint-banned in src/**"
    - "Anthropic/OpenAI SDKs are chokepoint-only (src/ai/** — not yet created); lint rule active now"
    - "Env contract shaped once here; later plans only flip .optional() -> required via disjoint edits in distinct waves"
key-files:
  created:
    - "package.json, package-lock.json, .prettierrc, .env.example, .gitignore (rewritten)"
    - "src/lib/env.ts, src/lib/logger.ts, src/lib/crypto.ts, src/lib/errors.ts"
    - "eslint.config.mjs (rewritten), scripts/check-banned-strings.mjs, tasks/banned-strings.txt, tasks/lessons.md"
    - "vitest.config.ts, tests/setup.ts, tests/lib/env.test.ts, tests/lib/logger.test.ts, tests/compliance/banned-strings.test.ts"
    - "playwright.config.ts, .lighthouserc.json, .github/workflows/ci.yml, e2e/README.md"
    - "next.config.ts, tsconfig.json, postcss.config.mjs, src/app/* (create-next-app scaffold), public/*.svg"
  modified: []
decisions:
  - "Next pinned at 16.2.6 (latest 16.x at scaffold time — RESEARCH said '16.1.x line'; 16.2.6 is the current GA 16.x, Turbopack default, React 19 — accepted)"
  - "drizzle-orm pinned 0.44.7 + drizzle-kit 0.31.10 (the 0.44/0.31 pairing) per the plan's 'not 1.0-beta' instruction, even though 0.45.2/0.45.x is the latest stable pre-1.0"
  - "NEXT_PUBLIC_SITE_URL / NEXT_PUBLIC_APP_URL are REQUIRED (not optional) in env.ts — they already exist in .env.local and the app reads all URLs from here, so a missing one must fail fast. This satisfies the plan's env-test acceptance ('throws when SITE_URL unset') AND the must_haves' 'stub everything else as optional' intent. Every OTHER Phase-1 var is .optional() with a 'Plan 0N flips this' comment."
  - "Lighthouse assertions are warn-level (not error) and the lhci CI step is continue-on-error: true — soft until Plan 08 ships the / marketing route, then flip to a hard gate"
  - "ESLint import boundaries implemented via no-restricted-imports / no-restricted-syntax (the plan explicitly allowed this over eslint-plugin-boundaries); eslint-plugin-boundaries installed for later use"
  - "create-next-app could not run in the existing repo root (conflicting .planning/CLAUDE.md/etc.) — scaffolded into a temp dir and merged the generated files in"
metrics:
  duration: "~50 min"
  completed: "2026-05-12"
---

# Phase 1 Plan 01: Foundation Scaffold Summary

Greenfield Next.js 16.2.6 App Router monolith with the env/logger/crypto/errors lib spine, the full ESLint guardrail set (no-hardcoded-URL · no-raw-console · AI-SDK chokepoint · safe-engine/cap-table-engine import boundaries), the banned-string CI check with a reusable `scanText` export and a "not legal/investment advice" allowlist, Vitest+Playwright+MSW test infra, and the GitHub Actions CI pipeline — the precedent every later phase builds on.

## What shipped

- **Repo scaffold** — `create-next-app@16.2.6` (App Router, TypeScript, Tailwind v4, `src/` dir, `@/*` alias), Turbopack default. `next`/`react`/`react-dom` exact-pinned. All Phase-1 deps installed (see tech-stack). npm scripts: `dev`, `build`, `start`, `lint`, `typecheck`, `test`, `test:watch`, `test:e2e`, `check:banned`, `db:push`, `db:generate`.
- **`src/lib/env.ts`** — Zod schema over `process.env` validating **every Phase-1 env var**. `NEXT_PUBLIC_SITE_URL` / `NEXT_PUBLIC_APP_URL` are required (`z.string().url()`); everything else is `.optional()` with a `// Plan 0N flips this to required-in-prod` comment so later plans know exactly which line to touch. `AI_FALLBACK_ENABLED` is coerced to boolean. Exports `env`, `SITE_URL`, `APP_URL`. Parsed once at module load → fails fast on a bad var.
- **`src/lib/logger.ts`** — redacting `console` wrapper. Exports `SENSITIVE_FIELDS` (the single source of truth Sentry's `beforeSend` reuses in Plan 05) and `redactSensitive`. Deep-redacts nested objects/arrays, matches compound keys (`stripeSecret`, `userPassword`), handles circular refs.
- **`src/lib/crypto.ts`** — field-encryption **STUB** (`encryptField`/`decryptField`, reversible base64 with a `stub:v0:` marker + TODO; real AES-256-GCM with dedicated key columns lands Phase 8/9). **`src/lib/errors.ts`** — `AppError` base (carries `status` + `code`) + `NotFoundError` / `ForbiddenError` / `UnauthorizedError` / `ValidationError` + `isAppError`.
- **`eslint.config.mjs`** (flat, extends `eslint-config-next` core-web-vitals + typescript):
  - `no-restricted-syntax` bans string/template literals matching `/https?:\/\/trochia/i` everywhere except `src/lib/env.ts` (and tests/scripts/configs).
  - `no-console: error` in `src/**` except `src/lib/logger.ts` (and tests/scripts/configs).
  - `no-restricted-imports` bans `@anthropic-ai/sdk` and `openai` outside `src/ai/**` (no-op until `ai/` exists in Plan 04, then enforced).
  - `src/safe-engine/**` and `src/cap-table-engine/**` may not import `@/ai`/`ai/*` patterns (no-op until those dirs exist).
  - Tests / e2e / scripts / `*.config.*` relax the URL + console + import rules.
- **Banned-string check** — `scripts/check-banned-strings.mjs` (ESM, no deps):
  - Exports: `scanText(text, { banned?, allowlist? }) → { term, index, line }[]`, `scanFiles(files?) → { file, term, line }[]`, `loadBannedList(listPath?) → string[]`, `ALLOWLISTED_PHRASES`.
  - CLI globs `src/**/*.{ts,tsx,md,mdx}` + `public/**/*.md`, prints `file:line  banned term: "<term>"`, exits 1 on any violation.
  - Allowlist: `investment advice` / `legal advice` are rescued when preceded (same line, within ~30 chars, ≤15 chars filler) by a negation — `not`, `this is not`, `is not`, `does not provide`, `doesn't provide`, `isn't`.
  - `tasks/banned-strings.txt`: hard bans `rolling fund`, `investment vehicle`, `adviser`, `AI-as-call-speaker`; conditional `investment advice`, `legal advice`. Bare `fund` deliberately **not** listed (too common; gets a Compliance-Auditor pass in Phase 10).
- **Test infra** — `vitest.config.ts` (env `node`, `setupFiles: ['./tests/setup.ts']`, includes `tests/**` + `src/**`, excludes `e2e/**`, v8 coverage, `@` alias). `tests/setup.ts` boots a shared MSW `server` (`setupServer()`, `beforeAll(listen)`/`afterEach(resetHandlers)`/`afterAll(close)`) and seeds minimal env. `playwright.config.ts` (`testDir: ./e2e`, `baseURL` from `PLAYWRIGHT_BASE_URL` else `http://localhost:3000`, local `webServer: build && start`, chromium, retries 1 in CI; `e2e/README.md` placeholder until the first spec). `.lighthouserc.json` (perf/a11y/best-practices/SEO ≥ 0.9 on `/`, warn-level — soft for now).
- **CI** — `.github/workflows/ci.yml` on `pull_request` + `push` to `main`, Node 24: `npm ci` → `npm run lint` → `npm run typecheck` → `npm run check:banned` → `npm run test` → `npm run build` → `npx playwright install --with-deps chromium` → `npm run test:e2e` → `npx lhci autorun` (`continue-on-error: true` until Plan 08 ships `/`). Expected secrets documented inline (`DATABASE_URL`, `DIRECT_URL`, `NEXT_PUBLIC_SITE_URL`, `NEXT_PUBLIC_APP_URL`, `PLAYWRIGHT_BASE_URL`).
- **`.env.example`** — every Phase-1 var with placeholders (Supabase publishable/secret + DB URLs, Stripe secret/webhook/4 price IDs, Anthropic/OpenAI + `AI_FALLBACK_ENABLED`, Langfuse, Sentry incl. build-time `SENTRY_*`, Amplitude, Resend + `EMAIL_FROM`, Inngest signing/event keys, Upstash URL/token, `NEXT_PUBLIC_SITE_URL`/`APP_URL`). `.gitignore` rewritten to keep `.env*` except `.env.example` + ignore test/playwright/lighthouse artifacts. `.prettierrc` standard config. `tasks/lessons.md` seeded with the synthetic-fixtures-only rule.

## Env var inventory — which plan flips each to required-in-prod

| Plan | Vars it flips to required-in-prod |
|------|-----------------------------------|
| 02 (DB/Supabase) | `DATABASE_URL`, `DIRECT_URL`, `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` |
| 03 (Stripe) | `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_PRE_RAISE_MONTHLY`, `STRIPE_PRICE_PRE_RAISE_ANNUAL`, `STRIPE_PRICE_ACTIVE_RAISE_MONTHLY`, `STRIPE_PRICE_ACTIVE_RAISE_ANNUAL` |
| 04 (AI chokepoint + rate limit) | `ANTHROPIC_API_KEY`, `OPENAI_API_KEY` (when `AI_FALLBACK_ENABLED`), `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN` |
| 05 (observability + email) | `LANGFUSE_PUBLIC_KEY`, `LANGFUSE_SECRET_KEY`, `SENTRY_DSN`, `NEXT_PUBLIC_SENTRY_DSN`, `AMPLITUDE_API_KEY`, `NEXT_PUBLIC_AMPLITUDE_API_KEY`, `RESEND_API_KEY` |
| 07 (Inngest) | `INNGEST_SIGNING_KEY`, `INNGEST_EVENT_KEY` |
| 08 (marketing site) | may flip `NEXT_PUBLIC_SITE_URL` / `NEXT_PUBLIC_APP_URL` to required-in-prod (already required-always here) |
| — (build-time only, owned but not "flipped") | `SENTRY_ORG`, `SENTRY_PROJECT`, `SENTRY_AUTH_TOKEN`, `LANGFUSE_HOST`, `EMAIL_FROM`, `AI_FALLBACK_ENABLED` |

## Verification

| Check | Result |
|-------|--------|
| `npm run build` | ✅ exit 0 (Next 16.2.6, Turbopack) |
| `npm run typecheck` | ✅ exit 0 |
| `npm run lint` | ✅ exit 0 (0 errors, 0 warnings) |
| `npm run check:banned` | ✅ "no violations" |
| `npx vitest run` | ✅ 3 files, 15 tests passed |
| `npx playwright test --list` | ✅ exit 0 (config parses; 0 specs — later plans add them) |
| `grep -rn "https://trochia" src/` | ✅ only `src/lib/env.ts` (a comment) |
| import-boundary rule | ✅ verified: `import Anthropic from '@anthropic-ai/sdk'` outside `src/ai/**` → ESLint error; literal `'https://trochia.ai'` → error; `console.log` in `src/**` → error |
| banned-string allowlist | ✅ `scanText('...is not a law firm and does not provide legal advice.')` → 0 violations; `scanText('Trochia provides legal advice')` → flagged |

## Deviations from Plan

### Auto-fixed / adjusted

**1. [Rule 3 — Blocking] `create-next-app` refused to run in the existing repo root.** The worktree root already contains `.planning/`, `CLAUDE.md`, `public/`, `tasks/`, `README.md`. `create-next-app .` aborts on conflicting files. Scaffolded into a temp dir, then copied the generated files (`package.json`, configs, `src/app/*`, `public/*.svg`, lockfile) into the repo and removed the temp dir. A leftover partial `node_modules` from that copy was corrupted (`Cannot find module '../server/require-hook'`) → did a clean `rm -rf node_modules package-lock.json && npm install` to fix. Found during Task 1. No file-content impact beyond what the plan specified.

**2. [Decision] Next pinned at `16.2.6`, not the `16.1.x` line RESEARCH named.** `npm view next version` returned `16.2.6` at scaffold time — the current GA 16.x (Turbopack default, React 19, App Router), which is what the plan/RESEARCH actually want ("start on 16, never the previous major"). Exact-pinned per D-01.

**3. [Decision] `NEXT_PUBLIC_SITE_URL` / `NEXT_PUBLIC_APP_URL` are required (not `.optional()`).** The plan's must_haves say "ALL `.optional()` initially" but the same plan's env-test acceptance criterion says "importing it with `NEXT_PUBLIC_SITE_URL` unset throws a Zod error" — contradictory. Resolved in favour of the env-test acceptance + the interfaces note ("env vars already present in .env.local: NEXT_PUBLIC_SITE_URL"): the two site-URL vars are required (they exist in `.env.local`, the whole app reads URLs from here, a missing one must fail fast). Every other Phase-1 var is `.optional()` with a `Plan 0N flips this` comment — the "stub everything else, later plans flip via disjoint edits" intent holds.

**4. [Decision] `drizzle-orm@0.44.7` + `drizzle-kit@0.31.10` pinned even though `drizzle-orm@0.45.x` is the latest stable pre-1.0.** The plan is explicit: "Pin `drizzle-orm`/`drizzle-kit` to the 0.44.x line, NOT 1.0-beta." Honored literally. (A later plan can bump to 0.45.x — no migration cost yet since no schema exists.)

**5. [Decision] Lighthouse CI is `warn`-level + `continue-on-error: true`.** Per the plan ("allowed to be a soft-fail until the marketing site plan ships `/`"). Flip to `error` + remove `continue-on-error` when Plan 08 lands `/`.

## Known Stubs

- `src/lib/crypto.ts` — `encryptField`/`decryptField` are a reversible base64 encoding, **not real encryption** (documented in the file's docblock + a `TODO(phase-8/9)`). Intentional per XC-03 / D-06b: the API/seam is established now; real AES-256-GCM with dedicated key columns lands Phase 8/9 when cap-table figures / audio data exist. Does not block this plan's goal.
- `e2e/README.md` — placeholder; the `e2e/` dir has no specs yet. Later Phase-1 plans (auth/onboarding flow, `/styleguide` gate) add the first real specs. Intentional — this plan's scope is test *infra*, not test *content*.

## TDD Gate Compliance

N/A — this plan is `type: execute` (not `type: tdd`); no tasks carry `tdd="true"`. Unit tests for `env.ts`, `logger.ts`, and the banned-string scanner were written alongside their implementations and pass.
