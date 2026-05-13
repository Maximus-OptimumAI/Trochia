import type { ReactNode } from 'react';

/**
 * `(app)` route-group layout — pages inside this group are session-gated by
 * `src/proxy.ts` (some also subscription-gated; see proxy classifier). Most
 * pages render their own `<AppShell>` so they can set title/actions/activeHref;
 * this layout is intentionally a thin pass-through so route-group nesting is
 * explicit and each page owns its chrome.
 */
export default function AppLayout({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
