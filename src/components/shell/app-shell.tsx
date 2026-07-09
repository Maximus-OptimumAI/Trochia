import type { ReactNode } from 'react';
import { Sidebar } from '@/components/shell/sidebar';
import { TopBar } from '@/components/shell/top-bar';

/**
 * AppShell composes the Sidebar (w-60), the TopBar (h-14), and a content slot.
 * The ambient Q&A surface is no longer mounted here: ASK-UX-01 moved it to
 * `<AskLauncher>` (a floating pill plus Cmd-K opening a right-side sheet),
 * mounted once in the `(app)` route-group layout. This shell owns only the
 * primary chrome each page renders around its content.
 */
export function AppShell({
  title,
  actions,
  activeHref,
  userName,
  userEmail,
  children,
}: {
  title: string;
  actions?: ReactNode;
  activeHref?: string;
  userName?: string;
  userEmail?: string;
  children: ReactNode;
}) {
  return (
    <div className="flex min-h-screen bg-paper">
      <Sidebar activeHref={activeHref} userName={userName} userEmail={userEmail} />
      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar title={title} actions={actions} />
        <main className="min-w-0 flex-1 px-8 py-8">{children}</main>
      </div>
    </div>
  );
}
