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
