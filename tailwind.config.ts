import type { Config } from 'tailwindcss';

/**
 * Trochia Tailwind config — the canonical brand-token source.
 *
 * Mirrors docs/DESIGN-REFERENCE.md § "Tailwind config additions Phase 1 must
 * produce": the 8 color tokens, the 7 custom `fontSize` keys (Geist's 4 +
 * Inter's 3 — mono deliberately uses Tailwind-native `text-base` / `text-sm`,
 * NOT a custom key), the spacing scale + `section` responsive padding, the
 * max-width helpers, and the radii. On Tailwind v4 this file is loaded via the
 * `@config "../../tailwind.config.ts"` directive in src/app/globals.css; the
 * same tokens are also mirrored into that file's `@theme` block so the v4
 * utility pipeline resolves `bg-paper`, `text-display`, etc.
 *
 * No Tailwind color or font outside this token system — Code Reviewer rejects
 * it. Never pure #000 / #FFF — use `ink` (#0A0E1A) / `paper` (#FAFAF7).
 */
const config: Config = {
  content: ['./src/app/**/*.{ts,tsx}', './src/components/**/*.{ts,tsx}'],
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
        sans: ['var(--font-inter)', 'system-ui', 'sans-serif'],
        mono: ['var(--font-geist-mono)', 'ui-monospace', 'monospace'],
      },
      fontSize: {
        // Geist (4): display / h2 / h3 / h4
        display: ['4rem', { lineHeight: '1.05', letterSpacing: '-0.02em', fontWeight: '600' }],
        h2: ['2.5rem', { lineHeight: '1.1', letterSpacing: '-0.01em', fontWeight: '600' }],
        h3: ['1.625rem', { lineHeight: '1.25', fontWeight: '500' }],
        h4: ['1.25rem', { lineHeight: '1.3', fontWeight: '500' }],
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
        lg: '0.5rem', // 8px — buttons + inputs
        xl: '0.75rem', // 12px — cards
        full: '9999px',
      },
    },
  },
  plugins: [],
};

export default config;
