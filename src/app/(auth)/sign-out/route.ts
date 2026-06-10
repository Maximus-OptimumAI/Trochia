/**
 * Sign-out (fix/ui-bundle / C4).
 *
 * The sidebar previously linked `Sign out -> /sign-out` with no route behind it,
 * 404ing the founder. This handler clears the Supabase session and returns them
 * to the marketing hero ("/").
 *
 * POST, not GET: sign-out is state-changing, so a GET — triggerable by a link
 * prefetch or a cross-site <img>/<a> — is a CSRF nit. The sidebar submits a form
 * (see src/components/shell/sidebar.tsx). The proxy classifies `/sign-out` as a
 * public route (not /app|/onboarding|/styleguide), so it passes through without
 * a redirect and this handler runs.
 *
 * 303 See Other (not the NextResponse default 307): a 307 preserves the method,
 * which would re-POST against "/". 303 makes the browser follow with GET.
 */
import { NextResponse } from 'next/server';

import { createServerSupabaseClient } from '@/lib/supabase/server';
import { APP_URL } from '@/lib/env';

export async function POST() {
  const supabase = await createServerSupabaseClient();
  await supabase.auth.signOut();
  return NextResponse.redirect(new URL('/', APP_URL), { status: 303 });
}
