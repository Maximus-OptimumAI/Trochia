import type { ReactNode } from 'react';
import { Toaster } from '@/components/ui/sonner';

/**
 * /styleguide layout — a sticky table-of-contents sidebar + a wide content
 * column. This route is the Phase-1 design-system exit gate.
 *
 * NOTE: this route is SESSION-gated (not subscription-gated) once auth lands in
 * Plan 07 — it is an internal dev tool. In Phase 1 there is no auth yet, so it
 * ships open. It must NEVER be wrapped by `entitlements()` — it is not a
 * customer feature.
 */
const SECTIONS: { id: string; label: string }[] = [
  { id: 'color', label: '1 · Color tokens' },
  { id: 'typography', label: '2 · Typography' },
  { id: 'spacing', label: '3 · Spacing scale' },
  { id: 'buttons', label: '4 · Buttons' },
  { id: 'inputs', label: '5 · Inputs & Form' },
  { id: 'cards', label: '6 · Cards' },
  { id: 'dialog', label: '7 · Dialog' },
  { id: 'sheet', label: '8 · Sheet' },
  { id: 'tabs', label: '9 · Tabs' },
  { id: 'toast', label: '10 · Toast' },
  { id: 'navigation-menu', label: '11 · NavigationMenu' },
  { id: 'avatar', label: '12 · Avatar' },
  { id: 'badge', label: '13 · Badge' },
  { id: 'dropdown-menu', label: '14 · DropdownMenu' },
  { id: 'accordion', label: '15 · Accordion' },
  { id: 'primitives', label: '16 · Cross-cutting primitives' },
  { id: 'app-shell', label: '17 · App shell' },
  { id: 'motion', label: '18 · Motion examples' },
  { id: 'iconography', label: '19 · Iconography' },
  { id: 'logo', label: '20 · Logo' },
  { id: 'shadows', label: '21 · Shadows' },
  { id: 'reveal', label: '22 · Reveal' },
  { id: 'carousel', label: '23 · Carousel frame' },
];

export default function StyleguideLayout({ children }: { children: ReactNode }) {
  return (
    <div className="mx-auto flex max-w-content gap-12 px-6 py-12 md:px-12">
      <nav className="sticky top-12 hidden h-[calc(100vh-6rem)] w-56 shrink-0 flex-col gap-1 overflow-y-auto md:flex">
        <p className="mb-2 text-label text-graphite">Trochia design system</p>
        {SECTIONS.map((s) => (
          <a
            key={s.id}
            href={`#${s.id}`}
            className="rounded-md px-2 py-1.5 text-body-sm text-graphite transition-colors hover:bg-stone/50 hover:text-ink"
          >
            {s.label}
          </a>
        ))}
      </nav>
      <div className="min-w-0 flex-1">{children}</div>
      <Toaster />
    </div>
  );
}
