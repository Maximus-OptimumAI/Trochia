import { redirect } from 'next/navigation';

import { AppShell } from '@/components/shell/app-shell';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { SettingsView } from './settings-view';

/**
 * `/app/settings` (Plan 01-09 / XC-04, UI-SPEC §"/app/settings").
 *
 * Server shell — reads the Supabase session, hands the founder's email/name to
 * the client view that wires the Plan-06 data-rights mutations.
 */
export default async function SettingsPage() {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/sign-in');

  return (
    <AppShell
      title="Settings"
      activeHref="/app/settings"
      userName={user.user_metadata?.full_name as string | undefined}
      userEmail={user.email ?? undefined}
    >
      <SettingsView
        email={user.email ?? ''}
        fullName={(user.user_metadata?.full_name as string | undefined) ?? ''}
      />
    </AppShell>
  );
}
