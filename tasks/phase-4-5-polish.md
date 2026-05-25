# Phase 4.5 polish backlog

Bugs surfaced during Phase 1 smoke test (2026-05-19).
Not blockers. Fix during Phase 4.5 build weeks.

---

## P4.5-POLISH-01: /sign-out returns 404

**Severity**: Cosmetic
**Surface**: Vercel preview after clicking sign-out
**Repro**: Sign in → click sign-out from sidebar → lands on /sign-out → 404
**Root cause hypothesis**: Sign-out handler redirects to /sign-out
  (a confirmation page that doesn't exist) instead of clearing session
  and redirecting to /.
**Fix**: Update sign-out handler to redirect to / (or /sign-in) after
  Supabase session.signOut() completes.
**Estimated effort**: 15 min
**File likely involved**: src/app/(auth)/sign-out/ or wherever sign-out is wired

---

## P4.5-POLISH-02: accounts.current_period_end not populated by webhook

**Severity**: Low (data completeness)
**Surface**: Supabase accounts table
**Repro**: Complete Stripe Checkout → check accounts row → current_period_end is NULL
**Root cause hypothesis**: Webhook handler for customer.subscription.created
  / customer.subscription.updated doesn't extract subscription.current_period_end
  from the Stripe event object.
**Fix**: In src/app/api/webhooks/stripe/route.ts, add
  `current_period_end: new Date(subscription.current_period_end * 1000)`
  to the accounts upsert payload. Stripe returns Unix timestamp in seconds;
  Postgres expects milliseconds-based timestamptz.
**Estimated effort**: 20 min including test
**Files**: src/app/api/webhooks/stripe/route.ts, possibly drizzle schema migration if column type wrong

---

## P4.5-POLISH-03: Billing UI shows "No active subscription" despite active DB row

**Severity**: Low (UI correctness)
**Surface**: /settings/billing or wherever current plan is displayed
**Repro**: After successful checkout, billing page shows "Pre-Raise · No active subscription"
  even though accounts.subscription_status = 'active'
**Root cause hypothesis**: UI likely computes active state by checking
  current_period_end > now() instead of reading subscription_status field.
  Because current_period_end is NULL (see P4.5-POLISH-02), the check fails.
**Fix**: Either
  (a) Fix UI to use subscription_status === 'active' || 'trialing', OR
  (b) Fix P4.5-POLISH-02 first; this bug likely resolves automatically.
**Recommendation**: Fix P4.5-POLISH-02 first, retest, then decide if UI also needs change.
**Estimated effort**: 10 min (if resolved by #2) or 20 min (if separate fix needed)
**Files**: src/app/(app)/settings/billing/ or wherever billing UI lives

---

## Smoke test status post-fix

After all 3 fixes ship:
- [ ] Sign-out lands on / (or /sign-in), not 404
- [ ] accounts.current_period_end is populated with a future timestamp
- [ ] Billing page shows "Pre-Raise · Active subscription · Renews [date]"

## P4.5-POLISH-07: Agent worktree hygiene in gsd-executor

**Severity**: Internal process
**Cause**: Phase 2 Plan 02-02 surfaced two cases where subagents drifted from
their worktree scope: T4 wrote to main repo path before catching itself,
T7 used git stash inside worktree to investigate a pre-existing failure.
**Recovery**: Both self-disclosed, both recovered cleanly. Commits unaffected.
**Improvement**: Document throwaway-WIP-branch pattern as the right way to
investigate trunk-vs-worktree behavior differences. Add to gsd-executor skill.
**Estimated effort**: 30 min (doc update, no code change)

## P4.5-POLISH-08: Worktree isolation breach on Windows (Claude Code #3099 class)

**Severity**: Internal process (recovery worked, atomicity broken)
**Cause**: Parallel agents on Wave 4-B/4-C had Edit/Write calls land in main
repo working tree instead of their worktrees. 4-B never recovered (salvaged
via in-place commit); 4-C self-recovered via cp + git checkout.
**Impact**: Cannot rely on worktree isolation as safety guarantee on Windows
until upstream fix.
**Workaround**: Sequential single-task execution until #3099 resolves, OR
post-merge integrity check (manual diff of main vs worktree branches).

## P4.5-POLISH-09: gsd-executor worktree branch-check safety hole

**Severity**: Internal process
**Cause**: `<worktree_branch_check>` uses `git merge-base HEAD <expected> ==
<expected>`. This passes when worktree HEAD is an ANCESTOR of expected (because
merge-base returns the older one). Wave 4-B worktree HEAD was 19 commits behind
expected base and check still passed.
**Fix**: Replace with `git rev-list --count <expected>..HEAD == 0`
(HEAD must be at-or-after expected).

## P4.5-POLISH-08: Worktree isolation breach on Windows (Claude Code #3099 class)
**Symptom**: Parallel agents' Edit/Write calls silently land in main repo working tree instead of worktrees.
**Trigger**: Plan 02-03 Wave 4-B/4-C, 2026-05-22.
**Workaround**: Sequential single-task execution (Option 1) until upstream #3099 resolves.

## P4.5-POLISH-09: gsd-executor worktree branch-check safety hole
**Symptom**: `<worktree_branch_check>` uses `git merge-base HEAD <expected> == <expected>`. Passes when worktree HEAD is an ancestor of expected.
**Trigger**: Wave 4-B worktree HEAD was 19 commits behind expected; check still passed.
**Fix**: Replace with `git rev-list --count <expected>..HEAD == 0` (HEAD at-or-after expected).

## P4.5-POLISH-10: AppError lacks structured context field
**Symptom**: T11 router regex-parses markerCount + categoryCount from
err.message string. T6 sanitizer always emits "high-severity" literal in
err.message regardless of whether classifier said 'high' or 'critical'.
Audit row records severity: null — loses high-vs-critical distinction.
**Trigger**: Plan 02-03 T11, 2026-05-22.
**Fix**: Add context?: Record<string, unknown> field to AppError shape in
src/lib/errors.ts. Refactor T6 to set structured context with severity,
categoryCount, markerCount. Refactor T11 to read from err.context directly.
**Priority**: Polish — markerCount + categoryCount captured correctly;
only severity literal is lost. Audit fidelity degraded but not broken.

## P4.5-POLISH-11: ConflictResolver override path doesn't archive rejected_alternatives
**Symptom**: When founder picks custom override, handleResolveConflict in
confirmation-form.tsx stores the override entry verbatim with no
rejected_alternatives populated. Audit row loses the candidates the founder
saw and rejected.
**Trigger**: Plan 02-03 T13 e2e authoring, 2026-05-22 — surfaces at test
activation time (Phase 4.5).
**Fix**: Patch handleResolveConflict so override path also archives both
extractor candidates as rejected_alternatives. Form-side change in
confirmation-form.tsx.
**Priority**: Polish — audit fidelity on override path is degraded but the
canonical chosen value + scalar are correct. T13 e2e currently asserts
rejected_alternatives.length === 2; activation needs either this fix OR
the assertion softened.

## P4.5-POLISH-12: Codex T15 MEDIUM findings deferred from Phase 2 scope
**Triggered**: Codex review T15, Plan 02-03, 2026-05-22.
**Deferrals (rationale: attack surface not exposed in Phase 2 MVP)**:
- M2: LLM03 tool-use injection markers — Phase 5 voice agent dependency
- M3: LLM04 training-data/memory-poisoning markers — no memory-write surface in Phase 2
- M4: LLM05 output-handling probes (<script>, SQL) — Phase 2 output is structured JSON via Zod, no free-form rendering
- M5: Model-DoS regex patterns (already mitigated via MAX_PASTE_CHARS + EXTRACTOR_MAX_TOKENS caps; no further work needed)
- M6: Multi-marker escalation false-positives on benign 'developer mode' phrasing — needs design partner data to assess frequency
- L1: Founder-self exemption is global (founder email preserved in third-party prose) — behavior change requires UX call

**Action**: Re-evaluate when Phase 5 voice/tool features ship. M5+L1 may stay
permanent.
