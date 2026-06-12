# Trochia Design System — Canonical

**Version 1.1 — 2026-06-11.** This document is the law for every Trochia UI surface.
It supersedes `docs/DESIGN-REFERENCE.md` (deprecated, kept for history) and implements the
founder-approved adoption plan at `.planning/features/2026-06-11-design-adoption-PLAN.md`:
**Dialog's layout + experience system** (structure, radii, surfaces, shadows, flow,
single-accent discipline) **on Trochia tokens** (`docs/BRAND.md` v1.1). Dialog's brand
values (its palette, its typeface) are NOT adopted — the structural reference lives at
`docs/design/REFERENCE-dialog.md` and is reference-only.

**Precedence.** On any conflict: `docs/BRAND.md` wins on tokens and voice; this document
wins on layout, components, and motion; phase UI-SPECs consolidate both and never override
either. There are no unresolved conflicts — every BRAND-vs-Dialog tension is settled in
the Conflict Register (§12).

**Required reading.** Any UI-track subagent reads `docs/BRAND.md` AND this document before
planning or implementing any surface. Not reading both is a violation.

---

## 1. Design philosophy

A neutral showroom with one warm price tag. Two tones of off-white build the entire
spatial plane; the single Signal accent appears once per surface and pulls the eye the way
a price tag pops on white linen. Light-weight display type at large sizes reads
pencil-drawn, not stamped — zero aggression, maximum presence. Pill buttons are the only
soft shape in an otherwise rectilinear system; sharp-cornered inputs against pill CTAs is
a deliberate tension, not an oversight.

Operator-grade restraint stands: real product on display, no stock metaphors, no "AI
buddy" energy, motion serves comprehension and never decoration.

## 2. Principles

| # | Principle | Implication |
|---|---|---|
| 1 | **Two-tone surface system** | Paper canvas + White cards build all depth. Section rhythm = canvas swaps, not colored bands. |
| 2 | **Single-accent CTA discipline** | Signal spends ONCE PER VIEWPORT — never two Signal elements co-visible at any scroll position. Sticky/fixed elements (nav) are co-visible with everything and therefore never carry Signal. Never text, icons, decoration, or large fills. |
| 3 | **Light display type** | Geist Light at 50–70px is the signature typographic move. Never bold display. |
| 4 | **Flush elevation** | Shadows define edges, they don't lift. ≤8px blur, ≤0.12 opacity. Cards sit in the plane. |
| 5 | **Pills vs. sharp** | Buttons and badges are pills. Inputs are sharp (0px). Cards are 24px. The contrast is the system. |
| 6 | **Real product on display** | Mockups show actual Trochia surfaces with real-shaped data. No fabricated testimonials, logos, or metrics — ever. |
| 7 | **Progressive enhancement** | Every page is complete and legible with JS off and motion off. `prefers-reduced-motion` is always honored. |

## 3. Color tokens

Declared once in `tailwind.config.ts` + the `@theme` mirror in `src/app/globals.css`.
**No hardcoded hex in components. No Tailwind color outside this set — Code Reviewer rejects.**

| Token | Hex | Role |
|---|---|---|
| `paper` | `#FAFAF7` | Page canvas (surface level 0). The default background. |
| `card` | `#FFFFFF` | Raised surfaces: cards, nav pill, mockup frames, popovers (level 1). **The one sanctioned pure white** — surface-only carve-out ratified in BRAND v1.1. Never a text color. |
| `ink` | `#0A0E1A` | Headings, body, primary-CTA text, icon fills. Never pure `#000` — no exceptions. |
| `graphite` | `#6B7280` | Secondary text, meta, nav labels, placeholders. Usage rule in §10. |
| `stone` | `#ECEAE3` | Hairline borders, dividers, skeletons, soft fills. |
| `signal` | `#F25C2A` | THE accent. Primary CTA fill only — one moment per surface. |
| `success` | `#0F9D58` | Positive states. |
| `warning` | `#E5A100` | Caution states. |
| `danger` | `#E53935` | Errors, destructive actions. |

Not in the system (and never to be added without a BRAND version bump): Dialog's
Tangerine/Dusty Rose/Peach Whisper/Deep Slate, any second accent, any colored section band.

## 4. Typography

Three families, locked (BRAND v1.1): **Geist** (display + headings), **Inter** (body +
UI), **Geist Mono** (numbers + code). No new font families.

| Class | Font | Size desktop / mobile | Weight | Tracking | Line height | Use |
|---|---|---|---|---|---|---|
| `text-display` | Geist | 70px / 44px | **300** | -0.01em | 1.15 | Hero H1 only |
| `text-heading-lg` | Geist | 50px / 36px | **300** | -0.01em | 1.2 | Section H2 |
| `text-heading` | Geist | 32px / 28px | **400** | -0.32px | 1.3 | H3, major card titles |
| `text-h4` | Geist | 20–24px | 400 | 0 | 1.3 | Card titles, inline emphasis |
| `text-body` | Inter | 16–17px | 400 | 0 | 1.65 | Body default |
| `text-body-sm` | Inter | 13–15px | 400 | 0 | 1.55 | Secondary copy, captions |
| `text-label` | Inter | 13–14px | 500 | +4%, uppercase OK | 1.4 | Eyebrows, form labels |
| `text-mono` / `text-mono-sm` | Geist Mono | 16px / 14px | 400 | 0 | 1.5 | Numbers, code, metrics, IDs |

**Weight-by-size rule.** Geist 300 only at ≥50px; Geist 400 below 50px (Light loses
stroke definition under Windows ClearType at smaller sizes — 400 Geist still renders
visually light at 32px, the same effect Dialog gets from its grotesque at weight 400).
Never 600+ on display or section headings — light display is the brand's voice. 600 may
persist temporarily in app-shell internals until Phase B audits it out.

**Default text color** is `ink`. Secondary copy is `graphite` (§10 rule applies).
`signal` is never a text or icon color — no exceptions. (A star/rating exception existed
in draft and is struck: pre-revenue honesty rules make rating displays unshippable, and
any such glyph would collide with the CTA's Signal moment under C7.)

## 5. Spacing & layout

- **Base unit** 4px; Tailwind's default scale covers Dialog's spacing scale — no custom spacing tokens.
- **Max content width** `max-w-content` (1200px), gutters `px-6 md:px-12`.
- **Section padding** `py-20 md:py-32` (80px mobile / 128px desktop).
- **Card padding** `p-6` (24px). Featured/hero cards may use `p-8`.
- **Element gaps** 8–16px; card grids `gap-6`; major layout blocks `gap-12`.
- **Whitespace is a luxury signal** — never crowd content to fill space.

### Page flow (marketing)

The canonical landing-page sequence:

1. **Floating pill nav** (always-pill, §7-Nav)
2. **Hero center-stack**: eyebrow label → display H1 → subhead → CTA row → honest trust line
3. **Product mockup** — browser-frame card floating below the hero, bottom edge fading into Paper
4. **Alternating 2-col feature sections** — label pill + heading-lg + body on one side, white mockup card on the other; sides alternate per section
5. **Proof-of-work carousel** — the one sanctioned horizontal carousel (§7)
6. **Pricing teaser → final CTA → footer**

Hero text is **center-aligned on the landing page only**. Feature sections, app screens,
and interior pages stay left-aligned.

### Surface rhythm

Sections alternate `bg-paper` ↔ `bg-card` full-width bands. Hairline (`stone`) +
mono-label dividers are an accent **within** a band, never the primary section separator.
Bands are the rhythm; dividers are punctuation.

## 6. Radii, shadows, elevation

### Radii (token-mapped; never improvised per-component)

| Element | Radius | Tailwind |
|---|---|---|
| Cards, mockup frames | 24px | `rounded-3xl` |
| Buttons | pill | `rounded-full` (h-11/h-12 caps it at ≈28px — Dialog's pill) |
| Inputs, textareas | **0px** | `rounded-none` |
| Nav pill container | 32px | `rounded-[2rem]` (token `--radius-nav`) |
| Badges, label pills | full | `rounded-full` |
| Card-inner chips/thumbnails | 12px | `rounded-xl` |
| Overlays (dialog, sheet, popover) | 24px | `rounded-3xl` |

Never apply <24px radius to a layout-level card; 8–12px radii belong to inner chips only.

### Shadows (Ink-tinted; flush with the plane)

| Token | Value | Use |
|---|---|---|
| `shadow-card` | `0 2px 3px -2px rgba(10,14,26,0.12)` | Cards — edge definition, not lift |
| `shadow-button` | `0 1px 2px rgba(10,14,26,0.04), 0 2px 4px rgba(10,14,26,0.02), 0 4px 8px rgba(10,14,26,0.02)` | Pill CTAs |
| `shadow-fade` | `0 -40px 40px rgba(250,250,247,0.5)` | Mockup-frame bottom vignette — fades INTO Paper, erasing depth |
| `shadow-overlay` | `0 8px 24px rgba(10,14,26,0.08)` | Modals, dropdowns, popovers |

Rules: cards are **borderless** — `bg-card shadow-card`, edge defined by shadow + surface
contrast. Stone borders remain for inputs, table rows, dividers, and skeletons. Never
stack high-elevation shadows; never exceed 8px blur / 0.12 opacity on cards.

### Surface levels

| Level | Token | Use |
|---|---|---|
| 0 | `paper` | Page canvas, alternating-band base |
| 1 | `card` | Cards, nav pill, mockup frames, popovers |
| 2 | — | Reserved. Dark contrast panels (Ink) are deferred — see C18. |

## 7. Components

### Buttons

All variants are pills (`rounded-full`). Press state `active:scale-[0.98]`; hover
transitions 120ms ease-out; focus `focus-visible:ring-2 ring-ink/40`. Sizes: default
`h-11 px-6`, mobile `h-12`, compact `h-9 px-4` (dense app UIs only — no `xs`, small
buttons read as toy).

| Variant | Spec | Use |
|---|---|---|
| **signal** | `bg-signal text-ink hover:bg-signal/90 shadow-button` | THE conversion CTA — the viewport's one Signal moment. **Text is Ink, never Paper/white** (Ink-on-Signal = 5.8:1, passes AA; the pre-adoption `text-paper` variant was 3.2:1 — a live AA failure this system fixes). |
| **primary** (ink) | `bg-ink text-paper hover:bg-ink/90` | Workhorse primary: app-shell screens AND marketing mid-page/pricing CTAs (v1.1 — Signal is reserved for the hero + final conversion anchors, which are never co-visible). |
| **secondary** | `bg-card text-ink border border-stone hover:border-ink/30` | Supporting actions; the "white pill" |
| **ghost** | `bg-transparent text-ink hover:bg-stone/50` | Tertiary, nav-adjacent |
| **link** | `text-ink underline-offset-4 hover:text-signal hover:underline` | In-flow text actions, "See how →" |
| **destructive** | `bg-danger text-paper hover:bg-danger/90` | Destructive confirms |

**CTA discipline (v1.1, founder rulings 2026-06-11).** Signal spends once per
VIEWPORT — never two Signal elements co-visible at any scroll position; sticky/fixed
elements never carry Signal. The marketing CTA map:

| Surface | CTA treatment |
|---|---|
| Hero primary | **signal** pill (Ink text) |
| Final CTA | **signal** pill — its own viewport, never co-visible with the hero's |
| Mid-page section CTAs | ink pill or ghost/link |
| Pricing CTAs | ink pills (the featured ring spends that viewport's moment) |
| Nav CTA | **secondary** (white pill) in ALL nav states |

App screen: ink pill = default primary; signal pill on at most the single
highest-value action per screen — many screens have none. New marketing layouts
verify Signal co-visibility at 1440×900 and 1920×1080.

### Inputs

```
bg-paper (bg-card when inside a white band)
rounded-none
border border-stone
h-11 px-4
text-body text-ink placeholder:text-graphite
focus:border-ink focus:outline-none focus:ring-0
```

Sharp corners are the point — the 0px input beside a pill button is the system's
signature tension. Hero/email capture may use bottom-border-only (`border-0 border-b`).
Error: `border-danger` + `text-body-sm text-danger mt-1.5`. Labels:
`text-label text-graphite mb-2 block`. Affordance relies on the sharp shape + Ink focus
border (18:1), not Stone alone; if usability testing flags weak at-rest boundaries, add
`border-graphite/40` at rest (pre-approved fallback).

### Cards

```
bg-card rounded-3xl p-6 shadow-card
```

No border. No hover lift. Interactive cards: `transition-shadow duration-150` to a
slightly deeper `shadow-overlay` is permitted, or `hover:bg-card` tint via inner ring —
prefer cursor + inner-content affordances. Featured card (pricing "Most chosen"):
`ring-2 ring-signal` + a neutral "Most chosen" badge (`text-graphite` on Card, per the
Badges spec) — the ring **is** that viewport's Signal moment. Badges never carry
Signal, including here; the ring alone spends the moment.
(Because the ring spends the viewport's Signal moment, pricing CTAs are ink pills, and
the pricing ring must never share a viewport with another Signal element — verify at
1440×900 and 1920×1080.)

### Badges / label pills

`rounded-full bg-paper (or bg-stone/50) px-3 py-1 text-label text-graphite`. Neutral
always — badges never carry Signal (that would spend the accent).

### Navigation — marketing (spread-at-top → pill-on-scroll, v1.1 / D3-B)

```
Sticky container, centered
At page top:   full-content-width transparent row over Paper —
               logo left · links + secondary CTA right. No fill, no shadow.
Past ~64px:    contracts into the centered floating pill —
               bg-card rounded-nav shadow-card h-14, shadow deepens one step
Contents: logo lockup · ≤5 nav links (text-body-sm text-graphite hover:text-ink) · SECONDARY pill CTA
```

200ms ease-out morph. LIGHT-ONLY — no dark variant, no color morph; the CTA stays
**secondary** (white pill) in both states (nav is sticky = co-visible with everything,
so it never carries Signal — §2). `prefers-reduced-motion`: the two states SNAP, no
transition. Both states must be fully functional without JS (the scroll listener is
enhancement only). Mobile: logo + hamburger → full-screen Sheet.

### Navigation — app shell

Structure unchanged from current shell (sidebar 240px + top bar). Phase B restyles
surfaces only: sidebar `bg-paper border-r border-stone`; content cards go `bg-card
rounded-3xl shadow-card`; active nav item `bg-stone text-ink`; pills and sharp inputs per
this document.

### Section heading block

Eyebrow label pill (optional) → `text-heading-lg` (Geist 300) → `text-body text-graphite`
subtext, 12–16px gap. Center-aligned in the hero, left-aligned everywhere else.

### Product mockup browser frame

`bg-card rounded-3xl shadow-fade` card with minimal browser chrome (three 10px `stone`
dots — never traffic-light colors, that's chroma spend). Interior: a **real Trochia
surface** (pre-call brief, investor-match list, pipeline view) rendered from actual
components with real-shaped data — never lorem-skeletons pretending to be product, never
screenshots of competitors. Bottom edge cropped or vignetted into Paper via `shadow-fade`.

### Proof-of-work carousel (the one sanctioned carousel)

Horizontal scroll-snap `ul` (native scroll + drag, visible affordance), cards at
`rounded-3xl bg-card shadow-card p-6`, ~3 visible with partial peek. Optional auto-drift
≥60s linear; pauses on `:hover`/`:focus-within`; **disabled under reduced-motion** (manual
scroll remains). Content = what Trochia actually has: real product-surface cards,
manifesto pull-quote, honest accelerator-status line. Real founder quotes swap in
post-design-partner. Carousels remain **banned everywhere else** (C9).

### Section divider (accent, within a band)

`text-mono-sm text-graphite uppercase` label + `flex-1 h-px bg-stone`. Punctuation, not
structure (§5 surface rhythm).

### Overlays

Dialog/Sheet/Popover: `bg-card rounded-3xl shadow-overlay`. Sheets keep square edges on
their attached side.

## 8. Imagery

No photography until real customer/brand assets exist (C16). Visuals are: the mark, real
product surfaces in mockup frames, and Geist Mono data displays. If photography enters
later it lives inside 24px-radius cards, never full-bleed — and that addition requires a
version bump here.

## 9. Motion

**Global rails.** Progressive enhancement only: every page complete, legible, and fully
operable with JS off and motion off. The `prefers-reduced-motion` kill-switch in
`globals.css` stays permanently. Scroll-reveal content is rendered visible by default; JS
adds the initial-hidden state, never the markup.

### Timing table

| Motion | Duration | Easing | Use |
|---|---|---|---|
| Hover | 120ms | ease-out | Color, border, shadow |
| Press | instant | — | `active:scale-[0.98]` only |
| Page enter | 200ms | ease-out | Fade-up `translateY(8px→0)` + opacity |
| Scroll reveal | 300ms | ease-out | Same, on intersection, once per element |
| Overlay enter | 250ms | ease-out | Fade + slight upward translate |
| Hero simulation step | 800ms/step | ease-in-out | Sequential states, 2s pause at loop end |
| Carousel auto-drift | ≥60s/loop | linear | Pauses on hover/focus; off under reduced-motion |
| Nav spread→pill morph | 200ms | ease-out | Past ~64px scroll; SNAPS under reduced-motion |

### Brand-matched replacements for Dialog's motion (M-series, locked)

| # | Dialog original | Trochia replacement | Reduced-motion |
|---|---|---|---|
| M1 | Canvas "Orb" + peach/lavender glow | **Signal halo** — one static CSS `radial-gradient`, Signal at 4–6% opacity over Paper, behind the hero center-stack. No canvas, no animation. Ambient warmth, not a Signal "moment" — the CTA is the moment. | Already static |
| M2 | Autoplay hero MP4 | **Animated product simulation** in the mockup frame: real Trochia surface stepping through 3–4 states, 800ms/step, 2s loop pause. CSS/SVG + existing Framer Motion. Zero video bytes. | Static composed end-state |
| M3 | 60.8s testimonial marquee | **Proof-of-work carousel** (§7) | No drift; manual scroll |
| M4 | Framer appear effects | IntersectionObserver fade-up, 300ms, once | Content visible, no reveal |
| M5 | Nav dark→light variant swap | Spread-at-top → pill-on-scroll morph at ~64px (light-only, no color morph; CTA stays secondary in both states), 200ms ease-out | The two states SNAP, no transition |
| M6 | Lottie play/pause icons | Not adopted — no Lottie dependency. SVG icon swap if a pause control ships. | — |
| M7 | Hover micro-interactions | Current contract kept (timing table) | Kill-switch applies |

### Banned motion

Spring physics / bounces · scale-on-hover beyond the 0.98 press · cursor-followers and
spotlight effects · confetti, sparkles, particles · animated background gradients ·
autoplay video of any kind · auto-rotating banners · marquees and carousels outside the
one §7 carousel · parallax.

## 10. Accessibility

Computed (WCAG 2.1 relative luminance), normative:

| Pair | Ratio | Verdict |
|---|---|---|
| Ink on Signal (CTA text) | 5.8:1 | PASS AA normal text. **The only sanctioned text-on-Signal pairing.** Paper/white-on-Signal (3.2:1) is banned — it was a live AA failure in the pre-adoption `button.tsx` signal variant, fixed by this system. |
| Graphite on Paper | 4.6:1 | PASS AA with zero margin → **Graphite rule:** Graphite text only at ≥13px regular or ≥11px medium; **never alpha-lightened for text** (`text-graphite/80` etc. banned); `graphite/50` allowed for disabled states only (non-essential per WCAG). |
| Graphite on Card | 4.8:1 | PASS |
| Ink on Paper / Card | 18.4:1 / 19.3:1 | PASS (Geist 300 at ≥50px is large text, threshold 3:1 — massive headroom) |
| Signal fill vs Paper (UI boundary) | 3.2:1 | PASS non-text (≥3:1) |
| Stone vs Paper | ~1.1:1 | Decorative only — never the sole boundary of an essential control (§7 Inputs) |

Further rules: visible focus (`ring-ink/40`) on every interactive element · carousel is a
native scrolling list (`ul/li`), no aria-carousel widgetry, drift pauses on focus-within ·
touch targets ≥44px (`h-11`; `h-12` on mobile) · text never rendered as image ·
`prefers-reduced-motion` always honored (Dialog itself ships zero reduced-motion handling
— we do not copy that).

## 11. Do / Don't

**Do**
- Geist 300 exclusively for display/heading-lg (≥50px); 400 below; never bold display.
- Signal on conversion-CTA pills only — once per VIEWPORT, never two Signal elements
  co-visible at any scroll position; sticky/fixed elements never carry Signal.
- `bg-paper` canvas, `bg-card` raised surfaces — all section variation from this swap.
- All buttons pills; all inputs sharp; all cards 24px.
- `shadow-card` on cards — single low-offset shadow, no stacks.
- Inter at -0.01em to -0.02em tracking for nav/dense-UI text where Dialog-scale alignment matters; body stays neutral.
- Real product, real-shaped data, honest copy — always.

**Don't**
- Don't put Signal on text, icons, badges, borders, or backgrounds. The only two
  sanctioned non-CTA Signal uses in the system: the M1 hero halo (≤6% opacity radial,
  ambient — does not count as the moment) and the §7 featured-pricing ring (which SPENDS
  that viewport's moment).
- Don't use pure `#000` anywhere, or `#FFFFFF` for anything but level-1 surfaces.
- Don't give cards <24px radii, borders, hover-lifts, or gradients.
- Don't round inputs.
- Don't introduce colored section bands, second accents, or chart rainbows.
- Don't fabricate testimonials, logos, metrics, or "trusted by" claims.
- Don't add font families, Lottie, or autoplay video.
- Don't ship any animation without a reduced-motion path.
- Don't write "rolling fund," "investment advice," or "legal advice" (un-negated) in any copy — compliance ban, CI-enforced.

## 12. Conflict register (C1–C18) — resolved, none implicit

Every tension between BRAND v1.0 / old DESIGN-REFERENCE and the Dialog system, settled.
**W = winner.** These resolutions are final until a version bump.

| # | Topic | Old canon said | Dialog said | Resolution (W) |
|---|---|---|---|---|
| C1 | Display type | Geist 600, 56–72px, -2% | Light grotesque, 32/50/70px, -0.01em | **Dialog scale + Geist Light** (founder-locked). BRAND bumped to v1.1. Weight-by-size rule §4. |
| C2 | Hero alignment | Centered hero banned | Center-stack hero | **Dialog**, landing hero only. Everything else stays left-aligned. |
| C3 | Card elevation | No shadows; 1px Stone borders | Borderless, flush low shadow | **Dialog.** Cards = `bg-card shadow-card`, no border. Stone borders persist on inputs/tables/dividers. "Drop shadows on cards" removed from the anti-pattern list. |
| C4 | Card surface | "Never pure #FFF" | White cards on near-white canvas | **Dialog two-tone.** `card: #FFFFFF` carve-out ratified in BRAND v1.1 — surface-only (cards/nav/overlays); canvas stays Paper; pure white never a text color. Never-pure-black stands with NO exceptions. |
| C5 | Button shape | 8px rectangles | 28px pills | **Dialog.** All variants `rounded-full`. |
| C6 | Input shape | 8px boxed | 0px sharp | **Dialog.** `rounded-none`; §7 Inputs spec; `border-graphite/40` at-rest pre-approved if QA flags affordance. |
| C7 | Primary CTA color | Ink fill primary; Signal "sparing" | Orange is THE CTA | **Merge (v1.1, D1-B).** Signal spends once per VIEWPORT, on conversion anchors: marketing hero + final CTA = signal pills (never co-visible); mid-page and pricing CTAs = ink (UN-retired for those uses — the featured ring spends pricing's moment); nav CTA = secondary always. App: ink primary, signal ≤1/screen. |
| C8 | CTA text color | `text-paper` on signal | `#000` on orange | **Dialog logic, Trochia token: Ink on Signal** (5.8:1 AA pass). Fixes the live 3.2:1 AA failure in pre-adoption `button.tsx`. |
| C9 | Carousels | Banned | Core social-proof pattern | **Conditional adopt.** Exactly one (§7 proof-of-work carousel), native scroll-snap, pausable drift, reduced-motion-off. Ban stands everywhere else. |
| C10 | Autoplay video | Banned | Hero is autoplay MP4 | **Ban stands.** Replacement M2 — animated real-UI simulation, zero video bytes. |
| C11 | Gradients | Banned (one hero exception) | Peach/lavender orb glow | **Conditional adopt.** One static Signal-halo radial (≤6% opacity) behind the hero (M1). Ban stands for sections, buttons, text. |
| C12 | Nav | Full-width sticky bar | Floating 32px pill | **Dialog (v1.1, D3-B).** Spread-at-top → pill-on-scroll morph (M5), light-only, CTA secondary in both states. App sidebar/top-bar structure unchanged; Phase B restyles surfaces. |
| C13 | Section variation | Hairline dividers on one canvas | Paper↔White band swaps | **Dialog.** Bands are the rhythm; dividers are punctuation within a band. |
| C14 | Social proof | Testimonials post-design-partner; fake anything banned | Testimonial carousel with brand photography | **Trochia reality.** Carousel filled with real product cards, manifesto pull-quote, honest status line. No fabrication — real quotes swap in when they exist. |
| C15 | Dialog palette | — | Tangerine, Dusty Rose, Peach Whisper, Deep Slate | **Not adopted.** Reference-only; Dialog's brand values stay Dialog's. |
| C16 | Imagery | Real product only | Editorial brand photography | **Trochia.** No photography until real assets exist (§8). |
| C17 | Motion timing | 120/200/300ms, no spring | Framer defaults, 2s entrances, 60s marquee | **Trochia table stands** + two additions: carousel drift (≥60s, pausable) and hero-simulation steps (800ms). |
| C18 | Dark sections | Not in system | Deep Slate panels; dark nav over hero | **Defer.** Light-only this phase. At most one Ink contrast panel is a recorded future option, not current scope. |

## 13. Voice & compliance (pointer)

Voice per `docs/BRAND.md`: operator, not assistant; no emoji in product copy; Trochia
drafts / matches / briefs / scores / tracks — never feels, loves, wants, or "helps."
Banned strings ("rolling fund," un-negated "investment advice" / "legal advice") per
`tasks/constraints.md`, CI-enforced.

## 14. Versioning

This document evolves only by version bump with a dated changelog line. Conflict-register
resolutions are binding until superseded by a later version. Code Reviewer rejects PRs
that: hardcode hex/site URLs · use banned strings · violate §11 Don'ts · add Tailwind
colors/fonts outside the token system · render two Signal elements co-visible in a
viewport (incl. Signal on sticky/fixed elements).

- **v1.1 — 2026-06-11.** Founder rulings 2026-06-11 (Phase A continue): **D1-B** —
  Signal rule reworded from per-surface to PER-VIEWPORT (§2, §7 CTA discipline + map,
  §11, §14); marketing CTA map recorded (hero + final = signal, mid-page/pricing = ink
  un-retired, nav = secondary always); C7 updated. **D3-B** — marketing nav becomes
  spread-at-top → pill-on-scroll morph, light-only (§7 Nav, §9 M5 + timing row, C12).
- **v1.0 — 2026-06-11.** Initial canon. Dialog layout/experience adoption on Trochia
  tokens per `.planning/features/2026-06-11-design-adoption-PLAN.md` (founder-approved).
  Supersedes `docs/DESIGN-REFERENCE.md` v1.0.
