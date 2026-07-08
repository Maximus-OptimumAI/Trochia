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
import { logger } from '@/lib/logger';
import { signInAction } from './actions';

/**
 * Sign-in screen (FND-04, AUTH-EMAIL-PASSWORD-01). Email + password is the
 * working path beside Google SSO.
 *
 * Email + password runs through the `signInAction` server action, which mirrors
 * the OAuth callback: after signInWithPassword succeeds it reads the account and
 * routes via the shared `authDestination()` helper. An onboarding-incomplete
 * founder RESUMES onboarding instead of being bounced to /reactivate by the proxy
 * /app gate, so the client no longer hardcodes /app.
 *
 * Security: the error message is generic ("Invalid email or password.") so it
 * never reveals whether the email is registered, and neither the email nor the
 * password is ever logged.
 */
export default function SignInPage() {
  const [pending, startTransition] = useTransition();
  const [googleLoading, setGoogleLoading] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      // On success the action redirects (this call does not return here); reaching
      // this point means it returned the generic, non-enumerating error.
      const result = await signInAction({ email, password });
      if (result?.error) setError(result.error);
    });
  }

  async function onContinueWithGoogle() {
    setGoogleLoading(true);
    try {
      const supabase = createBrowserSupabaseClient();
      // On a Vercel preview the round-trip must return to THIS host (the browser's
      // own origin) so the PKCE cookie is visible to the callback; on prod this
      // resolves to APP_URL. The origin comes only from the browser's own
      // window.location.origin (never user input), and the path is fixed.
      const { error: oauthError } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: buildAuthCallbackUrl(window.location.origin, APP_URL) },
      });
      if (oauthError) {
        logger.warn('sign-in: signInWithOAuth failed', { err: oauthError });
        setGoogleLoading(false);
      }
    } catch (err) {
      logger.warn('sign-in: signInWithOAuth threw', { err });
      setGoogleLoading(false);
    }
  }

  return (
    <div className="auth-enter flex flex-col items-center gap-8">
      <Logo variant="mark" height={48} href={null} className="md:hidden" />

      <header className="flex flex-col items-center gap-2 text-center">
        <h1 className="text-h3 text-ink">Welcome back</h1>
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
            autoComplete="current-password"
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
          {pending ? 'Signing in…' : 'Sign in'}
        </Button>
      </form>

      <p className="w-full text-center text-body-sm">
        <Link href="/forgot-password" className="text-ink underline-offset-4 hover:underline">
          Forgot password?
        </Link>
      </p>

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
        New to Trochia?{' '}
        <Link href="/sign-up" className="text-ink underline-offset-4 hover:text-ink hover:underline">
          Start raising →
        </Link>
      </p>
    </div>
  );
}
