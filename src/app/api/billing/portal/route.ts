/**
 * POST /api/billing/portal — server-side Customer Portal session creator.
 *
 * `/reactivate` posts a plain form to this route; we resolve the session's own
 * customer id and 303-redirect to the portal URL.
 */
import { NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';

import { createServerSupabaseClient } from '@/lib/supabase/server';
import { getServiceClient } from '@/db/client';
import { accounts } from '@/db/schema';
import { createPortalSession } from '@/modules/billing/portal';
import { logger } from '@/lib/logger';
import { APP_URL } from '@/lib/env';

export async function POST() {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.redirect(new URL('/sign-in', APP_URL), 303);

  const service = getServiceClient();
  const account = await service.query.accounts.findFirst({
    where: eq(accounts.ownerUserId, user.id),
  });
  if (!account?.stripeCustomerId) {
    // No customer object yet — pick a plan via Checkout first.
    return NextResponse.redirect(new URL('/onboarding', APP_URL), 303);
  }

  try {
    const { url } = await createPortalSession({ customerId: account.stripeCustomerId });
    return NextResponse.redirect(url, 303);
  } catch (err) {
    logger.warn('api/billing/portal: failed', { err });
    return NextResponse.redirect(new URL('/reactivate?error=portal_failed', APP_URL), 303);
  }
}
