import { redirect } from 'next/navigation';

import { AppShell } from '@/components/shell/app-shell';
import { EmptyState } from '@/components/primitives/empty-state';
import { createServerSupabaseClient } from '@/lib/supabase/server';

/**
 * `/app/pitch` — Pitch Lab placeholder (Plan 01-09).
 *
 * Phase 1 ships a "Coming in Phase 3" empty-state. Real Pitch Lab (deck
 * review against the Business Memory + defect taxonomy) lands in Phase 3.
 */
export default async function PitchPlaceholderPage() {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/sign-in');

  return (
    <AppShell
      title="Pitch Lab"
      activeHref="/app/pitch"
      userName={user.user_metadata?.full_name as string | undefined}
      userEmail={user.email ?? undefined}
    >
      <EmptyState
        heading="Pitch Lab is coming soon"
        body="Trochia will review your deck against your Business Memory and a defect taxonomy, flagging factual contradictions, vague language, and missing context, with zero fabricated slide references."
        primaryCtaLabel="Back to dashboard"
        primaryCtaHref="/app"
      />
    </AppShell>
  );
}
