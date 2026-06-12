> ⛔ **DEPRECATED — 2026-06-11. This document is no longer canonical.**
>
> The Trochia design system now lives at **`docs/design/DESIGN.md`** (Dialog
> layout/experience system on Trochia tokens, per the founder-approved plan at
> `.planning/features/2026-06-11-design-adoption-PLAN.md`). Read that document — not this
> one — before planning or implementing any UI surface. Several rules below are
> explicitly **repealed** (card shadows/borders, button/input radii, centered hero,
> carousel ban scope, CTA color discipline, the display type scale) — the full
> supersession list is the Conflict Register (C1–C18) in `docs/design/DESIGN.md` §12.
>
> This file is retained for history only: Phase 0–2 artifacts and pre-adoption code
> comments reference it, and it accurately describes the system **as shipped before the
> adoption**. Code comments pointing here are re-pointed as each file is restyled in
> design-adoption Phases A/B.

# Trochia AI — Design Reference v1.0 (superseded)

Distilled from the two reference sites: **harmonic.ai** and **firecrawl.dev**. This document translates the Trochia brand tokens (`BRAND.md`) into specific component and layout decisions so Phase 1 ships a coherent, intentional design system — not a default shadcn/ui theme with brand colors swapped in.

**This document is required reading for any subagent doing UI work, alongside `BRAND.md`.**

---

## Design philosophy

Both reference sites converge on the same operator-grade aesthetic. The pattern:

> Technical credibility + premium restraint + zero "AI buddy" energy. The visual decisions make a founder feel they're using a professional operator's tool, not a chatbot wrapped in gradient buttons.

Trochia inherits this directly. Every visual choice in this document optimizes for that feel.

---

## Five principles

| # | Principle | Implication |
|---|---|---|
| 1 | **Near-monochromatic with one accent** | Ink + Paper carry 90% of the visual weight. Signal earns one moment per surface. Stone and Graphite handle structure. No competing accents, no rainbows. |
| 2 | **Generous whitespace as a luxury signal** | Section padding 128px desktop / 80px mobile. Cards padded 32px+. Never crowd content to fill space — leave it empty. |
| 3 | **Real data, real code on display** | Heroes show actual product surfaces, real API calls, real raise timelines — not abstract illustrations or stock graphics. |
| 4 | **Tight typography, confident headlines** | Display type at 56–72px Geist 600 tracking-tight. Subheads stay short. No marketing fluff sentences. |
| 5 | **Subtle, intentional motion** | Fade-up on scroll. Hover transitions 120ms. No spring physics, no bounces, no confetti. Motion serves comprehension, never decoration. |

---

## Color tokens (use these names in Tailwind config)

From `BRAND.md`, with semantic role assignments:

| Token | Hex | Role |
|---|---|---|
| `paper` | `#FAFAF7` | Page background. The default. |
| `ink` | `#0A0E1A` | Primary text, primary button bg, mark color |
| `graphite` | `#6B7280` | Secondary text, muted UI labels |
| `stone` | `#ECEAE3` | Borders (1px hairlines), dividers, soft surfaces |
| `signal` | `#F25C2A` | The single accent. One moment per surface — never body, never large fills |
| `success` | `#0F9D58` | Positive states |
| `warning` | `#E5A100` | Caution states |
| `danger` | `#E53935` | Errors, destructive actions |

**Shadow rule.** No shadows on cards by default. Use 1px Stone borders instead. If a shadow is essential (modal, dropdown), use a single very-low-opacity Ink-tinted shadow: `0 8px 24px rgba(10,14,26,0.08)`.

**Gradient rule.** No gradients anywhere except in the hero "live element" (the animated raise timeline), and even there, only an Ink → Ink/0 fade if needed.

---

## Typography system (Tailwind classes to define)

Pulled from `BRAND.md` and extended with explicit class names Phase 1 should create:

| Class | Font | Size | Weight | Tracking | Use |
|---|---|---|---|---|---|
| `text-display` | Geist | 56–72px (responsive) | 600 | -2% | Hero H1 only |
| `text-h2` | Geist | 36–44px | 600 | -1% | Section headlines |
| `text-h3` | Geist | 24–28px | 500 | 0 | Card titles, sub-section headers |
| `text-h4` | Geist | 18–20px | 500 | 0 | Inline emphasis |
| `text-body` | Inter | 16–17px | 400 | 0 (line-height 1.65) | Body copy default |
| `text-body-sm` | Inter | 14–15px | 400 | 0 | Secondary copy, captions |
| `text-label` | Inter | 13–14px | 500 | +4% (uppercase OK) | Eyebrow text, form labels |
| `text-mono` | Geist Mono | 14–16px | 400 | 0 | Numbers, code, metrics, command palette |
| `text-mono-sm` | Geist Mono | 12–13px | 400 | 0 | Inline code, badges |

**Default text color** is `text-ink`. Use `text-graphite` for secondary copy, `text-signal` only for one accent moment per surface.

---

## Layout system

| Surface | Spec |
|---|---|
| Max content width | `max-w-[1200px] mx-auto` (~Harmonic uses 1280, Firecrawl ~1200; we land at 1200) |
| Page gutters | `px-6 md:px-12` |
| Section padding (between marketing sections) | `py-20 md:py-32` (80px / 128px) |
| Card padding (default) | `p-8` (32px) |
| Card padding (hero / featured) | `p-12` (48px) |
| Grid gaps | `gap-6` (24px) for cards, `gap-12` for major layout blocks |
| Border radius | `rounded-xl` (12px) for cards, `rounded-lg` (8px) for buttons + inputs, `rounded-full` for pills/badges |
| Border weight | Always 1px. Color `border-stone` at rest, `border-ink/20` on hover for interactive elements. |

---

## Component patterns

### Buttons

| Variant | Spec | Use |
|---|---|---|
| **Primary** | `bg-ink text-paper hover:bg-ink/90 h-11 px-6 rounded-lg font-medium tracking-tight` | Main CTA — one per surface (the "signal moment" can replace this with a `bg-signal` variant) |
| **Signal** | `bg-signal text-paper hover:bg-signal/90 h-11 px-6 rounded-lg font-medium` | Reserved for the one accent CTA per surface. Use sparingly. |
| **Secondary** | `bg-paper text-ink border border-stone hover:border-ink/30 h-11 px-6 rounded-lg font-medium` | Supporting actions |
| **Ghost** | `bg-transparent text-ink hover:bg-stone/50 h-11 px-6 rounded-lg font-medium` | Tertiary, nav-adjacent |
| **Link** | `text-ink hover:text-signal underline-offset-4 hover:underline transition-colors` | In-flow text actions, "Learn more →" patterns |

**Sizes.** Default `h-11` (44px). Mobile `h-12` (48px touch target). Compact `h-9` (36px) for dense UIs only. No `xs` variant — small buttons read as toy.

**Press state.** `active:scale-[0.98]` on all variants. No other physics.

### Cards

```
bg-paper
border border-stone
rounded-xl
p-8
hover:border-ink/20 (only if interactive)
transition-colors duration-150
```

No shadow. No lift on hover. No gradient.

**Featured card variant** (for pricing's "Most chosen"):
```
border-2 border-signal
relative
(with a small Signal badge absolutely positioned top-right)
```

### Inputs

```
bg-paper
border border-stone
rounded-lg
h-11
px-4
text-body text-ink
placeholder:text-graphite
focus:border-ink focus:outline-none focus:ring-0
```

**Label.** `text-label text-graphite mb-2 block`

**Error state.** `border-danger` + helper text in `text-body-sm text-danger mt-1.5`

### Navigation (top bar)

```
h-16 (64px)
bg-paper/95 backdrop-blur-sm
border-b border-stone (only when scrolled past 8px — toggle via JS)
sticky top-0 z-40
```

**Contents (left to right):** Mark+wordmark lockup (linked to `/`) · Center nav (max 5 items: How it works, Pricing, Manifesto, Docs, Changelog) · Right-side actions (Sign in link + "Start raising" Primary button)

Mobile: hamburger → full-screen Sheet menu, Mark stays top-left.

### Section dividers

Borrow Harmonic's pattern: thin line + a small mono label. Use between major sections on long pages.

```html
<div class="flex items-center gap-4 my-20">
  <div class="text-mono-sm text-graphite uppercase tracking-[+8%]">— SECTION NAME</div>
  <div class="flex-1 h-px bg-stone"></div>
</div>
```

---

## Marketing site page briefs (Phase 1 ships these)

### Homepage `/`

**Above-the-fold hero (single screen, no scroll required):**

```
[Eyebrow]  THE AGENTIC OPERATOR FOR YOUR RAISE
           (text-label text-signal)

[H1]       Run your raise from one operator.
           (text-display, max-w-3xl, tracking-tight)

[Subhead]  Trochia holds your business memory, finds the
           right investors, drafts your outreach, and closes
           the round. From F&F to Series A.
           (text-body text-graphite max-w-xl)

[CTAs]     [Primary: Start your raise] [Link: See how it works →]

[Live element — right column or below subhead on mobile]
           Animated raise timeline:
           Memory → Pitch Lab → Pipeline → Live Raise → Close
           Each module lights up sequentially (Ink color → Signal),
           800ms per step, loops with 2s pause.
           Built in SVG + Framer Motion. Respects prefers-reduced-motion.
```

**Trust strip (immediately below hero, single line):**

> `Used by founders raising at Y Combinator, Techstars, Antler, and 8 other accelerators in 2026`
> (text-body-sm text-graphite, centered, with small logo strip below)

**"How it works" section:**

Numbered horizontal flow, 4 steps. Each step is a small card with:
- Mono-numbered label (01, 02, 03, 04 in `text-mono text-signal`)
- H3 title
- 2-sentence body
- Arrow connector between steps on desktop

Steps:
1. Drop your context → Business Memory
2. Trochia matches investors → Pipeline
3. Run your pitches → Live Raise
4. Close → Cap Table

**Modules section ("What Trochia operates"):**

2×3 grid of module cards. Each:
- Mark icon (small, Ink) top-left
- H3 module name
- 2–3 sentence description
- "See how →" link bottom

The 6 modules: Business Memory, Pitch Lab, Investor Pipeline, Live Raise, Data Room, Raise Ops (SAFE + Cap Table).

**Founder voices section** (post-design-partner, placeholder for now):

2 testimonial cards, each with:
- Quote (text-h3, Geist 500)
- Founder name + company + round raised (text-mono-sm)
- Headshot (24px, rounded-full)

**Pricing teaser:**

4 small cards in a row showing the four tiers ($49 / $199 / $399 / $19) with one-line positioning each. CTA: "See full pricing →" links to `/pricing`.

**Final CTA section:**

Full-width, py-32, centered:
- H2 "Stop juggling. Start raising."
- Subhead
- Primary CTA: "Start your raise"
- Optional secondary: "Talk to founder" → calendar link

**Footer:**

Three columns + a mark line:
- Trochia logo + tagline
- Product nav (Pricing, Manifesto, Changelog, Status)
- Legal (Privacy, Terms, Security, DPA)
- Bottom: © 2026 Trochia, mark, social icons (X, LinkedIn)

### Pricing `/pricing`

4-card grid, side-by-side on desktop, stacked on mobile.

Card structure (per tier):
- Tier name (text-h3)
- Price (Geist Mono, large: `text-4xl`) + `/month` (Inter, graphite)
- One-line positioning
- Feature list (8–12 items, checkmark icons in Signal)
- CTA button at bottom

**Most-popular card** (Active Raise): `border-2 border-signal`, with a small "Most chosen" badge top-right in Signal background.

Below the cards:
- Comparison table (full feature matrix across all 4 tiers)
- FAQ accordion (8 questions, shadcn Accordion themed)

### Manifesto `/manifesto`

Long-form, single-column, treated as the credibility piece.

- Hero: title + author + date (max-w-3xl mx-auto)
- Body: 1500–2000 words on why Trochia exists, what's broken about fundraising, the operator philosophy
- Set in `text-body` at 18px, max-w-prose (~65ch)
- Pull quotes in larger Geist with a 4px Signal left-border bar
- Section breaks use the divider pattern above

### Sign-up `/sign-up` and Sign-in `/sign-in`

Centered card pattern:

```
py-24 px-6
Centered, max-w-md mx-auto

[Mark, 48px, centered]

[H3] Start your raise
     (or "Welcome back" for sign-in)

[Subhead] Trochia operates alongside you through every stage.
          (text-body-sm text-graphite, centered)

[Email input — full width]

[Primary CTA — full width, "Continue with email"]

[Divider with "or"]

[Google SSO button — secondary variant, full width]

[Footer link] Already have an account? Sign in →
              (or "New to Trochia? Start raising →" on sign-in)

[Legal] By continuing you agree to our Terms and Privacy.
        (text-body-sm text-graphite, centered)
```

---

## App shell (Phase 1 ships the empty shell; later phases fill it)

### Layout

```
+--------------------------------------------------+
| Sidebar (240px) |  Main area                     |
|                 |  +------------------------+   |
|  [Mark]         |  | Top bar (page title)  |   |
|                 |  +------------------------+   |
|  Business       |  |                        |   |
|   Memory        |  |   Page content         |   |
|  Pitch Lab      |  |                        |   |
|  Pipeline       |  |                        |   |
|  Live Raise     |  |                        |   |
|  Data Room*     |  |                        |   |
|  Raise Ops*     |  |                        |   |
|                 |  |                        |   |
|  --- bottom --- |  |                        |   |
|  Settings       |  |                        |   |
|  [User avatar]  |  +------------------------+   |
+--------------------------------------------------+
```

\* Modules tagged `V2` or `V3` are disabled with a subtle "Coming Phase X" hint until they ship.

### Sidebar spec

```
w-60 (240px) on desktop, full-width drawer on mobile
bg-paper
border-r border-stone
flex flex-col

[Top: Logo lockup, p-6]
[Middle: Nav items, px-3, gap-1]
[Bottom: User menu, p-3, mt-auto]
```

**Nav items** look like:
- `flex items-center gap-3 px-3 h-10 rounded-md text-body-sm font-medium text-graphite hover:bg-stone/50 hover:text-ink`
- Active state: `bg-stone text-ink`
- Disabled (future phase): `text-graphite/50 cursor-not-allowed` with a small mono badge "Phase 6" right-aligned

### Top bar (inside main area)

```
h-14 (56px)
bg-paper
border-b border-stone
px-8
flex items-center justify-between

Left: Page title (text-h3)
Right: Page actions (filter, search, primary action)
```

### Empty dashboard state (Phase 1 visible state)

Centered, max-w-md, py-32:
- Mark icon, 64px
- H3: "Welcome to Trochia"
- Body: "Start by dropping your context into Business Memory. Everything else builds on it."
- Primary CTA: "Start Business Memory" → links to `/app/memory` (Phase 2 fills this)

---

## Motion guidelines

| Motion type | Duration | Easing | Use |
|---|---|---|---|
| Hover transitions | 120ms | `ease-out` | Color, border, background |
| Page enter | 200ms | `ease-out` | Fade-up: `translateY(8px → 0)` + `opacity(0 → 1)` |
| Scroll reveal | 300ms | `ease-out` | Same as page enter, triggered on viewport intersection |
| Modal/sheet enter | 250ms | `ease-out` | Fade + slight upward translate |
| Live element loop (hero timeline) | 800ms per step | `ease-in-out` | Sequential illumination, 2s pause at loop end |

**Banned motion patterns:**

- Spring physics (no bouncing)
- Scale-on-hover beyond `0.98` press state
- Cursor-following effects (gradient cursors, spotlight follows)
- Confetti, sparkles, particle systems
- Background gradient animations
- Carousels (use scroll-snap horizontal lists if absolutely needed)
- Auto-rotating banners
- Marquee tickers (except possibly logo strip, very slow)

**Reduced motion.** Respect `prefers-reduced-motion: reduce`. All non-essential motion disabled. The hero live element switches to a static composition.

---

## Specific patterns to copy

### From firecrawl.dev

1. **Code/terminal demo in the hero.** Real syntax-highlighted output, mono font, narrow card, hints at the product's technical depth. *Trochia translation:* a fake pre-call brief or matched-investor list in the hero card showing what the operator produces.

2. **Single tight color accent.** Their orange flame mark + occasional orange CTA. *Trochia translation:* Signal #F25C2A used identically — mark dot + one CTA per surface, never more.

3. **Documentation feels like part of the product.** Their `/docs` is set in the same type system, same colors, same nav. *Trochia translation:* `/manifesto`, `/legal/*`, `/changelog` all use the same components and feel.

4. **No stock illustrations.** Every visual is either the mark, a real screenshot, or a code snippet. *Trochia translation:* Same. Marketing site visuals are: the mark, animated raise timeline, real product screenshots once Phase 5 ships.

### From harmonic.ai

1. **Live data feel in the hero.** Animated counters, streaming data, "live" subtitle indicating real product activity. *Trochia translation:* The animated raise timeline + a counter ("`347 founders raising right now`" — once we have real data).

2. **Customer logo strip.** Grayscale logos at rest, color on hover, very slow scroll if motion. *Trochia translation:* Accelerator logos at first (Y Combinator, Techstars, Antler, etc. — only where founders have actually raised through Trochia).

3. **Section dividers with mono label.** Thin line + small mono uppercase label marking each section. *Trochia translation:* Use this pattern between marketing sections (component spec above).

4. **Numbers prominent in mono.** Key metrics displayed in Geist Mono, large, with Inter body context. *Trochia translation:* Use mono for `$5M raised through Trochia`, `347 founders`, `92% activation`, etc.

---

## Anti-patterns (do NOT do these)

The full list of generic "AI startup" patterns Trochia avoids:

| Anti-pattern | Why it's banned |
|---|---|
| Gradient backgrounds on full sections | Reads cheap, ages fast |
| Glassmorphism / frosted glass | Played out, lacks restraint |
| Cursor-following gradient spotlights | Distracting, on-trend = off-brand |
| Multiple competing accent colors | Breaks the single-Signal-moment rule |
| Centered hero text on desktop | Looks like a generic SaaS template; Trochia heroes are left-aligned |
| Stock illustrations (3D characters, abstract waves) | Trochia shows real product, not metaphor |
| Carousels | Hide content, hurt comprehension |
| "AI buddy" copy ("Hi! I'm Trochia 👋", emoji in product) | Violates voice guidelines in BRAND.md |
| Drop shadows on cards | Use borders; shadows make UI feel dated |
| Auto-playing background video | Bandwidth, distraction, motion-sickness risk |
| Confetti on success states | Violates motion rules; reads as toy |
| Animated SVG illustrations of laptops/phones with screens | Abstract clutter |
| "Trusted by" + logos that have no real relationship | Violates voice (no fluff) |

---

## shadcn/ui component installation priority for Phase 1

Install + theme these to brand tokens. Defer everything else.

### Phase 1 install (10 components)

1. **Button** — with all variants from the table above
2. **Input** — with brand-themed focus + error states
3. **Label** — themed to `text-label` class
4. **Form** — react-hook-form + zod integration
5. **Card** — default + featured variant
6. **Dialog** — for modals (e.g., "Start your raise" capture)
7. **Sheet** — for mobile nav + side panels (used heavily Phase 2+)
8. **Tabs** — for pricing toggle, manifesto sections
9. **Toast** — for app-shell notifications (Sonner integration)
10. **NavigationMenu** — for marketing site top bar
11. **Avatar** — for testimonials + user menu (small surface, easy)
12. **Badge** — for "Most chosen", phase tags in disabled nav items
13. **DropdownMenu** — for user menu in sidebar
14. **Accordion** — for FAQ on pricing page

That's 14, not 10 — the four extras (NavigationMenu, Avatar, Badge, Accordion) all earn their slot for Phase 1 marketing-site or app-shell completeness.

### Phase 2+ install (defer until needed)

- DataTable — Phase 4 (Pipeline)
- Command palette (`cmdk`) — Phase 2 (Q&A sidebar)
- Combobox — Phase 4 (investor search)
- Calendar — Phase 5 (Live Raise dates)
- Progress — Phase 3+ (file upload)
- Slider — defer or skip
- Switch — Phase 1 if dark mode toggle ships; otherwise defer
- Tooltip — Phase 1 light, but only where genuinely necessary

---

## Tailwind config additions Phase 1 must produce

```typescript
// tailwind.config.ts
import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        paper: '#FAFAF7',
        ink: '#0A0E1A',
        graphite: '#6B7280',
        stone: '#ECEAE3',
        signal: '#F25C2A',
        success: '#0F9D58',
        warning: '#E5A100',
        danger: '#E53935',
      },
      fontFamily: {
        geist: ['var(--font-geist)', 'system-ui', 'sans-serif'],
        inter: ['var(--font-inter)', 'system-ui', 'sans-serif'],
        mono: ['var(--font-geist-mono)', 'monospace'],
      },
      fontSize: {
        display: ['4rem', { lineHeight: '1.05', letterSpacing: '-0.02em', fontWeight: '600' }],
        h2: ['2.5rem', { lineHeight: '1.1', letterSpacing: '-0.01em', fontWeight: '600' }],
        h3: ['1.625rem', { lineHeight: '1.25', fontWeight: '500' }],
        h4: ['1.25rem', { lineHeight: '1.3', fontWeight: '500' }],
        body: ['1.0625rem', { lineHeight: '1.65', fontWeight: '400' }],
        'body-sm': ['0.9375rem', { lineHeight: '1.55', fontWeight: '400' }],
        label: ['0.8125rem', { lineHeight: '1.4', letterSpacing: '0.04em', fontWeight: '500' }],
      },
      maxWidth: {
        content: '1200px',
        prose: '65ch',
      },
      spacing: {
        section: '8rem', // 128px section padding (desktop)
        'section-sm': '5rem', // 80px section padding (mobile)
      },
      borderRadius: {
        DEFAULT: '0.5rem',
        lg: '0.5rem',
        xl: '0.75rem',
      },
    },
  },
  plugins: [require('@tailwindcss/typography')],
};

export default config;
```

---

## Phase 1 design system exit gate

Phase 1 is **NOT done** until all of these are true:

1. ✅ `tailwind.config.ts` matches the spec above (tokens, typography, spacing, radius)
2. ✅ Geist + Inter + Geist Mono loaded via `next/font` with CSS variables
3. ✅ All 14 priority shadcn/ui components installed and themed (not stock)
4. ✅ Marketing site live at `/` with all sections from the homepage brief
5. ✅ `/pricing`, `/manifesto`, `/sign-up`, `/sign-in` shipped per their briefs
6. ✅ App shell at `/app` with sidebar, top bar, empty dashboard state
7. ✅ `/styleguide` internal route (auth-gated) showing every themed component + type scale + color tokens + motion examples
8. ✅ Favicon + OG image + all `next/metadata` wired
9. ✅ Lighthouse score >90 on `/` (performance, accessibility, best practices, SEO)
10. ✅ `prefers-reduced-motion` respected on the hero live element

If any of these are missing, the phase has not exited.

---

## Reference: the two sites in three lines each

**harmonic.ai** — Investor data company. Their site is the gold standard for fintech-meets-AI: data-rich heroes, mono accents on numbers, generous whitespace, single saturated accent. Steal: section pacing, customer logo treatment, animated data feel.

**firecrawl.dev** — Developer tool for web scraping. Their site is the gold standard for technical credibility: code-in-hero, documentation feel, single saturated orange accent, no fluff. Steal: hero composition, documentation styling, restraint with motion.

Both share: light cream background, near-black ink text, hairline borders, no shadows, no gradients, tight tracking on display, mono for technical content. Trochia inherits all of it.

---

*Design Reference v1.0 — 2026-05-11. Updates as the design system evolves.*
