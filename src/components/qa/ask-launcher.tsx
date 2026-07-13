'use client';

import * as React from 'react';
import { usePathname } from 'next/navigation';
import { Sparkles } from 'lucide-react';

import { QaSidebar } from '@/components/qa/sidebar';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet';

/**
 * `<AskLauncher/>` (ASK-UX-01) is the single entry point to the ambient Q&A
 * surface. It replaces the old inline bottom-of-page Ask bar with TWO triggers
 * that open the SAME right-side sheet:
 *
 *   1. a floating "Ask Trochia" signal pill (bottom-right), and
 *   2. a global Cmd-K / Ctrl-K shortcut.
 *
 * The sheet renders the existing `<QaSidebar/>` unchanged (same `trpc.qa.ask`
 * call, same five states, same citations-first rendering). This component owns
 * ONLY the open-state and the two triggers; it touches no retrieval logic.
 *
 * a11y + motion: Escape and backdrop-click close via the Sheet primitive
 * natively. The sheet mounts the QaSidebar on open, whose textarea is
 * `autoFocus`ed so focus lands in the question field. The pill carries
 * `aria-haspopup="dialog"`; the sheet keeps a (visually hidden) title for the
 * dialog's accessible name, since QaSidebar renders its own visible heading.
 *
 * ONBOARDING-FIX-01: the ambient Q&A surface answers from confirmed business
 * memory, which does not exist yet during onboarding, so the launcher is gated
 * off every `/onboarding/*` route. On those routes this renders NOTHING (no
 * pill, no sheet) AND the global Cmd-K / Ctrl-K listener is never registered.
 * The launcher is unchanged on every other `(app)` route.
 */
export function AskLauncher() {
  const pathname = usePathname();
  const onOnboarding = pathname?.startsWith('/onboarding') ?? false;

  const [open, setOpen] = React.useState(false);

  // Global Cmd-K / Ctrl-K opens the sheet. Listener is removed on unmount.
  // Skipped entirely on onboarding: the effect returns before registering, so
  // the shortcut is absent (not just hidden) wherever the pill is hidden.
  React.useEffect(() => {
    if (onOnboarding) return;
    function onKeyDown(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setOpen(true);
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onOnboarding]);

  // Render nothing on onboarding. All hooks above run unconditionally first, so
  // this early return respects the rules of hooks.
  if (onOnboarding) return null;

  return (
    <>
      <Button
        variant="signal"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        className="fixed bottom-6 right-6 z-40 rounded-full shadow-overlay"
        data-testid="ask-launcher-pill"
      >
        <Sparkles />
        Ask Trochia
      </Button>

      <Sheet open={open} onOpenChange={(next) => setOpen(next)}>
        {/*
          Overlay treatment per DESIGN.md section 8: bg-card, shadow-overlay
          (inherited from the primitive), rounded on the exposed side only so the
          attached/right edge stays square (`rounded-l-3xl`). Width is scoped
          under `data-[side=right]` because the Sheet primitive sets its default
          width there; overriding with the same modifier lets tailwind-merge win.
        */}
        <SheetContent
          side="right"
          className="bg-card gap-0 rounded-l-3xl data-[side=right]:w-full data-[side=right]:sm:w-[400px] data-[side=right]:sm:max-w-[400px]"
          data-testid="ask-launcher-sheet"
        >
          <SheetTitle className="sr-only">Ask Trochia</SheetTitle>
          <div className="min-h-0 flex-1 overflow-y-auto p-6">
            <QaSidebar />
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
