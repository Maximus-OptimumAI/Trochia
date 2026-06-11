# UI Bundle — Fix Plan (2026-06-10)

Branch: `fix/ui-bundle` (off `origin/main` @ `5c030bb`, incl. qa-robustness #10).
Scope: 4 minimal functional fixes + 1 read-only status check. **No restyling, no nav
redesign, no schema/backend changes.** Visuals are owned by the queued design-adoption
cycle — do not pre-empt.

Verify gate for all fixes: `npm run typecheck` + `npm run test`. Sign-out also `npm run test:e2e` optional.

---

## Fix 1 + Fix 4 — Sidebar logo: routing + size (ONE line)

**Root cause.** `Logo` defaults `href='/'` (`src/components/brand/logo.tsx:27`). The
sidebar renders `<Logo height={26} />` (`src/components/shell/sidebar.tsx:99`) with no
override. The sidebar lives only in the `(app)` route group (always authenticated, proxy-
gated), so clicking it sends an authed user to the marketing hero `/`. Session is **not**
actually lost (proxy treats `/` as public, cookies intact) — the marketing top bar just
renders a logged-out CTA, so it *looks* signed out. Size is driven by the numeric `height`
prop → inline style (`logo.tsx:48`), **not** a CSS token/class (see note).

**Change — `src/components/shell/sidebar.tsx:99`**
```
-        <Logo height={26} />
+        <Logo href="/app" height={32} />
```
- `href="/app"` → authed users land on the dashboard (Fix 1).
- `height={32}` → larger mark; 32 matches the lockup's intended scale (Fix 4).
- No change to `marketing-top-bar.tsx:48` (`<Logo height={26} />`): unauthenticated hero
  header should stay `→ /`. *Optional consistency:* bump that call to `height={32}` too —
  recommend yes, but it is not the reported bug; leave to founder.

**Note (honest flag).** The scope says "fix via the CSS token/class." There is no size
token — `logo.tsx` sizes the `<img>` via the `height` prop → inline `style`. The correct
minimal lever is the prop. No Tailwind class change is possible without restyling the
component (out of scope).

**Test (new): `tests/components/shell/sidebar.test.tsx`**
- Renders `<Sidebar activeHref="/app" />`, asserts the logo anchor `href === '/app'`
  (guards Fix 1 regression back to `/`).
- Asserts the rendered logo `<img height>` is `32` (guards Fix 4). (Also covers Fix 2a — see below.)

---

## Fix 2a — Sidebar: add "Dashboard" nav item

**Root cause.** `NAV` (`src/components/shell/sidebar.tsx:39-46`) lists modules but no
Dashboard entry. Active-state is exact-match (`item.href === activeHref`, line 103) and the
dashboard page sets `activeHref="/app"` (`src/app/(app)/app/page.tsx:69`), so a `/app` item
highlights only on the dashboard — no prefix-collision handling needed.

**Change — `src/components/shell/sidebar.tsx`**
- Import icon (line 2-11 block): add `LayoutDashboard` to the `lucide-react` import.
- Prepend to `NAV` (line 40, as first item):
  ```
  { label: 'Dashboard', href: '/app', icon: LayoutDashboard },
  ```

**Test:** covered by `tests/components/shell/sidebar.test.tsx` — assert a nav link with
text "Dashboard" resolves to `href="/app"`.

---

## Fix 2b — Memory-aware dashboard CTA

**Root cause.** `src/app/(app)/app/page.tsx:64` hardcodes `const hasBusinessMemory = false;`
(Phase-1 TODO), so `<EmptyDashboard />` ("Start Business Memory") always renders — even when
the account has confirmed memory. Confirmed state = `business_memory.confirmed_at IS NOT NULL`
for the tenant; one row per tenant keyed on `account_id`
(`src/db/schema/memory.ts:134-136,155,165`). The page already resolves `account` and holds a
`getServiceClient()` Drizzle handle (page.tsx:42-47).

**Change — `src/app/(app)/app/page.tsx`**
1. Import `businessMemory` from `@/db/schema` (alongside `accounts`, line 9).
2. Replace the hardcoded flag (line 64) with a real read, scoped to the resolved account:
   ```ts
   const memory = await service.query.businessMemory.findFirst({
     where: eq(businessMemory.accountId, account.id),
     columns: { confirmedAt: true, companyName: true },
   });
   const hasConfirmedMemory = !!memory?.confirmedAt;
   ```
   (`eq` already imported, page.tsx:2. Service client is correct here — `account` is the
   user's own row already resolved; filtering by `account.id` is the tenant scope.)
3. Swap the render (page.tsx:90):
   ```
   -        {!hasBusinessMemory && <EmptyDashboard />}
   +        {hasConfirmedMemory
   +          ? <MemorySummaryCard companyName={memory?.companyName ?? null} href="/app/memory" />
   +          : <EmptyDashboard />}
   ```

**New component (minimal, required by the CTA state):**
`src/components/dashboard/memory-summary-card.tsx` — a thin presentational card:
"Business Memory" heading, optional `companyName` line, and a link → `/app/memory`
("View workspace"). Reuse the existing card container classes from `EmptyDashboard` /
`CtaCards`; **no new design tokens, no restyle** — structurally minimal, design cycle owns polish.

**Test (new): `tests/components/dashboard/memory-summary-card.test.tsx`**
- Renders `MemorySummaryCard` → asserts link `href="/app/memory"` and that
  "Start Business Memory" copy is **absent**.
- (`EmptyDashboard` keeps showing the start CTA — existing behavior, no test change.)
- Page-level wiring (the `findFirst`/boolean) is covered by `npm run typecheck`; the server
  component itself is not unit-tested (DB-backed) — consistent with the repo's current dashboard coverage.

---

## Fix 3 — Sign-out 404

**Root cause.** Sidebar links `Sign out → /sign-out` (`src/components/shell/sidebar.tsx:127`),
but no route resolves `/sign-out` (no `route.ts`/`page.tsx`). 404. Sign-out logic exists only
inside the account-deletion flow (`settings-view.tsx:59`), not as a general handler.
The proxy classifies `/sign-out` as `public` → pass-through, no getUser, no redirect
(`src/proxy.ts:44-58,73`), so a route handler at that path is reachable by an authed user.

**Change — new file `src/app/(auth)/sign-out/route.ts`** (mirrors `src/app/auth/callback/route.ts`):
```ts
import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { APP_URL } from '@/lib/env';

export async function GET() {
  const supabase = await createServerSupabaseClient();
  await supabase.auth.signOut();            // clears auth cookies via SSR client
  return NextResponse.redirect(new URL('/sign-in', APP_URL));
}
```
- Route group `(auth)` does not affect the URL → resolves at `/sign-out`. Keep the sidebar
  link target unchanged.
- **Prefetch guard (belt-and-suspenders):** set `prefetch={false}` on the sign-out `Link`
  (`sidebar.tsx:127`). Next does not prefetch route handlers, but this removes all doubt that
  hover-prefetch could trigger a sign-out.

**Test (new): `tests/auth/sign-out.test.ts`** (model: `tests/auth/callback.test.ts`)
- Mocks `createServerSupabaseClient`; asserts `auth.signOut()` is called and the response is a
  redirect to `/sign-in`.

---

## Read-only check — Deck-upload UI path (FINDINGS ONLY, no code)

**Verdict: NOT wired — the UI is a placeholder. The `deck/uploaded` event is never emitted.**

Chain status:
| Hop | Status | Location |
|---|---|---|
| Inngest listener (`deck/uploaded`) | ✅ present but **stub** (no-op body) | `src/inngest/functions/stubs.ts:22-27` (`deck-parse`) |
| Event sender (`inngest.send({name:'deck/uploaded'})`) | ❌ **none in repo** | — |
| Upload UI (file input) | ⚠️ inert — input has **no onChange / no submit handler** | `src/app/(app)/onboarding/deck/deck-step.tsx:67-72` |
| Onboarding mutation | advances step only; no file handling, no event | `src/server/routers/onboarding.ts:52-96` (`markStepComplete` / `skipStep`) |
| Storage step | ❌ no upload route, no storage bucket call | — |
| DB persistence | ❌ no `decks`/`pitches` table | `src/db/schema/index.ts` (no deck table) |

The "Continue" action calls `markStepComplete({step:'deck'})` → sets `accounts.onboarding_step`
to `review`; the file is never read, stored, or sent. Listener exists with no producer. Deck
parsing is deferred to Phase 2/3 (Pitch Lab) per the in-file comment. **No action this bundle**
— surfaced for roadmap visibility only.

**Logged: `FOLLOWUP-DECK-UPLOAD-NOT-WIRED-01`** (Pitch Lab). Full wiring is four pieces:
(1) UI submit handler on the dropzone (`deck-step.tsx:67-72`), (2) file storage (Supabase
bucket) + a `decks`/`pitches` table, (3) `inngest.send({ name: 'deck/uploaded', … })` on
persist, (4) the parser body in `deck-parse` (`stubs.ts:22-27`, currently a no-op).

---

## Files touched (implementation summary)

| Fix | File | Type |
|---|---|---|
| 1+4 | `src/components/shell/sidebar.tsx:99` | edit (1 line) |
| 2a | `src/components/shell/sidebar.tsx:2-11, 40` | edit (import + 1 array entry) |
| 2b | `src/app/(app)/app/page.tsx:9, 64, 90` | edit |
| 2b | `src/components/dashboard/memory-summary-card.tsx` | new (minimal) |
| 3 | `src/app/(auth)/sign-out/route.ts` | new |
| 3 | `src/components/shell/sidebar.tsx:127` | edit (`prefetch={false}`) |
| tests | `tests/components/shell/sidebar.test.tsx` | new |
| tests | `tests/components/dashboard/memory-summary-card.test.tsx` | new |
| tests | `tests/auth/sign-out.test.ts` | new |

npm scripts (verified against `package.json`): `npm run typecheck`, `npm run test`,
`npm run test:e2e` (all exist).

**STOP — awaiting founder review before implementation.**
