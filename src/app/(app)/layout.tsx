import type { ReactNode } from 'react';

import { AskLauncher } from '@/components/qa/ask-launcher';
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
 *
 * Also mounts the ambient Q&A entry point `<AskLauncher>` (ASK-UX-01) once for
 * every `(app)` page: a floating "Ask Trochia" pill plus a Cmd-K shortcut, both
 * opening a right-side sheet that holds the existing `<QaSidebar>` (which calls
 * `trpc.qa.ask` via the Plan-07 tRPC provider). Pages keep owning their own
 * primary chrome. NOTE: the launcher is mounted unconditionally, so it still
 * appears on onboarding; gating it before memory exists is ONBOARDING-FIX-01.
 */
export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <>
      {children}
      <AskLauncher />
      <Toaster />
    </>
  );
}
