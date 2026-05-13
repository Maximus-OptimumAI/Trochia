---
phase: 01-foundation
plan: 03
subsystem: database
tags: [drizzle, postgres, supabase, pgvector, rls, multi-tenancy, trpc, region-seam]

# Dependency graph
requires:
  - phase: 01-01
    provides: "src/lib/env.ts env contract (Supabase/DB vars stubbed optional), ESLint import boundaries, Vitest/MSW test infra, GitHub Actions CI"
  - phase: 01-02
    provides: "src/app/providers.tsx extension slot (Plan 07 mounts TRPCReactProvider there)"
provides:
  - "Provisioned Supabase Pro project (Postgres + pgvector + Storage); migration 0000_sturdy_maestro.sql applied live"
  - "Narrow Phase-1 Drizzle schema: users, accounts (region us|in enum + deleted_at + billing cols), sessions, subscriptions, jobs, legal_acceptances — NO future-phase domain tables"
  - "RLS default-deny on every tenant-scoped table with co-located tenant_isolation policies + users_self_access on users"
  - "src/db/rls.ts exporting NON_TENANT_TABLES allowlist constant (['corpus','__drizzle_migrations']) — Plan 07 adds processed_stripe_events"
  - "src/db/client.ts: getRequestClient(accessToken) (RLS, runs as authenticated role with JWT claims) + getServiceClient() (RLS-bypassing, audited caller list)"
  - "src/db/region.ts: getDbForRegion('us'|'in') seam — both branches → US client today"
  - "Tenant-scoped tRPC: createTRPCContext, protectedProcedure (injects ctx.tenantId/region/db/account), assertEntitled stub (Plan 07 replaces), accountRouter.me/.whoami, /api/trpc route handler"
  - "src/lib/trpc-client.ts: @trpc/tanstack-react-query client + exported (unmounted) TRPCReactProvider"
  - "Supabase Custom Access Token Auth Hook function public.custom_access_token_hook (injects tenant_id JWT claim)"
  - "tests/rls/{schema-scan,two-user-isolation}.test.ts + tests/db/{region,test-db}.ts (RLS tests skip without TEST_DATABASE_URL)"
  - "env.ts Supabase/DB vars flipped to required-in-prod"
affects: [01-04-ai-chokepoint-inngest, 01-07-walking-skeleton-auth-billing-entitlements, 01-09-onboarding-schema, phase-02-knowledge-layer, all-future-tenant-data]

# Tech tracking
tech-stack:
  added: ["drizzle-orm 0.44", "drizzle-kit", "postgres.js v3", "@supabase/ssr", "@supabase/supabase-js", "@trpc/server v11", "@trpc/client", "@trpc/tanstack-react-query", "superjson", "server-only (dev)"]
  patterns:
    - "RLS default-deny: every CREATE TABLE migration also ENABLE ROW LEVEL SECURITY + a tenant_isolation pgPolicy (drizzle-orm/supabase authenticatedRole + auth.jwt()->>'tenant_id')"
    - "tenant_id carried as a custom JWT claim via Supabase Custom Access Token Auth Hook; getRequestClient wraps each statement in a tx with SET LOCAL role=authenticated + SET LOCAL request.jwt.claims (db.rls(fn))"
    - "getServiceClient() = narrow audited RLS-bypass escape hatch (resolveAccount, Stripe webhooks, Inngest jobs, account deletion only)"
    - "getDbForRegion(region) factory seam — region enum + accounts.region + the switch all exist; both branches → US client until the first IN founder"
    - "tRPC defense-in-depth on top of RLS: protectedProcedure throws UNAUTHORIZED without session/tenant/db; assertEntitled is a Phase-1 pass-through stub (TODO Plan 07)"
    - "schema-scan CI test driven by an exported NON_TENANT_TABLES constant — adding a non-tenant table is a one-line local edit, not a test edit"

key-files:
  created:
    - drizzle.config.ts
    - src/db/schema/{tenancy,billing,jobs,legal,index}.ts
    - src/db/rls.ts
    - src/db/client.ts
    - src/db/region.ts
    - src/db/migrations/0000_sturdy_maestro.sql
    - src/server/{trpc,context}.ts
    - src/server/routers/{index,account}.ts
    - src/app/api/trpc/[trpc]/route.ts
    - src/lib/trpc-client.ts
    - tests/rls/{schema-scan,two-user-isolation}.test.ts
    - tests/db/{region,test-db}.ts
  modified:
    - src/lib/env.ts
    - vitest.config.ts
    - .github/workflows/ci.yml
    - package.json
    - package-lock.json

key-decisions:
  - "Q1 (RLS-JWT-claims plumbing) RESOLVED: option (a) — tenant_id custom JWT claim via Supabase Custom Access Token Auth Hook (public.custom_access_token_hook). One business per account in Phase 1 (D-03) ⇒ auth.users.id → accounts.id is 1:1."
  - "NON_TENANT_TABLES = ['corpus','__drizzle_migrations'] initially; Plan 07 appends processed_stripe_events."
  - "Single migration 0000_sturdy_maestro.sql carries the 6 tables + ENABLE RLS + tenant_isolation/users_self_access policies + CREATE EXTENSION vector (extensions schema) + ALTER PUBLICATION supabase_realtime ADD TABLE jobs + public.custom_access_token_hook + grants."
  - "TEST_DATABASE_URL points at a SEPARATE throwaway Supabase project (ref spqnjvcfmmmdobkwgmxs), not the prod DB; RLS integration tests describe.skip when it is unset."
  - "vitest.config.ts aliases 'server-only' → no-op shim so server modules (db/client, db/region) are testable (Rule 3)."
  - "assertEntitled is a documented pass-through stub returning all features; entitlements() logic lands in Plan 07."

patterns-established:
  - "RLS default-deny convention + schema-scan CI gate (NON_TENANT_TABLES allowlist)"
  - "tenant_id JWT claim via Auth Hook + getRequestClient db.rls(fn) for all tenant data access"
  - "getServiceClient audited-caller-list escape hatch"
  - "getDbForRegion region seam"
  - "tenant-scoped tRPC context (protectedProcedure / assertEntitled)"
  - "two-user isolation test as the highest-leverage test in the codebase"

requirements-completed: [FND-02, FND-03, FND-10]

# Metrics
duration: ~45min (impl) + provisioning checkpoint (orchestrator)
completed: 2026-05-12
---

# Phase 1 Plan 03: Data + Tenancy Spine Summary

**Provisioned Supabase Pro + the narrow Phase-1 Drizzle schema (users / accounts / sessions / subscriptions / jobs / legal_acceptances) with RLS default-deny on every tenant table, the `tenant_id`-via-Auth-Hook isolation pattern, the `getDbForRegion()` US/IN seam, the tenant-scoped tRPC context (`protectedProcedure` + `assertEntitled` stub), the tRPC client (unmounted `TRPCReactProvider`), and the RLS schema-scan + two-user-isolation + region tests — FND-02/03/10 satisfied; migration `0000_sturdy_maestro.sql` applied live and verified.**

## Performance

- **Duration:** ~45 min implementation (3 task commits) + a provisioning checkpoint resolved by the orchestrator (Supabase Pro project, env injection, `drizzle-kit migrate`, Auth Hook walk-through, full gate run).
- **Tasks:** 3 (all committed before the checkpoint)
- **Files modified:** ~20

## Accomplishments
- A live Supabase Pro Postgres with pgvector enabled, the 6 Phase-1 tables, RLS enabled + policies on all 6, the Realtime publication on `jobs`, and the `custom_access_token_hook` function — all verified live.
- RLS-from-day-0: default-deny on every tenant-scoped table, co-located `tenant_isolation` policies keyed on `auth.jwt()->>'tenant_id'`, `users_self_access` on `users`, the exported `NON_TENANT_TABLES` allowlist, and a schema-scan CI test that fails the build on any non-allowlisted table lacking RLS+policy.
- The two-user isolation integration test (the highest-leverage test in the codebase): tenant B's `authenticated` client reads zero of tenant A's rows across every tenant table, sees its own, and WITH CHECK blocks a cross-tenant insert.
- The tenant-scoped tRPC layer: `createTRPCContext` (Supabase session → `resolveAccount` via service client → `getDbForRegion(region)(accessToken)`), `protectedProcedure`, `assertEntitled` stub (Plan 07), `accountRouter.me/.whoami`, the App-Router `/api/trpc` fetch adapter, and `src/lib/trpc-client.ts` exporting an unmounted `TRPCReactProvider` (Plan 07 mounts it in `providers.tsx`).
- The `getDbForRegion('us'|'in')` multi-region seam — both branches return the US client today; the enum, the `accounts.region` column, and the switch all exist.
- Env tightening: `DATABASE_URL`, `DIRECT_URL`, `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` flipped to required-in-prod.

## Task Commits

1. **Task 1: Phase-1 Drizzle schema + RLS default-deny + region seam + DB client factories + env-var tightening** — `18ec505` (feat)
2. **Task 2: Tenant-scoped tRPC context + protectedProcedure + accountRouter + route handler + tRPC client** — `6e9d9f7` (feat)
3. **Task 3: RLS schema-scan test + two-user isolation test + region test + test-DB harness** — `980fceb` (test)

Provisioning checkpoint state recorded mid-stream: `e34a757` (docs — deferred-items.md). Resolution (Supabase provisioning, env injection, `drizzle-kit migrate`, Auth Hook, gate run) performed by the orchestrator, not a code commit.

**Plan metadata:** this SUMMARY commit.

## The shipped schema (table + column names)

- **`users`** — `id uuid pk` (mirrors `auth.users.id`), `email`, auth bookkeeping, `created_at`. Policy: `users_self_access` (`id = auth.uid()`).
- **`accounts`** (= the tenant) — `id uuid pk default gen_random_uuid()`, `owner_user_id → users.id`, `region` (Postgres enum `region` / `us`|`in`, default `us`; `eu` reserved, NOT present), `stripe_customer_id`, `subscription_status` default `'none'`, `tier` nullable, `current_period_end timestamptz`, `dpa_accepted_at`, `dpa_version`, `deleted_at timestamptz` (soft delete), `created_at`. Policy: `tenant_isolation` keyed on `id` + `auth_admin_can_read_accounts` (the Auth Hook role reads it to resolve the claim).
- **`sessions`** — `id`, `account_id → accounts.id ON DELETE CASCADE`, session bookkeeping. Policy: `tenant_isolation` on `account_id`.
- **`subscriptions`** — `id`, `account_id → accounts.id ON DELETE CASCADE`, `stripe_subscription_id unique`, `status`, `tier`, `period` (`monthly`|`annual`), `current_period_end`, `created_at`. Policy: `tenant_isolation` on `account_id`.
- **`jobs`** — `id uuid pk`, `account_id uuid → accounts.id ON DELETE CASCADE NULLABLE` (system jobs like the AI health-check have no tenant), `type`, `status` (`queued`|`running`|`done`|`failed`), `payload jsonb`, `result jsonb`, `error`, `created_at`, `updated_at`. Policy: `tenant_isolation` on `account_id` — `account_id IS NULL` rows match no `authenticated` policy ⇒ only `getServiceClient()` reads them (default-deny working). Realtime: in `supabase_realtime` publication.
- **`legal_acceptances`** — `id`, `account_id → accounts.id ON DELETE CASCADE`, `document` (`dpa`|`tos`|`privacy`), `version`, `accepted_at timestamptz default now()`. Policy: `tenant_isolation` on `account_id`.

NOT defined (later phases): `decks`, `investors`, `pipeline_entries`, `businesses`, `corpus`, `embeddings`, `processed_stripe_events`.

## RLS policy SQL (shape)

```sql
ALTER TABLE "<tenant table>" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "<tenant table>"
  AS PERMISSIVE FOR ALL TO "authenticated"
  USING (<id|account_id> = (auth.jwt() ->> 'tenant_id')::uuid)
  WITH CHECK (<id|account_id> = (auth.jwt() ->> 'tenant_id')::uuid);

-- users:
CREATE POLICY "users_self_access" ON "users"
  AS PERMISSIVE FOR ALL TO "authenticated"
  USING (id = auth.uid()) WITH CHECK (id = auth.uid());
```

`migration 0000_sturdy_maestro.sql` also runs: `CREATE EXTENSION IF NOT EXISTS vector` (in the `extensions` schema), `ALTER PUBLICATION supabase_realtime ADD TABLE jobs`, and creates `public.custom_access_token_hook(jsonb) RETURNS jsonb` (resolves `auth.users.id → accounts.id`, sets `claims.tenant_id`) with the grants Supabase's Auth Hook expects.

## How tenant isolation works (Q1 — RESOLVED, option a)

1. Supabase Auth issues a JWT. The **Custom Access Token Auth Hook** (`public.custom_access_token_hook`) runs server-side on token issuance and injects a `tenant_id` claim = the caller's `accounts.id` (1:1 with `auth.users.id` in Phase 1, D-03). A client cannot forge this — the JWT is Supabase-signed.
2. tRPC `createTRPCContext` reads the session, calls `resolveAccount(user.id)` via `getServiceClient()` (one of the audited service-role call sites), then `db = getDbForRegion(account.region)(session.access_token)`.
3. `getRequestClient(accessToken)` returns `{ rls }`; `ctx.db.rls(tx => ...)` runs the callback in a transaction that first does `SET LOCAL role = 'authenticated'; SET LOCAL request.jwt.claims = '<claims JSON>'`, so `auth.jwt()` / `auth.uid()` resolve inside the policies and a `SELECT *` physically returns only the JWT-claim tenant's rows.
4. `protectedProcedure` is the ergonomic + defense-in-depth layer on top: throws `UNAUTHORIZED` if `ctx.session`/`ctx.tenantId`/`ctx.db` is null.

## `getServiceClient` caller list (the audited escape hatch)

RLS-bypassing; legitimate callers ONLY: (1) `src/server/context.ts` `resolveAccount()` — learn tenant+region before the request client can exist; (2) Stripe webhook handlers — no session, tenant from the event payload (Plan 07); (3) Inngest job functions — carry & re-assert an explicit tenantId (Plan 04); (4) account deletion — must reach every tenant's rows. Never exposed to a user session; never in a `NEXT_PUBLIC_*` var (env.ts validates `SUPABASE_SECRET_KEY`/`DATABASE_URL` server-only).

## `getDbForRegion` seam

`getDbForRegion(region: 'us'|'in')` returns `(accessToken) => RequestDb`. Both `'us'` and `'in'` fall through to the US client (built from `DATABASE_URL`) on purpose. When the first IN founder signs up: provision that region's Supabase project, add `DATABASE_URL_IN` to env, give the `'in'` case its own factory — no call-site changes. `DEFAULT_REGION = 'us'`.

## `TRPCReactProvider`

`src/lib/trpc-client.ts` sets up `@trpc/tanstack-react-query` and **exports a `TRPCReactProvider({ children })` component** (wires the tRPC client + `httpBatchLink`, base URL from `@/lib/env` `APP_URL` — never hardcoded). It is **NOT mounted in Phase 1** — no React component consumes tRPC until Plan 07/09. **Plan 07 wraps `<TRPCReactProvider>` inside `src/app/providers.tsx`'s extension slot.** This plan did not edit `layout.tsx` or `providers.tsx`.

## Env vars flipped to required-in-prod

`DATABASE_URL` (pooled/Supavisor), `DIRECT_URL` (direct, for drizzle-kit), `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` — `.optional()` in dev, validated-non-empty when `NODE_ENV === 'production'`. (Plan 01 had stubbed them all `.optional()`.) `.env.example` already documents the full list (Plan 01) — not re-edited.

## Deviations from Plan

### Auto-fixed / forced by tooling reality

**1. [Rule 3 — Blocking tooling] `vitest.config.ts` aliases `server-only` → a no-op shim**
- **Found during:** Task 3.
- **Issue:** `src/db/client.ts` / `src/db/region.ts` import `'server-only'`; under Vitest (jsdom/node) that import throws, so the region unit test and the test-DB harness couldn't import them.
- **Fix:** Added a `resolve.alias` mapping `server-only` to an empty module in `vitest.config.ts`; added `server-only` as a devDependency.
- **Commit:** `980fceb`.

**2. [Rule 3] `getRequestClientFromClaims` gained an optional `connectionString` override**
- **Found during:** Task 3.
- **Issue:** The RLS integration tests must point the request client at `TEST_DATABASE_URL` (the throwaway test Supabase project), not the prod `DATABASE_URL`.
- **Fix:** `src/db/client.ts` factory accepts an optional connection-string override; the test harness uses it. Production code always uses the env default.
- **Commit:** `980fceb`.

**3. [Rule 3] `.github/workflows/ci.yml` — Supabase env vars with CI fallbacks + `TEST_DATABASE_URL` secret**
- **Found during:** Task 3 (CI must stay green; env.ts now requires the Supabase vars when `NODE_ENV=production`, and the RLS tests need a real Postgres).
- **Fix:** ci.yml supplies the 5 Supabase env vars (with harmless CI fallbacks so the production build is green) and reads `TEST_DATABASE_URL` from a GitHub Actions secret so `tests/rls/**` actually run in CI.
- **Commit:** `980fceb`.

**4. [Rule 3] Migration consolidation + Auth-Hook SQL hand-added**
- The schema (6 tables + ENABLE RLS + the two policy families), `CREATE EXTENSION vector`, the Realtime publication line, and `public.custom_access_token_hook` (+ grants) all live in the single generated migration `0000_sturdy_maestro.sql`. drizzle-kit emits ENABLE RLS + the `pgPolicy` SQL; the extension, the publication ALTER, and the hook function were added to the migration by hand (drizzle-kit does not model them).

**Total deviations:** 4 (all Rule 3 — blocking tooling/CI; no scope creep, no architectural change). The threat register's `mitigate` items (T-1-12…T-1-17) are all implemented as designed.

## Authentication / provisioning gate

This plan is `autonomous: false`. The provisioning gate was hit after Task 3 and resolved by the orchestrator:
- Supabase Pro project provisioned; `.env.local` populated with all 7 vars + `TEST_DATABASE_URL` (separate throwaway project, ref `spqnjvcfmmmdobkwgmxs`); Vercel env synced across Production/Preview/Development; GitHub Actions secrets added.
- `npx drizzle-kit migrate` applied `0000_sturdy_maestro.sql` to the prod DB. Verified live: 6 tables (`accounts`, `jobs`, `legal_acceptances`, `sessions`, `subscriptions`, `users`), RLS enabled on all 6, policies present (`tenant_isolation` ×5, `users_self_access` on `users`, `auth_admin_can_read_accounts` on `accounts`), `pgvector` installed in the `extensions` schema, `public.custom_access_token_hook` present with grants, `supabase_realtime` publication includes `public.jobs`.
- Full gate run: `typecheck` ✓, `lint` ✓, `check:banned` ✓, `build` (NODE_ENV=production) ✓, `vitest` 29/29 ✓ (with `TEST_DATABASE_URL` set and `--fileParallelism=false`).

## Known issues / follow-ups

1. **Parallel-migrate `drizzle`-schema race in the test harness.** When both RLS test files run in parallel, they race on `CREATE SCHEMA IF NOT EXISTS "drizzle"` inside `migrateTestDb()` — `CREATE SCHEMA IF NOT EXISTS` is not concurrency-safe in Postgres, so the loser hits error `23505` (duplicate key). Workaround in use: run the RLS tests serially (`vitest --fileParallelism=false`). A later plan / the verifier should harden the harness: retry-on-`23505`, take a session advisory lock around `migrateTestDb()`, or pre-create the `drizzle` schema once before the suite. **Does not block this plan** — the suite passes serially.
2. **Auth Hook dashboard enablement (operational, not code).** The Supabase dashboard "Customize Access Token (JWT) Claims" hook (Authentication → Hooks) must be pointed at `public.custom_access_token_hook`. Without it, issued JWTs won't carry `tenant_id` and RLS denies everything to authenticated sessions. The orchestrator is walking the founder through this. It is a noted post-provisioning step, not a blocker for plan completion; it must be confirmed before Plan 07's auth flow is exercised end-to-end.
3. **`assertEntitled` is a pass-through stub** (`TODO(Plan 07)`) — returns all features today; Plan 07 replaces it with the real `entitlements(ctx.account)` check.
4. **`processed_stripe_events`** is not yet in `NON_TENANT_TABLES` — Plan 07 (Stripe webhooks) adds it (a one-line edit to the constant, not to the schema-scan test).

## User Setup Required

No new `USER-SETUP.md` for this plan, but two founder actions are tracked (see deferred-items.md and "Known issues" above): (a) the Supabase Auth Hook dashboard enablement, and (b) keeping `TEST_DATABASE_URL` + the 5 Supabase vars present as GitHub Actions secrets and in Vercel env across all environments — both already done by the orchestrator during checkpoint resolution; (a) is the only one still being confirmed with the founder.

## Next Phase Readiness
- The data + tenancy spine is live. Plan 04 can create Inngest functions that write to `jobs`; Plan 07 mounts `TRPCReactProvider`, replaces the `assertEntitled` stub with real `entitlements()`, and wires Stripe/auth; Plan 09's onboarding-schema additions can `drizzle-kit generate` + `migrate` against the provisioned DB.
- Blocker to watch: the Auth Hook dashboard toggle must be confirmed before Plan 07's Google-SSO → tenant-scoped-query path is exercised end-to-end.

## Self-Check: PASSED

All three task commits (18ec505, 6e9d9f7, 980fceb) present in branch history; key files (src/db/rls.ts, src/db/client.ts, src/db/region.ts, src/lib/trpc-client.ts, tests/rls/two-user-isolation.test.ts, src/db/migrations/0000_sturdy_maestro.sql) exist on disk.

---
*Phase: 01-foundation*
*Completed: 2026-05-12*
