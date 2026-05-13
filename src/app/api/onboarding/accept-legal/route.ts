/**
 * POST /api/onboarding/accept-legal — records DPA + ToS + Privacy acceptance
 * for the current session's account (Plan 01-07; consumes Plan 06's clickwrap
 * plumbing). Idempotent at the current versions — re-calling is a no-op.
 *
 * Called from `/onboarding/welcome` ("Get started"). The clickwrap line on
 * `/sign-up` already flagged the contract — the durable record is written here.
 */
import { NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';

import { createServerSupabaseClient } from '@/lib/supabase/server';
import { getServiceClient } from '@/db/client';
import { accounts } from '@/db/schema';
import {
  DPA_VERSION,
  PRIVACY_VERSION,
  TOS_VERSION,
} from '@/lib/compliance/dpa';
import { legalAcceptances } from '@/db/schema/legal';
import { logger } from '@/lib/logger';

export async function POST() {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const service = getServiceClient();
  const account = await service.query.accounts.findFirst({
    where: eq(accounts.ownerUserId, user.id),
  });
  if (!account) return NextResponse.json({ error: 'account_not_found' }, { status: 404 });

  try {
    // Write the three legal_acceptances rows (idempotent at each version) +
    // update accounts.dpa_accepted_at/dpa_version. We use the service client
    // since this is part of the post-sign-in account-setup path.
    const documents: Array<{ document: 'dpa' | 'tos' | 'privacy'; version: string }> = [
      { document: 'dpa', version: DPA_VERSION },
      { document: 'tos', version: TOS_VERSION },
      { document: 'privacy', version: PRIVACY_VERSION },
    ];
    for (const { document, version } of documents) {
      await service
        .insert(legalAcceptances)
        .values({
          accountId: account.id,
          document,
          version,
          acceptedByUserId: user.id,
        })
        .onConflictDoNothing();
    }
    if (account.dpaVersion !== DPA_VERSION) {
      await service
        .update(accounts)
        .set({ dpaAcceptedAt: new Date(), dpaVersion: DPA_VERSION })
        .where(eq(accounts.id, account.id));
    }
    return NextResponse.json({ accepted: true });
  } catch (err) {
    logger.warn('accept-legal: failed', { err });
    return NextResponse.json({ error: 'record_failed' }, { status: 500 });
  }
}
