'use client';

import { useEffect } from 'react';

import { track } from '@/lib/analytics';

/**
 * Fires `dashboard_viewed` exactly once when the `/app` page mounts on the
 * client. Server-rendered pages can't fire browser-SDK events directly; a
 * tiny client component bridges to the analytics taxonomy (Plan 05).
 */
export function DashboardViewedTracker() {
  useEffect(() => {
    void track('dashboard_viewed').catch(() => undefined);
  }, []);
  return null;
}
