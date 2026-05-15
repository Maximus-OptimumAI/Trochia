# Security Follow-Ups

Tracking deferred security work. Each entry has a status, exploit-surface assessment, mitigation, and retry trigger. Investor / auditor / supply-chain scan reviewers should treat this as the canonical record of risk-evaluation, not oversight.

---

## Deferred: drizzle-orm 0.45.x upgrade (GHSA-gpj5-g38j-94v9)

**Status:** Deferred. Retry when drizzle-orm 0.45.3+ or 1.0 stable ships.

**CVE:** GHSA-gpj5-g38j-94v9 — HIGH severity, SQL injection via dynamic identifiers in drizzle-orm <0.45.0. Also affects drizzle-kit.

**Affected version in repo:** drizzle-orm@0.44.7, drizzle-kit (matching).

**Phase 1 exploit surface:** Zero. No user-controlled identifier paths reach the query builder anywhere in Phase 1. All sortBy/filterBy values are static enum literals or hardcoded column references. The CVE requires user-controlled column/table/schema names — none of those surfaces exist in Phase 1.

**Why deferred:** Drizzle 0.45.2 changes `db.transaction(async (tx) => ...)` rollback semantics in a way that breaks PR-3's claim-after-side-effect invariant. CI run #10 on fix/01-07-drizzle-orm-0.45 showed 4 failures in tests/billing/stripe-event-processing.test.ts — the transaction committed partial writes when the inner callback threw. This breaks Stripe webhook idempotency: a thrown side-effect would leave processed_stripe_events claiming success, causing Stripe to skip retries and dropping the failed effect permanently. Worse outcome than the CVE itself.

**Mitigation in Phase 1:** Keep all column references static. No dynamic identifier paths reach the query builder. Auditors running Snyk / Dependabot / GitHub supply-chain scans should reference this entry as proof of evaluated-and-deferred status.

**Phase 2 HARD constraint:** Phase 2 ships dynamic sortBy/filterBy from req.body. The CVE becomes exploit-real at that point. EITHER (a) drizzle-orm must be upgraded past 0.45.x before Phase 2 surfaces those code paths, OR (b) Phase 2 must enforce enum-allowlists so no user-controlled column names ever reach the query builder. One of these must happen before Phase 2 ships. Non-negotiable.

**Retry trigger:** When drizzle-orm 0.45.3+ is released, re-test against PR-3's suite (tests/billing/stripe-event-processing.test.ts). If transaction-rollback regression is fixed, bump. If not, retry on 1.0 stable. Reopen as new PR (do not reuse fix/01-07-drizzle-orm-0.45 branch name).

**Closed PR reference:** Maximus-OptimumAI/Trochia#4 (closed, not merged).