'use client';

import Link from 'next/link';
import { useState, useTransition, type FormEvent } from 'react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Logo } from '@/components/brand/logo';
import { createBrowserSupabaseClient } from '@/lib/supabase/client';
import { APP_URL } from '@/lib/env';
import { buildAuthCallbackUrl } from '@/lib/auth-redirect';
import { track } from '@/lib/analytics';
import { logger } from '@/lib/logger';
import { signUpAction } from './actions';

/**
 * Sign-up screen (FND-04, AUTH-EMAIL-PASSWORD-01). Email + password runs through
 * the `signUpAction` server action (the tenant bootstrap needs the server-only
 * service client); Google SSO stays as the OAuth path.
 *
 * Confirm-email is OFF, so a successful sign-up has a live session and the action
 * redirects to `/onboarding`. The error message is generic and non-enumerating
 * (never reveals whether the email is already registered).
 */
export default function SignUpPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [googleLoading, setGoogleLoading] = useState(false);

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    void track('signup_started').catch(() => undefined);
    startTransition(async () => {
      // On success the action redirects (the awaited call does not return here);
      // reaching this point means it returned a generic, non-enumerating error.
      const result = await signUpAction({ email, password });
      if (result?.error) setError(result.error);
    });
  }

  async function onContinueWithGoogle() {
    setGoogleLoading(true);
    try {
      void track('signup_started').catch(() => undefined);
      const supabase = createBrowserSupabaseClient();
      const { error: oauthError } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: buildAuthCallbackUrl(window.location.origin, APP_URL) },
      });
      if (oauthError) {
        logger.warn('sign-up: signInWithOAuth failed', { err: oauthError });
        setGoogleLoading(false);
      }
    } catch (err) {
      logger.warn('sign-up: signInWithOAuth threw', { err });
      setGoogleLoading(false);
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

      <form className="flex w-full flex-col gap-3" onSubmit={onSubmit}>
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
            required
          />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="password">Password</Label>
          <Input
            id="password"
            name="password"
            type="password"
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </div>
        {error && (
          <p role="alert" className="text-body-sm text-danger">
            {error}
          </p>
        )}
        <Button type="submit" variant="primary" className="w-full" disabled={pending}>
          {pending ? 'Creating account…' : 'Create account'}
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
        disabled={googleLoading}
      >
        {googleLoading ? 'Connecting…' : 'Continue with Google'}
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
