import { redirect } from 'next/navigation';

import { AppShell } from '@/components/shell/app-shell';
import { EmptyState } from '@/components/primitives/empty-state';
import { createServerSupabaseClient } from '@/lib/supabase/server';

/**
 * `/app/pipeline` — Investor Pipeline placeholder (Plan 01-09).
 *
 * Phase 1 ships a "Coming in Phase 4" empty-state. Real Pipeline (VC fit
 * matching, application tracking, outreach drafts, warm-intro mapping) lands
 * in Phase 4. The dashboard CTAs "Generate VC fit list" and "Draft outreach"
 * both link here.
 */
export default async function PipelinePlaceholderPage() {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/sign-in');

  return (
    <AppShell
      title="Investor Pipeline"
      activeHref="/app/pipeline"
      userName={user.user_metadata?.full_name as string | undefined}
      userEmail={user.email ?? undefined}
    >
      <EmptyState
        heading="Investor Pipeline — coming in Phase 4"
        body="Trochia will match VCs and accelerators from your Business Memory, track applications, draft outreach, and map warm intros — all founder-approved before anything leaves."
        primaryCtaLabel="Back to dashboard"
        primaryCtaHref="/app"
      />
    </AppShell>
  );
}
