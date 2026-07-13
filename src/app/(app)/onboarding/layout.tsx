import type { ReactNode } from 'react';

import { Button } from '@/components/ui/button';

/**
 * Onboarding layout (ONBOARDING-FIX-01).
 *
 * Onboarding previously inherited only the `(app)` layout, which has no way
 * out: a user who lands on `/onboarding/*` had no sign-out affordance (the
 * sidebar, which owns the only other sign-out, is not rendered on these
 * pre-app screens). This layout adds a minimal top-right "Sign out" and is
 * otherwise a pass-through, so every onboarding page keeps its own layout.
 *
 * The form reuses the EXACT mechanism the sidebar uses: a POST to `/sign-out`
 * (src/app/(auth)/sign-out/route.ts), which clears the Supabase session and
 * 303-redirects to "/". No new endpoint, no auth-logic change.
 *
 * Styling is deliberately understated: the `ghost` variant on brand tokens,
 * no Signal accent, so it never competes with the "Get started" CTA. It is
 * `fixed` top-right and clear of page content. The Ask pill is absent here
 * (gated off `/onboarding/*` in AskLauncher), so nothing else occupies the
 * corner.
 */
export default function OnboardingLayout({ children }: { children: ReactNode }) {
  return (
    <>
      {children}
      <form action="/sign-out" method="post" className="fixed right-4 top-4 z-40">
        <Button type="submit" variant="ghost" size="compact">
          Sign out
        </Button>
      </form>
    </>
  );
}
