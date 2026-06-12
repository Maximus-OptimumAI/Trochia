import type { Metadata, Viewport } from 'next';
import { SITE_URL } from '@/lib/env';
import { fontVariables } from './fonts';
import { Providers } from './providers';
import './globals.css';

/**
 * Root layout. Light mode only this phase (no dark-mode toggle). Font CSS
 * variables (Geist / Inter / Geist Mono) are applied to <html>; the body
 * carries the brand surface (`bg-paper text-ink`). All context providers live
 * in <Providers> (src/app/providers.tsx) — never add them here.
 *
 * Metadata wires every brand asset from public/ via the Next metadata API.
 * The canonical site URL comes from `@/lib/env` (SITE_URL) — never hardcoded.
 */
export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: 'Trochia · the agentic operator for your raise',
    template: '%s · Trochia',
  },
  description:
    'Trochia holds your business memory, finds the right investors, drafts your outreach, and closes the round. From F&F to Series A.',
  applicationName: 'Trochia',
  icons: {
    icon: [
      { url: '/favicon.svg', type: 'image/svg+xml' },
      { url: '/favicon-32x32.png', sizes: '32x32', type: 'image/png' },
      { url: '/favicon-16x16.png', sizes: '16x16', type: 'image/png' },
    ],
    apple: [{ url: '/apple-touch-icon.png', sizes: '180x180', type: 'image/png' }],
    other: [
      { rel: 'icon', url: '/android-chrome-192x192.png', sizes: '192x192', type: 'image/png' },
      { rel: 'icon', url: '/android-chrome-512x512.png', sizes: '512x512', type: 'image/png' },
    ],
  },
  openGraph: {
    type: 'website',
    siteName: 'Trochia',
    url: SITE_URL,
    title: 'Trochia · the agentic operator for your raise',
    description:
      'Trochia holds your business memory, finds the right investors, drafts your outreach, and closes the round. From F&F to Series A.',
    images: [{ url: '/og-image.png', width: 1200, height: 630, alt: 'Trochia' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Trochia · the agentic operator for your raise',
    description: 'The agentic operator for your raise. From F&F to Series A.',
    images: ['/og-image.png'],
  },
};

export const viewport: Viewport = {
  themeColor: '#FAFAF7',
  colorScheme: 'light',
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${fontVariables} h-full`}>
      <body className="bg-paper text-ink antialiased min-h-full">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
