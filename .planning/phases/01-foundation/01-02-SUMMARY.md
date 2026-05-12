---
phase: 01-foundation
plan: 02
subsystem: design-system
tags: [ui, shadcn, tailwind, design-system, app-shell, marketing-shell, styleguide]
requires: [01-01]
provides:
  - "tailwind.config.ts brand-token contract (8 colors, 7 fontSize keys, spacing scale, radii)"
  - "src/app/providers.tsx (QueryClientProvider + the extension slot Plans 05/07 register into)"
  - "src/components/ui/* — 14 themed shadcn components"
  - "src/components/primitives/* — FounderApprovalDialog (XC-02), DestructiveConfirmDialog, LegalDisclaimerBanner, EmptyState, ErrorState, SkeletonBlock, SectionDivider"
  - "src/components/shell/* — AppShell, Sidebar, TopBar"
  - "src/components/marketing/* — MarketingTopBar, Footer"
  - "src/components/brand/logo.tsx — Logo (lockup/mark variants)"
  - "/styleguide route — the Phase-1 design-system exit gate (19 sections)"
affects: [marketing-pages, auth-pages, app-pages, all-future-ui]
tech-stack:
  added: ["shadcn/ui (CLI v4.7, base preset)", "@base-ui/react", "class-variance-authority", "clsx", "tailwind-merge", "tw-animate-css", "shadcn (tailwind.css helper)", "sonner", "motion (already present)"]
  patterns: ["brand-token-only Tailwind", "providers.tsx extension-slot convention", "FounderApprovalDialog as the single external-send gate (XC-02)", "no-bare-CTA-label / Keep {noun} dismiss convention"]
key-files:
  created:
    - tailwind.config.ts
    - src/app/fonts.ts
    - src/app/providers.tsx
    - src/components/brand/logo.tsx
    - src/components/ui/{button,input,label,form,card,dialog,sheet,tabs,sonner,navigation-menu,avatar,badge,dropdown-menu,accordion}.tsx
    - src/components/primitives/{founder-approval-dialog,destructive-confirm-dialog,legal-disclaimer-banner,empty-state,error-state,skeleton-block,section-divider}.tsx
    - src/components/shell/{app-shell,sidebar,top-bar}.tsx
    - src/components/marketing/{marketing-top-bar,footer}.tsx
    - src/lib/utils.ts
    - components.json
    - src/app/(app)/styleguide/{layout,page,styleguide-demos}.tsx
    - tests/components/primitives.test.tsx
    - e2e/styleguide.spec.ts
  modified:
    - src/app/globals.css
    - src/app/layout.tsx
    - src/app/page.tsx
    - package.json
    - package-lock.json
decisions:
  - "Used the current shadcn CLI's default `base` preset (built on @base-ui/react), not the older Radix-based shadcn the UI-SPEC implicitly assumed — the CLI no longer offers a non-interactive Radix path. Components were re-themed to brand tokens; 'themed shadcn components, not a stock preset' still holds. (Deviation Rule 3.)"
  - "`form` is not in the shadcn `base` registry — hand-wrote src/components/ui/form.tsx (the standard react-hook-form wrapper) themed to brand tokens. (Deviation Rule 3.)"
  - "Tailwind v4 is CSS-first; kept a literal tailwind.config.ts (the DESIGN-REFERENCE artifact) referenced via `@config` in globals.css, and mirrored the same tokens into the v4 `@theme` block so utilities resolve. text-mono / text-mono-sm are `@utility` definitions (native text-base/text-sm + Geist Mono), not custom fontSize keys."
  - "/styleguide page is a 'use client' component (it wires onClick/onRetry demo handlers); session-gated in Plan 07, never entitlements()."
  - "Sonner sonner.tsx de-coupled from next-themes (not installed; app is light-only this phase)."
metrics:
  duration: ~1h
  completed: 2026-05-12
---

# Phase 1 Plan 02: Design System Summary

**One-liner:** Trochia design system stood up — shadcn/ui themed to the brand tokens (not a preset), the canonical Tailwind brand config, Geist/Inter/Geist-Mono via `next/font`, `providers.tsx` (QueryClientProvider + the extension slot), 14 themed components, the cross-cutting primitives (founder-approval Dialog [XC-02], destructive-confirm Dialog, legal-disclaimer banner, empty/error/skeleton states, section divider), the app shell + marketing top bar + footer, and `/styleguide` rendering all 19 sections — the Phase 1 styleguide exit gate.

## What shipped

### Task 1 — shadcn init, brand Tailwind config, fonts, providers, themed components (`88bf2b1`)
- `npx shadcn@latest init` (CLI v4.7, `base` preset, Tailwind v4, CSS variables, `src/` layout) → then re-themed.
- **`tailwind.config.ts`** (the canonical brand-token source, referenced via `@config` in `globals.css`):
  - colors: `paper #FAFAF7`, `ink #0A0E1A`, `graphite #6B7280`, `stone #ECEAE3`, `signal #F25C2A`, `success #0F9D58`, `warning #E5A100`, `danger #E53935`
  - fontFamily: `geist`/`inter`/`sans`(→Inter)/`mono`(→Geist Mono) on the `--font-*` CSS vars
  - **7 custom `fontSize` keys** (Geist's 4 + Inter's 3): `display` 4rem/1.05/-0.02em/600 · `h2` 2.5rem/1.1/-0.01em/600 · `h3` 1.625rem/1.25/500 · `h4` 1.25rem/1.3/500 · `body` 1.0625rem/1.65/400 · `body-sm` 0.9375rem/1.55/400 · `label` 0.8125rem/1.4/0.04em/500. **No mono fontSize key** — `text-mono` / `text-mono-sm` are `@utility` defs in `globals.css` (Geist Mono on native `text-base` / `text-sm`).
  - maxWidth: `content` 1200px, `prose` 65ch · spacing: `section` 8rem (128px), `section-sm` 5rem (80px) · borderRadius: `lg` 8px, `xl` 12px, `full`
  - `globals.css` `@theme` mirrors all of the above as `--color-*` / `--text-*` / `--spacing-*` / `--radius-*`, and maps shadcn's theme vars (`--background`→paper, `--foreground`→ink, `--primary`→ink, `--border`/`--input`→stone, `--ring`→ink, `--destructive`→danger, sidebar vars, chart ink-ramp) onto the tokens. Includes a global `prefers-reduced-motion: reduce` block.
- **`src/app/fonts.ts`** — `Geist` (600/700, `--font-geist`), `Inter` (400/500, `--font-inter`), `Geist_Mono` (400, `--font-geist-mono`) via `next/font/google`; `fontVariables` convenience export.
- **`src/app/providers.tsx`** — `'use client'`; `QueryClientProvider` with a lazily-initialised client (`useState(makeQueryClient)`); a clearly-marked extension-point comment. **The single place downstream plans register context providers** — mounted once in `layout.tsx` as `<Providers>{children}</Providers>`.
  - **Convention for Plans 05/07:** wrap `{children}` inside `Providers` — `Plan 05 → <AnalyticsProvider>`, `Plan 07 → <TRPCReactProvider>` — never re-edit `layout.tsx`.
- **`src/app/layout.tsx`** — applies the font CSS-var classes to `<html>`, `<body className="bg-paper text-ink ...">`, renders `<Providers>{children}</Providers>`, light-only (`viewport.colorScheme: 'light'`, `themeColor: '#FAFAF7'`), and a full `export const metadata` wiring all `public/` brand assets (`favicon.svg` + 16/32 PNGs, `apple-touch-icon`, `android-chrome` 192/512, `og-image`) via the Next metadata API. `metadataBase` / OG `url` from `@/lib/env` `SITE_URL` — never hardcoded.
- **14 shadcn components installed + themed** in `src/components/ui/`: `button` (5 brand variants — `primary` bg-ink, `signal` bg-signal, `secondary` bg-paper+border-stone, `ghost`, `link`; sizes `default` h-11 / `mobile` h-12 / `compact` h-9 + icon aliases; `active:scale-[0.98]`; no `xs`; `default`/`outline`/`destructive` aliases kept), `input` (bg-paper border-stone rounded-lg h-11 px-4 text-body, error→border-danger), `label` (text-label text-graphite mb-2 block), `form` (hand-written RHF wrapper — `Form`/`FormField`/`FormItem`/`FormLabel`/`FormControl`/`FormDescription`/`FormMessage`; error helper `text-body-sm text-danger mt-1.5`, field gets `aria-invalid`), `card` (bg-paper border-stone rounded-xl p-8, no shadow/lift; `interactive` → hover:border-ink/20; `featured` → border-2 border-signal), `dialog` (paper surface, 1px stone border, the one allowed modal shadow `0 8px 24px rgba(10,14,26,0.08)`, fade+slight-up ~250ms; X close labelled "Dismiss"), `sheet` (themed; "Dismiss" close), `tabs`, `sonner` (light, bottom-right, ~4s, no decorative icons; de-coupled from next-themes), `navigation-menu`, `avatar`, `badge` (`signal` "Most chosen" / `phase` "Phase N" mono-sm / `default` / `outline`), `dropdown-menu`, `accordion`. **No deferred components installed** (DataTable, cmdk, Combobox, Calendar, Progress, Slider, Switch, Tooltip).
- **`src/components/brand/logo.tsx`** — `<Logo>` rendering `public/brand/lockup-horizontal.svg` (default) or `mark-color.svg` (`variant="mark"`), with a clear-space padding box; links to `/` unless `href={null}`.

### Task 2 — cross-cutting primitives + app shell + marketing shell (`526f0ed`)
- **`src/components/primitives/`**:
  - **`FounderApprovalDialog`** (XC-02) — `{ thing, recipient, contentPreview, onSend, onKeepEditing, open, onOpenChange, primaryVariant? }`. Renders `Dialog` titled `Send this {thing}?`, a read-only `recipient` + `contentPreview` block, primary `Send {thing}` (noun-bearing, never bare "Send"; `primaryVariant` = `'primary'`|`'signal'`), secondary `Keep editing`. JSDoc: the single sanctioned gate for anything that leaves Trochia; later-phase send flows MUST route through it.
  - **`DestructiveConfirmDialog`** — `{ title, body, confirmVerbNoun, dismissKeepNoun, requireTypedConfirmation?, onConfirm, onDismiss, open, onOpenChange, secondaryAction? }`. `bg-danger` confirm carrying `confirmVerbNoun`; if `requireTypedConfirmation` set, confirm disabled until an input matches; dismiss = literal `dismissKeepNoun`; dev assertion that `dismissKeepNoun` starts with `"Keep "`.
  - **`LegalDisclaimerBanner`** — `{ variant: 'not-legal-advice' | 'affiliate' }`. Thin `bg-stone/60 border border-stone rounded-lg p-4 text-body-sm text-graphite` strip with the canonical, banned-string-safe copy ("Trochia is not a law firm and does not provide legal advice. Consult your lawyer." / "Trochia may earn a referral fee from vendors listed here.").
  - **`EmptyState`** — `{ heading, body, primaryCtaLabel, primaryCtaHref }`. 64px Mark, H3, body, one primary CTA, `max-w-md py-32` centered.
  - **`ErrorState`** — `{ heading? (default "Something went wrong."), body, onRetry, supportHref }`. "Try again" + "Contact support" link; never a stack trace.
  - **`SkeletonBlock`** — `{ className? }`. `bg-stone/60 animate-pulse rounded-lg`; no spinner.
  - **`SectionDivider`** — `{ label? }`. `flex items-center gap-4 my-20`: `text-mono-sm uppercase tracking-wider text-graphite` label + `h-px flex-1 bg-stone`.
- **`src/components/shell/`**:
  - **`Sidebar`** — `{ activeHref?, userName?, userEmail? }`. `w-60 bg-paper border-r border-stone`; `<Logo>` top; nav order Business Memory · Pitch Lab · Pipeline · Live Raise · Data Room (disabled, "Phase 7" badge) · Raise Ops (disabled, "Phase 9" badge); nav item classes `flex items-center gap-3 px-3 h-10 rounded-md text-body-sm font-medium text-graphite hover:bg-stone/50 hover:text-ink`, active `bg-stone text-ink`, disabled `text-graphite/50 cursor-not-allowed` + right-aligned `Badge variant="phase"`; bottom: Settings + user avatar `DropdownMenu` (Settings / Billing / Sign out).
  - **`TopBar`** — `{ title, actions? }`. `h-14 bg-paper border-b border-stone px-8`, title `text-h3` left, actions slot right.
  - **`AppShell`** — `{ title, actions?, activeHref?, userName?, userEmail?, children, qaOpen? }`. Composes `Sidebar` + `TopBar` + content slot + an empty `Sheet`-mounted right-side region (`qaOpen` defaults false) reserved for the Phase-2 ambient Q&A sidebar.
- **`src/components/marketing/`**:
  - **`MarketingTopBar`** — `'use client'`, scroll listener. `h-16 bg-paper/95 backdrop-blur-sm sticky top-0 z-40`, `border-b border-stone` only when `window.scrollY > 8`; left `<Logo>` → `/`; center nav "How it works" / "Pricing" / "Manifesto" (no Docs/Changelog); right "Sign in" link + "Start raising" primary; mobile hamburger → top-`Sheet`.
  - **`Footer`** — three columns + mark line: col1 `<Logo>` + "The agentic operator for your raise."; col2 Product (Pricing / Manifesto / Status — no Changelog); col3 Legal (Privacy / Terms / Security / DPA); bottom © 2026 Trochia + mark + X / LinkedIn; `text-body-sm text-graphite`. (Hrefs point at Plans-07–09 routes — broken now, correct paths.)
- **`tests/components/primitives.test.tsx`** (vitest jsdom): FounderApprovalDialog with `thing="outreach"` → primary text exactly `"Send outreach"`, no exact-text `"Send"`/`"Cancel"` button, recipient shown; `thing="follow-up"` → `"Send follow-up"`; DestructiveConfirmDialog with `dismissKeepNoun="Keep my account"` + `requireTypedConfirmation="DELETE"` → confirm disabled until input is `"DELETE"`; LegalDisclaimerBanner → "is not a law firm" / "does not provide legal advice" / affiliate "referral fee". **5/5 pass.**
- `sheet.tsx` X close relabelled "Dismiss" (no bare ">Close<" in `src/components/`).

### Task 3 — `/styleguide` route, all 19 sections, e2e smoke spec (`a799f96`)
- **`src/app/(app)/styleguide/layout.tsx`** — sticky TOC sidebar (anchors to all 19 sections) + wide content column + a mounted `<Toaster />`. Comment: session-gated in Plan 07, **never** `entitlements()`.
- **`src/app/(app)/styleguide/page.tsx`** (`'use client'`) — 19 sections, in order:
  1. **Color tokens** — 8 swatches (`data-testid="color-swatches"`) with hex + name + role; "Signal usage" reserved-list callout.
  2. **Typography specimens** — every type class with name/font/size/weight/tracking/line-height/sample (Geist + Inter + Geist Mono); per-typeface guardrail-exception panel (Geist 4 / Inter 3 / Geist Mono 2; mono = native sizes; 7 config keys = expected).
  3. **Spacing scale** — visual bars per token + the `section` 80/128 value.
  4. **Buttons** — all 5 variants × `compact`/`default`/`mobile` × default/disabled/with-icon/icon-only; `signal` flagged "use once per surface"; no `xs` note.
  5. **Inputs & Form** — Input default/error/disabled, Label, Textarea, and a `react-hook-form` + Zod `SampleForm` showing a live "Enter a valid email address." error.
  6. **Cards** — default, interactive (hover:border-ink/20), featured (`border-2 border-signal` + "Most chosen" Signal `Badge`).
  7. **Dialog** — `PlainDialogDemo` (dismiss = **"Keep draft"**, primary "Discard draft" — no bare Cancel/OK/Close), `FounderApprovalDialogDemo` (title "Send this outreach?", primary **"Send outreach"**, secondary "Keep editing", placeholder content), `DestructiveConfirmDialogDemo` ("Delete account" / "Keep my account" / typed `DELETE`).
  8. **Sheet** — right-side panel (Q&A slot shape) + top sheet (mobile-nav pattern).
  9. **Tabs** — Monthly/Annual (pricing-toggle mimic).
  10. **Toast** — `ToastDemo` buttons firing Sonner `"Deck uploaded."` / `"Couldn't upload your deck. …"`.
  11. **NavigationMenu** — the marketing nav standalone.
  12. **Avatar** — sizes 6/9/12 + fallback initials.
  13. **Badge** — "Most chosen" (signal), "Phase 6" (phase), "New" (default), "Default" (outline).
  14. **DropdownMenu** — the sidebar user menu standalone.
  15. **Accordion** — 3-question sample FAQ.
  16. **Cross-cutting primitives** — `SkeletonBlock`s, `EmptyState`, `ErrorState`, `SectionDivider`, `LegalDisclaimerBanner` (both variants).
  17. **App shell** — `Sidebar` + `TopBar` in a framed preview.
  18. **Motion examples** — hover (120ms ease-out), page-enter fade-up (200ms), scroll-reveal (300ms), modal/sheet enter (250ms), hero live-element loop (800ms/step ease-in-out, 2s pause) — each with a "reduced motion" toggle showing the static fallback and a duration+easing label; built with `motion` (not framer-motion); global `prefers-reduced-motion` block also applies.
  19. **Iconography** — Lucide sampler at 16/20/24, Ink, 1.5px stroke.
- **`styleguide-demos.tsx`** (`'use client'`) — `ToastDemo`, `PlainDialogDemo`, `FounderApprovalDialogDemo`, `DestructiveConfirmDialogDemo`, `SampleForm`, `MotionExamples` (+ `HeroTimelineLoop`).
- **`e2e/styleguide.spec.ts`** (Playwright): `/styleguide` returns 200; all 19 section headings visible; `color-swatches` has 8 children; opening the founder-approval demo shows "Send outreach" + "Keep editing", no exact "Send" button; the plain modal's dismiss is "Keep draft", no exact "Cancel"/"OK"/"Close"; a second test asserts the page renders without an auth/entitlements gate. **2/2 pass.**

## Verification (all green)
- `npm run build` exits 0 (routes: `/`, `/_not-found`, `/styleguide`).
- `npm run lint` — 0 errors, 0 warnings.
- `npm run typecheck` — clean.
- `npm run check:banned` — no violations.
- `npx vitest run tests/components/primitives.test.tsx` — 5/5 pass.
- `npx playwright test e2e/styleguide.spec.ts` — 2/2 pass.
- `tailwind.config.ts` has exactly the 8 brand color tokens and 7 custom `fontSize` keys (no mono key).
- `src/app/providers.tsx` exists (`QueryClientProvider` + extension slot); `layout.tsx` mounts `<Providers>` and reads the site URL from `@/lib/env`.
- No pure `#000`/`#FFF` in component/style files (only a comment in `globals.css` mentions the hex literals); no bare `>Cancel<`/`>OK<`/`>Submit<`/`>Close<`/`>Send<` in `src/components/`.
- `/styleguide` route + layout contain no `entitlements()` call (only comments saying it must never be gated).

## Deviations from Plan

### Auto-fixed / forced by tooling reality

**1. [Rule 3 — Blocking tooling] Used shadcn CLI's default `base` preset (@base-ui/react), not Radix-based shadcn**
- **Found during:** Task 1.
- **Issue:** `npx shadcn@latest init` (CLI v4.7) has no non-interactive Radix path; its default `base`/`base-nova` preset is built on `@base-ui/react` and ships components with a different aesthetic (`ring`-instead-of-`border` cards, an `xs` button size, `bg-muted/50` footers, etc.) than the Radix-based shadcn the UI-SPEC implicitly assumed.
- **Fix:** Accepted the `base` preset, then re-themed each component to the brand tokens (Button → 5 brand variants + brand sizes, no `xs`; Card → `border border-stone rounded-xl p-8`, no shadow/ring, `interactive`/`featured` variants; Input/Label → brand classes; Dialog/Sheet → paper surface + the one allowed shadow, "Dismiss" close; Badge → `signal`/`phase` variants; Sonner → de-coupled from `next-themes`). "Themed shadcn components, not a stock preset" still holds.
- **Files:** `components.json`, `src/components/ui/*`, `src/lib/utils.ts`.
- **Commit:** `88bf2b1` (+ sheet tweak in `526f0ed`).

**2. [Rule 3 — Blocking tooling] `form` block not in the `base` registry — hand-wrote `src/components/ui/form.tsx`**
- **Found during:** Task 1.
- **Issue:** `npx shadcn@latest add form` is a no-op against the `base` registry.
- **Fix:** Hand-wrote the standard react-hook-form wrapper (`Form`/`FormField`/`FormItem`/`FormLabel`/`FormControl`/`FormDescription`/`FormMessage`), themed to brand tokens, error helper `text-body-sm text-danger mt-1.5`, field `aria-invalid`. `FormControl` clones the child to forward `id`/`aria-*` (no `@radix-ui/react-slot` dependency added).
- **Files:** `src/components/ui/form.tsx`.
- **Commit:** `88bf2b1`.

**3. [Rule 3] `/styleguide/page.tsx` made a Client Component**
- **Found during:** Task 3 (build).
- **Issue:** The page passes `onClick`/`onRetry` demo handlers to `ErrorState`/buttons; Next.js prerender fails when a Server Component passes event handlers to a Client Component.
- **Fix:** Added `'use client'` to `styleguide/page.tsx`. (Still session-gated in Plan 07, never `entitlements()`.)
- **Files:** `src/app/(app)/styleguide/page.tsx`.
- **Commit:** `a799f96`.

**4. [Rule 3] `sonner.tsx` de-coupled from `next-themes`**
- The shadcn-generated `sonner.tsx` imports `next-themes` (not installed; app is light-only this phase). Replaced with `theme="light"`, `position="bottom-right"`, `duration={4000}`. Commit `88bf2b1`.

**5. [Rule 3] Worktree was branched before the 01-01 scaffold landed**
- The executor worktree branch (`worktree-agent-…`) was created from the UI-SPEC commit, before `phase-1-foundation` got the 01-01 scaffold. Merged `phase-1-foundation` into the worktree branch at start so the scaffold (`src/lib/env.ts`, `eslint.config.mjs`, `package.json`, etc.) was present. No content changes — just a fast-forward-style merge of prior-wave work. Also added a local `.env.local` (gitignored) with the two required `NEXT_PUBLIC_*_URL` vars so `npm run build` / tests run (the env contract requires them).

**Tailwind-v4 note (not a deviation, a clarification):** Tailwind v4 is CSS-first. Kept a literal `tailwind.config.ts` (the DESIGN-REFERENCE artifact) wired in via `@config` in `globals.css`, and mirrored the same tokens into the v4 `@theme` block so utilities (`bg-paper`, `text-display`, …) resolve. `text-mono` / `text-mono-sm` are `@utility` definitions (Geist Mono on native `text-base`/`text-sm`), deliberately not custom `fontSize` keys — so the per-typeface guardrail holds and the config has exactly 7 fontSize keys.

## Authentication gates
None.

## Known Stubs
- `src/components/marketing/footer.tsx` and `MarketingTopBar` link to marketing/legal/app routes (`/pricing`, `/manifesto`, `/sign-up`, `/legal/*`, `/app/*`) that ship in Plans 07–09 — the hrefs are correct but the destinations don't exist yet (broken links, by design — the plan says so).
- `src/app/page.tsx` is a placeholder homepage (logo + hero text + a "See the design system →" link) — the full marketing homepage is a later Phase-1 plan.
- App-shell `Sidebar` nav items point at `/app/memory|pitch|pipeline|live-raise|settings|billing` which don't exist yet (Plans 07–09).
- These are intentional Phase-1 stubs; none blocks the plan's goal (the design system + `/styleguide` exit gate).

## For downstream plans
- **Plans 05 / 07 (context providers):** add your provider inside `src/app/providers.tsx`, wrapping `{children}` — `Plan 05 → <AnalyticsProvider>`, `Plan 07 → <TRPCReactProvider>`. **Do not edit `layout.tsx`.**
- **Plans 07–09 (UI consumers):** import the themed components from `@/components/ui/*`, the primitives from `@/components/primitives/*`, the shell from `@/components/shell/*` (`<AppShell title=… activeHref=…>`), the marketing chrome from `@/components/marketing/*`, and `<Logo>` from `@/components/brand/logo`. The brand tokens are `tailwind.config.ts` + the `@theme` block — never introduce a Tailwind color/font outside them. Every external send must route through `<FounderApprovalDialog>` (XC-02); every destructive action through `<DestructiveConfirmDialog>` ("Keep {noun}" dismiss, never bare "Cancel").
- **`/styleguide`** is the living component catalogue — extend it (don't fork it) when you add components in later phases.

## Self-Check: PASSED

All listed created files exist on disk; all three task commits (88bf2b1, 526f0ed, a799f96) are present in the branch history.
