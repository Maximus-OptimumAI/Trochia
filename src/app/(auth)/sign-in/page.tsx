'use client';

import Link from 'next/link';
import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Logo } from '@/components/brand/logo';
import { createBrowserSupabaseClient } from '@/lib/supabase/client';
import { APP_URL } from '@/lib/env';
import { logger } from '@/lib/logger';

/**
 * Sign-in screen (FND-04, Plan 01-07). Same card as `/sign-up` but with
 * H3 "Welcome back" + footer link to `/sign-up`. Magic-link is V2 (D-10);
 * Google SSO is the working path.
 */
export default function SignInPage() {
  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState('');

  async function onContinueWithGoogle() {
    setLoading(true);
    try {
      const supabase = createBrowserSupabaseClient();
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: `${APP_URL}/auth/callback` },
      });
      if (error) {
        logger.warn('sign-in: signInWithOAuth failed', { err: error });
        setLoading(false);
      }
    } catch (err) {
      logger.warn('sign-in: signInWithOAuth threw', { err });
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col items-center gap-8">
      <Logo variant="mark" height={48} href={null} />

      <header className="flex flex-col items-center gap-2 text-center">
        <h1 className="text-h3 text-ink">Welcome back</h1>
        <p className="text-body-sm text-graphite">
          Trochia operates alongside you through every stage.
        </p>
      </header>

      <form
        className="flex w-full flex-col gap-3"
        onSubmit={(e) => e.preventDefault()}
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
        variant="secondary"
        className="w-full"
        onClick={onContinueWithGoogle}
        disabled={loading}
      >
        {loading ? 'Connecting…' : 'Continue with Google'}
      </Button>

      <p className="text-center text-body-sm text-graphite">
        New to Trochia?{' '}
        <Link href="/sign-up" className="text-ink underline-offset-4 hover:text-signal hover:underline">
          Start raising →
        </Link>
      </p>
    </div>
  );
}
