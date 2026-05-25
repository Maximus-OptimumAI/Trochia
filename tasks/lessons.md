# Lessons — Trochia AI

Running log of patterns and rules learned during the build. Reviewed at session start.
New lessons appended after any correction or postmortem.

---

## Security / data handling

- **Never paste real customer data into Claude Code / Cursor / ChatGPT to debug — synthetic fixtures only.** Customer data never enters an AI build-tooling context, ever. Reproduce bugs with synthetic fixtures. (XC-01; seeded Phase 1.)

---

## Stack / scaffolding

- **`drizzle-kit push` does diff-sync; `drizzle-kit migrate` applies files verbatim. Use `migrate` for any project where migrations include hand-authored SQL.** Phase 2's first `db:push` attempt against the throwaway DB diffed against Drizzle schema files and wanted to `DROP POLICY "auth_admin_can_read_accounts" ON "accounts" CASCADE` — a Phase 1 policy created by raw SQL in `0000_sturdy_maestro.sql` (line 139) that grants `supabase_auth_admin` SELECT on `accounts` for the JWT-minting auth hook. Drizzle schema files only declare `tenant_isolation` and `owner_self_read` on `accounts`, so push saw the third policy as drift. Dropping it would have broken `tenant_id` resolution for every new login. `strict: true` in `drizzle.config.ts` surfaced the destructive intent before applying — keep `strict: true` always. Fix: switched to `npx drizzle-kit migrate` which applies `0005_easy_the_executioner.sql` verbatim without diff-sync; verified post-migrate that `auth_admin_can_read_accounts` still exists. Open follow-up: declare `auth_admin_can_read_accounts` in `src/db/schema/tenancy.ts` via a custom `pgPolicy` so future `db:push` calls don't see it as drift. (Phase 2 Plan 02-01 Task 7, 2026-05-20.)

- **`drizzle-kit` does NOT auto-load `.env.local`** — unlike Next.js. The npm scripts `db:push` / `db:generate` / `db:migrate` need env loaded explicitly. Pattern: `set -a && . ./.env.local && set +a && npx drizzle-kit <cmd>` from bash. Lifts the `.env.local` vars into the process environment without needing `dotenv-cli`. (Phase 2 Plan 02-01 Task 7.)

- **`.env.local` DATABASE_URL/DIRECT_URL points at the throwaway test project (`spqnjvcfmmmdobkwgmxs`), NOT the real Phase 1 project (`xnzyhjwalphcykjwoxdw`).** Local dev runs against the throwaway DB; production env vars on Vercel point at the real project. Phase 1's `01-03-SUMMARY.md` says "TEST_DATABASE_URL points at a SEPARATE throwaway Supabase project (ref `spqnjvcfmmmdobkwgmxs`), not the prod DB" — but the .env.local has been set up so DATABASE_URL ALSO points at the throwaway. This is the safe pattern for local dev (no risk to prod data) but means `npm run db:push` from local hits the throwaway. To apply schema changes to prod: either swap .env.local temporarily, or rely on the Vercel deploy to apply via build-time migration (TODO: confirm Phase 1 had a prod-migration hook). (Phase 2 Plan 02-01 Task 7.)

- **Phase 1 was built and GSD-verified entirely in `next dev` (NODE_ENV=development). Every feature touching env validation, security headers, CSP, or CI-only tools (Lighthouse, Playwright webServer) needs a separate prod-mode smoke pass before merging.** The first GHA run on PR-1 surfaced three latent prod-only bugs in succession that dev mode masked: (1) vitest cross-file `TRUNCATE` race against shared TEST_DATABASE_URL (file-parallelism on); (2) `src/lib/env.ts` ZodError on every client hydration (strict-prod `prodRequired()` enforces server-only vars against a stripped client bundle); (3) `.lighthouserc.json` missing `startServerCommand` (CI's Playwright tears down its webServer before lhci runs). All three would have been caught by a 30-second `npm run build && npm run start && curl -I / && npx playwright test && npx lhci autorun` pass against the production build. Add this as a required gate to the Phase verification protocol — verifier asks "did you run the prod smoke?" and refuses ACCEPTED-WITH-FOLLOWUPS until the answer is yes. (PR-1, commits f243f61 / 41d372b / this commit.)

### Dependency upgrades can break invariants without breaking APIs

Drizzle-orm 0.45.2 was a SemVer-minor bump (no breaking API changes
documented) but changed the rollback semantics of `db.transaction()` in a
way that broke PR-3's claim-after-side-effect tests. CI run #10 on
fix/01-07-drizzle-orm-0.45 surfaced 4 failures; PR-4 was closed without
merging.

**Local-vs-CI divergence root cause:** TEST_DATABASE_URL was set in CI but
not locally, so postgres-js integration tests silently skipped on local
pre-push. Local gate said green, CI said red.

**Rules from here:**

1. Always run `npm run gate` (not `npm run test`) before pushing. The gate
   sources .env.test, refuses to run if TEST_DATABASE_URL is missing, and
   exercises the full integration suite.
2. For any dep that touches transaction boundaries, isolation levels, or
   error propagation — drizzle, postgres, supabase-js, stripe SDK, inngest
   — additionally run `npm run build` before pushing.
3. SemVer-minor is not safe by default. Read the dep's changelog before
   bumping anything touching the data layer.
4. The CVE deferral is tracked in tasks/security-followups.md.

References: PR-4 (closed, never merged); CVE GHSA-gpj5-g38j-94v9.

---

## Operator working with Claude Code

- **Probe before theorizing. The operator should ask Claude to run a probe (curl, pageerror capture, file existence, header dump) BEFORE stating a theory in the prompt — not after.** On three consecutive PR-1 CI failures the operator's theory was specific, plausible, and grounded in a real log line — and wrong every time: (a) "FK violations are missing seed steps" — actual cause was vitest's cross-file `TRUNCATE` race; (b) "marketing page hydration crash is Sentry init on bogus DSN" — actual cause was `src/lib/env.ts`'s single `parse(process.env)` against the strict-prod schema crashing the client; (c) "Lighthouse interstitial is HSTS/upgrade-insecure-requests forcing https on localhost" — actual cause was `.lighthouserc.json` missing `startServerCommand`, leaving lhci to navigate against a dead port. In each case a single 30-second probe (`SELECT FROM information_schema`, `page.on('pageerror')`, `curl -sI`) would have surfaced the actual cause faster than the theorized fix could have been written. The shape that fails: operator skim-reads a CI log, latches onto the first symptom that matches a familiar shape, and writes the prompt as if the diagnosis is already settled. The shape that works: operator pastes the failing log + asks "run a probe to confirm what the server/page/binary is actually doing before proposing a fix." Claude is happy to commit to a theory the operator hands him; he should not be the one breaking that frame on every cycle. (PR-1; the three commits above + this one.)

- **For "page renders blank in CI but works locally," capture `pageerror` (uncaught exceptions reaching `window`) BEFORE reading `console.error`. One real `pageerror` is worth 100 `console.error` lines.** The chromium-launcher probe pattern — launch headless, attach `page.on('pageerror', e => …)`, `page.goto(url)`, dump `pageerror[0]` — takes ~30 seconds and is the highest-leverage diagnostic for hydration-class CI failures. In PR-1 round 3 the operator's strongest theory was "Sentry client init crashing on bogus DSN," grounded in CI logs noisy with Sentry-related `console.error` lines. The actual cause was a `ZodError` thrown by `src/lib/env.ts` doing a single strict-prod `parse(process.env)` on the client bundle: Next correctly strips non-`NEXT_PUBLIC_*` vars from the client, so the full server-schema parse fails on every hydration, replacing the page with Next's error boundary. The probe surfaced it instantly — `pageerror[0]` was a `ZodError`, not anything Sentry-shaped. `console.error` in a prod-mode CI run is full of expected noise (bogus DSN init warnings, hydration mismatches, third-party SDK chatter); `pageerror` is the signal cut. Pattern: when a page mounts blank, the first move is the headless-chromium pageerror probe — not log-scrolling. (PR-1 round 3, commit 41d372b.)

---

### Test cleanup helpers must include every new table

When PR-3 added the `processed_stripe_events` idempotency ledger, the
cleanup helper in tests/db/test-db.ts wasn't updated to truncate it.
PR-3's tests passed in CI because each test used unique event IDs, so
rows accumulated harmlessly. PR-4's broken drizzle 0.45.2 transaction
rollback then left orphan rows that overlapped with test event IDs,
breaking every test in the file once node_modules was reverted to 0.44.7.

**Rule:** When a PR adds a new table that tests write to, the same PR must
add that table to the cleanup truncate list. Worth a grep before opening
any future PR that includes a migration creating a new table.

---

## Lesson: Vercel Framework Preset (2026-05-15)

**Root cause of "preview failing on every PR" since project creation:** Vercel project's Framework Preset was set to "Other" instead of "Next.js" during initial import. Auto-detection failed.

**Symptom:** Build succeeds (`next build` runs fine, 32/32 static pages generated, "Build Completed"), but every route returns Vercel platform 404 with `cle1:cle1::...` ID format. Reason: "Other" preset deploys `public/` as static site and never applies Next.js routing rules to `.next/` output.

**Time burned:** ~3 hours, 5 hypotheses tested in sequence (env vars, proxy.ts code, build cache, Node 24, Sentry wrapper) — all were downstream of the misconfig, none could have fixed it.

**Rule:** On every Vercel project import, immediately verify Settings → Build and Deployment → Framework Preset = "Next.js". Do not trust auto-detection.

**Side fix:** Sentry stripped from next.config.ts (Sentry was never set up on sentry.io — env vars were "ci-project" placeholders). Restore when wiring to real Sentry project in Phase 5.

## Lesson 11 (2026-05-19): Phase 1 smoke test passed end-to-end

Full flow verified on Vercel preview:
Google OAuth → onboarding → /pricing → Stripe Checkout (test card 4242)
→ webhook delivered 200 → DB write → tier reflected.

Test artifacts:
- Stripe customer: cus_UY45YKDD7M8Ink
- DB row: tier=pre_raise, subscription_status=active
- Webhook events: checkout.session.completed, customer.subscription.created,
  invoice.paid — all 200 OK at 19:25:37–39

Three minor bugs deferred to Phase 4.5 polish (see tasks/phase-4-5-polish.md).

Step 6b.8 closed. Phase 1 closure complete.

### Priority queue update (2026-05-19)

6b.8 End-to-end smoke test: ✅ DONE
Next: 6c (Install Cursor CLI to Windows PATH)

- **Postgres ALTER TYPE ADD VALUE cannot run inside a transaction.**
  drizzle-kit migrate wraps each migration in a transaction by default, so
  enum-value additions fail silently — zero stdout output, journal updated
  locally but no row in drizzle.__drizzle_migrations on the live DB.
  Detection: query __drizzle_migrations directly — local journal lying
  doesn't mean migration applied.
  Fix: apply enum changes via postgres.unsafe() outside a transaction, then
  manually insert the migration hash into __drizzle_migrations to mark
  applied. Future plans should split enum-only migrations into separate
  files. (Plan 02-03 T11 precursor, 2026-05-22.)

- **Postgres ALTER TYPE ADD VALUE cannot run inside a transaction.**
  drizzle-kit migrate wraps each migration in a transaction by default, so
  enum-value additions fail silently — zero stdout output, journal updated
  locally but no row in drizzle.__drizzle_migrations on the live DB.
  Detection: query __drizzle_migrations directly — local journal lying
  doesn't mean migration applied.
  Fix: apply enum changes via postgres.unsafe() outside a transaction, then
  manually insert the migration hash into __drizzle_migrations to mark
  applied. Future plans should split enum-only migrations into separate
  files. (Plan 02-03 T11 precursor, 2026-05-22.)

---

## Phase 2 Week 3 (Plan 02-03) — Sanitizers + Conflict Resolver + Security Gates

- **Sanitizer regex coverage requires fixture-driven authoring + codex review — informal pattern lists miss attack variants.**
  Plan 02-03 Task 2 authored 20 OWASP LLM Top 10 payloads as a JSON fixture
  set with per-payload expected-severity + match-substrings + sanitized-
  excludes BEFORE writing the sanitizer's regex registry at Task 4. The
  fixture became the executable specification; the sanitizer was iterated
  against it until 20/20 flagged at the right severity. Codex T15-FIX-1
  closed H1 (severity-escalation bypass via single-marker high-base regex)
  + H2 (PII-14 dual-walk regression in the fixture file). Lesson: every
  future security sanitizer in Trochia (file upload Tier 2 KNW-03 Phase
  2 Week 7, qa-rag Phase 2 Week 6) ships with a fixture set first,
  regex second, and a /codex pass third. Informal "I'll add the patterns
  as I think of them" authoring is the antipattern. (T2 + T4 + T15-FIX-1.)

- **PII redaction founder-self exemption MUST source from trusted auth
  identity (ctx.session.user.email), NOT from LLM-derived draft fields.**
  Plan 02-03's original spec read founder-self identity from
  draft.team.founders[*].email — a field populated by the LLM extractor
  parsing attacker-controlled paste content. /cso M1 + /codex H3 both
  flagged this independently as a high-severity bypass: an attacker could
  paste content that causes the LLM to populate team.founders[0].email
  with the attacker's own address, which then whitelists that address
  from redaction. Fix at T16-FIX-1: the agent passes ctx.session.user.email
  (the trusted post-auth identity from Supabase) as the founder-self
  exemption seed; draft.team.founders remains informational only and
  cannot grant exemption. Generalized rule: for any redaction or
  filtering primitive whose decision depends on identity, source identity
  from the trusted auth layer, NOT from the input being filtered.
  (T6 spec → T16-FIX-1 fix, 2026-05-25.)

- **Audit-row metadata redaction boundary: severity band + numeric counts only,
  never matched substrings, never byType detail, never content fields beyond
  capped 200-char snippets.**
  Plan 02-03's security-IR audit row (kind='paste_extract' on injection
  rejection) carries `{ rejected: true, severity, categoryCount }` and
  NOTHING ELSE. The conflict-resolution audit row (kind='paste_confirm')
  carries `{ fieldKey, chosenSourceSnippet: snippet.slice(0, 200), rejectedCount }`
  per resolved field — chosen-snippet capped to 200 chars; never the
  full snippet, never byType breakdown of PII, never injectionScreen.matches
  contents (those are paste substrings — may themselves contain PII).
  The cap is the audit-vs-PII-leak tradeoff. Generalized rule: when writing
  security-IR audit rows, encode the question "is this attribute the kind of
  thing that could itself BE the attack content?" — if yes, store severity
  band or count only; if no, store with a tight cap. The interaction.metadata
  jsonb column is the audit boundary; the logger remains content-blind.
  (T11 spec + T16-FIX-1 audit-swallow fix.)

- **Atomic-upsert pattern from 02-02 generalizes to every Phase 2+ tRPC
  mutation touching one-row-per-tenant tables — default to
  `INSERT ... ON CONFLICT (account_id) DO UPDATE WHERE <state-guard>`
  + a TOCTOU guard via lastUpdatedAt-in-UPDATE-WHERE.**
  Plan 02-02 3be8fa6 introduced the atomic-upsert + isNull(confirmedAt)
  guard. Plan 02-03 T16-FIX-1 added the TOCTOU companion: lastUpdatedAt-in-
  UPDATE-WHERE catches the narrow race where two concurrent confirm
  requests both pass the read-side state check then race on UPDATE. The
  pattern is now: (a) atomic upsert with setWhere = state predicate,
  (b) version column (lastUpdatedAt) in UPDATE WHERE, (c) check returned
  row count + throw clean CONFLICT if 0. Every Plan 02-04+ mutation
  touching business_memory / embeddings / interaction / timeline_event
  with a one-row-per-tenant or version-bumping shape inherits this.
  (T16-FIX-1 TOCTOU upgrade, 2026-05-25.)

- **Planner-inheritance error pattern: when a plan references a schema
  artifact, verify the artifact actually shipped in the predecessor's
  state before relying on it.**
  Plan 02-03's T11 spec referenced an `interaction.metadata` jsonb column
  as if Plan 02-01 had shipped it — but Plan 02-01 never did. Caught at
  T11 dispatch when the audit-row insert failed with "column does not
  exist". Resolved via a precursor migration d5902ef that additively
  added the column + paste_extract / paste_confirm enum values BEFORE
  T11's audit-row contract could land. Plan-checker discipline now
  includes a verify-referenced-schema-exists step: every plan's <files>
  + <interfaces> + acceptance-criteria mention of a column / table /
  index must trace back to a shipped migration in a predecessor plan's
  SUMMARY. (T11 dispatch, 2026-05-22.)

- **Claude Code worktree-isolation bug #3099 on Windows — prefer
  sequential single-agent dispatches until upstream fix lands.**
  Plan 02-03 Wave 4-B/4-C on 2026-05-22 hit the bug class: parallel agents
  spawned with `isolation="worktree"` had Edit/Write calls silently land
  in the main repo working tree instead of their per-agent worktrees.
  Wave 4-B never recovered cleanly (work salvaged via in-place commit
  on main worktree); Wave 4-C self-recovered via cp + git checkout.
  Atomicity broken in both cases — recovery worked but the worktree-as-
  safety-guarantee invariant did not hold. Policy: sequential single-agent
  dispatch on Windows until #3099 ships an upstream fix. The branch-check
  safety hole (P4.5-POLISH-09) compounds this — `git merge-base HEAD
  <expected> == <expected>` passes when HEAD is an ancestor of expected;
  correct check is `git rev-list --count <expected>..HEAD == 0`.
  (Wave 4-B/4-C, 2026-05-22; logged at P4.5-POLISH-08 + P4.5-POLISH-09.)

- **APPROVED-WITH-FIXES from /codex or /cso is a real outcome — when
  fixes are small (~10-50 lines) ship them as a follow-up FIX commit on
  the same branch BEFORE /ship; don't merge with the verdict still
  outstanding.**
  Plan 02-03 hit two APPROVED-WITH-FIXES gates (T15 codex + T16 /cso).
  Both surfaced HIGH or MEDIUM findings that were closable in single-
  commit fix waves: T15-FIX-1 + T15-FIX-2 closed Codex H1/H2/H3/M1;
  T16-FIX-1 closed /cso M1/M2/M3. Pattern: when the verdict says
  APPROVED-WITH-FIXES, evaluate each finding's fix-size. If the cumulative
  patch is small enough to land as 1-3 commits on the same branch
  without re-architecting, ship the FIX commits + log the deferred
  lower-severity findings to backlog (P4.5-POLISH-12 for Codex MEDIUMs,
  P4.5-POLISH-13 for /cso LOWs). If the patch would re-architect the
  surface, escalate to a re-dispatch via the operator. APPROVED-WITH-
  FIXES is NOT "merge with caveats" — the fixes ship before merge.
  (T15-FIX-1/FIX-2 + T16-FIX-1, 2026-05-23 → 2026-05-25.)
