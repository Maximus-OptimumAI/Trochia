/**
 * POST /api/billing/checkout — server-side Checkout session creator.
 *
 * The onboarding tier-picker (Client Component) POSTs `{ tier, period }` here;
 * we resolve the session's own account (NEVER trust an `accountId` from the
 * body — T-1-41), call `createCheckoutSession`, and return the redirect URL.
 *
 * tRPC's `billing.createCheckout` does the same thing — this route exists so
 * the tier picker can stay a simple `fetch` (no TRPCReact dependency in that
 * client tree).
 */
import { NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { z } from 'zod';

import { createServerSupabaseClient } from '@/lib/supabase/server';
import { getServiceClient } from '@/db/client';
import { accounts } from '@/db/schema';
import { createCheckoutSession } from '@/modules/billing/checkout';
import { logger } from '@/lib/logger';

const Body = z.object({
  tier: z.enum(['pre_raise', 'active_raise']),
  period: z.enum(['monthly', 'annual']),
});

export async function POST(request: Request) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  let parsed: z.infer<typeof Body>;
  try {
    parsed = Body.parse(await request.json());
  } catch {
    return NextResponse.json({ error: 'bad_request' }, { status: 400 });
  }

  const service = getServiceClient();
  const account = await service.query.accounts.findFirst({
    where: eq(accounts.ownerUserId, user.id),
  });
  if (!account) return NextResponse.json({ error: 'account_not_found' }, { status: 404 });

  try {
    const { url } = await createCheckoutSession({
      accountId: account.id,
      tier: parsed.tier,
      period: parsed.period,
      customerEmail: user.email ?? undefined,
      customerId: account.stripeCustomerId ?? undefined,
    });
    return NextResponse.json({ url });
  } catch (err) {
    logger.warn('api/billing/checkout: failed', { err });
    return NextResponse.json({ error: 'checkout_failed' }, { status: 500 });
  }
}
