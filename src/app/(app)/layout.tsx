import type { ReactNode } from 'react';

import { Toaster } from '@/components/ui/sonner';

/**
 * `(app)` route-group layout — pages inside this group are session-gated by
 * `src/proxy.ts` (some also subscription-gated; see proxy classifier). Most
 * pages render their own `<AppShell>` so they can set title/actions/activeHref;
 * this layout is intentionally a thin pass-through so route-group nesting is
 * explicit and each page owns its chrome.
 *
 * Mounts the Sonner `<Toaster>` once for every `(app)` page — Settings +
 * Billing (Plan 09) and later phases call `toast.success` / `toast.error` for
 * non-blocking confirmations (export started, billing portal failed, etc).
 * The styleguide layout mounts its own copy for the styleguide preview.
 */
export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <>
      {children}
      <Toaster />
    </>
  );
}
