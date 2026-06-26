'use client';

import Link from 'next/link';
import { useEffect, useState, type FormEvent } from 'react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Logo } from '@/components/brand/logo';
import { createBrowserSupabaseClient } from '@/lib/supabase/client';
import { logger } from '@/lib/logger';

/**
 * Reset-password screen (AUTH-EMAIL-PASSWORD-01).
 *
 * The recovery link returns the browser here as `/reset-password?code=...`. We
 * exchange that code for a recovery session ON THIS BROWSER (the PKCE verifier
 * was set when the reset was requested) using the browser client. This page does
 * NOT touch `src/app/auth/callback/route.ts` (the hardened OAuth callback).
 *
 * On a valid session the user sets a new password via `updateUser`; errors are
 * generic.
 */
type Phase = 'verifying' | 'ready' | 'invalid';

export default function ResetPasswordPage() {
  const [phase, setPhase] = useState<Phase>('verifying');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    // A missing code becomes an empty exchange that errors out, so every state
    // transition lands inside the async callbacks below (never synchronously in
    // the effect body).
    const code = new URLSearchParams(window.location.search).get('code') ?? '';
    const supabase = createBrowserSupabaseClient();
    supabase.auth
      .exchangeCodeForSession(code)
      .then(({ error: exchangeError }) => {
        if (cancelled) return;
        if (exchangeError) {
          logger.warn('reset-password: code exchange failed');
          setPhase('invalid');
        } else {
          setPhase('ready');
        }
      })
      .catch(() => {
        if (cancelled) return;
        logger.warn('reset-password: code exchange threw');
        setPhase('invalid');
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (password !== confirm) {
      setError('Passwords do not match.');
      return;
    }
    setLoading(true);
    try {
      const supabase = createBrowserSupabaseClient();
      const { error: updateError } = await supabase.auth.updateUser({ password });
      if (updateError) {
        logger.warn('reset-password: updateUser failed');
        setError('Could not update your password. Request a new reset link.');
        setLoading(false);
        return;
      }
      // Hard navigation so the proxy middleware sees the refreshed session cookie.
      window.location.assign('/app');
    } catch {
      logger.warn('reset-password: updateUser threw');
      setError('Could not update your password. Request a new reset link.');
      setLoading(false);
    }
  }

  return (
    <div className="auth-enter flex flex-col items-center gap-8">
      <Logo variant="mark" height={48} href={null} className="md:hidden" />

      <header className="flex flex-col items-center gap-2 text-center">
        <h1 className="text-h3 text-ink">Set a new password</h1>
      </header>

      {phase === 'verifying' && (
        <p role="status" className="text-body-sm text-graphite">
          Verifying your reset link…
        </p>
      )}

      {phase === 'invalid' && (
        <div className="flex flex-col items-center gap-4 text-center">
          <p className="text-body-sm text-graphite">
            This reset link is invalid or expired. Request a new one.
          </p>
          <Link
            href="/forgot-password"
            className="text-body-sm text-ink underline-offset-4 hover:underline"
          >
            Request a new link
          </Link>
        </div>
      )}

      {phase === 'ready' && (
        <form className="flex w-full flex-col gap-3" onSubmit={onSubmit}>
          <div className="flex flex-col gap-2">
            <Label htmlFor="password">New password</Label>
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
          <div className="flex flex-col gap-2">
            <Label htmlFor="confirm">Confirm password</Label>
            <Input
              id="confirm"
              name="confirm"
              type="password"
              autoComplete="new-password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              required
            />
          </div>
          {error && (
            <p role="alert" className="text-body-sm text-danger">
              {error}
            </p>
          )}
          <Button type="submit" variant="primary" className="w-full" disabled={loading}>
            {loading ? 'Updating…' : 'Update password'}
          </Button>
        </form>
      )}
    </div>
  );
}
