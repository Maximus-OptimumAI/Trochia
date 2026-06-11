# Design Adoption Plan — Dialog Layout/Experience System on Trochia Tokens

**Date:** 2026-06-11 · **Branch:** `feat/design-adoption` (off `origin/main` @ `0c204b2`)
**Status:** PLAN ONLY — awaiting founder review. No implementation in this branch yet beyond the verbatim reference copy at `docs/design/REFERENCE-dialog.md`.

---

## Verdict

Adopt Dialog's layout + experience system (radii, two-tone surfaces, flush shadows, center-stack hero flow, pill nav, single-accent CTA discipline) re-valued onto Trochia tokens, with Geist Light replacing PP Radio Grotesk at the Dialog type scale. This **supersedes parts of `docs/DESIGN-REFERENCE.md`** (Harmonic/Firecrawl canon) — the conflict register below resolves every contradiction explicitly so no future session inherits ambiguity. Two contrast issues found and resolved in-plan: the current `signal` button variant (Paper-on-Signal, 3.2:1) **fails AA** and must become Ink-on-Signal (5.8:1, passes); Graphite-on-Paper body passes AA at 4.6:1 but with no margin — usage rule added.

---

## Inputs and evidence

| Input | Location | Status |
|---|---|---|
| Dialog style reference (REFERENCE-ONLY — Dialog's brand values, not adopted) | `docs/design/REFERENCE-dialog.md` | Copied verbatim from `Downloads/DESIGN.md`; SHA-256 verified identical |
| Trochia brand v1.0 | `docs/BRAND.md` | Read; v1.1 bump planned (typography section) |
| Current design canon | `docs/DESIGN-REFERENCE.md` | Read; partially superseded — see conflict register |
| Build constraints | `tasks/constraints.md` | Read; all rails honored |
| Live-site motion audit | This session, Playwright against `https://www.askdialog.com` 2026-06-11 | Findings below |
| Current token implementation | `tailwind.config.ts`, `src/app/globals.css`, `src/app/fonts.ts` | Read; change set scoped below |

### Live-site motion audit (first-party, Playwright)

Dialog is a **Framer site** (`meta generator: Framer`). Verified findings:

| # | Pattern | Evidence |
|---|---|---|
| 1 | **Hero ambient "Orb"** — a 1600px circular element behind the hero with soft colored glows: `box-shadow: rgb(245,178,152) 0 -144px 32px -288px, rgb(218,199,255) 0 144px 32px -288px` (peach above, lavender below), mostly off-screen above the fold. Companion 1600×720 canvas renders a **static** texture (two sampled frames identical — grain/gradient, not animated). | Computed styles + canvas frame diff |
| 2 | **Hero product demo is an autoplay video** — `hero_01.mp4`, `autoplay loop muted playsinline`, 1200×647, R2-hosted. The only `<video>` on the page. | DOM inspection |
| 3 | **Hero entrance** — one ~2000ms linear animation at load on a hero container; 8 elements carry Framer appear effects (fade-up: opacity + small translateY, `transition: all`). | `document.getAnimations()` + appear-element sampling |
| 4 | **Testimonial marquee** — a `<ul>` of 24 items animating at **60.8s linear, infinite** — very slow horizontal drift. | `getAnimations()` timing |
| 5 | **Nav scroll behavior** — Framer variant swap `"Desktop — Dark"` → `"Desktop — Light (scrolled)"` by ~900px scroll. Inner nav container is a **465px-wide pill, border-radius 32px**, transparent over the dark hero, white when scrolled. | Variant names + computed styles at 0 / 900px |
| 6 | **Secondary canvas** — 400×400 in a "UI Elements" feature section (decorative orb repeat). | DOM inspection |
| 7 | **Lottie** — play/pause icon states only (`Lottie (Play)` / `Lottie (Pause)`), not decorative animation. | Framer layer names |
| 8 | **`prefers-reduced-motion`: zero handling.** No reduced-motion rules in any stylesheet. The marquee, video, and appear effects run unconditionally. | Stylesheet scan |
| 9 | Page ~8,740px tall; alternating `Text Right` / `Text Left` 2-col feature sections; no GSAP/Lenis/Locomotive — all motion is Framer-native (WAAPI). | Layer names + `window` probe |

Item 8 is a gap we explicitly do better on (motion-reduce discipline stands).

---

## Locked founder decisions (restated, baked in)

1. **Adopt Dialog's layout + experience system**: spacing scale; radii (24px cards / 28px pill buttons / 0px inputs / pill nav); flush low-elevation shadows; two-tone surface system; hero center-stack → mockup → alternating 2-col features → carousel flow; single-accent CTA discipline.
2. **Trochia tokens, not Dialog's**: Tangerine `#f69251` → **Signal `#F25C2A`** (CTA-only, one moment per surface) · Fog `#f7f7f7` → **Paper `#FAFAF7`** (canvas); cards **`#FFFFFF`** · Carbon `#000` / Midnight Ink `#181825` → **Ink `#0A0E1A`** (never pure black) · Dialog grays → **Graphite `#6B7280`** (secondary text) / **Stone `#ECEAE3`** (borders).
3. **Typography**: display/section headings = **Geist Light (300/400)** at the Dialog scale (32/50/70px, tight tracking) — replaces PP Radio Grotesk (not licensing). Body = Inter 400 (unchanged). Numeric/code = Geist Mono (unchanged). **No new font families.**
4. **Deliverable docs first**: (a) `docs/design/DESIGN.md` — canonical Trochia design system with every BRAND-vs-Dialog conflict resolved; (b) `docs/BRAND.md` → v1.1 (typography section), per its own version-bump rule.
5. **Phasing**: Phase A = public landing page. Phase B = authed app shell restyle. Phase A is the first implementation slice.
6. **Motion**: brand-matched replacements for Dialog's background animations/videos; `prefers-reduced-motion` honored; progressive enhancement only — page complete without motion.

---

## Token mapping (Dialog → Trochia)

Tokens once, in `tailwind.config.ts` + the `@theme` mirror in `src/app/globals.css`. **No hardcoded hex in components.**

### Color

| Dialog token | Dialog value | Trochia token | Trochia value | Role |
|---|---|---|---|---|
| Fog | `#f7f7f7` | `paper` | `#FAFAF7` | Page canvas (level 0) |
| Snow | `#ffffff` | `card` (new token) | `#FFFFFF` | Card surfaces, nav pill, mockup frames (level 1) |
| Tangerine Tag | `#f69251` | `signal` | `#F25C2A` | CTA fill ONLY — one moment per surface |
| Carbon / Midnight Ink | `#000` / `#181825` | `ink` | `#0A0E1A` | Headings, body, CTA text — never pure black |
| Stone/Graphite (Dialog grays) | `#636363` / `#484758` | `graphite` | `#6B7280` | Secondary text, meta, nav labels |
| Pebble/Ash | `#949494` / `#8b8b8b` | `graphite` (placeholders use `graphite`, disabled use `graphite/50`) | — | No new gray tokens |
| Dialog borders | `#b2b2b2` | `stone` | `#ECEAE3` | Hairlines, dividers, skeletons |
| Deep Slate (dark cards) | `#242433` | `ink` | `#0A0E1A` | Optional dark contrast panel (at most one per page) |
| Dusty Rose / Peach Whisper | — | **not adopted** | — | Dialog brand color; violates single-accent rule |

**New token `card: #FFFFFF`** is the one sanctioned use of pure white — surface only, never text. BRAND v1.1 records the carve-out ("Paper is the canvas, Card is the raised surface; pure white never appears as a text color"). Never-pure-black stands with no exceptions.

### Typography (BRAND v1.1)

| Level | Font | Size (desktop / mobile) | Weight | Tracking | Replaces |
|---|---|---|---|---|---|
| Display (hero H1) | Geist | 70px / 44px | **300** | -0.01em (≈ -0.7px) | Geist 600 56–72px -2% |
| Heading-lg (section H2) | Geist | 50px / 36px | **300** | -0.01em (≈ -0.5px) | Geist 600 36–44px -1% |
| Heading (H3) | Geist | 32px / 28px | **400** | -0.32px | Geist 500 24–28px |
| H4 / card titles | Geist | 20–24px | 400 | 0 | Geist 500 |
| Body | Inter | 16–17px | 400, lh 1.65 | 0 | unchanged |
| Body-sm / caption | Inter | 13–15px | 400 | 0 | unchanged |
| UI label | Inter | 13–14px | 500 | +4%, uppercase OK | unchanged |
| Mono | Geist Mono | 14–16px | 400 | 0 | unchanged |

- Weight assignment by size: **300 at ≥50px, 400 at <50px** — Light below ~40px loses stroke definition on Windows ClearType; 400 Geist still reads light at 32px (same logic as Dialog's "weight 400 renders visually light").
- Line heights per Dialog scale: display 1.15, heading-lg 1.2, heading 1.3.
- `src/app/fonts.ts`: Geist weights become `['300', '400', '600']` — 600 retained during transition for app-shell H3/H4 until Phase B, then dropped if unused.

### Radii

| Element | Current | New | Tailwind |
|---|---|---|---|
| Cards | 12px (`rounded-xl`) | **24px** | `rounded-3xl` (re-point card components) |
| Buttons | 8px (`rounded-lg`) | **28px pill** | `rounded-full` (h-11/h-12 caps the radius — full ≡ pill) |
| Inputs | 8px | **0px** | `rounded-none` |
| Nav container | none (full-width bar) | **32px pill** | `rounded-[2rem]` via token `--radius-nav: 2rem` |
| Badges/pills | full | full (unchanged) | `rounded-full` |
| Card-inner chips | 8px | **12px** | `rounded-xl` |
| Overlays (dialog/sheet) | 12px | **24px** | `rounded-3xl` |

### Shadows (re-tinted from Dialog's `#181825` base to Ink `#0A0E1A`)

| Token | Value | Use |
|---|---|---|
| `shadow-card` | `0 2px 3px -2px rgba(10,14,26,0.12)` | Cards — edge definition, not lift |
| `shadow-button` | `0 1px 2px rgba(10,14,26,0.04), 0 2px 4px rgba(10,14,26,0.02), 0 4px 8px rgba(10,14,26,0.02)` | Pill CTAs |
| `shadow-fade` | `0 -40px 40px rgba(250,250,247,0.5)` | Mockup-frame bottom vignette — fades INTO Paper (Dialog's signature "erase depth" move) |
| `shadow-overlay` | `0 8px 24px rgba(10,14,26,0.08)` | Modals/dropdowns (kept from current system) |

Discipline stands: ≤8px blur, ≤0.12 opacity on cards; never stacked high-elevation shadows.

### Spacing / layout

Dialog's 4px-base scale ⊆ Tailwind's default scale — **no new spacing tokens needed**. Keep: `max-w-content` 1200px, section padding `py-20 md:py-32`, card padding 24px (`p-6` — down from current `p-8`; Dialog spec), element gaps 8–16px.

---

## Conflict register — every contradiction, resolved

This table is the heart of `docs/design/DESIGN.md`. **W = winner.**

| # | Topic | BRAND v1.0 / DESIGN-REFERENCE v1.0 says | Dialog system says | Resolution (W) |
|---|---|---|---|---|
| C1 | Display type | Geist 600, 56–72px, -2% | Light grotesque 300-feel, 32/50/70px, -0.01em | **Dialog scale + Geist Light** (founder-locked). BRAND → v1.1. |
| C2 | Hero alignment | Centered hero = banned anti-pattern; left-aligned | Center-stack hero | **Dialog** (founder-locked). Anti-pattern entry repealed for the landing hero; app-shell pages stay left-aligned. |
| C3 | Card elevation | No shadows; 1px Stone borders | Borderless white cards, flush low shadow | **Dialog.** Cards = `bg-card shadow-card`, no border. Stone borders remain for table rows, dividers, input underlines. "Drop shadows on cards" leaves the anti-pattern list. |
| C4 | Card surface | Cards on Paper (`bg-paper`), "never pure #FFF" | White cards on Fog | **Dialog two-tone.** New `card: #FFFFFF` token, surface-only carve-out recorded in BRAND v1.1. |
| C5 | Button shape | `rounded-lg` 8px rectangles | 28px pills | **Dialog.** All button variants → `rounded-full`. |
| C6 | Input shape | `rounded-lg` 8px boxed | 0px sharp | **Dialog.** `rounded-none`, Stone 1px border (or bottom-border-only in hero capture), focus = `border-ink`, no ring. The pill-vs-sharp tension is the system's signature. |
| C7 | Primary CTA color | Primary = Ink fill; Signal variant "use sparingly" | Orange is THE CTA, only color on page | **Merge.** The one-Signal-moment-per-surface rule (BRAND) now spends its moment on the **primary CTA pill** (Dialog). Marketing surfaces: Signal pill = primary, white/ghost pill = secondary, Ink-fill retired from marketing. App shell (Phase B): Ink pill = workhorse primary; Signal pill only for the single highest-value action per screen. |
| C8 | CTA text color | `signal` variant: `text-paper` | `#000` on orange | **Dialog logic, Trochia token: Ink on Signal.** Paper-on-Signal is 3.2:1 — **AA failure** in the current `button.tsx`; fixed by this adoption. |
| C9 | Carousels/marquees | Banned ("carousels hide content"; marquee "except logo strip, very slow") | Testimonial carousel + 60s marquee is the social-proof pattern | **Conditional adopt.** One horizontal scroll-snap carousel permitted, social-proof section only, native scroll + drag, optional ≥60s auto-drift that pauses on hover/focus-within and is **disabled under reduced-motion**. Ban stands everywhere else. |
| C10 | Autoplay video | Banned (bandwidth, motion-sickness) | Hero is autoplay-loop MP4 | **Ban stands.** Replacement: animated product simulation built from real UI components (see Motion plan M2). Zero video bytes. |
| C11 | Gradients | Banned except hero live element | Peach/lavender Orb glow behind hero | **Conditional adopt.** One static radial "Signal halo" behind the hero at ≤6% opacity (see M1). Gradient ban stands for sections, buttons, text. |
| C12 | Nav | Full-width sticky bar, border-b on scroll | Floating white pill (32px radius) | **Dialog.** Marketing nav becomes a floating pill. App-shell sidebar/top-bar unchanged in structure (Phase B restyles surfaces only). |
| C13 | Surface variation | Sections divided by hairlines on one Paper canvas | Paper ↔ White band alternation | **Dialog.** Section rhythm = canvas swaps (`bg-paper` ↔ `bg-card`); hairline + mono-label dividers retained as an accent between bands. |
| C14 | Social proof | "Trusted by + fake logos" banned; testimonials post-design-partner | Testimonial carousel with brand photography | **Trochia reality.** Carousel slots filled with what actually exists: real product-surface cards (memory brief, investor-match scorecard, pipeline view — "real data on display" principle), manifesto pull-quote card, honest accelerator-status line. **No fabricated testimonials, no fake logos.** Real founder quotes swap in post-design-partner. |
| C15 | Dialog brand colors | — | Tangerine, Dusty Rose, Peach Whisper, Deep Slate | **Not adopted.** Reference file is style-structure only; its palette carries Dialog's brand values. |
| C16 | Imagery | No stock illustrations; real product only | Editorial brand photography in cards | **Trochia.** No photography until real customer assets exist; mockup frames show real product UI. Photography rule deferred, recorded as future-open in DESIGN.md. |
| C17 | Motion durations | 120ms hovers / 200–300ms reveals; no spring | Framer defaults, ~2s hero entrance, 60s marquee | **Trochia timing table stands** + two additions: marquee timing (≥60s linear, pausable) and hero simulation step timing (800ms/step, existing HeroTimeline contract). |
| C18 | Dark sections | Not in system | Deep Slate contrast panels; nav dark-variant over hero | **Defer.** Light-only this phase (matches current `globals.css` comment). At most one optional Ink contrast panel noted as a future option, not in Phase A scope. |

`docs/DESIGN-REFERENCE.md` gets a deprecation banner pointing at `docs/design/DESIGN.md` (kept for history, no longer canonical). Pointer sweep: project `CLAUDE.md` + `tasks/constraints.md` UI-section references re-pointed to the new canon (doc-only edits).

---

## Accessibility verification (computed, WCAG 2.1 relative-luminance)

| Pair | Ratio | Requirement | Verdict |
|---|---|---|---|
| Ink `#0A0E1A` on Signal `#F25C2A` (CTA text) | **5.8:1** | 4.5:1 (AA normal) | **PASS** (also AAA large) |
| Paper `#FAFAF7` on Signal (current `signal` variant) | **3.2:1** | 4.5:1 | **FAIL — flagged.** Current `button.tsx` `signal: bg-signal text-paper` is non-compliant today; this plan replaces it with Ink-on-Signal. |
| Graphite `#6B7280` on Paper `#FAFAF7` (body secondary) | **4.6:1** | 4.5:1 | **PASS — no margin.** Usage rule: Graphite only at ≥13px regular / ≥11px medium; never lightened (`graphite/80` etc. banned for text); disabled states (`graphite/50`) exempt as non-essential per WCAG. |
| Graphite on Card `#FFFFFF` | **4.8:1** | 4.5:1 | PASS |
| Ink on Paper (headings/body) | **18.4:1** | — | PASS (Geist Light 300 at 50–70px: large-text threshold is 3:1; massive headroom) |
| Signal fill vs Paper (button boundary) | **3.2:1** | 3:1 (non-text UI) | PASS |
| Stone `#ECEAE3` borders vs Paper | ~1.1:1 | 3:1 if essential | Decorative hairlines only — inputs must rely on the 0-radius shape + focus `border-ink` (18:1), not Stone alone, for boundary affordance. Input at-rest border may add `border-graphite/40` if usability testing flags it. |

---

## Motion plan — brand-matched replacements (M-series)

Global rails: every effect is **progressive enhancement** (page complete and fully legible with JS off and motion off); the existing `prefers-reduced-motion` kill-switch in `globals.css` stays; banned-motion list (spring, confetti, cursor-followers, parallax) stands.

| # | Dialog original | Trochia replacement | Reduced-motion behavior |
|---|---|---|---|
| M1 | Canvas "Orb" + peach/lavender glow behind hero | **Signal halo** — single static radial glow (`radial-gradient`, Signal at 4–6% opacity over Paper), positioned behind the hero center-stack, pure CSS, no canvas, no animation by default. Counts as the hero's ambient warmth, not a Signal "moment" (the CTA is the moment) — recorded in DESIGN.md. | Already static — no change needed |
| M2 | `hero_01.mp4` autoplay product video | **Animated product simulation** in a browser-frame card (24px radius, `shadow-fade` vignette): a real Trochia surface (pre-call brief or investor-match list) that steps through 3–4 states at 800ms/step, 2s loop pause — CSS/SVG + the existing Framer Motion dependency from `HeroTimeline`, which this evolves/absorbs. Real UI, zero video bytes. | Static composed end-state frame |
| M3 | 60.8s testimonial marquee | **Proof-of-work carousel** — scroll-snap horizontal list (native scroll + drag), optional auto-drift ≥60s linear, `:hover`/`:focus-within` pauses, visible scroll affordance. Content per C14. | No auto-drift; manual scroll only (still fully usable) |
| M4 | Framer appear effects (8 fade-ups) | IntersectionObserver fade-up: `opacity 0→1` + `translateY(8px→0)`, 300ms ease-out, once per element, content rendered visible by default (JS adds the initial-hidden class, not the markup) | No reveal animation; content visible |
| M5 | Nav dark→light variant swap at scroll | **Always-pill nav** — floating white pill from load (no variant swap; our hero is light so there is no dark-over-hero state to leave). Subtle `shadow-card` gain after 8px scroll, 200ms ease-out. Zero JS dependency for correctness. | Shadow toggles without transition |
| M6 | Lottie play/pause icons | Not adopted — no Lottie dependency. SVG icon swap if M2 ever gets a pause control. | — |
| M7 | Button/card hovers | Keep current contract: 120ms ease-out color/border/shadow; `active:scale-[0.98]` press only | Effectively instant (kill-switch) |

---

## Implementation tasks

### Task 0 — Canon docs (first implementation task, blocks everything else)

| Step | Deliverable | Notes |
|---|---|---|
| 0.1 | **`docs/design/DESIGN.md`** — canonical Trochia design system | Dialog's structure/components/do-don't discipline + token mapping above + full conflict register (C1–C18) + motion table (M1–M7) + a11y rules. Self-sufficient: a future UI subagent reads only this + BRAND.md. |
| 0.2 | **`docs/BRAND.md` → v1.1** | Typography section: Display = Geist Light per the new hierarchy table; `card` white-surface carve-out; version line bumped per the doc's own rule. Nothing else changes. |
| 0.3 | Pointer sweep | Deprecation banner atop `docs/DESIGN-REFERENCE.md`; re-point project `CLAUDE.md` + `tasks/constraints.md` UI rules from DESIGN-REFERENCE.md to `docs/design/DESIGN.md`. |

### Phase A — Public landing page (first implementation slice)

| Step | Scope | Files (primary) |
|---|---|---|
| A1 | **Token re-value** — radii (cards 24 / buttons full / inputs 0 / nav 32 / overlays 24), `card` color token, 4 shadow tokens, type-scale keys (display 70/300, heading-lg 50/300, heading 32/400 + responsive clamps), shadcn `--card` → `#FFFFFF` | `tailwind.config.ts`, `src/app/globals.css` |
| A2 | **Fonts** — Geist weights `300/400/600` | `src/app/fonts.ts` |
| A3 | **Primitives restyle** — Button (all variants → pills; `signal` → `text-ink`; primary-on-marketing = signal), Input (`rounded-none`, focus `border-ink`), Card (`bg-card rounded-3xl shadow-card p-6`, borderless), Badge, Dialog/Sheet (24px) | `src/components/ui/{button,input,card,badge,dialog,sheet}.tsx` |
| A4 | **Floating pill nav** (M5) | `src/components/marketing/marketing-top-bar.tsx` |
| A5 | **Hero rebuild** — center-stack (eyebrow → display H1 → subhead → CTA row → honest trust line), Signal halo (M1), browser-frame product simulation with `shadow-fade` (M2, absorbs `hero-timeline.tsx`) | `src/app/(marketing)/page.tsx`, `src/components/marketing/*` |
| A6 | **Feature sections** — alternating 2-col (label pill + heading-lg + body left, white mockup card right; mirrored), Paper↔White band rhythm (C13), fade-up reveals (M4) | `how-it-works.tsx`, `modules-grid.tsx` rework |
| A7 | **Proof-of-work carousel** (M3/C14) — replaces `founder-voices.tsx` placeholder | new `proof-carousel.tsx` |
| A8 | **Pricing teaser + final CTA + footer** restyle to new surfaces/pills | `pricing-cards.tsx`, `footer.tsx`, page sections |
| A9 | **Cascade QA** — `/pricing`, `/manifesto`, `/sign-in`, `/sign-up`, `/legal/*` inherit A1–A3 automatically; visual pass to fix breakage (no redesign of these pages in Phase A) | spot fixes |
| A10 | **Styleguide update** — new tokens, type scale, pill variants, sharp inputs, shadows, motion demos | `src/app/(app)/styleguide/page.tsx` |

**Phase A gates** (per project workflow rules): `/plan-design-review` before A3, `/design-review` after A8, `/qa` (real browser) at exit, Lighthouse > 90 on `/` (incl. accessibility — the contrast fixes above are load-bearing), banned-string CI green, reduced-motion verified by toggling emulation in Playwright.

### Phase B — Authed app shell restyle (planned, not the first slice)

| Step | Scope |
|---|---|
| B1 | App shell surfaces: sidebar + top bar onto two-tone system (sidebar `bg-paper`, content cards `bg-card shadow-card rounded-3xl`); structure unchanged |
| B2 | Dashboard: `cta-cards`, `memory-summary-card`, `empty-dashboard` onto new card/pill/heading system |
| B3 | Forms & flows: onboarding stepper, memory confirmation forms, Q&A sidebar — sharp inputs, pill buttons; **CTA discipline in-app**: Ink pill = default primary, Signal pill = one per screen max (C7) |
| B4 | Primitives sweep: dialogs, empty/error states, skeletons (Stone blocks at 12px card-inner radius), legal-disclaimer banner |
| B5 | Geist 600 audit — drop weight if no longer referenced |
| B6 | Gates: `/design-review`, `/qa` across app routes, styleguide parity check |

Phase B ships as its own branch/PR after Phase A lands and the founder approves the system in production.

---

## Rails honored (non-negotiable)

- **Tokens once** — all Dialog values re-valued in `tailwind.config.ts` + `@theme`; zero hardcoded hex in components (Code Reviewer rejects).
- **Compliance** — no "rolling fund" / "investment advice" / "legal advice" in any copy; voice = operator, no emoji; existing landing copy already conforms and is mostly retained.
- **No backend/schema changes.** No new routes except none — Phase A is restyle-in-place.
- **Existing logo SVGs only** (`src/components/brand/logo.tsx` + `public/` assets); no new marks.
- **No component-library migration** — shadcn/base-ui + cva stay; no design-tool round-trips; no new dependencies (Framer Motion already present via HeroTimeline; Lottie explicitly not added).
- **URLs** via `NEXT_PUBLIC_SITE_URL` (untouched).

## Risks / open items

| Risk | Mitigation |
|---|---|
| Geist 300 renders thin on Windows at smaller display sizes | Weight-by-size rule (300 only ≥50px); verify on Windows ClearType during `/qa`; fallback = 400 across the scale (one-line token change) |
| Graphite-on-Paper 4.6:1 has zero AA margin | Usage rule in DESIGN.md (≥13px, never alpha-lightened for text); re-verify in Lighthouse a11y audit |
| Sharp inputs (0px) may read as unstyled in dense app forms | Phase A proves the pattern on auth/marketing capture; Phase B may add `border-graphite/40` at-rest if QA flags affordance |
| Pill buttons truncate long labels in app tables | `compact` pill (h-9) verified in styleguide before Phase B |
| Carousel a11y (keyboard/screen-reader) | Native scroll-snap list semantics (`ul/li`), no aria-carousel widgetry, drift pauses on focus-within |
| Section white-band rhythm could fight the hairline-divider pattern | DESIGN.md sets precedence: bands are primary rhythm; dividers only within a band |

---

**STOP point reached.** Founder reviews this plan; implementation begins on approval, Task 0 first.
