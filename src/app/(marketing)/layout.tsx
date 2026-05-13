import type { Metadata } from 'next';
import { SITE_URL } from '@/lib/env';
import { MarketingTopBar } from '@/components/marketing/marketing-top-bar';
import { Footer } from '@/components/marketing/footer';

/**
 * Marketing layout — wraps every `(marketing)` route in the marketing top bar
 * + the footer. Per-page `metadata` defaults live here; pages override the
 * title/description/canonical as needed. All URLs come from `@/lib/env` —
 * never hardcoded.
 *
 * This is a route-group layout (`(marketing)`) — the URL segments
 * (`/`, `/pricing`, `/manifesto`, `/legal/*`) are exposed to the user without
 * the parenthesised prefix.
 */
export const metadata: Metadata = {
  alternates: { canonical: SITE_URL },
  openGraph: {
    url: SITE_URL,
    siteName: 'Trochia',
    type: 'website',
    images: [{ url: '/og-image.png', width: 1200, height: 630, alt: 'Trochia' }],
  },
};

export default function MarketingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-dvh flex-col">
      <MarketingTopBar />
      <main className="flex-1">{children}</main>
      <Footer />
    </div>
  );
}
