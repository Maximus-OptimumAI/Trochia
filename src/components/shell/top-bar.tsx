import type { ReactNode } from 'react';

/**
 * TopBar (app shell, inside the main area) — `h-14 bg-paper border-b
 * border-stone px-8`, page title `text-h3` on the left, a page-actions slot on
 * the right (filter / search / primary action).
 */
export function TopBar({ title, actions }: { title: string; actions?: ReactNode }) {
  return (
    <header className="flex h-14 shrink-0 items-center justify-between border-b border-stone bg-paper px-8">
      <h1 className="text-h3 font-geist text-ink">{title}</h1>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </header>
  );
}
