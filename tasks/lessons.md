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

- **Both /codex and /cso are mandatory for security_gate-flagged plans.**
  Plan 02-03 declared security_gate: cso + codex_review_required: true in
  frontmatter. /codex caught regex coverage gaps (3 HIGH + 4 MEDIUM); /cso
  caught business-logic gaps that /codex didn't (M1 founder-self exemption,
  M2 TOCTOU, M3 audit-swallow log). Both lenses matter — /codex is the
  regex auditor, /cso is the data-flow + business-logic auditor. Don't skip
  one because the other passed. (Plan 02-03 T15+T16, 2026-05-25.)

- **Production schema migration for Phase 2 succeeded with both 0005 + 0006
  applied via drizzle-kit migrate directly.** Unlike Test-CI (where 0006's
  ALTER TYPE ADD VALUE silently failed inside transaction), prod accepted
  the enum addition via the same drizzle-kit invocation. Possible factors:
  Postgres 17.6 on prod vs Test-CI version, or pooler behavior. Discrepancy
  noted but not investigated — both DBs now hold identical schema.
  Smoke test against Vercel preview confirmed prod app reads/renders
  without issue. OAuth callback cross-preview issue surfaced separately
  (logged P4.5-POLISH-14, preview-only, prod unaffected).
  Migration timestamp: 2026-05-25. (Phase 2 Plan 02-03 close.)

- **2026-05-27 — Schema-freeze guard hardening (deferred from C5-L1).**
  `git diff --quiet <baseline> -- src/db/schema/` does NOT catch new
  untracked files under `src/db/schema/`. It only catches modifications
  to tracked files. Accepted as a known LOW for Plan 02-04 because the
  plan-text bans new files under `src/db/schema/` in three places
  (must_haves, files_modified frontmatter, T08 acceptance criterion) AND
  the T08 human checkpoint backstops, AND the named risk-#10 threat
  (a `last_embedded_at` column on business_memory) mutates an existing
  tracked file so the current guard catches it. Future schema-freeze
  guards (Plans 02-05 onward) must use the airtight form:

  ```bash
  git diff --quiet <baseline> -- src/db/schema/ && \
    test -z "$(git ls-files --others --exclude-standard src/db/schema/)"
  ```

  Bake this into the plan-author skill's schema-lock template so every
  future phase ships with the airtight guard from cycle 1. (Phase 2
  Plan 02-04 cycle-5 review; founder decision 2026-05-27.)

- **2026-05-27 — Deterministic npm-script existence gate (cycle-5
  permanent rule).** The pnpm + db:check + db:diff escapes survived 4
  cross-AI review cycles because reviewers treated the plan-doc as ground
  truth instead of cross-checking package.json. Cycle 5 added a permanent
  deterministic gate that resolves every `npm run X` reference by numeric
  task index:
    1. Run `grep -oE 'npm run [...]' plan-doc | sort -u | comm -23 - <(jq -r '.scripts|keys[]' package.json | sort -u)`.
    2. For each script S printed: grep `"S":` in the plan to find the
       add-step task `T_add`; find the earliest task containing
       `npm run S` as `T_use` (instructional context only — not frontmatter
       metadata, not post-task prose).
    3. No add-step found anywhere → HARD FAIL (true phantom).
    4. `T_add ≤ T_use` → PASS (self-provisioned in time).
    5. `T_add > T_use` → HARD FAIL (provisioned too late).
  This replaces the prior loose "same-plan-add-step exception" prose.
  It is grep-able, scriptable, and CI-enforceable. Bake into every future
  Phase 2+ `<plan-checker>` block from cycle 1. Cycle reviews must paste
  the comm output verbatim AND the per-script T_add/T_use resolution for
  every comm hit. (Phase 2 Plan 02-04 cycle-5 review; recorded in
  02-REVIEWS.md §"Permanent plan-checker rule (added cycle 5)".)

- **2026-05-29 — vitest 4.1.6 has no `--repeat` flag; determinism
  re-runs use a serial in-test loop (or `vitest.config` `repeats`).**
  Plan 02-04 T03 dispatch surfaced this: cycle-7-converged plan said
  `npx vitest run … --repeat=3` for the chunker determinism case;
  vitest 4.1.6 (the pinned version) throws
  `CACError: Unknown option \`--repeat\``. Executor swapped to 3 serial
  runs — equivalent, since Case 1 itself runs `chunkText(input)` 100×
  in-test. **Gate-1 sibling rule (carries to all future plans):**
  Gate 1 verifies `npm run X` scripts resolve in `package.json`. ADD a
  parallel verification that every CLI FLAG used in a plan command
  (`--repeat`, `--coverage.thresholds.lines=N`, `--reporter=json`, etc.)
  actually exists in the installed tool version — `vitest run --help`
  output should be greppable for the flag. Caught the same defect class
  as the npm-script existence gate, just one level deeper (the script
  exists, the flag it's invoked with doesn't). Bake into the
  plan-author skill: when authoring a CLI invocation in a plan code
  sketch, verify the flag exists in the installed tool's `--help` at
  authoring time, not at execution time. (Phase 2 Plan 02-04 T03
  dispatch, 2026-05-29.)

- **2026-05-27 — Sibling plan-checker rules (extends cycle-5 npm-script
  gate).** Plan 02-04 T01 pre-dispatch surfaced a new defect class on top
  of the cycle-5 npm-script gate: the plan-doc imported helpers that do
  not exist in the source it imported from (`withTenantContext`,
  `makeTenantContext`, `TenantContext`, `tenantA.memoryRowId` — none
  exist in `tests/db/test-db.ts`). Same root cause as pnpm/db:check/db:diff
  escapes: plan-doc asserts something not verified against the repo.
  Additionally found ~80% case overlap between the proposed new test file
  and existing `tests/integration/rls-memory.test.ts`. Extend the
  deterministic gate with TWO sibling rules, applied on every future
  cycle review:

  **Sibling rule A — Import resolution.**
  For every `import { X, Y } from '@/<path>'` (or `'<rel/path>'`) in any
  plan-doc task block:
    1. Resolve the path to a real source file (alias `@` → `src/`;
       relative paths from the test file's eventual location).
    2. For each named import (X, Y, type Z), grep the source for a
       matching `export` — named, re-export, or default. Type imports
       must resolve to actual exported types.
    3. If any import does not resolve to a real export → HARD FAIL,
       blocks convergence.
  Reviewer must paste the per-import resolution table for any task that
  authors test files or imports from project-internal modules.

  **Sibling rule B — Test scope dedup.**
  For every proposed new test file in a plan task:
    1. List existing test files under `tests/**` that touch the same
       tables / concerns / external services (grep by table name,
       module path, or service identifier).
    2. For each proposed test case, grep the existing tests for cases
       asserting the same invariant. Compute overlap as
       `overlapping_cases / proposed_cases`.
    3. Classify:
       - `<50%` overlap → PASS (file is genuinely new)
       - `≥50%` overlap → DOWNGRADE-TO-EXTEND (reviewer must flag:
         drop the new file and extend existing, OR trim the new file
         to non-duplicative cases only — like Plan 02-04 T01 trimmed
         from 5 cases to 2)
       - Effective duplicate (>90%) → HARD FAIL
  Reviewer must report the overlap percentage + per-case mapping table
  for any new test file proposed in the plan.

  Both rules carry to ALL future Phase 2+ phases. Bake into the plan-
  author skill: inspect existing test files + verify all imports against
  the source + grep for case-overlap before drafting any task block.
  (Phase 2 Plan 02-04 T01 pre-dispatch drift audit, 2026-05-27.)

- **2026-05-27 — Repo-grounding pre-authoring requirement
  (lessons-from-the-bills).** Plan 02-04 was patched FOUR times before
  T01 ran: pnpm migration (cycle 4), db:check (cycle 4), db:diff (cycle
  5), test infra/helpers/scope (T01 pre-dispatch). Every patch was a
  plan-author skill failure to ground in the actual repo state. Future
  plan authoring must, as a MANDATORY pre-drafting step:
    1. Read the relevant existing test files end-to-end (not just grep
       headers) — and cross-reference proposed new cases against them.
    2. Verify every named import in any code sketch resolves to a real
       export in the source it imports from (sibling rule A).
    3. Verify every `npm run X` invocation resolves to a real script
       in `package.json` (cycle-5 deterministic gate).
    4. Verify env-loading: every test that depends on a runtime env var
       must show how that env var is loaded for the test runner (vitest
       does NOT auto-load `.env.local`; explicit `dotenv.config({ path:
       '.env.local' })` in `tests/setup.ts` is the canonical path for
       this project).
    5. Verify shell idioms work on Windows (this project's primary dev
       env): no POSIX `export $(grep | xargs)`, no `&&`-chained
       commands assuming bash, no `$(...)` in PowerShell contexts.
  These checks happen ONCE, before plan drafting — not after 5 cross-AI
  review cycles. The plan-author skill template should ship with a
  pre-drafting checklist that surfaces this work explicitly. (Phase 2
  Plan 02-04 retrospective, 2026-05-27.)

- **2026-05-27 — Three new sibling plan-checker rules (cycle-7 close).**
  Cycle 6 caught 5 HIGH (import-resolution drift); cycle 6 hotfix landed
  CLEAN but cycle 7's expanded audit immediately surfaced 3 NEW HIGH +
  2 NEW MED in T04/T05 that cycles 1-6 missed because no gate checked:
  (a) SDK call SIGNATURES, (b) Drizzle column-type-annotation
  completeness, (c) implementation-vs-test-assertion cross-checks.
  Pattern: every patch surfaces deeper drift. Took option-3
  scope-reduce in cycle 7 (drop T05 corpus-sync; defer to
  FOLLOWUP-CORPUS-SYNC-01 with all 6 gates applied at AUTHORING time).
  Three new sibling gates carry forward to ALL future Phase 2+ plans:

  **Gate 4 — External-library SIGNATURE consistency.**
  For every SDK call in a plan task code sketch (`inngest.createFunction`,
  `db.transaction`, Anthropic SDK methods, Voyage adapter, Drizzle ORM
  query builders, MSW handlers, etc.):
    1. Resolve the SDK method name to its type definition in
       `node_modules/<pkg>/**/*.d.ts`.
    2. Verify call shape — argument count, argument shapes, return type
       usage.
    3. Mismatch → HARD FAIL.
  Reviewer pastes the per-call shape comparison for any task that uses
  external SDK APIs. (Example caught: Inngest v4 `createFunction` is
  2-arg form `(options-with-embedded-triggers, handler)` not 3-arg form
  `(options, trigger, handler)` — surfaced cycle 7 HIGH 1 against
  Plan 02-04 T04+T05.)

  **Gate 5 — Drizzle column-type-annotation completeness.**
  For every Drizzle column referenced in a code sketch:
    1. If column is `jsonb()` / `json()`, verify `.$type<T>()`
       annotation is present at the schema, OR an explicit cast is
       present at every access site in the sketch.
    2. No annotation AND no cast → HARD FAIL (will not compile under
       `strict: true`).
  Reviewer pastes the per-jsonb-access cast/annotation status for any
  task that reads jsonb columns. (Example caught: cycle-7 H2 — T04
  flatten site read `row.narrative?.problem` but `narrative` was typed
  `unknown` because the Drizzle schema lacked `.$type<Narrative>()`.
  Two paths: localized cast (cycle-7 chose this), or schema annotation
  — schema annotation deferred to FOLLOWUP-DRIZZLE-TYPE-ANNOTATION-01
  because src/db/schema/* is git-frozen during the embed-pipeline ship.)

  **Gate 6 — Implementation-vs-assertion cross-check.**
  For every test assertion involving a counted/quantified invariant
  (e.g., `expect(spy.mock.calls.length).toBeLessThanOrEqual(N)`, batch
  size N, retry count N, fan-out arity N, chunk count N):
    1. Grep the implementation sketch in the SAME plan for the
       relevant operation (loop, batch call, fan-out, retry).
    2. Verify the implementation matches the assertion's count under
       the assertion's input conditions.
    3. Contradiction → HARD FAIL.
  Reviewer pastes the per-quantified-assertion vs implementation
  comparison for any task that has counted invariants. (Example caught:
  cycle-7 H3 — T05 implementation looped `for (const doc of docs)
  await voyage.embed(...)` (50 docs = 50 HTTP calls) while Case 7
  asserted `httpCallSpy.mock.calls.length <= 7` under the 50-doc
  budget. Survived 6 cycles because no review cross-read both halves of
  T05 in a single pass.)

  These gates carry to ALL future Phase 2+ phases AND bake into the
  plan-author skill: verify SDK signatures, column-type annotations,
  and implementation-vs-assertion counts BEFORE drafting any task block.
  Future plans run all 6 gates at first cycle, not cycle 6+
  retroactively. The cycle-7 scope-reduce of T05 → FOLLOWUP-CORPUS-SYNC-01
  is the canonical example: re-authoring with gates 1-6 active from
  word one beats grafting fixes onto a plan that's been patched 8 times.
  (Phase 2 Plan 02-04 cycle-7 close, 2026-05-27.)

- **Chunker tokenCount is an ESTIMATE under the heuristic path; label it on
  the type, not only in the docstring.** Plan 02-04 T03 ships `chunkText` with
  the `1 token ≈ 4 chars` heuristic because `@anthropic-ai/tokenizer` is not
  a dep (verified package.json at T03 implementation; only `@anthropic-ai/sdk`
  is present, and the plan explicitly says NOT to add the tokenizer at this
  stage — `tasks/constraints.md` keeps `ai/client.ts` as the Anthropic
  chokepoint and adding a new SDK on the Voyage-embedding path would dilute
  that boundary). The `tokenCount` field is annotated `estimated under
  heuristic` directly on the `Chunk` type, so a future reader sees the caveat
  at the call site, not just buried in the module docstring. Plan 02-05 swaps
  in a real tokenizer if eval shows drift. Voyage's 32K-token input limit is
  far above any 800-token chunk under either path — drift here only affects
  cost-tracking fidelity in OBS-COST-01 (Plan 02-07), not correctness.
  (Phase 2 Plan 02-04 T03, 2026-05-29.)

- **2026-05-29 — `--no-verify` is permitted IFF every failing test grep-matches
  a documented FOLLOWUP (bounded-bypass rule, carries forward).** Standing
  rule had been "never `--no-verify`." Phase 2 Plan 02-04 T04 surfaced a real
  edge case: the pre-push gate fails on the 2 pre-existing
  `FOLLOWUP-HARDCODED-DOMAIN-REGEX-01` tests
  (`tests/billing/checkout-session.test.ts:66` +
  `tests/lib/email.test.ts:56` — both flag the legitimate
  `trochia.asranest.com` build domain because the regex over-fires). Fixing
  the regex requires CCO/compliance review (trademark-safety test); deferring
  the fix while still being able to push is the right ergonomic.

  **Bounded-bypass rule (explicit):**
    - `--no-verify` is permitted IFF, BEFORE the bypass commit:
        1. The executor stashes its own work-in-progress
        2. Re-runs the pre-push gate on the pre-task baseline (the commit
           the task started from)
        3. Confirms the same failures appear at baseline (i.e., NOT caused
           by the task's own changes)
        4. Confirms every failing test name grep-matches an open FOLLOWUP
           in `02-04-PLAN.md` `deferred_items` (currently only
           `FOLLOWUP-HARDCODED-DOMAIN-REGEX-01`)
    - **Any failing test that does NOT grep-match a documented FOLLOWUP →
      fix root cause, never bypass.**
    - The bypass must be recorded as a deviation in the executor's success
      report, with the stash + re-run evidence quoted.
    - When the FOLLOWUP fix lands, the bounded-bypass carve-out for that
      FOLLOWUP retires automatically.

  Bake this rule into the gsd-executor agent's posture so future dispatches
  apply it without an orchestrator carve-out in each dispatch prompt.
  (Phase 2 Plan 02-04 T04, 2026-05-29.)

- **2026-05-30 — Founder-gated review + deploy flow (Plan 02-04 T08 close
  pattern, carries forward).** The flow that closed Plan 02-04 codifies
  three boundaries every future plan with a `security_gate` + production
  surface should honor:

  **Boundary 1 — Pre-review prep is executor-owned, redeploy is founder-
  owned.** The executor can prepare the changeset (env flips, GHA bumps,
  CI fallbacks) and lands them as one pre-review commit, but does NOT
  trigger `/codex` or `/cso` and does NOT trigger prod redeploy. Both
  are the founder's commands — billed, time-boxed, deliberate. The
  executor's job is to leave the branch in a "ready for review" state
  and surface that clearly.

  **Boundary 2 — Both reviews run before prod redeploy; their verdicts
  serialize.** `/codex` runs first (correctness lens), then `/cso`
  (security lens). Each verdict is one of:
    - APPROVED → proceed
    - APPROVED-WITH-FIXES → land the fixes as ONE pre-redeploy commit on
      the same branch, no `--no-verify`, then proceed
    - REJECTED → re-architect; do not push more code until the issue is
      designed out
  Fixes from both gates can batch into the same pre-redeploy commit. The
  commit message must cite which finding ID each fix closes.

  **Boundary 3 — Cross-review overlap is a high-signal positive.** When
  `/codex` and `/cso` flag the SAME issue from different lenses (e.g.,
  Plan 02-04 T08: TEST_DATABASE_URL silent-skip flagged by both Codex
  P2-2 + /cso F1), the priority bumps up — that's two independent
  perspectives converging on the same defect, not noise. Fix it. When
  the lenses DISAGREE (Codex says X is a finding, /cso says X is by-
  design, or vice versa), surface the disagreement to the founder for
  ratification rather than silently siding with one.

  (Phase 2 Plan 02-04 T08, 2026-05-30.)

- **2026-05-30 — Defer the write path's prod-debut until the read path
  + cost caps ship in the SAME merge (carries forward as a strategic
  pattern for AI-cost-bearing features).** Plan 02-04 implemented the
  embed-memory pipeline (founder-confirm → memory.confirmed → Voyage
  embed → pgvector upsert). The pipeline is functionally complete,
  schema-clean, /codex+/cso APPROVED, CI green. But the founder ratified
  a deploy-deferred close: ship the write path to prod ONLY when the
  read path (Plan 02-06 hybrid retriever + Plan 02-07 qa-rag) lands,
  AND when OBS-COST-01 ($5/user/day cap) is pulled forward into that
  same merge.

  **Rationale (the principle):** Any feature that introduces a new AI
  egress with per-token billing must not enter prod without
  - (a) the cost cap that bounds founder-side worst-case spend, AND
  - (b) the read-side surface that gives the write-side observable
    value — shipping a write-only pipeline to prod means founders pay
    Voyage embed costs but get zero retrieval value until weeks later.
  The aggregate value AND the aggregate risk both arrive at the
  read-path merge, so that's where the prod cutover belongs.

  **What this looks like operationally:** Plan 02-04 closes "merge-
  ready" not "merged". PR #7 stays a DRAFT. The branch
  `phase-2-knowledge-layer` accumulates 02-05 → 02-06 → 02-07 work in
  the same PR. At Plan 02-07 close, `PULL-OBS-COST-01-FORWARD` (logged
  in 02-04-PLAN.md `deferred_items`) reminds the planner to ship the
  cost cap in the same wave, not as a separate Plan 02-07-FOLLOWUP.
  Then PR #7 merges, prod auto-deploys, the entire memory feature
  (write + read + caps) goes live together.

  **Generalize:** every future plan that introduces a new AI-token
  egress (Plan 02-06 qa-rag query embedding, Phase 3 deck reviewer
  Sonnet+Opus pass, Phase 4 pipeline auto-stage, Phase 5 voice ASR
  vendor) should ratify with the founder whether it's a "ship the
  write path before the read path" candidate (rare; only when the
  write path itself surfaces founder value, e.g., visible activity
  count) or a "wait for the joint deploy" candidate (default). The
  default is wait, not ship.

  (Phase 2 Plan 02-04 T08 close, 2026-05-30.)

- **2026-06-01 — Eval-check env-gates key on credential PRESENCE, not
  validity — so any UNMOCKED eval check in vitest fires a real (often
  doomed) network call. Always mock the live dependency in unit tests.**
  Plan 02-05 flipped two eval checks live: `extraction-floor` gates on
  `!process.env.ANTHROPIC_API_KEY`, `cache-hit` gates on
  `isLangfuseConfigured()` (all three Langfuse vars set). Both gates
  test for the var being SET, never that it is VALID. `tests/setup.ts`
  loads `.env.local`, which carries a (CI-placeholder / invalid) key —
  so the gate passes inside vitest and the check fires the REAL
  `extractFromPaste` / `fetchTraces`, hitting a 401.

  **How it bit, twice:**
  - T02: T01's `runner.test.ts` Cases 4+5 called `runEvalSuite()`
    unmocked (safe while all checks were inert `'pending'` stubs). Once
    extraction-floor went live they fired a real Anthropic 401 →
    forced a (correct, in-scope) test edit to stub the live checks.
  - T03: `runner.test.ts` Case 2 mocked only `extractionFloor` and let
    `cacheHit` run live → a real Langfuse 401. The SDK resolved (not
    rejected) with a non-array `data`, which threw
    `TypeError: res.data is not iterable`. Fixed in cache-hit.ts with an
    `Array.isArray(res.data)` guard (malformed read → 0 traces → ratio
    0 → `'fail'`; fail-CLOSED, never a throw, never a false pass). Case 2
    later made hermetic at plan close by stubbing `cacheHit → 'skip'`.

  **Rules going forward:**
  - In vitest, ALWAYS `vi.mock` the live dependency (`@/ai/agents/
    extract-from-paste.agent`, `@/lib/langfuse`) for ANY test that
    invokes a live eval check OR `runEvalSuite()` — a present-but-invalid
    credential in `.env.local` defeats a presence-only env-gate.
  - A live read that errors or returns a malformed shape must fail-CLOSED
    (`'fail'` / propagate), never silently `'pass'`. Pair this with the
    `EVAL_LIVE_REQUIRED` runner gate (a `'skip'` is a FAILURE on
    scheduled/manual live runs) so a creds-misconfigured nightly is a RED
    gate, not a green lie.
  - Workflow defense (already in eval.yml): the PR step passes NO secrets
    and does not set `EVAL_LIVE_REQUIRED` → live checks `'skip'` on PRs;
    only the LIVE step (schedule/dispatch) carries valid creds. The unit
    suite must not depend on that — it mocks.

  (Phase 2 Plan 02-05 close, 2026-06-01.)

- **2026-06-02 — `eval:run` belongs in EVERY verify-loop, not just the unit
  suite — vitest bundler-aliases `server-only` so a broken import passes
  unit tests while `tsx` (eval:run) crashes at module-eval.** Plan 02-07
  T01→T03 shipped a `cap.ts` that statically imported `@/db/client` (which
  transitively pulls `server-only`). The full vitest suite stayed GREEN —
  vitest's Next-aware transform aliases `server-only` to a no-op, so the
  module graph resolved fine in-test. But `npm run eval:run` (plain `tsx`,
  no Next transform) crashed at module-eval the moment the eval's static
  import graph reached `cap.ts` → `@/db/client` → `server-only` (which
  throws by design outside a Server Component). The hotfix `a9babe5` made
  `cap.ts` lazy-import `@/db/client` behind an async accessor so the
  `server-only` module is only evaluated at call time (inside a request),
  never at import time in the `tsx` eval graph.

  **Two rules from here (carry to all future Phase 2+ plans):**
    1. **`npm run eval:run` (PR-sim: creds unset → all checks `'skip'`,
       exit 0) is a MANDATORY verify-loop gate alongside typecheck / lint /
       check:banned / vitest.** It is the ONLY gate that exercises the
       `runAgent` + eval static import graph under a real Node/`tsx`
       module-eval (no Next bundler aliasing). A clean vitest run does NOT
       prove the eval graph loads. Run it on every plan that touches
       `src/ai/**` (agents, client, cap, eval, schemas).
    2. **Any new `@/db/client` / `server-only` import that lands in the
       `runAgent` OR eval static import graph MUST be lazy** — a dynamic
       `import()` behind an async accessor, evaluated at call time inside a
       request, NEVER a top-level static import. A top-level
       `import '@/db/client'` (or anything that transitively imports
       `server-only`) anywhere reachable from `src/ai/client.ts` or
       `src/ai/eval/runner.ts`'s static graph crashes `eval:run` at
       module-eval. The cap meter (`cap.ts`) is the canonical example: it
       needs the request-scoped DB client, but it must reach for it lazily.

  (Phase 2 Plan 02-07 T04+T05 close — cites the T01→T03 regression + the
  `a9babe5` cap.ts lazy-import fix, 2026-06-02.)

---

## Cost / rate tables (2026-06-03)

- **A cost-rate table MUST carry an absolute-value test against a dated published source — internal ordering/proportion checks are not enough.** `src/ai/cost/rates.ts` shipped the Opus constants as the DEPRECATED Opus 4/4.1 card ($15/$75/$18.75/$1.50) — exactly 3x the current Opus 4.6/4.7/4.8 rates ($5/$25/$6.25/$0.50). It survived every test because `rates.test.ts` only pinned the ORDERING (cache_write >= input >= cache_read) and PROPORTIONS (reserve = input x cache_write + ...). A uniform 3x scale error preserves every ratio, so the suite stayed green while the live cap metered real spend at 3x (the "$5/user/day" HARD-blocked at ~$1.67/day of real Opus cost). The internal `actual <= reserve` bound also held (same constants both sides), so it was conservative-but-wrong, not unsafe — which is exactly why nothing flagged it.

  **Rules (carry to every priced primitive — Phase 3 deck reviewer, Phase 4 Live Raise, Phase 8 Raise Ops):**
    1. **Pin the ABSOLUTE rate** against a dated published source, not just relationships: `expect(OPUS_INPUT).toBe(5.0)` + the derived `6.25`/`0.50`. A future provider price change must then update the literal deliberately, failing CI until it does.
    2. **One source of truth, derive the rest.** Make the base input rate the single constant and derive cache-write (x1.25) / cache-read (x0.10) from it so the four numbers can never drift apart.
    3. **Record the source + date in the code.** A dated comment (`platform.claude.com/docs, pulled 2026-06-03, founder-ratified`) turns "ratify at convergence" from a TODO into an audit trail.
    4. **Re-verify rates at every prod-merge gate** — model price cards change between when a constant is authored and when it ships. (Phase 2 Plan 02-07 FOLLOWUP-COST-RATES-RATIFY, 2026-06-03.)

---

## CI / test environment (2026-06-06)

- **Any test that exercises the REAL runtime client (`getServiceClient()` → `DATABASE_URL`) needs CI `DATABASE_URL` pointed at a reachable, migrated test DB — not a dummy localhost.** The cost-cap integration test (`tests/integration/cost-cap.test.ts`, first shipped in 02-07) drives the real meter (`cap.ts` → `getServiceClient()` → `DATABASE_URL`). Locally it passed because `.env.local` sets `DATABASE_URL == TEST_DATABASE_URL` (the throwaway test project). In CI it FAILED (#73, 6 tests, all `AI_COST_METER_UNAVAILABLE` 503) because `ci.yml` had `DATABASE_URL` falling back to a dead `postgresql://localhost:5432/ci` (the `DATABASE_URL` secret was unset) — so the meter could not reach a DB even though `migrateTestDb()` had created `ai_usage_daily` in `TEST_DATABASE_URL`. The two DBs were different. Fix: `DATABASE_URL: ${{ secrets.TEST_DATABASE_URL }}` in `ci.yml` (CI-config only).

  **Why it hid until now:** CI #72 (on the pre-02-07 head) was green because no test had ever driven the real `getServiceClient()` against the DB before — every prior DB test used the RLS `tenantClient` (`TEST_DATABASE_URL`) or mocked `@/db/client`. The cost-cap meter was the first caller of the runtime service client in a test, so it was the first to expose the `DATABASE_URL`-vs-`TEST_DATABASE_URL` split in CI.

  **Rules:**
    1. **CI must mirror local DB wiring.** If local sets `DATABASE_URL == TEST_DATABASE_URL`, CI must too — a green local run does NOT prove CI parity when the two env vars diverge.
    2. **A dummy/unreachable `DATABASE_URL` is a latent trap.** It works only while no test touches the runtime client. The moment one does, it fails-closed (correctly) and reads as a product bug. Point CI `DATABASE_URL` at the real test DB so the trap never arms.
    3. **Distinguish the two clients in test review:** RLS tests use `tenantClient`/`TEST_DATABASE_URL`; anything using `getServiceClient()` uses `DATABASE_URL`. Both must be reachable + migrated in CI. (Phase 2 Plan 02-07, CI #73 diagnosis, 2026-06-06.)

---

## Form-to-mutation seams + prod smoke-test fixes (2026-06-06)

- **A green test suite did NOT prove the onboarding flow worked — the form-to-mutation seam was never driven.** "Save and continue" was a silent no-op in prod: `confirmation-form.tsx` built its react-hook-form resolver as `zodResolver(businessMemoryConfirmedSchema.transform((v) => ({ payload: v })))`, but the form VALUE is wrapped (`{ payload: ... }`). `.transform` rewrites the parsed OUTPUT, not the shape the parser EXPECTS — so it validated the wrapped value against the UNWRAPPED schema and ALWAYS failed on the two required top-level keys (`provenance`, `confirmedAt`). `form.handleSubmit(onValid)` (no `onInvalid`) then swallowed every submit → `confirmDraft` never fired → no `memory.confirmed` → no embed → Q&A empty. `errorCount` only walked rendered-card paths, so the failure was invisible.
  **Two `as never` casts hid the shape error from tsc** — the exact mismatch a type would have caught. Fix: `zodResolver(z.object({ payload: businessMemoryConfirmedSchema }))`, casts dropped (it now typechecks honestly), plus an `onInvalid` arm + a form-level error surface so a blocked submit is never silent again.
  **Rules:**
    1. **Every form that persists via a mutation needs a seam test** that renders the real form, drives it to submit, and asserts the mutation handler fires with a schema-valid payload — not just that cards render. A component test asserting rendered UI is NOT a working-submit test.
    2. **Never `as never` around `zodResolver`.** If the resolver needs a cast to fit `useForm<T>`, the schema shape and the form-value shape disagree — that IS the bug. Make them match instead.
    3. **`handleSubmit` always takes an `onInvalid` arg** for any form whose schema can fail on non-rendered paths; surface a form-level error so a blocked submit is visible.

- **MEMORY-NAV-WIRING-01 (fixed here):** `/app/memory` shipped in merged main as the Plan-01-09 "coming in Phase 2" stub even though Phase 2 shipped — the real paste/confirm flow lived only at `/onboarding/import/paste`, and the dashboard CTA + sidebar both linked to the stub. Fixed: `/app/memory` now renders `<MemoryWorkspace/>` (paste / resume-draft / confirmed-read-only); the existing links resolve correctly with no link change. Lesson: a route that is a placeholder must be tracked to its real-UI replacement at the phase that ships the feature — a placeholder in merged main reads as "feature missing."

### Follow-ups opened
- **FOLLOWUP-EXTRACT-500-RETRY-01** — the intermittent `extractFromPaste` 500: the metered path (`costContext`) disables the OpenAI fallback, so a transient structured-output validation miss throws `AI_STRUCTURED_OUTPUT_INVALID` → 500; retry succeeds. Optional bounded in-agent re-roll on `AI_STRUCTURED_OUTPUT_INVALID` for the extract path before surfacing a 500. Not a launch blocker.
- **FOLLOWUP-MEMORY-SHARED-CORE-01** — `PasteFlow` is reused at `/app/memory` via a `mode` prop (onboarding kept byte-identical). A future plan can factor the shared paste->confirm->save core out of `PasteFlow` rather than branch on `mode`.
- **FOLLOWUP-MEMORY-APP-E2E-01** — authed Playwright paste->confirm->save E2E (the durable seam guard) needs the test-user-mint helper (deferred from P4.5). The unit seam test (`tests/components/memory/confirmation-form.test.tsx`) is the guard until then.
- **FOLLOWUP-MEMORY-REIMPORT-01** — the confirmed-row reimport/update contract. The first patch shipped an "Update Business Memory" CTA on the confirmed read-only view, but codex HIGH-1 found it dead-ends: `extractFromPaste`'s upsert excludes confirmed rows (`ON CONFLICT … WHERE confirmedAt IS NULL`), so re-pasting over a confirmed memory creates NO unconfirmed draft, yet `PasteFlow` still advanced to confirm → on submit `confirmDraft` → `NOT_FOUND`. Resolved for now by HIDING the CTA (the confirmed view is honestly terminal read-only). The real fix needs a server reimport mutation that re-opens an unconfirmed draft from a confirmed row (or makes `confirmDraft` able to re-confirm an existing confirmed row) — tied to the deferred Week-3 update/conflict work. Until then a confirmed memory cannot be updated from the UI.

- **Codex HIGH-1: a confirmed-state CTA whose server write path the upsert filter forbids.** The confirmed read-only view offered "Update Business Memory" → re-ran `PasteFlow mode="app"`, but `extractFromPaste` upserts with `WHERE confirmedAt IS NULL`, so for a confirmed row no unconfirmed draft is ever written; `PasteFlow` advanced to confirm regardless, and submit hit `confirmDraft` → `NOT_FOUND`. The first-time and unconfirmed-draft-resume paths were clean — only the confirmed→reimport branch dead-ended. Rule: when a UI affordance triggers a write path guarded by a partial-index / conditional-upsert predicate (`WHERE confirmedAt IS NULL`), trace the affordance's originating state against that predicate — an affordance offered in a state the predicate excludes is a guaranteed dead-end, not an edge case. Fix was Option 1 (hide the CTA; confirmed view is terminal read-only); the server reimport contract is FOLLOWUP-MEMORY-REIMPORT-01.

(Prod smoke-test fix batch, fix/prod-smoke-blockers off main @ 923cae0, 2026-06-06; codex HIGH-1 follow-up patch same branch.)
