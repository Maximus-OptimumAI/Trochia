'use client';

import Link from 'next/link';
import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Logo } from '@/components/brand/logo';
import { createBrowserSupabaseClient } from '@/lib/supabase/client';
import { APP_URL } from '@/lib/env';
import { track } from '@/lib/analytics';
import { logger } from '@/lib/logger';

/**
 * Sign-up screen (FND-04 / FND-12 funnel step 1, Plan 01-07).
 *
 * Per `01-UI-SPEC.md` §"Auth + onboarding shell":
 *   - Mark 48px centered
 *   - H3 "Start your raise"
 *   - sub "Trochia operates alongside you through every stage."
 *   - Email Input full width, primary "Continue with email" (disabled; magic-
 *     link is V2 per D-10 — Google is the working Phase 1 path)
 *   - Divider "or"
 *   - secondary full-width "Continue with Google"  → fires `signup_started`,
 *     then `supabase.auth.signInWithOAuth({ provider: 'google',
 *     options: { redirectTo: `${APP_URL}/auth/callback` } })`
 *   - footer link "Already have an account? Sign in →"
 *   - legal line + DPA clickwrap line
 *
 * Note on DPA acceptance: per the SUMMARY note for this plan, DPA acceptance
 * is recorded on the welcome screen (after the OAuth round-trip — that's
 * when the founder has an `accounts` row to attach the acceptance to).
 */
export default function SignUpPage() {
  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState('');

  async function onContinueWithGoogle() {
    setLoading(true);
    try {
      void track('signup_started').catch(() => undefined);
      const supabase = createBrowserSupabaseClient();
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: `${APP_URL}/auth/callback` },
      });
      if (error) {
        logger.warn('sign-up: signInWithOAuth failed', { err: error });
        setLoading(false);
      }
      // success: Supabase redirects the browser; no further client work.
    } catch (err) {
      logger.warn('sign-up: signInWithOAuth threw', { err });
      setLoading(false);
    }
  }

  return (
    <div className="auth-enter flex flex-col items-center gap-8">
      <Logo variant="mark" height={48} href={null} className="md:hidden" />

      <header className="flex flex-col items-center gap-2 text-center">
        <h1 className="text-h3 text-ink">Start your raise</h1>
        <p className="text-body-sm text-graphite">
          Trochia operates alongside you through every stage.
        </p>
      </header>

      <form
        className="flex w-full flex-col gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          // Email magic-link sign-in is V2 (D-10) — the input + button are here
          // for visual parity with the UI-SPEC, but the action is disabled. The
          // working Phase 1 path is Google SSO.
        }}
      >
        <div className="flex flex-col gap-2">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            placeholder="you@yourstartup.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled
          />
        </div>
        <Button type="submit" variant="primary" className="w-full" disabled>
          Continue with email
        </Button>
      </form>

      <div className="flex w-full items-center gap-3">
        <span className="h-px flex-1 bg-stone" />
        <span className="text-mono-sm uppercase tracking-wider text-graphite">or</span>
        <span className="h-px flex-1 bg-stone" />
      </div>

      <Button
        variant="signal"
        className="w-full"
        onClick={onContinueWithGoogle}
        disabled={loading}
      >
        {loading ? 'Connecting…' : 'Continue with Google'}
      </Button>

      <p className="text-center text-body-sm text-graphite">
        Already have an account?{' '}
        <Link href="/sign-in" className="text-ink underline-offset-4 hover:text-ink hover:underline">
          Sign in →
        </Link>
      </p>

      <div className="flex flex-col gap-2 text-center text-body-sm text-graphite">
        <p>
          By continuing you agree to our{' '}
          <Link href="/legal/terms" className="underline-offset-4 hover:text-ink hover:underline">
            Terms
          </Link>{' '}
          and{' '}
          <Link href="/legal/privacy" className="underline-offset-4 hover:text-ink hover:underline">
            Privacy
          </Link>
          .
        </p>
        <p>
          By signing up you agree to our{' '}
          <Link href="/legal/dpa" className="underline-offset-4 hover:text-ink hover:underline">
            Data Processing Addendum
          </Link>
          .
        </p>
      </div>
    </div>
  );
}
