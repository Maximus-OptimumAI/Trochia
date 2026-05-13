import { redirect } from 'next/navigation';

import { AppShell } from '@/components/shell/app-shell';
import { EmptyState } from '@/components/primitives/empty-state';
import { createServerSupabaseClient } from '@/lib/supabase/server';

/**
 * `/app/memory` — Business Memory placeholder (Plan 01-09).
 *
 * Phase 1 ships a thin "Coming in Phase 2" empty-state inside the app shell so
 * the sidebar nav resolves and the EmptyDashboard CTA ("Start Business
 * Memory") leads somewhere coherent. Real Memory UI lands in Phase 2 (the
 * Knowledge Layer plan).
 */
export default async function MemoryPlaceholderPage() {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/sign-in');

  return (
    <AppShell
      title="Business Memory"
      activeHref="/app/memory"
      userName={user.user_metadata?.full_name as string | undefined}
      userEmail={user.email ?? undefined}
    >
      <EmptyState
        heading="Business Memory — coming in Phase 2"
        body="Trochia will turn your existing AI context into a confirmed Business Memory that every module reads from. Paste your ChatGPT or Claude context, confirm each field, resolve conflicts."
        primaryCtaLabel="Back to dashboard"
        primaryCtaHref="/app"
      />
    </AppShell>
  );
}
