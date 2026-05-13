---
phase: 01-foundation
plan: 09
subsystem: onboarding-shell-dashboard-settings-billing

# Dependency graph
requires:
  - phase: 01-02
    provides: "AppShell + Sidebar (Data Room/Raise Ops disabled-with-badge) + TopBar + the DestructiveConfirmDialog primitive + EmptyState primitive + SkeletonBlock primitive + themed shadcn Button/Card/Input/Label/Badge/Sonner Toaster"
  - phase: 01-03
    provides: "src/db/schema/tenancy.ts (accounts table — Plan 09 adds two columns); src/server/{context,trpc}.ts (protectedProcedure with the resolved tenantId/account); the schema-scan invariant (no new tenant-scoped tables added; accounts is already covered)"
  - phase: 01-05
    provides: "src/lib/analytics.ts typed AnalyticsEvent union — Plan 09 fires welcome_viewed (via Plan 07's GetStartedButton), knowledge_pack_step_viewed, deck_upload_step_viewed, review_step_viewed, dashboard_viewed (already fired by Plan 07's tracker); manage_billing_clicked still fired server-side from portal.ts"
  - phase: 01-06
    provides: "complianceRouter.requestDataExport + requestAccountDeletion (consumed by /app/settings); DPA_VERSION (consumed by the /onboarding index)"
  - phase: 01-07
    provides: "/onboarding/welcome + /onboarding/page.tsx + /onboarding/tier-picker + Checkout/Portal + billingRouter (currentSubscription + openPortal consumed by /app/billing) + the (app) layout + the /app skeleton (Plan 09 replaces it) + entitlements()/TIERS (consumed by /app + /app/billing) + the proxy.ts session gate + the assertEntitled real check"
provides:
  - "accounts.onboarding_step (text, nullable) + accounts.onboarding_completed_at (timestamptz, nullable) — the FND-12 funnel position columns"
  - "src/db/migrations/0002_soft_zuras.sql — the migration, NOT auto-applied (founder runs alongside Plan 07's 0001_*.sql)"
  - "src/server/routers/onboarding.ts — onboardingRouter (getProgress + markStepComplete + skipStep), registered as appRouter.onboarding"
  - "src/components/onboarding/stepper.tsx — the 3-step header (01 Import context · 02 Upload deck · 03 Review)"
  - "src/app/(app)/onboarding/import/{page,import-step}.tsx — the Knowledge Pack Import shell (paste textarea + file dropzone hint + Continue/Skip), fires knowledge_pack_step_viewed"
  - "src/app/(app)/onboarding/deck/{page,deck-step}.tsx — the deck upload shell (PDF/PPTX dropzone + Slides URL input + Continue/Skip), fires deck_upload_step_viewed"
  - "src/app/(app)/onboarding/review/{page,review-step}.tsx — the SkeletonBlock-based auto-review (NO spinner — UI-SPEC anti-pattern), fires review_step_viewed, auto-advances after 1.2s → /app"
  - "src/app/(app)/onboarding/page.tsx (REFINED from Plan 07) — reads accounts.onboarding_step + onboarding_completed_at; routes ?checkout=success → /onboarding/import; resumes mid-stepper; finished → /app"
  - "src/components/dashboard/cta-cards.tsx — the three FND-12 action cards ('Generate VC fit list' → /app/pipeline, 'Prepare for an upcoming call' → /app/live-raise, 'Draft outreach' → /app/pipeline) each with a text-mono-sm 'Coming Phase N' Badge, never disabled with no affordance"
  - "src/components/dashboard/empty-dashboard.tsx — 64px Mark + H3 'Welcome to Trochia' + body + Primary 'Start Business Memory' → /app/memory"
  - "src/app/(app)/app/page.tsx (REPLACED Plan 07's skeleton) — AppShell + tier-line + EmptyDashboard + CtaCards; TODO(Phase 2) for the real 'no Business Memory' check"
  - "src/app/(app)/app/{memory,pitch,pipeline,live-raise}/page.tsx — the 4 module placeholders, each AppShell + EmptyState 'Coming in Phase N'"
  - "src/app/(app)/app/settings/{page,settings-view}.tsx — Profile + Your data ('Export my data' → compliance.requestDataExport, toast) + Danger zone ('Delete account' → DestructiveConfirmDialog with typed DELETE + 'Keep my account' dismiss → compliance.requestAccountDeletion → sign-out → /sign-in?deletion=scheduled). XC-04 in-app surface."
  - "src/app/(app)/app/billing/{page,billing-view}.tsx — Current plan (tier + status + trial/period-end + card-on-file) with 'Manage billing' → billing.openPortal → Stripe Customer Portal + 'Cancel subscription' → DestructiveConfirmDialog ('Keep subscription' dismiss; NEVER bare 'Cancel') → openPortal. FND-05 in-app surface."
  - "src/app/(app)/layout.tsx (modified) — mounts Sonner <Toaster /> once for every (app) page (Settings + Billing call toast.* for non-blocking confirmations)"
  - "e2e/onboarding.spec.ts (5 tests) — proxy-gate matrix for /onboarding/{import,deck,review}: session-only gate → /sign-in, NOT /reactivate"
  - "e2e/app-shell.spec.ts (12 tests) — proxy-gate matrix for /app + /app/{memory,pitch,pipeline,live-raise,settings,billing}: unauthed → 307 → /sign-in; /styleguide session-gated; 'not a 404' checks for the placeholder routes (proves they're wired without needing a live session)"
affects:
  - "Phase 2 (Knowledge Layer) — the Memory module replaces /app/memory's 'coming in Phase 2' empty-state; the Knowledge-Pack-Import step's textarea + dropzone become real (extraction → Business Memory); the EmptyDashboard's hasBusinessMemory check (currently always-true) is wired against the businesses table Plan 2 creates"
  - "Phase 3 (Pitch Lab) — replaces /app/pitch placeholder; the auto-review skeleton becomes a real deck-review pipeline"
  - "Phase 4 (Investor Pipeline) — replaces /app/pipeline placeholder; the 'Generate VC fit list' + 'Draft outreach' CTA cards' destinations come to life (badges removed)"
  - "Phase 5 (Live Raise) — replaces /app/live-raise placeholder; the 'Prepare for an upcoming call' CTA card destination comes to life"

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Onboarding step state is persisted on the accounts row (onboarding_step + onboarding_completed_at), NOT in cookies/session — refreshing mid-stepper resumes at the right step; the /onboarding index reads the columns and routes accordingly. The columns are UI shells only — the access gate remains the subscription status (proxy.ts), so a forged step-skip can't bypass anything (T-1-55)."
    - "Skip vs. complete: onboardingRouter exposes both markStepComplete (founder did the step's work) and skipStep (founder bypassed it). Both advance onboarding_step; the distinction is for the future analytics drill-down (Plan 05's union currently has no step_skipped event — add at Phase 2 when the Memory feature lights up and skip becomes meaningful)."
    - "The review-step skeleton uses SkeletonBlock laid out to roughly match the future Phase-3 deck-review result layout (rows of bg-stone/60 animate-pulse) so the eventual transition feels continuous, not jarring. NO spinner — UI-SPEC §Anti-Patterns bans spinners as the primary full-page loading affordance."
    - "Dashboard FND-12 CTA cards always link to a real placeholder destination — never disabled-with-no-affordance, even when the destination is itself a 'coming in Phase N' empty-state. The 'Coming Phase N' Badge is the only visible signal; the click-through works today (lands on the placeholder route's empty-state)."
    - "Settings + Billing each compose a server-Component page that reads the persisted state (account row / user) + a client-Component view that wires the tRPC mutations. The destructive dialogs (Delete account + Cancel subscription) are both <DestructiveConfirmDialog> instances; the dismiss labels ('Keep my account' / 'Keep subscription') satisfy the UI-SPEC's 'never bare Cancel' anti-pattern."
    - "Cancel-subscription routes through Stripe Customer Portal (per UI-SPEC D-02c — the in-app trigger still shows the destructive Dialog before redirecting). The Portal handles the actual cancellation; Trochia never sees card details. The 'Manage billing' button uses the same openPortal mutation."
    - "Sonner Toaster mounted in src/app/(app)/layout.tsx (the styleguide layout still mounts its own preview Toaster). The toast.* calls in Settings/Billing fire non-blocking confirmations ('Your data export is on its way — check your email.' / 'Couldn't open the billing portal.')."

key-files:
  created:
    - src/db/migrations/0002_soft_zuras.sql
    - src/db/migrations/meta/0002_snapshot.json
    - src/server/routers/onboarding.ts
    - src/components/onboarding/stepper.tsx
    - src/app/(app)/onboarding/import/page.tsx
    - src/app/(app)/onboarding/import/import-step.tsx
    - src/app/(app)/onboarding/deck/page.tsx
    - src/app/(app)/onboarding/deck/deck-step.tsx
    - src/app/(app)/onboarding/review/page.tsx
    - src/app/(app)/onboarding/review/review-step.tsx
    - src/components/dashboard/cta-cards.tsx
    - src/components/dashboard/empty-dashboard.tsx
    - src/app/(app)/app/memory/page.tsx
    - src/app/(app)/app/pitch/page.tsx
    - src/app/(app)/app/pipeline/page.tsx
    - src/app/(app)/app/live-raise/page.tsx
    - src/app/(app)/app/settings/page.tsx
    - src/app/(app)/app/settings/settings-view.tsx
    - src/app/(app)/app/billing/page.tsx
    - src/app/(app)/app/billing/billing-view.tsx
    - e2e/onboarding.spec.ts
    - e2e/app-shell.spec.ts
  modified:
    - src/db/schema/tenancy.ts (+ onboarding_step + onboarding_completed_at columns)
    - src/db/migrations/meta/_journal.json (drizzle bookkeeping)
    - src/server/routers/index.ts (+ onboardingRouter)
    - src/app/(app)/onboarding/page.tsx (refined: routes by onboarding_step + onboarding_completed_at + ?checkout=)
    - src/app/(app)/app/page.tsx (replaced Plan 07's skeleton tier-only view with EmptyDashboard + CtaCards)
    - src/app/(app)/layout.tsx (+ mounted Sonner Toaster)

key-decisions:
  - "The /onboarding index now routes by accounts.onboarding_step (Plan 09 addition) instead of inferring step from the ?checkout= query param alone. This makes the founder's position durable — a refresh / a new tab / a bounce back to / mid-stepper resumes at the right step instead of starting over. Cost: a tiny migration (2 columns). Benefit: the under-5-minute UX target survives interruption."
  - "The review-step auto-advances after 1.2s (a constant in review-step.tsx). The UI-SPEC says 'about a minute' for the eventual Phase-3 review; Phase-1 ships the skeleton-as-intentional-state with a short beat so the founder doesn't sit watching a placeholder. The Phase-3 plan replaces the constant with the real review wait."
  - "skipStep is a separate procedure from markStepComplete even though their behavior is identical today (both advance onboarding_step). Rationale: in Phase 2 when the import step's extraction actually exists, we'll need to differentiate 'completed' from 'skipped' for analytics + retention messaging — having the procedure already in the router (with the right semantic name + tRPC type signature) means Phase 2's wiring is additive, not a refactor."
  - "The EmptyDashboard renders unconditionally in Phase 1 because the businesses table doesn't exist yet (D-03). The TODO(Phase 2) marker in /app/page.tsx documents the swap. The CTA cards always render below the EmptyDashboard — they're not gated on the Memory state."
  - "The Cancel-subscription confirm action redirects to the Stripe Customer Portal (where the founder actually cancels), NOT a direct cancel mutation. Per UI-SPEC D-02c: 'the in-app trigger still shows the destructive Dialog before the redirect.' Rationale: the Portal handles dunning, refunds, and cancellation timing more reliably than reimplementing those rules. The destructive Dialog is the friction; the Portal is the action."
  - "The Sonner Toaster mounts in src/app/(app)/layout.tsx (not in providers.tsx) so it's scoped to the authenticated app surface. The marketing site doesn't need toasts. The styleguide preview keeps its own Toaster mount."

requirements-completed: [FND-12, XC-02, XC-04]

# Metrics
duration: ~1.5h
completed: 2026-05-13
---

# Phase 1 Plan 09: Onboarding Shell + Dashboard + Settings + Billing — Summary

**One-liner:** The post-Checkout onboarding stepper (3 steps: Knowledge Pack Import / Deck upload / Auto-review skeleton — all UI shells, skip-friendly, the review step using SkeletonBlock not a spinner, every stage transition firing an Amplitude funnel event), the `/app` dashboard (`EmptyDashboard` + the three FND-12 CTA cards with "Coming Phase N" badges, never dead), the four module placeholders (`/app/memory|pitch|pipeline|live-raise`), `/app/settings` (XC-04 — Export my data + Delete account with typed-`DELETE` gate + "Keep my account" dismiss), `/app/billing` (FND-05 — tier display + Manage-billing → Customer Portal + Cancel-subscription Dialog with "Keep subscription" dismiss → Portal), the `onboardingRouter` + `accounts.onboarding_step` / `accounts.onboarding_completed_at` schema addition + migration, and the onboarding + app-shell e2e specs. FND-12 onboarding shell is end-to-end; Phase 1 is complete.

## Task Commits

1. **Task 1 — `6c29c69`** (feat): onboarding stepper + the 3 step screens + `onboardingRouter` + `accounts.onboarding_*` schema + migration `0002_soft_zuras.sql` (NOT auto-applied) + `e2e/onboarding.spec.ts`.
2. **Task 2 — `4a88dea`** (feat): `/app` dashboard (EmptyDashboard + CtaCards replacing Plan 07's skeleton) + 4 module placeholders (`/app/memory|pitch|pipeline|live-raise`) + `e2e/app-shell.spec.ts`.
3. **Task 3 — `22193ce`** (feat): `/app/settings` (XC-04 — Export + Delete-account Dialog with typed `DELETE` gate) + `/app/billing` (FND-05 — Manage-billing → Customer Portal + Cancel Dialog → Portal) + Sonner Toaster mounted in `(app)/layout.tsx`.

Plan metadata: _(this commit)_ — `docs(01-09): complete onboarding-shell + dashboard + Settings + Billing plan`.

## What shipped

### Onboarding shell — the post-Checkout half (FND-12)

`accounts.onboarding_step` (`text`, nullable: `'welcome'|'tier'|'import'|'deck'|'review'|null`-when-done) and `accounts.onboarding_completed_at` (`timestamptz`, nullable) added to the tenancy schema. Migration `0002_soft_zuras.sql` emitted (ADD COLUMN × 2; no RLS edits — `accounts` already has the `tenant_isolation` policy). **NOT auto-applied** — the founder runs `npx drizzle-kit migrate` against the live Supabase project alongside Plan 07's `0001_sticky_bloodstrike.sql` (recorded in `deferred-items.md`).

`src/server/routers/onboarding.ts` — `onboardingRouter`:
- `getProgress` (protectedProcedure.query) — `{ step, completedAt }`.
- `markStepComplete` (protectedProcedure.mutation, `{ step: 'welcome'|'tier'|'import'|'deck'|'review' }`) — advances `onboarding_step` to the next step in the linear funnel. When `step === 'review'` → sets `onboarding_completed_at = now()` and clears `onboarding_step`.
- `skipStep` (same signature as `markStepComplete`) — semantically distinct (the import + deck steps are skippable in Phase 1 since the feature logic ships in later phases), behavior currently identical. The semantic split lets Phase 2 add `*_step_skipped` events without changing the wire shape.

Registered as `appRouter.onboarding` in `src/server/routers/index.ts`.

`src/components/onboarding/stepper.tsx` — the `01 Import context · 02 Upload deck · 03 Review` header: current step's mono number in `text-signal` (the one-accent moment on the surface), completed steps render the Check mark in an ink dot, future steps are graphite-muted. Hairline divider below; content slot below that.

`src/app/(app)/onboarding/import/{page,import-step}.tsx` — Knowledge Pack Import (step 1):
- UI-SPEC copy: heading "Import your context", body "Drop in your existing AI context — ChatGPT instructions, Claude project notes, a Notion brief — or paste 500–5,000 words. Trochia builds your Business Memory from it."
- A `<textarea>` (paste) + a dashed-border dropzone with a `<input type="file">` accepting `.md/.txt/.pdf`. Hint copy "We'll process this when you finish onboarding." makes the Phase-1 shell honest.
- Primary "Continue" → `markStepComplete({step:'import'})` → `/onboarding/deck`. Link "Skip for now" → `skipStep({step:'import'})` → same destination.
- Fires `track('knowledge_pack_step_viewed')` on mount (browser SDK).

`src/app/(app)/onboarding/deck/{page,deck-step.tsx}` — Deck upload (step 2):
- UI-SPEC copy: heading "Upload your deck", body "PDF, PPTX, or a Google Slides link. Trochia reviews it next."
- A dropzone (PDF/PPTX input) + a `<Input type="url">` (Google Slides link).
- Continue + Skip → `/onboarding/review`.
- Fires `track('deck_upload_step_viewed')` on mount.

`src/app/(app)/onboarding/review/{page,review-step}.tsx` — Auto-review (step 3):
- UI-SPEC copy: heading "Reviewing your deck…", body "This takes about a minute. We'll take you to your dashboard when it's done."
- A `<SkeletonBlock>`-based progress mock (rows of `bg-stone/60 animate-pulse` in a `Card`-like container; layout approximates the future Phase-3 deck-review result so the transition will feel continuous). **No spinner** — UI-SPEC §Anti-Patterns bans spinners as the primary full-page loading affordance.
- On mount: fires `review_step_viewed`, then after 1.2s calls `markStepComplete({step:'review'})` (which sets `onboarding_completed_at`) → routes to `/app`. Fail-soft: even if the mutation errors, the founder still routes to `/app` (onboarding finishing is UX, not a security gate).

`src/app/(app)/onboarding/page.tsx` (refined from Plan 07) — the `/onboarding` index now:
- DPA not accepted → `/onboarding/welcome` (unchanged).
- `?checkout=success` → persist `onboarding_step='import'` if not already in the stepper, then `/onboarding/import`.
- `?checkout=cancelled` → re-render the tier picker.
- `onboarding_completed_at` set + active sub → `/app`.
- Active sub mid-stepper → resume at the recorded step (`/onboarding/import|deck|review`).
- Active sub but no step recorded (refresh post-Checkout without the query param) → start at step 1.

### Funnel instrumentation (FND-12)

Every stage transition fires the Plan-05 typed event from the AnalyticsEvent union. Full Phase-1 funnel:
1. `signup_started` — fired by Plan 07 on `/sign-up` Continue-with-Google.
2. `welcome_viewed` — fired by Plan 07's `GetStartedButton` (Plan 09 didn't touch this — confirmed correct).
3. `tier_selected` — fired server-side by Plan 07's `createCheckoutSession`.
4. `checkout_started` — same.
5. `checkout_completed` — fired server-side by Plan 07's Stripe webhook (non-spoofable, node SDK).
6. **`knowledge_pack_step_viewed`** — Plan 09 (`/onboarding/import`).
7. **`deck_upload_step_viewed`** — Plan 09 (`/onboarding/deck`).
8. **`review_step_viewed`** — Plan 09 (`/onboarding/review`).
9. `dashboard_viewed` — Plan 07's `<DashboardViewedTracker>` (unchanged).

Bold = new in Plan 09. The funnel is now end-to-end instrumented; the under-5-minute target is verifiable in Amplitude.

### `/app` dashboard (FND-12, UI-SPEC §"/app (dashboard)")

`src/components/dashboard/empty-dashboard.tsx` — the `<EmptyDashboard>` state: 64px Mark (no link), H3 "Welcome to Trochia", body "Start by dropping your context into Business Memory. Everything else builds on it.", Primary `<Button>` "Start Business Memory" → `/app/memory`. Centered, `max-w-md`.

`src/components/dashboard/cta-cards.tsx` — the three FND-12 action cards as a `grid-cols-1 md:grid-cols-3` of secondary-variant cards (1px `stone` border, no shadow, `hover:border-ink/20`):
- "Generate VC fit list" (Network icon) → `/app/pipeline` (Badge "Coming Phase 4")
- "Prepare for an upcoming call" (PhoneCall icon) → `/app/live-raise` (Badge "Coming Phase 5")
- "Draft outreach" (Send icon) → `/app/pipeline` (Badge "Coming Phase 4")

Each card is itself a `<Link>` (full-card target — never disabled with no affordance). One-line description per card. An "Open →" affordance bottom-left that flips to `text-signal` on hover (the only place `text-signal` shows on the dashboard surface — the one-accent moment).

`src/app/(app)/app/page.tsx` (replacing Plan 07's skeleton tier-only view):
- Renders `<AppShell>` (title "Dashboard", `activeHref="/app"`, `userName` + `userEmail` from the Supabase session).
- A subtle tier line `text-body-sm text-graphite` — "Active Raise · trial ends 2026-05-20" (or "renews" for `active`), kept from the Plan-07 skeleton.
- `<EmptyDashboard />` (Phase-1 always-on; `// TODO(Phase 2):` marker for the real "no Business Memory" check once the businesses table exists).
- `<CtaCards />` below.
- `<DashboardViewedTracker />` fires `dashboard_viewed` on mount (unchanged from Plan 07).

### Module placeholders

Four routes — `/app/memory`, `/app/pitch`, `/app/pipeline`, `/app/live-raise` — each renders `<AppShell>` + the `<EmptyState>` primitive (64px Mark + H3 + body + "Back to dashboard" link) with phase-specific copy:

| Route | Heading | Body |
|-------|---------|------|
| `/app/memory` | "Business Memory — coming in Phase 2" | "Trochia will turn your existing AI context into a confirmed Business Memory that every module reads from. Paste your ChatGPT or Claude context, confirm each field, resolve conflicts." |
| `/app/pitch` | "Pitch Lab — coming in Phase 3" | "Trochia will review your deck against your Business Memory and a defect taxonomy, flagging factual contradictions, vague language, and missing context — with zero fabricated slide references." |
| `/app/pipeline` | "Investor Pipeline — coming in Phase 4" | "Trochia will match VCs and accelerators from your Business Memory, track applications, draft outreach, and map warm intros — all founder-approved before anything leaves." |
| `/app/live-raise` | "Live Raise — coming in Phase 5" | "Trochia will generate pre-call briefs, ingest your transcripts, draft 24-hour follow-ups, and keep a Pipeline Memory kanban — so no thread goes cold." |

Data Room and Raise Ops have no routes — Plan 02's `Sidebar` renders their nav items as disabled `<span>`s with `text-mono-sm` "Phase 7" / "Phase 9" badges. No 404 risk because the sidebar doesn't link there.

### `/app/settings` (XC-04)

`src/app/(app)/app/settings/{page,settings-view}.tsx`. Server-Component shell hands the founder's email + name to the client view. Three Cards:
1. **Profile** — read-only email + name `<Input>`s. Full editing is a later phase.
2. **Your data** — "Export my data" `<Button variant="secondary">` calls `compliance.requestDataExport` (Plan 06). On success: `toast.success("Your data export is on its way — check your email.")` (the export → Storage signed URL → email is Plan 06's `exportAccountData`). On error: error toast.
3. **Danger zone** — "Delete account" `<Button variant="destructive">` opens the `<DestructiveConfirmDialog>` (Plan 02) with:
   - `title="Delete your account?"`
   - body per UI-SPEC: "This soft-deletes your account now and permanently purges all your data after 30 days. You can export your data first."
   - `confirmVerbNoun="Delete account"` (the danger button text)
   - `dismissKeepNoun="Keep my account"` (the dismiss button — NEVER bare "Cancel", per UI-SPEC §Anti-Patterns)
   - `requireTypedConfirmation="DELETE"` (the founder must type DELETE; the confirm button is disabled until then — the `DestructiveConfirmDialog` primitive already enforces this)
   - `secondaryAction`: a link "Export my data first" inside the Dialog footer that triggers `compliance.requestDataExport` before deletion
   - `onConfirm`: calls `compliance.requestAccountDeletion` (Plan 06's soft-delete → 30-day purge cron), then `supabase.auth.signOut()` from the browser client, then `router.push('/sign-in?deletion=scheduled')`.

### `/app/billing` (FND-05)

`src/app/(app)/app/billing/{page,billing-view}.tsx`. Server-Component shell reads the persisted account (tier + status + period-end + has-customer-id from `entitlements()` + `TIERS`) and hands a snapshot to the client view. Two Cards:
1. **Current plan** — displays `tierName` ("Active Raise" / "Pre-Raise") + a status-derived label ("Trial ends 2026-05-20" / "Renews 2026-08-13" / "Payment past due" / "Cancelled" / "No active subscription") + "Card on file" hint when `trialing && hasCustomer`. Primary button: "Manage billing" → calls `billing.openPortal` (Plan 07) → `window.location.assign(portal.url)` to the Stripe Customer Portal (the Portal handles plan switch / card update / invoices / cancellation). Fallback "Pick a plan" → `/onboarding` if `!hasCustomer` (defensive — past the proxy gate this shouldn't happen).
2. **Cancel subscription** (rendered only when `hasCustomer && status !== 'canceled'`) — destructive `<Button>` opens `<DestructiveConfirmDialog>`:
   - `title="Cancel your subscription?"`
   - body: "You'll keep access until the end of your billing period."
   - `confirmVerbNoun="Cancel subscription"`
   - `dismissKeepNoun="Keep subscription"` (NEVER bare "Cancel")
   - No `requireTypedConfirmation` (lower friction than account deletion; UI-SPEC permits)
   - `onConfirm`: closes the Dialog, then calls `billing.openPortal` (per UI-SPEC D-02c: "the in-app trigger still shows the destructive Dialog before redirect" — the Stripe Customer Portal handles the actual cancellation).

### Toaster mount

`src/app/(app)/layout.tsx` now mounts `<Toaster />` (Sonner) once for every `(app)` page. Without this the Settings/Billing `toast.success` / `toast.error` calls would no-op. The styleguide preview keeps its own Toaster mount.

### e2e specs

`e2e/onboarding.spec.ts` (5 tests) — proxy-gate matrix for the new stepper routes:
- `/onboarding/import`, `/onboarding/deck`, `/onboarding/review` each: unauthed → 307 → `/sign-in` (session-only gate, NOT `/reactivate`).
- One byte-level assertion that the Location header on each route is `/sign-in` (not `/reactivate`) confirms the proxy classifier still treats `/onboarding/*` as session-only.

`e2e/app-shell.spec.ts` (12 tests) — proxy-gate matrix for the `/app/*` routes:
- All seven routes (`/app`, `/app/memory`, `/app/pitch`, `/app/pipeline`, `/app/live-raise`, `/app/settings`, `/app/billing`): unauthed → 307 → `/sign-in`.
- `/styleguide` unauthed → `/sign-in` (Plan 07's session gate, still in force).
- "Not a 404" checks for each placeholder route — proves the routes are wired without needing a live session (a nonexistent route would return 404; getting 307 is the smoke check that the page exists).

The full happy-path click-through (welcome → tier picker → Checkout stub → import → deck → review → /app with all 8 Amplitude events firing in order) needs a live Supabase test user + a Checkout-stub harness + MSW-mocked Amplitude. That CI-only slice lives in `e2e/skeleton.spec.ts`'s webhook-round-trip block alongside Plan 07's CI-only flow. The contract — every step's heading + body + the SkeletonBlock vs spinner discipline + the dismiss-label rules — is verified at the source-file level by `npm run check:banned` + lint + the per-route placeholder presence the e2e proves.

### `/styleguide` session-gate confirmation

Plan 07 made `/styleguide` session-gated (proxy classifies `/styleguide` as `onboarding-or-styleguide` → requires session). Plan 09's `e2e/app-shell.spec.ts` re-asserts this contract:
```ts
test('/styleguide unauthenticated → /sign-in (Plan 07 session gate)', async ({ page }) => {
  await page.goto('/styleguide');
  await expect(page).toHaveURL(/\/sign-in/);
});
```
Pre-existing `e2e/styleguide.spec.ts` also passes (13/13 in the re-run). No regression.

## Verification

| Check | Result |
|-------|--------|
| `npm run lint` | exit 0 (0 errors, 0 warnings) |
| `npm run typecheck` | exit 0 |
| `npm run build` | exit 0 — 32 routes registered including `/onboarding/import|deck|review` and `/app/memory|pitch|pipeline|live-raise|settings|billing`; the `ƒ Proxy (Middleware)` is listed |
| `npm run check:banned` | "no violations" |
| `npx vitest run --fileParallelism=false` | 17 files / 108 tests passed, 2 files / 5 skipped (the pre-existing RLS / CI-only skips) |
| `npx playwright test e2e/onboarding.spec.ts e2e/app-shell.spec.ts` | 17/17 passed |
| `npx playwright test e2e/auth.spec.ts e2e/skeleton.spec.ts e2e/styleguide.spec.ts` | 13/13 passed, 1 skipped (the pre-existing CI-only webhook round-trip) — no regression |
| migration `0002_soft_zuras.sql` emitted | ✓ — ADD COLUMN × 2; NOT auto-applied (recorded in `deferred-items.md`) |
| no hardcoded site URLs | ✓ — Settings/Billing actions go through `compliance.*` + `billing.openPortal` which build URLs from `APP_URL` |
| no bare generic CTA labels | ✓ — Delete-account dismiss is "Keep my account"; Cancel-subscription dismiss is "Keep subscription"; "Skip for now" is the verb-bearing form |
| no spinners on full-page loads | ✓ — `/onboarding/review` uses `SkeletonBlock` rows (`bg-stone/60 animate-pulse`); the Button-level `isPending` states use copy ("Saving…" / "Opening…") not a spinner glyph |
| FND-12 funnel instrumented | ✓ — `knowledge_pack_step_viewed`, `deck_upload_step_viewed`, `review_step_viewed` fire from the three new step screens; the other events were already in place (Plan 07's tracker + Plan 07's server-side checkout events) |

## Deviations from Plan

None — the plan executed exactly as written. No bugs auto-fixed, no missing critical functionality added, no architectural changes needed.

One implementation choice the plan permitted:
- **Cancel-subscription confirm → Stripe Customer Portal (not a direct cancel mutation).** The UI-SPEC permits either approach; Plan 09's plan text explicitly notes "the Portal route is simpler and matches 'self-serve Customer Portal'." Implemented the Portal route. Recorded in key-decisions.

## Authentication gates

None. Plan 09 did not encounter any auth gate during execution — the schema change is local (drizzle-kit generate only; push is the operational step the founder runs).

## Known Stubs

- **`/app/page.tsx` always renders `<EmptyDashboard />`** — the `// TODO(Phase 2):` marker documents that Phase 2 (Memory) replaces the unconditional render with a real `hasBusinessMemory` check against the `businesses` table Phase 2 creates. Intentional — `businesses` is not a Phase-1 table per D-03.
- **Module placeholders (`/app/memory|pitch|pipeline|live-raise`)** — each renders an `<EmptyState>` with "Coming in Phase N" copy. Intentional — the real UI ships in Phases 2/3/4/5 respectively. The phase plan is on the ROADMAP; the user-facing copy makes the timeline transparent.
- **Onboarding step screens are UI shells** — the Knowledge Pack Import textarea + dropzone don't persist content; the deck upload dropzone + Slides URL input don't parse; the review-step skeleton doesn't reflect a real review. Intentional per the plan ("Phase 1 ships the screens, navigation between them, skeletons, and the instrumentation — not the feature logic"). The Continue/Skip "We'll process this when you finish onboarding" copy makes the contract honest. Real wiring lands Phases 2 (import → Business Memory) and 3 (deck → review).
- **The Phase-1 onboarding-skip-step analytics event is absent** — `skipStep` and `markStepComplete` currently fire the same step-viewed events. Phase 2 will add `*_step_skipped` events (a tiny AnalyticsEvent-union extension) when distinguishing skip vs. complete becomes useful for retention analysis.
- **The `/sign-out` route the Sidebar's DropdownMenu links to does not yet exist** — pre-existing from Plan 07's commit, not introduced by Plan 09. The sidebar's "Sign out" item routes to `/sign-out` but no handler is registered. Settings/Billing don't depend on it (Settings does its own `supabase.auth.signOut()` from the browser client post-deletion). Filed for Phase 11 (Polish + Launch) cleanup; not a Phase-1-blocker — the sidebar still works for navigation and the DropdownMenu's other items work.

## Pending operational steps (recorded in `deferred-items.md`)

1. Run the migration alongside Plan 07's: `DATABASE_URL=… DIRECT_URL=… npx drizzle-kit migrate`.
2. Manual end-to-end smoke against the Vercel preview — full walk-through from `/sign-up` through `/app/billing` (steps documented in `deferred-items.md`).

## Self-Check: PASSED

**Created files exist on disk:**
- `src/db/migrations/0002_soft_zuras.sql` — FOUND
- `src/server/routers/onboarding.ts` — FOUND
- `src/components/onboarding/stepper.tsx` — FOUND
- `src/app/(app)/onboarding/import/page.tsx`, `import-step.tsx` — FOUND
- `src/app/(app)/onboarding/deck/page.tsx`, `deck-step.tsx` — FOUND
- `src/app/(app)/onboarding/review/page.tsx`, `review-step.tsx` — FOUND
- `src/components/dashboard/cta-cards.tsx`, `empty-dashboard.tsx` — FOUND
- `src/app/(app)/app/{memory,pitch,pipeline,live-raise}/page.tsx` — FOUND (4 files)
- `src/app/(app)/app/settings/page.tsx`, `settings-view.tsx` — FOUND
- `src/app/(app)/app/billing/page.tsx`, `billing-view.tsx` — FOUND
- `e2e/onboarding.spec.ts`, `e2e/app-shell.spec.ts` — FOUND

**Task commits in `git log`:**
- `6c29c69` — FOUND (Task 1)
- `4a88dea` — FOUND (Task 2)
- `22193ce` — FOUND (Task 3)

---

*Phase: 01-foundation — this plan completes Phase 1.*
*Completed: 2026-05-13*
