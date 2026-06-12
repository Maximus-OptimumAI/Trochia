import type { Config } from 'tailwindcss';

/**
 * Trochia Tailwind config — the canonical brand-token source.
 *
 * Implements docs/design/DESIGN.md §3–§6 (the canonical design system, Dialog
 * layout/experience on Trochia tokens) + docs/BRAND.md v1.1: the 9 color
 * tokens (incl. the `card` #FFFFFF surface-only carve-out), the Geist Light
 * type scale (responsive via clamp — display 44→70px, heading-lg 36→50px,
 * heading 28→32px; weight 300 ≥50px / 400 below), the four Ink-tinted flush
 * shadows, the radii (cards 24px / buttons pill / inputs 0 / nav 32px), the
 * spacing + max-width helpers. Mono deliberately uses Tailwind-native
 * `text-base` / `text-sm`, NOT a custom key. On Tailwind v4 this file is
 * loaded via `@config` in src/app/globals.css; the same tokens are mirrored
 * into that file's `@theme` block so the v4 utility pipeline resolves them.
 *
 * No Tailwind color or font outside this token system — Code Reviewer rejects
 * it. Never pure #000; #FFFFFF only as the `card` surface token (never text,
 * never the canvas) — paper (#FAFAF7) is the page canvas.
 */
const config: Config = {
  content: ['./src/app/**/*.{ts,tsx}', './src/components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        paper: '#FAFAF7',
        card: '#FFFFFF', // surface-only carve-out (BRAND v1.1) — level-1 raised surfaces
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
        sans: ['var(--font-inter)', 'system-ui', 'sans-serif'],
        mono: ['var(--font-geist-mono)', 'ui-monospace', 'monospace'],
      },
      fontSize: {
        // Geist — DESIGN.md §4 scale. 300 at ≥50px, 400 below (weight-by-size rule).
        display: [
          'clamp(2.75rem, 1.55rem + 5vw, 4.375rem)', // 44px → 70px
          { lineHeight: '1.15', letterSpacing: '-0.01em', fontWeight: '300' },
        ],
        'heading-lg': [
          'clamp(2.25rem, 1.6rem + 2.7vw, 3.125rem)', // 36px → 50px
          { lineHeight: '1.2', letterSpacing: '-0.01em', fontWeight: '300' },
        ],
        heading: [
          'clamp(1.75rem, 1.57rem + 0.8vw, 2rem)', // 28px → 32px
          { lineHeight: '1.3', letterSpacing: '-0.32px', fontWeight: '400' },
        ],
        h4: ['1.25rem', { lineHeight: '1.3', fontWeight: '400' }],
        // Aliases — pre-adoption class names re-valued to the new scale so
        // existing pages cascade (Phase A step A9 visually QAs them).
        h2: [
          'clamp(2.25rem, 1.6rem + 2.7vw, 3.125rem)',
          { lineHeight: '1.2', letterSpacing: '-0.01em', fontWeight: '300' },
        ],
        h3: [
          'clamp(1.75rem, 1.57rem + 0.8vw, 2rem)',
          { lineHeight: '1.3', letterSpacing: '-0.32px', fontWeight: '400' },
        ],
        // Inter (3): body / body-sm / label
        body: ['1.0625rem', { lineHeight: '1.65', fontWeight: '400' }],
        'body-sm': ['0.9375rem', { lineHeight: '1.55', fontWeight: '400' }],
        label: ['0.8125rem', { lineHeight: '1.4', letterSpacing: '0.04em', fontWeight: '500' }],
        // NOTE: no mono fontSize key — text-mono / text-mono-sm compose
        // Tailwind-native text-base / text-sm + font-mono.
      },
      maxWidth: {
        content: '1200px',
        prose: '65ch',
      },
      spacing: {
        section: '8rem', // 128px desktop section padding
        'section-sm': '5rem', // 80px mobile section padding
      },
      borderRadius: {
        DEFAULT: '0.5rem',
        lg: '0.5rem', // 8px — small chips only (buttons are pills, inputs are sharp)
        xl: '0.75rem', // 12px — card-inner chips/thumbnails
        '3xl': '1.5rem', // 24px — cards, mockup frames, overlays
        nav: '2rem', // 32px — the floating pill nav container
        full: '9999px',
      },
      boxShadow: {
        // DESIGN.md §6 — Ink-tinted, flush with the plane
        card: '0 2px 3px -2px rgba(10,14,26,0.12)',
        button:
          '0 1px 2px rgba(10,14,26,0.04), 0 2px 4px rgba(10,14,26,0.02), 0 4px 8px rgba(10,14,26,0.02)',
        fade: '0 -40px 40px rgba(250,250,247,0.5)',
        overlay: '0 8px 24px rgba(10,14,26,0.08)',
      },
    },
  },
  plugins: [],
};

export default config;
