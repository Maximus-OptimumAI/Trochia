import type { ReactNode } from 'react';

/**
 * `(auth)` route-group layout — a minimal centered card layout (no marketing
 * top bar, no app shell). Plan 01-07 UI-SPEC: max-w-md, centered, mark at top.
 */
export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-paper px-6 py-12">
      <div className="w-full max-w-md">{children}</div>
    </main>
  );
}
