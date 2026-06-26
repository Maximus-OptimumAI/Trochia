'use client';

import Link from 'next/link';
import { useState, type FormEvent } from 'react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Logo } from '@/components/brand/logo';
import { createBrowserSupabaseClient } from '@/lib/supabase/client';
import { APP_URL } from '@/lib/env';
import { resolveRedirectOrigin } from '@/lib/auth-redirect';
import { logger } from '@/lib/logger';

/**
 * Forgot-password screen (AUTH-EMAIL-PASSWORD-01).
 *
 * `resetPasswordForEmail` is sent with a host-aware `redirectTo`: on a Vercel
 * `*.vercel.app` preview it returns to THAT preview's origin, on prod it resolves
 * to APP_URL, using the same `resolveRedirectOrigin` helper as the OAuth flow.
 * The origin comes only from `window.location.origin` (never user input) and the
 * path is the fixed literal `/reset-password`, so it cannot become an open
 * redirect.
 *
 * Anti-enumeration: the confirmation is identical whether or not the email
 * exists, and even transport errors fall through to the same neutral message.
 */
export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const supabase = createBrowserSupabaseClient();
      const redirectTo = `${resolveRedirectOrigin(window.location.origin, APP_URL)}/reset-password`;
      await supabase.auth.resetPasswordForEmail(email, { redirectTo });
    } catch {
      // Swallowed on purpose: we never reveal whether the email exists, even on a
      // transport failure. No email logged.
      logger.warn('forgot-password: reset request failed');
    }
    // ALWAYS the same neutral confirmation, regardless of outcome (no enumeration).
    setSent(true);
    setLoading(false);
  }

  return (
    <div className="auth-enter flex flex-col items-center gap-8">
      <Logo variant="mark" height={48} href={null} className="md:hidden" />

      <header className="flex flex-col items-center gap-2 text-center">
        <h1 className="text-h3 text-ink">Reset your password</h1>
        <p className="text-body-sm text-graphite">
          Enter your email and we will send a reset link.
        </p>
      </header>

      {sent ? (
        <p role="status" className="w-full text-center text-body-sm text-graphite">
          If an account exists for that email, we sent a reset link.
        </p>
      ) : (
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
          <Button type="submit" variant="primary" className="w-full" disabled={loading}>
            {loading ? 'Sending…' : 'Send reset link'}
          </Button>
        </form>
      )}

      <p className="text-center text-body-sm text-graphite">
        <Link href="/sign-in" className="text-ink underline-offset-4 hover:underline">
          Back to sign in
        </Link>
      </p>
    </div>
  );
}
