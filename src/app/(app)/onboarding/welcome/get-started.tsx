'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

import { Button } from '@/components/ui/button';
import { track } from '@/lib/analytics';
import { logger } from '@/lib/logger';

/**
 * Welcome screen CTA — records DPA/ToS/Privacy acceptance on click, then routes
 * to the `/onboarding` index (which renders the tier picker now that the
 * clickwrap chain is complete). Fires `welcome_viewed` on mount.
 */
export function GetStartedButton() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    void track('welcome_viewed').catch(() => undefined);
  }, []);

  async function onGetStarted() {
    setLoading(true);
    try {
      const res = await fetch('/api/onboarding/accept-legal', { method: 'POST' });
      if (!res.ok) {
        const text = await res.text();
        logger.warn('welcome: accept-legal failed', { status: res.status, text });
        setLoading(false);
        return;
      }
      router.push('/onboarding');
      router.refresh();
    } catch (err) {
      logger.warn('welcome: accept-legal threw', { err });
      setLoading(false);
    }
  }

  return (
    <Button onClick={onGetStarted} disabled={loading} className="w-full">
      {loading ? 'Setting up…' : 'Get started'}
    </Button>
  );
}
