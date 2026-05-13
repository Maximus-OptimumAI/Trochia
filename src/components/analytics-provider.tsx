'use client';

/**
 * Amplitude browser SDK init (FND-07 / D-13).
 *
 * Mounted ONCE inside `src/app/providers.tsx`'s extension slot (Plan 02) —
 * NOT in `layout.tsx`. Initializes the Amplitude browser SDK on first render
 * with the public client key (Amplitude's browser key is public-by-design;
 * server-side non-spoofable events use the separate node SDK + server key —
 * see `src/lib/analytics.ts`).
 *
 * Strict-Mode-safe: init runs once via a module-scoped guard.
 */
import { useEffect, type ReactNode } from 'react';

let initialized = false;

export function AnalyticsProvider({ children }: { children: ReactNode }) {
  useEffect(() => {
    if (initialized) return;
    const apiKey = process.env.NEXT_PUBLIC_AMPLITUDE_API_KEY;
    if (!apiKey) return;
    initialized = true;
    // Lazy-import to keep this off the SSR critical path.
    void import('@amplitude/analytics-browser').then((amplitude) => {
      amplitude.init(apiKey, {
        // No autocapture of page views or form interactions — events are
        // emitted explicitly via `track(...)` (D-12 funnel + lifecycle).
        autocapture: false,
        // Don't capture IP (XC-03 PII discipline).
        trackingOptions: { ipAddress: false },
      });
    });
  }, []);

  return <>{children}</>;
}
