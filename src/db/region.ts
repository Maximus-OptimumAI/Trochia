/**
 * Multi-region data-residency seam (FND-10 / D-05).
 *
 * `getDbForRegion(region)` returns a factory `(accessToken) => RequestDb` for the
 * Supabase project that hosts that region's data. TODAY every branch resolves to the
 * single US project (built from `DATABASE_URL`) — the second/third project is NOT
 * built. The enum (`'us' | 'in'`, `'eu'` reserved), the `accounts.region` column, and
 * this switch all exist now so the seam is real: when the first IN (or, in Phase 8,
 * EU) founder signs up we provision that region's Supabase project and change ONLY
 * that branch (plus add its connection string to env). No call-site changes.
 */
import 'server-only';

import { getRequestClient, type RequestDb, type DrizzleDb } from '@/db/client';

/** Region values that exist today. `'eu'` is intentionally absent until Phase 8. */
export type Region = 'us' | 'in';

type RequestDbFactory = (accessToken: string) => RequestDb & { db: DrizzleDb };

/**
 * Return the request-client factory for `region`.
 *
 * NOTE: `'us'` and `'in'` both fall through to the US client on purpose — the seam,
 * not yet split. When region N gets its own Supabase project, give that case its own
 * `getRequestClient`-equivalent bound to that project's `DATABASE_URL_<N>` and stop
 * falling through.
 */
export function getDbForRegion(region: Region): RequestDbFactory {
  switch (region) {
    case 'us':
    case 'in':
      // Both regions → the US Supabase project today (D-05). Change ONLY this branch
      // when the first IN founder signs up.
      return getRequestClient;
    default: {
      // Exhaustiveness guard — a new region enum value must add a branch here.
      const _exhaustive: never = region;
      return _exhaustive;
    }
  }
}

/** The region used when none is known yet (e.g. before an account exists). */
export const DEFAULT_REGION: Region = 'us';
