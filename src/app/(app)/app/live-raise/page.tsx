import { redirect } from 'next/navigation';

import { AppShell } from '@/components/shell/app-shell';
import { EmptyState } from '@/components/primitives/empty-state';
import { createServerSupabaseClient } from '@/lib/supabase/server';

/**
 * `/app/live-raise` — Live Raise placeholder (Plan 01-09).
 *
 * Phase 1 ships a "Coming in Phase 5" empty-state. Real Live Raise (pre-call
 * briefs, transcript ingestion, 24-hour follow-up drafts, Pipeline Memory
 * kanban) lands in Phase 5. The dashboard CTA "Prepare for an upcoming call"
 * links here.
 */
export default async function LiveRaisePlaceholderPage() {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/sign-in');

  return (
    <AppShell
      title="Live Raise"
      activeHref="/app/live-raise"
      userName={user.user_metadata?.full_name as string | undefined}
      userEmail={user.email ?? undefined}
    >
      <EmptyState
        heading="Live Raise — coming soon"
        body="Trochia will generate pre-call briefs, ingest your transcripts, draft 24-hour follow-ups, and keep a Pipeline Memory kanban — so no thread goes cold."
        primaryCtaLabel="Back to dashboard"
        primaryCtaHref="/app"
      />
    </AppShell>
  );
}
