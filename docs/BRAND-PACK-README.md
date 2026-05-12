# Trochia Brand Pack — drop-in for the Trochia repo

This bundle uses the **authentic Trochia brand v1 assets** (SVGs + PNGs straight from your original `trochia-brand-v1.zip`). The folder structure mirrors where each asset should live in the Next.js repo, so installation is one extract + commit.

## How to install

1. Extract this zip at the repo root: `C:\Users\ejehe\trochia\Trochia`
2. Confirm `public/brand/`, `public/favicon.svg`, and `docs/BRAND.md` exist
3. Commit:
   ```bash
   git add public/ docs/
   git commit -m "feat(brand): add Trochia brand pack v1 to repo"
   git push
   ```

## What's in the bundle

### `public/brand/` — SVG logos (primary for web)

| File | Use |
|---|---|
| `mark-color.svg` | **Primary mark.** Use inline in headers, marketing site, dashboard. Themeable via CSS. |
| `mark-mono-dark.svg` | Single-color ink for print, embossing, single-color contexts |
| `mark-mono-light.svg` | Knockout for dark backgrounds |
| `wordmark.svg` | "Trochia" set in Geist 600, -2% tracking |
| `wordmark-ai.svg` | "Trochia AI" — long form with muted graphite "AI" suffix |
| `lockup-horizontal.svg` | Mark + wordmark side-by-side (default for deck headers, email signatures) |
| `lockup-stacked.svg` | Mark above wordmark (title slides, splash screens) |
| `app-icon.svg` | 1024×1024 rounded square — for app stores |
| `social-square.svg` | 1024×1024 ink background — for X, LinkedIn, GitHub avatars |

### `public/brand/png/` — raster fallbacks

PNG renders of every variant at deployment sizes (256, 400, 512, 1024). Use these where SVG isn't viable (email signatures, certain social platforms, legacy embeds). For the web app itself, prefer the SVGs.

### `public/` — Next.js-convention root assets

| File | Use |
|---|---|
| `favicon.svg` | Modern browsers — sharp at any size, calibrated for legibility at 16/32px |
| `favicon-16x16.png` | Legacy fallback (older browsers, RSS readers) |
| `favicon-32x32.png` | Legacy fallback |
| `apple-touch-icon.png` | iOS home-screen icon, 180×180 |
| `android-chrome-192x192.png` | Android home-screen icon, 192×192 |
| `android-chrome-512x512.png` | Android splash + PWA icon, 512×512 |
| `og-image.png` | Default Open Graph share image, 1024×1024 |

### `docs/BRAND.md`

The canonical brand system spec v1.0. Referenced by Phase 1 design system work — subagents should read this before authoring any UI.

## CSS variables for Tailwind config

Phase 1's design system work should expose these tokens. Pulled directly from `docs/BRAND.md`:

```js
// tailwind.config.ts
export default {
  theme: {
    extend: {
      colors: {
        ink: '#0A0E1A',
        paper: '#FAFAF7',
        signal: '#F25C2A',
        graphite: '#6B7280',
        stone: '#ECEAE3',
        success: '#0F9D58',
        warning: '#E5A100',
        danger: '#E53935',
      },
      fontFamily: {
        geist: ['var(--font-geist)', 'sans-serif'],
        inter: ['var(--font-inter)', 'sans-serif'],
        mono: ['var(--font-geist-mono)', 'monospace'],
      },
    },
  },
};
```

## Font loading (Next.js 15/16 with `next/font`)

```tsx
// app/layout.tsx
import { Geist, Inter, Geist_Mono } from 'next/font/google';

const geist = Geist({ subsets: ['latin'], variable: '--font-geist' });
const inter = Inter({ subsets: ['latin'], variable: '--font-inter' });
const geistMono = Geist_Mono({ subsets: ['latin'], variable: '--font-geist-mono' });

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${geist.variable} ${inter.variable} ${geistMono.variable}`}>
      <body className="bg-paper text-ink font-inter">{children}</body>
    </html>
  );
}
```

## Mark usage in code

**Inline SVG component (preferred — scales, themes, animates):**

```tsx
// components/Logo.tsx
import MarkColor from '@/public/brand/mark-color.svg';
import LockupHorizontal from '@/public/brand/lockup-horizontal.svg';

export function Mark({ className }: { className?: string }) {
  return <MarkColor className={className} aria-label="Trochia" />;
}

export function Lockup({ className }: { className?: string }) {
  return <LockupHorizontal className={className} aria-label="Trochia" />;
}
```

(Requires `@svgr/webpack` or Next.js's built-in SVG-as-component handling in `next.config.js`.)

**Or render the wordmark in pure text (no asset needed):**

```tsx
<span className="font-geist font-semibold tracking-tight text-2xl text-ink">
  Trochia
</span>
```

## Favicon + OG metadata wiring

```tsx
// app/layout.tsx
export const metadata = {
  title: 'Trochia — the agentic operator for your raise',
  icons: {
    icon: [
      { url: '/favicon.svg', type: 'image/svg+xml' },
      { url: '/favicon-32x32.png', sizes: '32x32', type: 'image/png' },
      { url: '/favicon-16x16.png', sizes: '16x16', type: 'image/png' },
    ],
    apple: '/apple-touch-icon.png',
  },
  openGraph: {
    images: ['/og-image.png'],
  },
};
```

## Mark usage rules (from BRAND.md)

- **Clear space.** Equal to the height of the signal node on all sides. No type, image, or graphic intrudes.
- **Minimum size.** 32px for the full color mark, 24px for the favicon variant. Below that, omit the dot and use the wordmark only.
- **Backgrounds.** Color version on light surfaces. Mono-light on dark surfaces. Mono-dark for single-color print.
- **Don't.** Don't stretch. Don't recolor the dot to anything other than Signal. Don't place on busy photos without a backplate. Don't rotate. Don't add effects (shadow, glow, gradient, bevel).

---

*Bundle assembled 2026-05-11. All assets are the authentic Trochia brand v1.0 originals.*
