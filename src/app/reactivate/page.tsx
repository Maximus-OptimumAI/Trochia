import Link from 'next/link';
import { redirect } from 'next/navigation';

import { Logo } from '@/components/brand/logo';
import { Button } from '@/components/ui/button';
import { createServerSupabaseClient } from '@/lib/supabase/server';

/**
 * `/reactivate` (Plan 01-07, D-02b) — the destination for a logged-in founder
 * whose subscription is not active or trialing. The proxy.ts gate routes them
 * here from any `/app/*` request. The screen offers two paths:
 *   - Re-enter the tier picker (cheapest restart)
 *   - Open the Customer Portal (existing customer with a churn / decline)
 *
 * Public surface (no proxy gate) so signed-out users hitting an old link land
 * here cleanly — but if no session, we route them to /sign-in.
 */
export default async function ReactivatePage() {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/sign-in');

  return (
    <main className="mx-auto flex max-w-md flex-col items-center gap-8 px-6 py-16 md:py-24">
      <Logo variant="mark" height={48} href={null} />
      <header className="flex flex-col items-center gap-2 text-center">
        <h1 className="text-h3 text-ink">Your subscription isn&apos;t active.</h1>
        <p className="text-body-sm text-graphite">
          Pick a plan to keep operating, or open the billing portal to update your card.
        </p>
      </header>
      <div className="flex w-full flex-col gap-3">
        <Button variant="primary" className="w-full" render={<Link href="/onboarding" />}>
          Pick a plan
        </Button>
        <form action="/api/billing/portal" method="post">
          <Button variant="secondary" className="w-full" type="submit">
            Open billing portal
          </Button>
        </form>
      </div>
    </main>
  );
}
