# Phase 01 — deferred / blocked items

## 01-03 (data + tenancy spine) — BLOCKED at the provisioning checkpoint (2026-05-12)

All code shipped (3 commits: 18ec505 schema/RLS/region/client, 6e9d9f7 tRPC, 980fceb tests).
Remaining work requires the founder:

1. **Provision a Supabase Pro project.** Obtain: pooled (Supavisor) connection string,
   direct connection string, publishable key, secret key (NOT anon/service_role).
2. **Inject into `.env.local` AND Vercel env (Production + Preview):**
   `DATABASE_URL` (pooled), `DIRECT_URL` (direct), `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`,
   `SUPABASE_SECRET_KEY`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`.
   Also add `TEST_DATABASE_URL` as a GitHub Actions secret (a throwaway/test Postgres) so
   `tests/rls/**` run in CI; and add the five Supabase vars as GitHub Actions secrets
   (ci.yml currently uses fallbacks so the build is green without them).
3. **`npm run db:push`** (or `npm run db:generate` is already done — migration `0000_sturdy_maestro.sql`).
   Push applies: the 6 Phase-1 tables + ENABLE RLS + tenant policies, `CREATE EXTENSION vector`,
   `ALTER PUBLICATION supabase_realtime ADD TABLE jobs`, and `public.custom_access_token_hook`.
   If push prompts on an enum/rename → confirm (this is why the plan is autonomous:false).
4. **Enable the Auth Hook** in the Supabase dashboard: Authentication → Hooks → Customize Access
   Token → `public.custom_access_token_hook`. Without this, JWTs won't carry `tenant_id` and RLS
   denies everything to authenticated sessions.
5. Confirm pgvector is enabled (the migration does `CREATE EXTENSION IF NOT EXISTS vector`).

After 1–5: `npm run build && npm run typecheck && npm run lint && npm run test` should all pass
(build currently fails locally because NODE_ENV=production + env.ts now requires the Supabase vars
and there is no `.env.local`). Then 01-03-SUMMARY.md can be written and STATE/ROADMAP updated.

Q1 (RLS-JWT-claims plumbing) — RESOLVED: option (a), a `tenant_id` custom claim via
`custom_access_token_hook`; request-scoped Drizzle client runs as `authenticated` with the JWT's
claims set per transaction (`db.rls(fn)` in `src/db/client.ts`).

## 01-07 — local-windows Chromium render flake on marketing pages (2026-05-13)

`e2e/marketing.spec.ts` (6 tests) passes in CI per Plan 08's SUMMARY ("8/8 passed") but
fails when run on this Windows machine via Playwright's local webServer. The chromium
browser renders "This page couldn't load" / Reload / Back instead of the served HTML —
even though `curl http://localhost:3000/` returns the correct 200 + full HTML for the
same URL.

Diagnosis attempted in Plan 07:
- Removed proxy.ts overhead from public routes (the proxy now fast-paths `/`, `/pricing`,
  `/sign-up`, `/sign-in`, `/legal/*` without calling Supabase). curl after the fix gets
  `/` in ~3.7s cold start, `/pricing` in ~0.04s warm.
- Despite that, the marketing tests still render "page couldn't load" in headless
  Chromium under Windows + Playwright's bundled webServer.
- The auth + skeleton + styleguide e2e (which Plan 07 ships) all pass — they use
  `request.get()` (Playwright's request fixture, server-side bytes only, no browser).

This is NOT a regression introduced by Plan 07 — the marketing tests pre-dating my
proxy.ts also fail the same way locally. CI (Linux runner against the Vercel preview
URL) is the canonical test environment and is green.

Follow-up (out of Plan 07's scope):
1. Investigate the chromium "page couldn't load" cause on Windows. Hypothesis: a
   font / module-preload / Sentry / Amplitude resource fetch timing out and Chrome's
   "this page couldn't load" overlay short-circuits the render.
2. Either harden the marketing spec to use `request.get()` (mirroring Plan 07's auth
   spec pattern) — server-side bytes are the actual contract — or move the local
   webServer to a launched-once-per-suite worker.

Plan 07's verification is CI-green, not Windows-local-green. The pre-existing
marketing flake is logged here for the verifier / a later plan to harden.
