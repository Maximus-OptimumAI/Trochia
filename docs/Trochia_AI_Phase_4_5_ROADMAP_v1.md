# Trochia AI — Phase 4.5 ROADMAP Insertion (v1)

**Document type**: Canonical ROADMAP.md patch + ticket specs at parity depth with Phases 1-11.
**Slot**: Between Phase 4 (Investor Pipeline) and Phase 5 (Live Raise / MVP soft-launch checkpoint).
**Rationale**: Phase 5 is the explicit go/no-go gate where 25 paying design partners onboard onto prod. Phase 4.5 is the hardening pass that must complete before that gate — admin dashboard so the founder can see what's happening, security baseline above Phase 1's defaults, and an observability layer that turns Sentry/Langfuse/Amplitude silos into one agent-searchable event log.
**Ticket count**: 21 (ADM-01..08, SEC-01..07, OBS-01..06).
**Estimated calendar**: 4 weeks at Conservative solo-Martins pace.
**Authors**: Strategy lock — Martins. Plan production — Chief of Staff.

---

## How to apply this to `ROADMAP.md`

Five patches, top-to-bottom of the file:

1. **Insert one bullet** into the "Phases" list (line 19, between Phase 4 and Phase 5).
2. **Insert the full phase entry** into the "Phase Details" section (between Phase 4 detail block at line 81 and Phase 5 detail block at line 83).
3. **Replace the Execution Order line** at line 183 to include 4.5.
4. **Insert one row** into the Progress table at line 191.
5. **Append four bullets** to the Cross-Cutting Enforcement section.

Each patch is reproduced verbatim in §6 below. Apply in order; no other lines change.

---

## 1. New bullet for the "Phases" list

Insert as new bullet between Phase 4 and Phase 5:

```markdown
- [ ] **Phase 4.5: Admin Dashboard + Security Hardening + Observability — INSERTED** - Super-admin dashboard with tenant directory + AI cost view + support actions; security hardening above Phase 1 baseline (rate limiting, per-tenant token caps, admin MFA, security headers, session policy, secret rotation drill, backup-restore drill); observability layer turning Sentry/Langfuse/Amplitude silos into one agent-searchable `platform_events` log + trust-preserving error UX. **Mandatory gate before Phase 5 design partners reach prod.**
```

---

## 2. Phase 4.5 detail block (paste-ready)

Insert into the "Phase Details" section, between the Phase 4 block and the Phase 5 block:

```markdown
### Phase 4.5: Admin Dashboard + Security Hardening + Observability — INSERTED
**Goal**: Before exposing the product to 25 paying design partners in Phase 5, every operational surface a solo founder needs to safely run prod is built and verified — a super-admin dashboard with tenant directory + AI cost view + support actions, security hardening above Phase 1's baseline (rate limiting, per-tenant token caps, MFA for admins, security headers, session policy, backup-restore drill), and an observability layer that turns Sentry/Langfuse/Amplitude silos into one agent-searchable event log so Claude Code / Codex can debug from real history. **No design partner traffic reaches prod until Phase 4.5 ships.**
**Mode:** mvp
**Depends on**: Phase 4 (Investor Pipeline complete — admin dashboard needs real tenants/data to be meaningful)
**Requirements**: ADM-01, ADM-02, ADM-03, ADM-04, ADM-05, ADM-06, ADM-07, ADM-08, SEC-01, SEC-02, SEC-03, SEC-04, SEC-05, SEC-06, SEC-07, OBS-01, OBS-02, OBS-03, OBS-04, OBS-05, OBS-06
**Success Criteria** (what must be TRUE):
  1. A super-admin (MFA-enforced via `SUPER_ADMIN_USER_IDS` env-var list) lands on `/admin`, sees the full tenant directory, drills into any tenant, views their MTD AI cost / token usage against their tier cap / last 50 platform events / Sentry issues / Langfuse traces / Stripe state — all from one surface in <3 clicks, with a persistent "you are acting as admin" banner
  2. Rate limiting is live on Opus / auth / outreach routes via `@upstash/ratelimit` tRPC middleware (10 req/min per user on Opus-backed routes; 5/min on outreach drafter; 100/15-min on auth) and per-tenant monthly AI token caps fire 50%/80%/100% alerts with tier-aware soft-suspend at 100% (Pre-Raise 100K in / 50K out, Active Raise 1M / 500K, Close Mode 5M / 2.5M, Alumni 50K / 25K); one runaway-cost test on a sandbox tenant proves the cap holds
  3. Every meaningful platform action (tenant signup, deck upload, brief generated, follow-up sent, billing event, error, admin action) writes a typed row to `platform_events`; a super-admin can query the last 30 days by tenant/event-type/time-range; an admin-only `/api/admin/events/search` endpoint returns scoped results so Claude Code / Codex agents can pull real history into debug sessions
  4. Every user-facing error path returns a copy-reviewed, trust-preserving message via the `TrochiaError` → message mapping — zero bare 500/400/"Internal Server Error" surfaces in the product even when Anthropic/Stripe/Supabase/Inngest fail; Sentry still receives the full technical trace; a bug spotter fires Slack DMs on new error classes + error-rate spikes (>2σ over 1h baseline) + p95 latency regressions on top-10 routes
  5. Security baseline is verified: CSP/HSTS/X-Frame-Options/Referrer-Policy/Permissions-Policy headers active and enforced (CSP started in report-only mode for 1 week then enforced); idle timeout (24h access / 7d refresh, down from 30d) + refresh-token rotation + sign-out-on-password-change + sign-out-on-tenant-suspension live; TOTP MFA enforced for super-admins; secret rotation runbook exists at `docs/runbooks/secret-rotation.md` and one full rotation drill is recorded; one Supabase PITR restore-to-staging drill is recorded with RTO/RPO documented; off-platform uptime monitoring is live with page-to-founder-phone
**Plans**: TBD
**UI hint**: yes
```

---

## 3. Updated Execution Order line

Replace line 183:

```markdown
Phases execute in numeric order: 1 → 2 → 3 → 4 → 4.5 → 5 → 6 → 7 → 8 → 9 → 10 → 11
```

---

## 4. New Progress table row

Insert between the Phase 4 row and Phase 5 row:

```markdown
| 4.5. Admin Dashboard + Security Hardening + Observability (INSERTED) | 0/TBD | Not started | - |
```

---

## 5. Cross-Cutting Enforcement additions

Append to the end of the existing list (after the "Encryption at rest..." bullet at line 215):

```markdown
- Every Phase 5+ mutation handler MUST call `logEvent()` to write a `platform_events` row for its meaningful state change (enforced by code review + lint rule on tRPC mutation procedures)
- Every Phase 5+ user-facing error path MUST map through `TrochiaError` (lint rule: no bare `throw new Error()` in tRPC procedures or route handlers; bare errors trip CI)
- Every Phase 5+ Opus-backed AI route MUST chain the `@upstash/ratelimit` middleware (lint rule on the tRPC procedure chain)
- Every Phase 5+ tenant-scoped mutation MUST be visible to the admin dashboard (audited via the OBS-01 helper presence in the handler)
```

---

## 6. Full 21-Ticket Specs

Each ticket is sized for one PR (typically <500 LOC + tests). Order within each track is intentional — see §7 for the recommended cross-track build sequence.

### ADM — Admin Dashboard (8 tickets)

#### ADM-01: Super-admin role + RLS bypass policy

**Scope**:
- Add `SUPER_ADMIN_USER_IDS` env var (CSV of Supabase auth user UUIDs).
- New Postgres function `is_super_admin(user_id uuid)` returns true if the user matches the env-injected list (injected at app start via a migration parameter or a `set_config('app.super_admins', ...)` call from server startup).
- New RLS policy `super_admin_read_all` on tenant-scoped tables (`accounts`, `users`, `subscriptions`, `platform_events`, future tables): `FOR SELECT TO authenticated USING (is_super_admin(auth.uid()))`. **SELECT only** — writes still go through `tenant_isolation` (super-admin writes use service-role in well-audited paths only).
- Two-user RLS test extended: super-admin reads any tenant's accounts; non-admin still cannot.

**Files** (estimate): `src/db/migrations/0005_super_admin.sql`, `src/db/rls.ts`, `src/lib/admin.ts` (helper), `tests/rls/super-admin.test.ts`.

**Acceptance**: super-admin with stale tenant claim reads all tenants' accounts; non-admin with stale claim reads only own (PR-6's `owner_self_read` semantics unchanged for non-admins).

---

#### ADM-02: Admin dashboard shell at `/admin/*`

**Scope**:
- New route group `app/admin/*` gated in `src/proxy.ts`: requires authenticated + super-admin + MFA-verified session (MFA wiring from SEC-03).
- Shared layout with persistent red banner "You are acting as ADMIN — actions are logged" and a sticky `Acting as: <email>` indicator.
- Nav for the other ADM surfaces (placeholder routes returning 501 until each ticket lands).
- Never indexed (`X-Robots-Tag: noindex, nofollow` header on the entire group).
- Every admin pageview writes `platform_events` row with `event_type='admin.pageview'`.

**Files**: `src/app/admin/layout.tsx`, `src/app/admin/page.tsx`, `src/proxy.ts` (admin gate), `src/middleware/admin-mfa.ts`.

**Acceptance**: non-admin user gets 404 (not 403 — don't reveal the surface exists); admin without MFA gets MFA challenge; admin with MFA sees the shell + banner.

---

#### ADM-03: Tenant directory + drill-down

**Scope**:
- `/admin/tenants` — searchable, sortable, paginated table of all tenants: `{name, primary_email, plan_tier, status, signup_date, last_active_at, mrr_usd}`.
- Click row → `/admin/tenants/[id]` with detail panes:
  - Identity (account name, owner email, signup, plan, status)
  - Usage (last 30 days: deck reviews, briefs, follow-ups, signups for waitlist)
  - AI cost MTD (token totals by model from OBS-01 events)
  - Last 50 `platform_events`
  - Deep-links to Sentry / Langfuse / Stripe filtered to this tenant
- Search: name, email, account id. Filters: plan, status, region.
- All queries go through super-admin RLS bypass (ADM-01); no service-role.

**Files**: `src/app/admin/tenants/page.tsx`, `src/app/admin/tenants/[id]/page.tsx`, `src/server/routers/admin/tenants.ts`.

**Acceptance**: 100 tenants render in <1s; drill-down loads in <2s; CSV export of full directory works.

---

#### ADM-04: AI cost & token dashboard

**Scope**:
- `/admin/ai-cost` — global + per-tenant view.
- Global: rolling 7-day stacked-area chart by model (Opus / Sonnet / Haiku), top 10 spenders, anomaly callout (`>3σ` over baseline), cache-hit rate, $/active-user.
- Per-tenant (drill-down): MTD tokens-in / tokens-out by model + Inngest job, current % of cap (from SEC-02), historical trend, time-to-cap projection.
- Data source: `platform_events` rows of type `ai.call_completed` (written by `ai/client.ts`).

**Files**: `src/app/admin/ai-cost/page.tsx`, `src/server/routers/admin/cost.ts`, `src/lib/ai/cost-aggregator.ts`.

**Acceptance**: shows real numbers from at least one week of production data after Phase 4 ships; matches Langfuse totals within ±2%.

---

#### ADM-05: Audit log viewer

**Scope**:
- `/admin/events` — filterable view of `platform_events` (OBS-01).
- Filters: tenant, user, event_type (multi-select from enum), severity, time range, free-text search on payload JSONB.
- Each row expandable to show full JSONB payload + linked entity (deck, brief, billing event, etc.).
- Export filtered set to CSV.
- Default view: last 24h, severity >= info.

**Files**: `src/app/admin/events/page.tsx`, `src/server/routers/admin/events.ts`.

**Acceptance**: query of last 30 days for one tenant returns in <500ms (relies on OBS-01's indexes); CSV export of 10K rows works.

---

#### ADM-06: External-tool embeds

**Scope**:
- `/admin/tenants/[id]` adds deep-link buttons to:
  - Sentry: pre-filtered by `tenant_id` tag
  - Langfuse: pre-filtered by `tenant_id` user property
  - Amplitude: cohort view of just this tenant's users
  - Stripe Customer Portal (admin view of the customer record)
  - Supabase Auth admin view of the user
- All open in new tab. No iframe attempts (Sentry/Stripe block iframing).
- Each click writes `platform_events` row `admin.external_link_followed`.

**Files**: `src/app/admin/tenants/[id]/external-links.tsx`, `src/lib/admin/external-urls.ts`.

**Acceptance**: every link opens the correct vendor-side view for the specific tenant in <2 clicks.

---

#### ADM-07: Tenant support actions

**Scope**: Five buttons on tenant detail page, each gated by typed confirmation:

| Action | What it does | Reversibility |
|---|---|---|
| **Soft-suspend** | Set `account.suspended_at`; proxy.ts rejects traffic with a banner pointing at billing/support | Reversible (clear timestamp) |
| **Plan-change** | Force a tier change via Stripe Subscription API; updates entitlements immediately | Reversible (set back) |
| **Issue refund** | Stripe refund API on most recent invoice; surfaces in `platform_events` | Irreversible (Stripe is) |
| **View-as (impersonation)** | Generate a short-lived (15-min) JWT for the target user; admin enters their session; banner + 15-min visible countdown; auto-eject on timeout | Auto-reversible on timeout |
| **Force re-embed** | Enqueue Inngest job to re-embed Business Memory + corpus for this tenant (debug aid) | Reversible (no data lost) |

Every action writes a `platform_events` row `admin.action.*` with full payload.

**Files**: `src/app/admin/tenants/[id]/actions.tsx`, `src/server/routers/admin/actions.ts`, `src/lib/admin/impersonation.ts`.

**Acceptance**: impersonation produces a separate audit-log row; banner is impossible to dismiss; timeout auto-ejects within 15s of expiry.

---

#### ADM-08: Inngest ops

**Scope**:
- `/admin/inngest` — failed-job list from Inngest API.
- One-click replay (single + bulk by step name).
- Threshold alert: when failed-job count > N in the last 1h, fire Slack DM (reuses OBS-04 channel).
- Per-tenant filter on the same view.

**Files**: `src/app/admin/inngest/page.tsx`, `src/server/routers/admin/inngest.ts`, `src/lib/inngest/admin-client.ts`.

**Acceptance**: a deliberately-failed sandbox job appears in the list within 30s and replays successfully.

---

### SEC — Security Hardening (7 tickets)

#### SEC-01: Rate limiting on Opus / auth / outreach routes

**Scope**:
- New tRPC middleware `withRateLimit({ key, limit, window })` using `@upstash/ratelimit`.
- Apply to:
  - **Opus-backed routes** (`pitch.review`, `live.generateBrief`, `knowledge.ask`): 10 requests / 60s / userId
  - **Outreach drafter** (`pipeline.draftEmail`): 5 / 60s / userId
  - **Auth-sensitive** (`auth.signIn`, `auth.signUp`, `auth.requestPasswordReset`): 100 / 15min / IP
- 429 responses include `Retry-After` header and a `TrochiaError` (OBS-03) so the UI shows a friendly "you're moving too fast — try again in 30s" message.
- Per-call latency overhead must stay <30ms p95 (Upstash is regional — picks the closest endpoint).
- Test: floods sandbox tenant, assertion is 429 after limit, recovery within window.

**Files**: `src/server/middleware/rate-limit.ts`, `src/server/routers/*` (chain attachment), `tests/server/rate-limit.test.ts`.

**Acceptance**: limit enforcement verified for each of the three route classes; gate green.

---

#### SEC-02: Per-tenant monthly AI token cap

**Scope**:
- New `tier_token_caps` config table (or env-driven map) with token caps per tier:

| Tier | Input tokens/mo | Output tokens/mo | Behavior at 100% |
|---|---|---|---|
| Pre-Raise | 100,000 | 50,000 | Read-only mode + upgrade prompt |
| Active Raise | 1,000,000 | 500,000 | Read-only mode + upgrade prompt |
| Close Mode | 5,000,000 | 2,500,000 | Read-only mode + upgrade prompt (likely just upgrade contact) |
| Alumni | 50,000 | 25,000 | Read-only mode + upgrade prompt back to Active Raise |

- `ai/client.ts` pre-flight check: query MTD tokens from `platform_events`, reject with `TrochiaError` if at 100%, downgrade model to Haiku if at 80% (configurable).
- Alerts: 50% (email), 80% (email + admin dashboard flag), 100% (immediate email + admin alert + read-only state).
- Soft-suspend at 100% doesn't kill access — UI still loads, founder still sees their data, only NEW AI calls are blocked. Critical for trust.

**Files**: `src/lib/ai/quota.ts`, `src/lib/ai/client.ts` (integration), `src/server/jobs/quota-monitor.ts` (Inngest cron, hourly).

**Acceptance**: sandbox tenant burns through cap; correct alerts fire at each threshold; read-only state confirmed at 100%.

---

#### SEC-03: TOTP MFA for super-admin

**Scope**:
- Force MFA enrollment on first admin login via Supabase `auth.mfa.enroll` (TOTP only — no SMS).
- After enroll, every admin session requires fresh MFA challenge (`auth.mfa.challenge`) on `/admin/*` entry.
- Session AAL2 (assurance level 2) required by ADM-02's middleware.
- Recovery codes generated at enroll; one-time downloadable; never re-displayable. Stored as bcrypt'd records.
- This is **admin-only** for Phase 4.5. Phase 8 covers user-wide MFA on its own schedule.

**Files**: `src/middleware/admin-mfa.ts`, `src/app/admin/mfa/enroll/page.tsx`, `src/lib/auth/mfa.ts`.

**Acceptance**: admin without MFA is forced to enroll before reaching any `/admin/*` route; admin with expired MFA is challenged again.

---

#### SEC-04: Security headers

**Scope**:
- Configure in `next.config.ts` via `headers()`:
  - `Content-Security-Policy` — strict, allow-list per domain (Anthropic, Supabase, Sentry, Langfuse, Amplitude, Stripe, Vercel Insights)
  - `Strict-Transport-Security` — `max-age=63072000; includeSubDomains; preload`
  - `X-Frame-Options` — `DENY`
  - `X-Content-Type-Options` — `nosniff`
  - `Referrer-Policy` — `strict-origin-when-cross-origin`
  - `Permissions-Policy` — `camera=(self), microphone=(self), geolocation=()`
- CSP starts in **`Content-Security-Policy-Report-Only`** mode for 7 days (Sentry collects violations) → review reports → fix → flip to enforce.
- Subresource Integrity (SRI) on every third-party `<script>` tag.

**Files**: `next.config.ts`, `src/lib/security/csp.ts` (generator with nonces for inline scripts if needed).

**Acceptance**: Mozilla Observatory grade A on the deployed site; no CSP violations in the last 24h before enforce-flip.

---

#### SEC-05: Session security

**Scope**:
- Reduce Supabase session lifetime: access token 24h (down from 7d default), refresh token 7d (down from 30d).
- Enable refresh-token rotation: every refresh issues a new refresh + invalidates the old.
- Force sign-out on:
  - Password change (Supabase trigger → `auth.invalidate_refresh_tokens` for that user)
  - Tenant suspension (ADM-07 action triggers token revocation for all users on the suspended account)
  - Super-admin action (admin can force-sign-out any user, audit-logged)
- Token theft mitigation: if a rotated refresh-token is presented after rotation (re-use detected), all sessions for the user are revoked + email alert sent ("we detected unusual activity, you've been signed out everywhere").

**Files**: `src/db/migrations/0007_session_policy.sql`, `src/lib/auth/session.ts`, `src/lib/auth/revocation.ts`.

**Acceptance**: password change forces re-sign-in; tenant suspension forces re-sign-in for all users on that tenant; refresh-token re-use detection works in a scripted test.

---

#### SEC-06: Secret rotation procedure + dry run

**Scope**:
- Document at `docs/runbooks/secret-rotation.md`:
  - Inventory of all secrets (Supabase service-role, Anthropic API, Stripe webhook signing, Inngest signing, Resend API, etc.)
  - Rotation cadence (90 days default; faster on suspected compromise)
  - Zero-downtime swap procedure per secret (most support overlapping keys; document Vercel env-var update flow)
- Execute one full dry run:
  - Rotate Supabase service-role key (most invasive — has the wildest blast radius)
  - Rotate Anthropic API key
  - Rotate Stripe webhook signing secret
- Record: time taken, any downtime, any caller paths that broke. Update runbook with lessons.

**Files**: `docs/runbooks/secret-rotation.md`, `docs/runbooks/secret-rotation-2026Q2-drill.md` (the dry-run record).

**Acceptance**: full rotation drill recorded with <30s of degraded service (or zero, if Vercel's overlap window works as advertised); runbook is operator-ready for emergency rotation.

---

#### SEC-07: Backup / restore drill

**Scope**:
- Verify Supabase Point-in-Time Recovery (PITR) is enabled on trochia-prod (it is, by default on paid plans).
- Verify Storage backups (Supabase doesn't back up Storage by default — set up off-platform copy via cron or Supabase Storage replication).
- Execute one restore-to-staging drill:
  - Pick a point-in-time T (e.g., 24h ago).
  - Restore trochia-prod DB to a new project (trochia-restore-drill).
  - Verify schema + row counts + RLS policies all intact.
  - Verify Storage objects accessible from staging app pointed at the restored project.
- Document RTO (recovery time objective) and RPO (recovery point objective).

**Files**: `docs/runbooks/disaster-recovery.md`, `docs/runbooks/restore-drill-2026Q2.md`.

**Acceptance**: full restore completed in <1h (RTO target) with <5min data loss (RPO target); both RTO/RPO documented and committed.

---

### OBS — Observability (6 tickets — your additions)

#### OBS-01: `platform_events` structured event log

**Scope**:
- New table `platform_events`:

```sql
CREATE TABLE platform_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES accounts(id),
  user_id uuid REFERENCES users(id),
  event_type text NOT NULL,          -- e.g. 'deck.uploaded', 'brief.generated', 'ai.call_completed', 'admin.action.suspend'
  event_payload jsonb NOT NULL,
  severity text NOT NULL DEFAULT 'info',  -- debug | info | warn | error
  source_module text NOT NULL,       -- e.g. 'pitch-lab', 'live-raise', 'admin', 'ai'
  request_id text,                   -- correlates to Sentry trace
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_events_tenant_time ON platform_events (tenant_id, created_at DESC);
CREATE INDEX idx_events_type_time ON platform_events (event_type, created_at DESC);
CREATE INDEX idx_events_severity_time ON platform_events (severity, created_at DESC) WHERE severity IN ('warn','error');
```

- RLS: tenant_isolation (users see their own); super_admin_read_all (admin sees all).
- Helper: `logEvent({ tenantId, userId, eventType, payload, severity?, sourceModule, requestId? })` — fire-and-forget (uses `waitUntil` to not block request).
- Retention: 90 days hot; nightly Inngest job archives older rows to Supabase Storage as JSONL (gzip).
- Backfill: skip — start fresh from Phase 4.5 land date.

**Files**: `src/db/migrations/0008_platform_events.sql`, `src/lib/events/log.ts`, `src/lib/events/archive.ts`, `src/db/schema/events.ts`.

**Acceptance**: `logEvent()` writes a row in <5ms (async); query last 30d for one tenant returns in <500ms; archive job runs nightly and verifies row count matches archived count.

---

#### OBS-02: Token streaming admin view

**Scope**:
- `/admin/ai-stream` — SSE-streamed live tail of AI calls.
- Each call appears as a row: `{ timestamp, tenant_id (linked), user_id, model, tokens_in, tokens_out, cache_hit_ratio, cost_usd, latency_ms, status }`.
- Source: `platform_events` rows of type `ai.call_completed` (written by `ai/client.ts` in OBS-01 helper).
- Server pushes new rows as they're written; client buffers last 100, auto-scrolls.
- Filter by tenant or model in the URL.
- **Admin-only — never user-facing** per Martins's constraint.

**Files**: `src/app/admin/ai-stream/page.tsx`, `src/app/admin/ai-stream/route.ts` (SSE endpoint), `src/lib/events/stream.ts`.

**Acceptance**: an AI call triggered from another browser appears in the stream within 2s; closing stream cleans up listener (no leaks).

---

#### OBS-03: Valuable error messages (user trust UX)

**Scope**:
- New `TrochiaError` class with `{ userMessage, internalCode, internalDetails?, retryable, status }`.
- Mapping table at `src/lib/errors/messages.ts` — every internal error code maps to a copy-reviewed user-facing message:
  - `ANTHROPIC_TIMEOUT` → "We couldn't reach our AI provider — your draft is safe. Please try again in 30 seconds."
  - `STRIPE_PAYMENT_FAILED` → "Your payment didn't go through. Please check your card details in Settings → Billing, then try again."
  - `RATE_LIMITED` → "You're moving faster than our limits allow — please wait 30 seconds and try again."
  - `TENANT_TOKEN_CAP_EXCEEDED` → "You've used your monthly AI allowance. Your data is intact — you can keep browsing, and AI features resume next billing cycle (or upgrade to keep going)."
  - `INNGEST_JOB_FAILED` → "Something on our end didn't complete — we've been notified and are looking into it. You can refresh in a few minutes or contact support@trochia.ai."
  - `UNKNOWN` → "Something unexpected happened — we've been notified. Try again in a few minutes, or contact support if it keeps happening." (fallback, never bare 500)
- Server: every tRPC procedure + route handler wraps errors. Any bare `throw new Error()` trips a lint rule.
- Client: `<ErrorBoundary>` component renders the `userMessage`; copy-button for `internalCode` (so users can quote it in support tickets).
- Sentry STILL receives the full technical trace (with `internalDetails`); user just doesn't see it.
- Copy review: every message reviewed by founder for trust-preserving tone before merge.

**Files**: `src/lib/errors/trochia-error.ts`, `src/lib/errors/messages.ts`, `src/components/error-boundary.tsx`, `src/server/middleware/error-mapper.ts`, lint rule in `eslint.config.ts`.

**Acceptance**: deliberate Anthropic timeout in sandbox surfaces the friendly message + Sentry captures the trace; lint rule rejects a bare `throw new Error()` in a tRPC procedure.

---

#### OBS-04: Bug spotter alerts

**Scope**:
- Sentry alert rules (created via Sentry API + tracked in `infra/sentry/alerts.yaml`):
  - **New error class** (Sentry "issue first seen") → Slack DM to founder + email
  - **Error-rate spike** — >2σ over rolling 1h baseline → Slack DM
  - **p95 latency regression** on top-10 routes (defined list) → Slack DM
  - **Specific high-severity errors** (`UNKNOWN`, `DATABASE_*`, `SECURITY_*`) → immediate page (phone)
- Daily digest at 9am local: yesterday's error count by class, top 5 worst routes, slowest endpoints, error-rate trend.
- Threshold tuning over time — start permissive, narrow as baseline stabilizes.

**Files**: `infra/sentry/alerts.yaml`, `src/lib/monitoring/alert-channels.ts` (Slack webhook + paging).

**Acceptance**: triggering a deliberate new error class in sandbox fires the Slack DM within 5min; daily digest email arrives at 9am the next day with correct counts.

---

#### OBS-05: Agent-readable log API

**Scope**:
- `/api/admin/events/search` — REST endpoint, super-admin-only.
- Query params: `tenant`, `user`, `event_type` (CSV), `severity` (CSV), `from`, `to`, `q` (free-text JSONB search), `limit` (max 100), `cursor`.
- Response: `{ events: [...], next_cursor, sentry_deep_links: [...], langfuse_deep_links: [...] }`.
- Designed for agent retrieval: returns enough context (Sentry/Langfuse deep links per error event) that Claude Code / Codex can pivot from a `platform_events` row directly to the technical trace in the relevant vendor surface.
- Authentication: `Authorization: Bearer <SUPER_ADMIN_API_TOKEN>` (separate from session-cookie auth; tokens are env-vars + rotateable; super-admin generates their own from /admin/api-tokens — never displayed twice).
- Rate-limited: 60/min per token (high enough for an active debug session, low enough that a leaked token can't be a data exfiltration vector).
- Audited: every search writes `platform_events` row `admin.api.search` with the query parameters.

**Files**: `src/app/api/admin/events/search/route.ts`, `src/lib/admin/api-token.ts`, `src/app/admin/api-tokens/page.tsx`.

**Acceptance**: Claude Code, given a valid API token, can call this endpoint with `event_type=error&tenant=<id>&from=2026-05-15` and get a paginated structured response with Sentry deep-links it can navigate to.

---

#### OBS-06: Health endpoint + uptime monitoring

**Scope**:
- `/api/health` — public endpoint, returns:
  - `200` with `{ status: 'ok', checks: { db: 'ok', inngest: 'ok', anthropic: 'ok' } }` when everything is green
  - `503` with details on which subsystem is degraded
- Checks: DB `select 1` + Inngest ping + Anthropic `/v1/messages` HEAD (timeout 2s).
- External uptime monitoring via **Better Stack** (preferred — clean UI + status page free tier) or **UptimeRobot** (free, less polished).
  - Monitors: `/api/health` every 1 min from 3+ geos.
  - Paging: SMS + phone-call to founder phone on 3 consecutive failures.
  - Public status page: `status.trochia.ai` (optional; nice-to-have for trust signal to design partners).
- **Critical**: monitoring must be off-Vercel — if Vercel itself goes down, internal Vercel monitoring goes down with it.

**Files**: `src/app/api/health/route.ts`, `infra/uptime/better-stack-config.yaml`.

**Acceptance**: a deliberate 30s DB outage on staging is detected within 90s and pages founder phone; degraded responses match the documented contract.

---

## 7. Recommended internal build sequence (4 weeks, Conservative pace)

Order matters — some tickets unblock others. Cross-track parallelism is intentional.

### Week 1 — Foundation cluster

Goal: every other ticket can write to `platform_events` and every admin route is shellable.

| Day | Tickets |
|---|---|
| Day 1-2 | **OBS-01** (`platform_events` table + helper) |
| Day 3-4 | **ADM-01** (super-admin role + RLS) + **SEC-03** (admin MFA — needs to land before ADM-02 can require it) |
| Day 5 | **ADM-02** (admin shell + MFA gate + 501 placeholders for other ADM routes) |

**Week 1 exit**: super-admin can land on `/admin` (MFA-protected, banner visible), and the `logEvent()` helper is used by retrofitting Phase 1-4 mutation handlers.

### Week 2 — Trust + cheap wins

Goal: user-facing trust improvements + free security wins.

| Day | Tickets |
|---|---|
| Day 1-2 | **OBS-03** (`TrochiaError` + message mapping + lint rule + retrofit) |
| Day 3 | **OBS-04** (bug spotter alert rules + daily digest) |
| Day 4 | **SEC-04** (security headers — start in report-only mode for week 2-3) |
| Day 5 | **SEC-05** (session security — shortened TTL + rotation + sign-out hooks) |

**Week 2 exit**: zero bare 500s in the product; Sentry alerts fire to Slack; security headers in report-only mode collecting data.

### Week 3 — Dashboard surfaces become real

Goal: the admin dashboard is fully populated with real data.

| Day | Tickets |
|---|---|
| Day 1-2 | **ADM-03** (tenant directory + drill-down) |
| Day 3 | **ADM-04** (AI cost dashboard) + **ADM-05** (event log viewer) |
| Day 4 | **OBS-02** (token streaming SSE view) |
| Day 5 | **OBS-05** (agent log API — unlocks Claude Code / Codex agent debugging) |

**Week 3 exit**: by EOD Friday, you can answer "what is tenant X doing right now and how much have they cost us this month" from one dashboard surface, AND Claude Code can pull the last 24h of events into a debug session via API.

### Week 4 — Pre-launch hardening

Goal: rate limiting + caps + ops + drills — the "before design partners arrive" cluster.

| Day | Tickets |
|---|---|
| Day 1 | **SEC-01** (rate limiting middleware) + **SEC-02** (per-tenant token cap) |
| Day 2 | **ADM-06** (external embeds) + **ADM-07** (tenant ops — soft-suspend, plan-change, refund, view-as, force re-embed) |
| Day 3 | **ADM-08** (Inngest ops) + **OBS-06** (health endpoint + uptime monitoring + pager) |
| Day 4 | **SEC-06** (secret rotation runbook + dry run) |
| Day 5 | **SEC-07** (backup restore drill) + **CSP flip from report-only to enforce** (SEC-04 finalization) |

**Week 4 exit**: Phase 4.5 done. Phase 5 (design-partner soft launch) is now unblocked.

### Risk cuts

If Clockvest workload eats Week 2-3, defer in this order (cheapest cuts first):

1. **SEC-07** (backup drill) — to Phase 4.6. Restoration capability exists in Supabase regardless; only the *drill* is deferred.
2. **SEC-06** (secret rotation drill) — to Phase 4.6. Runbook lands; the *drill* defers.
3. **ADM-06** (external embeds) — to Phase 4.6. You can paste tenant IDs into vendor dashboards manually.
4. **OBS-06** (uptime monitoring) — defer the public status page; keep the pager (free Better Stack tier).

Do NOT cut: OBS-01, ADM-01..05, SEC-01, SEC-02, SEC-03, SEC-04, SEC-05, OBS-03, OBS-04, OBS-05. These are the load-bearing items for "design partners can safely hit prod."

---

## 8. Phase 4.5 → Phase 5 hand-off contract

Phase 5 ("Live Raise — MVP soft-launch checkpoint") explicitly gates on 25 design partners onboarded & paying with activation thresholds met. Phase 4.5 must hand off the following BEFORE Phase 5 can begin onboarding:

- ✅ Admin dashboard live; founder can monitor a real tenant in <3 clicks
- ✅ Rate limiting + token caps enforce against runaway cost (one runaway-cost test recorded)
- ✅ Zero bare error messages in the product (manual audit + lint rule)
- ✅ Bug spotter pages founder on regressions (one deliberate failure recorded)
- ✅ `platform_events` populated by every Phase 1-4 mutation handler
- ✅ Agent log API live; Claude Code can debug from real event history
- ✅ MFA on admin; CSP enforced; session policy tightened
- ✅ One secret-rotation drill recorded; one backup-restore drill recorded
- ✅ Off-platform uptime monitoring active with pager to founder phone

These items become **Phase 5 entry preconditions** in the ROADMAP.md `Depends on` line for Phase 5.

Optionally — and I recommend this — update Phase 5's `Depends on` line:

> **Depends on**: Phase 4, Phase 4.5

So the dependency graph is explicit.

---

## 9. Open items deferred to later phases

Items I considered for Phase 4.5 and deliberately deferred (with reason):

| Item | Why deferred | Where it lands |
|---|---|---|
| Full-user MFA (not just admin) | Adds friction for first 25 design partners; admin-only MFA covers the highest-blast-radius surface | Phase 8 (already there) |
| SOC 2 prep | Not needed for 25 design partners; tier-jump cost | Phase 11 (already there) |
| Per-user feature flags | Would be nice but no current need; can be hard-coded for the few flags Phase 5 needs | Phase 5 or later, ad-hoc |
| Vercel preview env-vars wiring | Tracked separately in handoff; orthogonal to Phase 4.5 scope | Standalone session (in the priority queue right after Phase 4.5) |
| Audit log SIEM export | No regulator requires it yet; `platform_events` archive is sufficient at this stage | Post-SOC-2 (Phase 11+) |
| Tenant-level encryption-at-rest beyond Supabase native | Phase 1's existing cross-cutting bullet covers this for cap-table/audio; no new tables in Phase 4.5 need additional encryption | N/A — cross-cutting already covers |

---

## 10. Document control

- **Version**: v1
- **Authors**: Strategy — Martins. Production — Chief of Staff.
- **Date**: 2026-05-15
- **Status**: Ready for paste into ROADMAP.md
- **Supersedes**: Nothing (first canonical Phase 4.5 spec)
- **Successor**: Phase 4.5 PLAN.md (created by `/gsd-plan-phase phase-4-5` after this lands)

---

**Ship signal**: paste the five patches in §1-§5 into ROADMAP.md, commit to `phase-1-foundation` with message `chore(roadmap): insert Phase 4.5 — Admin Dashboard + Security Hardening + Observability`, then run `/gsd-plan-phase phase-4-5` to produce the breakdown PLAN.md that Claude Code can execute against.
