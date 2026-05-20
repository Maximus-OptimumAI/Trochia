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
