# Trochia AI — Brand System v1.0

The agentic operator for your raise. From Greek τροχιά (trochiá): track, path, trajectory, orbit. Every visual decision encodes motion forward.

---

## The mark

The T-Orbit — a geometric T whose crossbar is an arc, with a signal node at the apex. The arc is the trajectory. The node is the raise rising. Both gestures carry through every variant.

**Variants in this pack:**
- `logos/trochia-mark.svg` — primary, color
- `logos/trochia-mark-mono-dark.svg` — single-color ink
- `logos/trochia-mark-mono-light.svg` — knockout for dark backgrounds

---

## Naming

- **Trochia** — capitalized T, lowercase remainder. Never TROCHIA except in deliberately tracked-out treatments.
- **Trochia AI** — long form for product surfaces and formal contexts. The "AI" is muted: lighter weight, smaller, graphite color.
- **Trochia** — short form in conversation, headlines, body copy where context is clear.
- Pronunciation: TROH-kee-ah.

---

## Color

| Token | Hex | RGB | Use |
|---|---|---|---|
| Ink | `#0A0E1A` | 10, 14, 26 | Mark, body text, structural elements. Cool near-black, never pure `#000`. |
| Paper | `#FAFAF7` | 250, 250, 247 | Primary background. Warm off-white, never pure `#FFF`. |
| Signal | `#F25C2A` | 242, 92, 42 | The leading node. Strategic accent only — one moment per surface, never body text or large fills. |
| Graphite | `#6B7280` | 107, 114, 128 | Secondary text, muted UI, the "AI" suffix in long-form wordmark. |
| Stone | `#ECEAE3` | 236, 234, 227 | Borders, dividers, soft backgrounds. |
| Success | `#0F9D58` | 15, 157, 88 | Positive states. |
| Warning | `#E5A100` | 229, 161, 0 | Caution states. |
| Danger | `#E53935` | 229, 57, 53 | Errors, destructive actions. |

**Usage rules.** Ink and Paper carry 90% of the visual weight. Signal earns one moment per surface — the leading node, a CTA, a brand accent — and is never used for body type or large fills. Stone and Graphite handle UI structure.

---

## Typography

- **Display & wordmark.** Geist (Vercel, OFL, free). Weight 600 for headings, 700 for tight wordmark treatments. Tracking -2% on display sizes, neutral on body.
- **Body.** Inter (OFL, free). Weight 400 with line-height 1.65. Weight 500 for UI labels.
- **Numerical & code.** Geist Mono (OFL, free). For ROI tables, application IDs, code excerpts.

**Hierarchy:**

| Level | Font | Size | Weight | Tracking |
|---|---|---|---|---|
| Display H1 | Geist | 56–72px | 600 | -2% |
| H2 | Geist | 36–44px | 600 | -1% |
| H3 | Geist | 24–28px | 500 | 0 |
| Body | Inter | 16–17px | 400 | 0, line-height 1.65 |
| UI label | Inter | 13–14px | 500 | +4%, uppercase OK |
| Code | Geist Mono | 14–16px | 400 | 0 |

Geist available at https://vercel.com/font. Inter at https://rsms.me/inter/.

---

## Voice

Operator, not assistant. Direct, founder-grade. No emoji. No "AI buddy" tone.

- Short sentences. Concrete nouns. Verbs that move.
- Trochia "drafts," "matches," "briefs," "tracks." Trochia does not "feel," "love," or "want."
- Strategy doc forbids: "investment advice," "legal advice," "rolling fund." These never appear in product or marketing copy.

---

## Mark usage rules

- **Clear space.** Equal to the height of the signal node on all sides. No type, image, or graphic intrudes.
- **Minimum size.** 32px for the full color mark, 24px for the favicon variant. Below that, omit the dot and use the wordmark only.
- **Backgrounds.** Color version on light surfaces. Mono-light (knockout) on dark surfaces or photos with a solid backplate. Mono-dark for single-color print or single-color contexts (embossing, foil, screenprint).
- **Don't.** Don't stretch. Don't recolor the dot to anything other than Signal or the matching mono. Don't place on busy photos without a solid backplate. Don't rotate. Don't add effects (shadow, glow, gradient, bevel). Don't reset in a circle — use the social-square variant instead.

---

## Files in this pack

```
trochia-brand/
├── logos/
│   ├── trochia-mark.svg              (primary mark, color)
│   ├── trochia-mark-mono-dark.svg    (single-color ink)
│   ├── trochia-mark-mono-light.svg   (knockout for dark)
│   ├── trochia-wordmark.svg          ("Trochia" wordmark)
│   ├── trochia-wordmark-ai.svg       ("Trochia AI" with muted suffix)
│   ├── trochia-lockup-horizontal.svg (mark + wordmark side by side)
│   └── trochia-lockup-stacked.svg    (mark above wordmark, centered)
├── icons/
│   ├── trochia-app-icon.svg          (1024×1024 rounded square)
│   ├── trochia-favicon-32.svg        (calibrated for 32/16px)
│   └── trochia-social-square.svg     (1024×1024 ink background)
└── docs/
    └── BRAND.md                      (this file)
```

---

## Shipping to production

**Web app.** Load Geist via `@fontsource/geist` or Vercel's CDN. Drop `trochia-favicon-32.svg` at `/favicon.svg`. Use `trochia-mark.svg` inline in the header for crispness at any size.

**Social.** Use `trochia-social-square.svg` for X, LinkedIn, GitHub, Slack. Crops cleanly to circular avatars on platforms that round.

**App stores.** Convert `trochia-app-icon.svg` to PNG at 1024px for iOS/Android submission. Apple will mask the rounded corners; the SVG already accounts for this.

**Decks & docs.** Use the horizontal lockup at the top-left, mark-only as a watermark/page-corner, stacked lockup on title slides.

---

*v1.0 — May 2026. This document evolves as the brand expands. Updates require a version bump.*
