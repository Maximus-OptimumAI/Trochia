import type { ReactNode } from 'react';
import { Sidebar } from '@/components/shell/sidebar';
import { TopBar } from '@/components/shell/top-bar';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';

/**
 * AppShell — composes Sidebar (w-60) + TopBar (h-14) + a content slot, plus an
 * empty Sheet-mounted right-side region reserved for the Phase-2 ambient Q&A
 * sidebar. Phase 1 mounts the region but leaves it empty (controlled `open` is
 * always false until Phase 2 wires it).
 */
export function AppShell({
  title,
  actions,
  activeHref,
  userName,
  userEmail,
  children,
  /** Phase 2 controls this; Phase 1 leaves it closed. */
  qaOpen = false,
}: {
  title: string;
  actions?: ReactNode;
  activeHref?: string;
  userName?: string;
  userEmail?: string;
  children: ReactNode;
  qaOpen?: boolean;
}) {
  return (
    <div className="flex min-h-screen bg-paper">
      <Sidebar activeHref={activeHref} userName={userName} userEmail={userEmail} />
      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar title={title} actions={actions} />
        <main className="min-w-0 flex-1 px-8 py-8">{children}</main>
      </div>
      {/* Phase-2 ambient Q&A sidebar slot — mounted, empty in Phase 1. */}
      <Sheet open={qaOpen}>
        <SheetContent side="right" className="w-[380px]">
          <SheetHeader>
            <SheetTitle>Ask Trochia</SheetTitle>
            <SheetDescription>The ambient Q&amp;A sidebar arrives in Phase 2.</SheetDescription>
          </SheetHeader>
        </SheetContent>
      </Sheet>
    </div>
  );
}
