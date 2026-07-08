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
 * Reset-password screen (AUTH-EMAIL-PASSWORD-01, FIX 1: cross-device).
 *
 * The recovery link returns the browser here as
 * `/reset-password?token_hash=...&type=recovery`. We verify that token_hash with
 * `verifyOtp({ token_hash, type: 'recovery' })` on the browser client. A
 * token_hash carries NO PKCE code_verifier, so verification works in ANY browser:
 * the founder can request the reset on a laptop and click the link on a phone
 * (cross-device). This replaces the prior `exchangeCodeForSession(code)` flow,
 * which required same-browser completion and double-consumed the one-time code
 * (the SDK's detectSessionInUrl auto-consumed it before the manual exchange).
 *
 * Transition handling: if the link still arrives as `?code=` (the Supabase email
 * template not yet switched to token_hash), we do NOT attempt the exchange; we
 * show the invalid-link state with a request-a-new-link action.
 *
 * On a verified recovery session the founder sets a new password via
 * `updateUser`; errors are generic. This page does NOT touch
 * `src/app/auth/callback/route.ts` (the hardened OAuth callback).
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
    const params = new URLSearchParams(window.location.search);
    const tokenHash = params.get('token_hash') ?? '';
    const type = params.get('type');

    // A valid recovery link carries token_hash + type=recovery. Anything else (a
    // missing token_hash, or an old-template `?code=` PKCE link we intentionally
    // do NOT consume) resolves straight to the invalid state with no network call.
    // Routing the outcome through a Promise keeps every setPhase inside an async
    // callback, so none runs synchronously in the effect body (react-hooks rule).
    //
    // detectSessionInUrl:false is REQUIRED: the default (true) would make the SDK
    // auto-consume an old-template `?code=` from this URL on client init, burning
    // the one-time code before we route it to the invalid state. verifyOtp does
    // not depend on this flag.
    const supabase = createBrowserSupabaseClient({ detectSessionInUrl: false });
    const verified: Promise<boolean> =
      tokenHash && type === 'recovery'
        ? supabase.auth
            .verifyOtp({ token_hash: tokenHash, type: 'recovery' })
            .then((res) => !res.error)
        : Promise.resolve(false);

    verified
      .then((ok) => {
        if (cancelled) return;
        if (ok) {
          setPhase('ready');
        } else {
          logger.warn('reset-password: recovery link invalid or expired');
          setPhase('invalid');
        }
      })
      .catch(() => {
        if (cancelled) return;
        logger.warn('reset-password: recovery verification threw');
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
      // Same non-consuming client as the verify effect; the recovery session is
      // already persisted in cookies by verifyOtp, so updateUser reads it.
      const supabase = createBrowserSupabaseClient({ detectSessionInUrl: false });
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
