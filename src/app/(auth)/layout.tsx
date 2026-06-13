import type { ReactNode } from 'react';

import { AuthBrandPanel } from './_components/auth-brand-panel';

/**
 * `(auth)` route-group layout (AUTH-RESTYLE-01) — Dialog split-screen.
 *
 *   - md+ : two columns. Left = brand panel (~40%, ambient M1 halo); right =
 *           form column with the form centered at max-w-md.
 *   - < md: single column. The brand panel drops out; the form renders as the
 *           prior centered card with the mark on top (mobile == the old layout,
 *           zero regression).
 *
 * Page-enter motion lives on the form column's children via the `.auth-enter`
 * stagger (globals.css §9, prefers-reduced-motion: no-preference only — under
 * reduced-motion nothing hides). No marketing top bar, no app shell.
 */
export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <main className="grid min-h-screen grid-cols-1 md:grid-cols-[2fr_3fr]">
      <AuthBrandPanel className="hidden md:flex" />
      <div className="flex items-center justify-center bg-paper px-6 py-12">
        <div className="w-full max-w-md">{children}</div>
      </div>
    </main>
  );
}
