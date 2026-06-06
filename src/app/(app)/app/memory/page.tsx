import { redirect } from 'next/navigation';

import { AppShell } from '@/components/shell/app-shell';
import { createServerSupabaseClient } from '@/lib/supabase/server';

import { MemoryWorkspace } from './memory-workspace';

/**
 * `/app/memory` — Business Memory (MEMORY-NAV-WIRING-01, prod smoke-test fix).
 *
 * Previously a Plan-01-09 "coming in Phase 2" stub even though Phase 2 shipped:
 * the real paste/confirm/save flow lived only at `/onboarding/import/paste`, and
 * the dashboard CTA + sidebar both linked here, to the stub. This route now
 * serves the REAL Business Memory experience via `<MemoryWorkspace/>` — which
 * loads the tenant's row and renders paste / confirm / confirmed-read-only as
 * appropriate — so those existing links resolve correctly with no link change.
 */
export default async function MemoryPage() {
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
      <MemoryWorkspace />
    </AppShell>
  );
}
