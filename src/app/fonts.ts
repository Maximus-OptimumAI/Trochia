/**
 * Trochia typefaces (3-typeface brand architecture — docs/BRAND.md v1.1):
 *   - Geist       → display + headings at LIGHT (300 ≥50px / 400 below —
 *                   weight-by-size rule, DESIGN.md §4); 700 for the wordmark
 *                   lockup only; 600 retained for app-shell internals until
 *                   the Phase B audit drops it. CSS var --font-geist.
 *   - Inter       → body + UI         (weights 400 / 500), CSS var --font-inter
 *   - Geist Mono  → numbers + code    (weight 400),        CSS var --font-geist-mono
 *
 * Loaded via next/font/google (self-hosted, no layout shift, no external
 * request). The CSS variables are applied to <html> in layout.tsx and consumed
 * by tailwind.config.ts / globals.css.
 */
import { Geist, Geist_Mono, Inter } from 'next/font/google';

export const geist = Geist({
  subsets: ['latin'],
  weight: ['300', '400', '600', '700'],
  variable: '--font-geist',
  display: 'swap',
});

export const inter = Inter({
  subsets: ['latin'],
  weight: ['400', '500'],
  variable: '--font-inter',
  display: 'swap',
});

export const geistMono = Geist_Mono({
  subsets: ['latin'],
  weight: ['400'],
  variable: '--font-geist-mono',
  display: 'swap',
});

/** Convenience: all three font CSS-variable classes for the <html> element. */
export const fontVariables = `${geist.variable} ${inter.variable} ${geistMono.variable}`;
