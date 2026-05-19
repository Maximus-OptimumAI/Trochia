# Trochia AI — Phase 4.5 ROADMAP Appendix (Vibe Coder Checklist Closure)

**Date**: 2026-05-16
**Status**: Appendix patch to `docs/Trochia_AI_Phase_4_5_ROADMAP_v1.md`
**Purpose**: Close the 7 gaps identified when auditing the vibe-coder pre-launch checklist against the existing 21-ticket Phase 4.5 spec. Adds 2 new SEC tickets (SEC-08, SEC-09) and 1 Phase 5 pre-launch checklist item (incident response playbook).
**Net effect on Phase 4.5**: 21 tickets → 23 tickets. SEC count 7 → 9. Total estimated additional effort: ~12 hours (3-4 days of solo build at Conservative pace). No load-bearing risk; both new tickets fit within existing weeks.

---

## 1. Why this appendix exists

The original Phase 4.5 ROADMAP (21 tickets, committed in `c768170`) addresses most pre-launch hardening — rate limiting, security headers, MFA, session security, secret rotation, backup drill. But a security audit against an external vibe-coder pre-launch checklist surfaced 7 gaps not explicitly covered:

| Gap | Severity | Where slotted |
|---|---|---|
| G1: Terms of Service page (`/legal/terms`) | Legal exposure if anything breaks | **SEC-08** |
| G2: Cookie consent banner (EU GDPR) | Legal exposure for EU users | **SEC-08** |
| G3: GDPR data deletion verification (right to erasure) | Legal exposure (GDPR Article 17) | **SEC-08** |
| G4: Formal OWASP Top 10 audit step | Defense-in-depth blind spot | **SEC-09** |
| G5: XSS test cases on user-controlled inputs (decks, knowledge packs) | High — Pitch Lab consumes uploaded files | **SEC-09** |
| G6: Bot protection on sign-up + Opus endpoints | API cost blowup + spam signups | **SEC-09** |
| G7: Incident response playbook | Operational readiness | **Phase 5 pre-launch checklist** |

The two new SEC tickets pull G1-G6 into Phase 4.5 (hardening before design partners touch prod). G7 lives in Phase 5 since it's an operational doc keyed to launch readiness, not a code change.

---

## 2. SEC-08 — Trust surface: ToS, Cookie Consent, GDPR Deletion

**Goal**: A founder visiting Trochia from the EU sees a compliant cookie consent banner, can read clear Terms of Service before they sign, and can exercise their GDPR right-to-erasure end-to-end from a single button — all visibly working before any design partner is onboarded.

**Scope** (this ticket only):
- Add `/legal/terms` route to the marketing site with a Trochia-specific Terms of Service draft (LLM-drafted, founder-reviewed before ship, lawyer review deferred to Phase 5)
- Add cookie consent banner that fires on first visit, blocks non-essential cookies (analytics, marketing) until accept, and persists choice in localStorage
- Verify the existing `src/modules/data-rights/export.ts` has a deletion counterpart; if not, build `src/modules/data-rights/delete.ts` that cascades a tenant's data across `accounts`, `processed_stripe_events`, `platform_events` (Phase 4.5 OBS-01), and any other tenant-scoped table, with a 14-day soft-delete grace period (real deletion via Inngest job after 14d)
- Wire deletion to a user-facing button on the account settings page that requires re-auth (Supabase `reauthenticate` flow) and types-the-account-name confirmation
- Add a `data_deletion_requests` table with `requested_at`, `executes_at`, `cancelled_at` columns
- Inngest job `data-deletion.execute` that runs the cascade after the grace period

**Out of scope** (deferred):
- Granular GDPR data export schemas beyond the existing `export.ts` (Phase 5 polish)
- Cookie consent integration with a third-party CMP (OneTrust, Cookiebot) — manual implementation for MVP
- Lawyer-reviewed ToS — Phase 5 (current ToS is "draft, subject to legal review" with a visible disclaimer)
- DPA (Data Processing Agreement) generator — already exists via `scripts/generate-dpa-pdf.ts`, untouched here

**Implementation outline**:
1. Draft Terms of Service markdown (LLM-generated from Trochia's known data flows + the existing privacy policy structure). Review pass before commit.
2. Create `src/app/legal/terms/page.tsx` rendering the markdown with the same chrome as `/legal/privacy`.
3. Add `<CookieConsentBanner />` component at root layout. Use a simple custom implementation (no library) — banner with Accept All / Reject Non-Essential / Customize. Store choice in `localStorage` under `trochia_cookie_consent`. Block Amplitude / analytics scripts until accepted.
4. Audit `src/modules/data-rights/export.ts` to confirm what's already there. If deletion module is missing, scaffold `src/modules/data-rights/delete.ts` with a `requestDeletion(userId)` function that schedules an Inngest job.
5. Migration `0005_data_deletion_requests.sql` with the new table + RLS policy `owner_self_delete_request`.
6. Inngest function `data-deletion.execute` triggered by event `tenant.delete.scheduled`, runs the cascade with a transaction wrapper.
7. Settings page button: "Delete my account" → confirmation modal → reauthenticate → name-type confirmation → `requestDeletion` call → 14-day grace period notice with "Cancel deletion" option visible during grace period.
8. Tests: vitest for the `requestDeletion` flow with grace period assertions; integration test confirming cascade deletes every tenant-scoped row.

**Acceptance criteria**:
- `/legal/terms` renders cleanly and is linked from the footer + sign-up page
- First-time visitor sees the cookie consent banner before any analytics/marketing scripts load
- Banner choice persists across reloads
- Account settings shows a "Delete my account" button; clicking it requires reauth + name confirmation
- After confirmation, the user sees a 14-day countdown with a "Cancel" option
- After 14 days, the Inngest job runs and the tenant's rows are gone from all tables
- During grace period, cancelling returns the account to active state with no data loss
- Two-user integration test confirms tenant A's deletion does NOT touch tenant B's data

**Files modified** (estimated):
- `src/app/legal/terms/page.tsx` (new)
- `src/app/legal/terms/content.mdx` or `.md` (new — the ToS body)
- `src/components/CookieConsentBanner.tsx` (new)
- `src/app/layout.tsx` (mount banner)
- `src/modules/data-rights/delete.ts` (new)
- `src/db/migrations/0005_data_deletion_requests.sql` (new)
- `src/db/schema/data-rights.ts` (new table)
- `src/inngest/functions/data-deletion.ts` (new)
- `src/app/app/settings/delete-account/page.tsx` (new)
- Tests under `tests/data-rights/` (new)

**Effort estimate**: 6 hours (1 day at Conservative pace)
**Dependencies**: OBS-01 (`platform_events` table — for logging deletion events). Buildable in parallel with most other tickets.
**Risk cut**: NO. Legal compliance for EU users. Cannot ship MVP soft launch (Phase 5) without this.

---

## 3. SEC-09 — Abuse hardening: CAPTCHA, OWASP audit, XSS test surface

**Goal**: The sign-up surface and Opus-hitting endpoints are protected from bot abuse with a real CAPTCHA, the codebase has a measured OWASP Top 10 audit on file with all HIGH findings remediated, and Pitch Lab's user-controlled deck/PPTX inputs have an explicit XSS test suite proving stored XSS is impossible from any parsed slide text.

**Scope** (this ticket only):
- Add Cloudflare Turnstile (or hCaptcha as fallback) to the sign-up page and on the AI-call endpoints that gate Opus (deck-review, ambient Q&A on anonymous routes if any, future Phase 4 outreach drafter)
- Run `/gsd-secure-phase` audit against the current `phase-1-foundation` branch + Phase 4.5 WIP, surface OWASP Top 10 findings, remediate any HIGH or CRITICAL items inline as part of this ticket
- Add explicit XSS test cases for: deck upload (LlamaParse-parsed text rendered in review dashboard), knowledge pack import (paste-tier content rendered in confirmation UI), Q&A answer rendering (Opus output rendered in the sidebar)
- Add a lint rule banning `dangerouslySetInnerHTML` outside an allowlist of audited components

**Out of scope** (deferred):
- Per-user CAPTCHA tuning (Turnstile's risk score thresholds — defaults are fine for MVP)
- Burp Suite-grade pentest (Phase 5 or Phase 11 SOC 2 prep)
- WAF rules at Vercel edge (Vercel Pro feature, not on Hobby tier)
- Subresource Integrity hashes for CDN scripts (Phase 10 polish)

**Implementation outline**:
1. Choose Turnstile (free, privacy-friendly, no user friction) vs hCaptcha. Default: Turnstile. Add Cloudflare site key + secret to Vercel env vars.
2. Add `<TurnstileWidget />` component invisible mode on the sign-up page; verify on the server in the Supabase Auth callback before completing sign-up.
3. Add Turnstile token requirement to AI-call endpoints (`/api/ai/deck-review`, `/api/ai/qa` for anonymous routes, etc.) — token validated server-side via Cloudflare's siteverify API.
4. Run `/gsd-secure-phase` against current branch. Surfaces are logged to `.codex/reviews/<timestamp>-vibe-coder-owasp.md`. Triage HIGH/CRITICAL findings, remediate in this ticket, defer MEDIUM/LOW to Phase 4.6.
5. XSS test cases under `tests/security/xss.spec.ts`:
   - Inject `<script>alert(1)</script>` into deck text via a fixture deck → assert it renders as text, not script
   - Inject malicious HTML into knowledge pack paste → assert escaped on display
   - Inject prompt-injection-shaped XSS payload into deck → assert structural-validation drops it before storage
6. ESLint rule (custom or via `eslint-plugin-react`'s `no-danger`) banning `dangerouslySetInnerHTML` outside an audited allowlist file `src/lib/security/html-allowlist.ts`.
7. Tests: vitest for Turnstile verification flow (mock the siteverify endpoint); the XSS suite above; one playwright e2e confirming the sign-up flow blocks without a Turnstile token.

**Acceptance criteria**:
- Sign-up without a valid Turnstile token returns 403 with a clear error message
- AI-call endpoints without a valid Turnstile token return 403
- A scripted bot attempting 1,000 signups in a minute is blocked
- `/gsd-secure-phase` audit report exists in `.codex/reviews/` with all HIGH/CRITICAL findings closed
- XSS test suite passes (5+ cases covering deck, knowledge pack, Q&A surfaces)
- ESLint blocks any new `dangerouslySetInnerHTML` usage outside the allowlist
- Two-user test: tenant A's malicious deck upload cannot inject script into tenant B's session

**Files modified** (estimated):
- `src/components/TurnstileWidget.tsx` (new)
- `src/lib/security/turnstile.ts` (new — server-side verification)
- `src/app/auth/callback/route.ts` (PR-6 modified; add Turnstile verify gate)
- `src/app/api/ai/**` (gate Opus-hitting routes)
- `src/lib/security/html-allowlist.ts` (new)
- `eslint.config.mjs` (add `no-danger` rule with allowlist exception)
- `tests/security/xss.spec.ts` (new)
- `tests/auth/turnstile-gate.test.ts` (new)
- `.codex/reviews/<timestamp>-vibe-coder-owasp.md` (audit artifact)

**Effort estimate**: 6 hours (1 day at Conservative pace, longer if OWASP audit surfaces unexpected HIGH findings)
**Dependencies**: SEC-01 (rate limiting — defense in depth with CAPTCHA), OBS-01 (`platform_events` for logging blocked attempts). Best done after SEC-01 lands.
**Risk cut**: PARTIAL. Cannot cut Turnstile on sign-up (cost protection on Opus is critical). CAN defer XSS test suite to Phase 4.6 if Week 4 is tight (the structural-validation guard in Pitch Lab already drops injected content; XSS tests are belt-and-suspenders). OWASP audit step must stay — it's a 1-hour `/gsd-secure-phase` run.

---

## 4. Phase 5 pre-launch checklist addendum — Incident Response Playbook

This is **NOT** a Phase 4.5 ticket. It's a Phase 5 pre-launch deliverable — a markdown document, not a code change. Recorded here so it doesn't fall through cracks when Phase 5 planning begins.

**Deliverable**: `docs/INCIDENT_PLAYBOOK.md`

**Scope**: A single-page playbook covering the 5 most likely incident scenarios for an early-stage Trochia, with concrete response steps for each:

| Scenario | Response steps |
|---|---|
| User uploads illegal content (CSAM, malware, etc.) | (1) Auto-flag via Inngest scan if implemented; (2) immediate tenant soft-suspend via ADM-07; (3) preserve evidence; (4) NCMEC report if CSAM (legal obligation); (5) document in `tasks/incidents.md` |
| Mass-signup abuse (bot signups, fake accounts) | (1) Increase Turnstile difficulty via Cloudflare dashboard; (2) tighten signup rate limit (SEC-01); (3) bulk soft-suspend via ADM-07; (4) post-mortem in `tasks/incidents.md` |
| API cost blowup (someone bypassing token caps) | (1) Hard-pause AI calls via feature flag (added in this playbook); (2) check Stripe billing portal for anomalous charges; (3) verify SEC-02 token caps fired correctly; (4) refund affected users via Stripe |
| Secret leak (API key in commit, etc.) | (1) Rotate secret per SEC-06 runbook; (2) revoke old key on provider side; (3) audit `platform_events` for usage during exposure window; (4) notify affected users if PII exposed |
| Supabase region outage | (1) Confirm Supabase status page; (2) flip `tenant.region` for affected tenants if multi-region (Phase 8); (3) communicate via status page (OBS-06); (4) Better Stack pager auto-fires |

**Effort estimate**: 1 hour (markdown drafting + founder review)
**Owner**: Martins (decides response policies for his app)
**Timing**: First week of Phase 5 planning, before design partners onboard

---

## 5. Cross-cut updates required in `docs/Trochia_AI_Phase_4_5_ROADMAP_v1.md`

When merging this appendix into the canonical ROADMAP doc, the following sections of the existing doc need updates:

### 5.1 §6 "Full specs for all 21 tickets" → "Full specs for all 23 tickets"
Insert SEC-08 and SEC-09 spec blocks (sections 2 and 3 of this appendix) immediately after the existing SEC-07 spec.

### 5.2 "21 tickets at a glance" subsection
Change:
```
**SEC (Security Hardening) — 7**:
- SEC-01: Rate limiting on Opus/auth/outreach routes (`@upstash/ratelimit`)
- SEC-02: Per-tenant monthly AI token cap (tier-mapped, see decision #1)
- SEC-03: TOTP MFA for super-admin (pulled forward from Phase 8 for admins only)
- SEC-04: Security headers (CSP, HSTS, X-Frame-Options, Referrer-Policy, Permissions-Policy)
- SEC-05: Session security (24h access / 7d refresh, rotation, sign-out hooks)
- SEC-06: Secret rotation runbook + dry run
- SEC-07: Backup/restore drill (Supabase PITR)
```
To:
```
**SEC (Security Hardening) — 9**:
- SEC-01: Rate limiting on Opus/auth/outreach routes (`@upstash/ratelimit`)
- SEC-02: Per-tenant monthly AI token cap (tier-mapped, see decision #1)
- SEC-03: TOTP MFA for super-admin (pulled forward from Phase 8 for admins only)
- SEC-04: Security headers (CSP, HSTS, X-Frame-Options, Referrer-Policy, Permissions-Policy)
- SEC-05: Session security (24h access / 7d refresh, rotation, sign-out hooks)
- SEC-06: Secret rotation runbook + dry run
- SEC-07: Backup/restore drill (Supabase PITR)
- SEC-08: Trust surface — ToS, cookie consent, GDPR deletion (vibe-coder appendix 2026-05-16)
- SEC-09: Abuse hardening — CAPTCHA, OWASP audit, XSS test surface (vibe-coder appendix 2026-05-16)
```

Total ticket count line updates: "21 tickets" → "23 tickets" everywhere it appears (intro, top of §6, etc.)

### 5.3 §7 "Recommended internal build sequence" — update Week 2 and Week 4
Change:
```
| 2 | OBS-03 + OBS-04 + SEC-04 + SEC-05 | Trust + cheap wins — error UX + alerts + headers + session policy |
| 4 | SEC-01 + SEC-02 + ADM-06 + ADM-07 + ADM-08 + OBS-06 + SEC-06 + SEC-07 | Pre-launch hardening + ops + drills |
```
To:
```
| 2 | OBS-03 + OBS-04 + SEC-04 + SEC-05 + SEC-08 | Trust + cheap wins — error UX + alerts + headers + session policy + ToS/cookie/deletion |
| 4 | SEC-01 + SEC-02 + SEC-09 + ADM-06 + ADM-07 + ADM-08 + OBS-06 + SEC-06 + SEC-07 | Pre-launch hardening + ops + drills + CAPTCHA/OWASP/XSS |
```

### 5.4 §10 "Risk-cut order if Clockvest workload bites mid-phase"
Insert two new entries between current #3 and #4:
```
1. SEC-07 (backup drill) → Phase 4.6
2. SEC-06 (secret rotation drill) → Phase 4.6
3. ADM-06 (external embeds) → Phase 4.6
4. SEC-09 XSS test suite portion only (keep CAPTCHA + OWASP audit) → Phase 4.6
5. OBS-06 public status page (keep the pager only)
```
And ADD to the "Do NOT cut" list:
```
**Do NOT cut**: OBS-01, ADM-01..05, SEC-01, SEC-02, SEC-03, SEC-04, SEC-05, SEC-08, SEC-09 CAPTCHA + OWASP portions, OBS-03, OBS-04, OBS-05. Load-bearing for "design partners can safely hit prod."
```

Rationale: SEC-08 cannot be cut (legal compliance). SEC-09's CAPTCHA portion cannot be cut (API cost protection). SEC-09's XSS test suite CAN be cut (structural validation already drops injected content; tests are belt-and-suspenders).

### 5.5 §8 "Phase 4.5 → Phase 5 hand-off contract"
Add two checkmark items to the 9 → 11 required items list:
```
- [ ] SEC-08 shipped: /legal/terms live, cookie consent banner live, GDPR deletion end-to-end tested
- [ ] SEC-09 shipped: Turnstile gating sign-up + Opus endpoints, /gsd-secure-phase audit clean, XSS test suite passing
```

---

## 6. Decision log — additions to the Phase 4.5 decision table

| # | Decision | Rationale |
|---|---|---|
| 5 | CAPTCHA provider = Cloudflare Turnstile (not hCaptcha or reCAPTCHA) | Free; no user friction (invisible mode); privacy-friendly (no Google data sharing); already an Anthropic-recommended stack choice |
| 6 | ToS lawyer review deferred from Phase 4.5 to Phase 5 | MVP soft launch goes to 25 design partners (small N, founder-known); lawyer review before Phase 10 public launch. ToS draft includes "subject to legal review" disclaimer. |
| 7 | GDPR deletion grace period = 14 days | Industry standard (matches Supabase's own 14-day soft-delete pattern); long enough to undo accidental clicks; short enough to satisfy GDPR Article 17 (no fixed deadline but "without undue delay") |
| 8 | XSS belt-and-suspenders: structural validation (Pitch Lab) + explicit test suite (SEC-09) + ESLint dangerouslySetInnerHTML block | Pitch Lab's structural validation already drops fabricated content; tests prove it; lint prevents regressions |

---

## 7. Effort summary

| Ticket | Effort | Slot |
|---|---|---|
| SEC-08 | 6 hours | Week 2 of Phase 4.5 build |
| SEC-09 | 6 hours | Week 4 of Phase 4.5 build |
| **Total added to Phase 4.5** | **~12 hours (~1.5 solo working days at Conservative pace)** | |
| Phase 5 Incident Playbook | 1 hour | First week of Phase 5 planning |

**Net impact on Phase 4.5 4-week budget**: ~1.5 day addition. Original 4-week Conservative pace had ~2 days slack per week for the dual-company workload risk. Adding 1.5 days across 4 weeks (0.375 days/week) consumes ~20% of that slack. Acceptable.

**Net impact on Phase 5 readiness**: STRENGTHENED. The vibe-coder checklist now has zero unaddressed items by the time design partners touch prod.

---

## 8. How to apply this appendix

**Option A: Merge into the canonical ROADMAP doc** (recommended)
1. Open `docs/Trochia_AI_Phase_4_5_ROADMAP_v1.md` in Cursor
2. Apply the cross-cut updates in §5 above (5 sections to update)
3. Append §2 (SEC-08 spec) and §3 (SEC-09 spec) into the existing §6 "Full specs" block
4. Append §6 (decision log additions) to the existing decision table
5. Update ticket count "21" → "23" everywhere it appears
6. Commit: `docs(phase-4.5): SEC-08 + SEC-09 from vibe-coder checklist audit`
7. Push to `phase-1-foundation`

**Option B: Keep as paired appendix file**
1. Save this file as `docs/Trochia_AI_Phase_4_5_ROADMAP_v1_APPENDIX_2026-05-16.md`
2. Add a reference at the top of the canonical ROADMAP: "See APPENDIX_2026-05-16 for SEC-08, SEC-09 spec"
3. Commit both files
4. Push to `phase-1-foundation`

Either works. Option A is cleaner long-term (one source of truth); Option B preserves the original 2026-05-15 spec history more visibly.

---

## Document control

- **Author**: Claude (claude.ai chat, 2026-05-16, in response to vibe-coder checklist audit request)
- **Source**: External "Pre-launch checklist — Ship products, not liabilities" PDF, audited against existing Phase 4.5 ROADMAP
- **For**: Martins (review + merge), future-Claude in Phase 4.5 build session
- **Confidence**: HIGH on gap analysis (cross-checked all 20 vibe-coder items against current Phase 4.5 spec + Phase 1 shipped code), HIGH on ticket scope (each new ticket is <500 LOC like the originals), MEDIUM on effort estimates (Conservative pace assumed; could move faster if Phase 4.5 build catches stride)
- **Next**: Merge into canonical ROADMAP doc; resume Phase 1 closure dashboards (step 6b)
