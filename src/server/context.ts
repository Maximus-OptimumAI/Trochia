/**
 * tRPC request context (FND-03).
 *
 * Resolves the Supabase session → the user → their `accounts` row (the tenant) →
 * the region → a request-scoped Drizzle client that runs as the `authenticated`
 * Postgres role with the session JWT's claims set (so RLS — keyed on
 * `auth.jwt() ->> 'tenant_id'` — applies). `resolveAccount` is the ONE place tRPC
 * uses the RLS-bypassing service client, and only for the narrow `auth.users.id →
 * accounts` lookup needed before the request client can exist.
 *
 * One business per account in Phase 1 (D-03): the lookup is `owner_user_id = uid`.
 */
import 'server-only';

import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';
import { and, eq, isNull } from 'drizzle-orm';

import { getServiceClient } from '@/db/client';
import { getDbForRegion, type Region, DEFAULT_REGION } from '@/db/region';
import { accounts } from '@/db/schema';
import { env } from '@/lib/env';

type AccountRow = typeof accounts.$inferSelect;

/** The shape every procedure sees. `protectedProcedure` narrows the nullable members. */
export interface TRPCContext {
  /** The Supabase session, or `null` when unauthenticated. */
  session: Awaited<ReturnType<ReturnType<typeof createServerClient>['auth']['getSession']>>['data']['session'];
  /** The owning account's id (= the tenant id), or `null`. */
  tenantId: string | null;
  /** The tenant's data-residency region, or `null`. */
  region: Region | null;
  /** Request-scoped, RLS-enforcing DB client (`db.rls(fn)`), or `null`. */
  db: ReturnType<ReturnType<typeof getDbForRegion>> | null;
  /** The full `accounts` row, or `null`. */
  account: AccountRow | null;
  /** The Supabase server client (cookie-bound) — for auth ops, never for tenant data. */
  supabase: ReturnType<typeof createServerClient>;
}

function makeSupabase() {
  // In dev/test the publishable key may be absent (env vars are optional outside
  // prod) — fall back to empty strings so module load doesn't crash; auth calls
  // will simply return no session.
  const url = env.NEXT_PUBLIC_SUPABASE_URL ?? env.SUPABASE_URL ?? '';
  const key = env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? env.SUPABASE_PUBLISHABLE_KEY ?? '';
  return createServerClient(url, key, {
    cookies: {
      async getAll() {
        const store = await cookies();
        return store.getAll();
      },
      async setAll(toSet) {
        try {
          const store = await cookies();
          for (const { name, value, options } of toSet) store.set(name, value, options);
        } catch {
          // Called from a Server Component render — safe to ignore (middleware refreshes).
        }
      },
    },
  });
}

/**
 * Look up the LIVE tenant for a user. RLS-bypassing service client — a narrow,
 * audited call site.
 *
 * Filters on `deleted_at IS NULL` to mirror the partial-unique index
 * `accounts_owner_user_id_uniq` (migration 0003) — the schema guarantees at
 * most one live row per `owner_user_id`, and the same predicate here keeps a
 * soft-deleted row from shadowing the live one (a user can soft-delete then
 * re-onboard within the 30-day window; both rows coexist, but only the live
 * one is the "current tenant").
 */
async function resolveAccount(userId: string): Promise<AccountRow | null> {
  const service = getServiceClient();
  const row = await service.query.accounts.findFirst({
    where: and(eq(accounts.ownerUserId, userId), isNull(accounts.deletedAt)),
  });
  return row ?? null;
}

/**
 * Build the per-request context. tRPC's fetch adapter calls this with `{ req }`.
 *
 * **Auth path (post PR-2 — /codex 01-07 [P1]):** revalidate the session with
 * `auth.getUser()` before reading the tenant. `getUser()` round-trips to
 * Supabase Auth (a JWKS-verified server call) — so a revoked / banned / signed-
 * out account is rejected immediately, not after the ≤1h JWT TTL rolls over.
 * `proxy.ts` already does the same on `/app/*` route nav, but the proxy's
 * `classify()` returns `'public'` for `/api/trpc/*` (so prerendered marketing
 * pages don't pay the auth round-trip on every static asset). That means tRPC
 * mutations from an already-loaded `/app` page would otherwise ride the cached
 * cookie indefinitely. The revalidation here closes that window for every
 * protectedProcedure call. Cost: ~30ms per tRPC request — acceptable.
 *
 * `getSession()` is still called afterwards solely to obtain the JWT access
 * token (the canonical reference for the RLS-claims-driven request client). It
 * is safe to trust at this point because `getUser()` already revalidated the
 * cookie chain; if the session had been revoked, we'd have returned above.
 */
// `req` is part of the adapter contract; cookies/session come from `next/headers`,
// so the request object itself isn't read here.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export async function createTRPCContext(opts: { req: Request }): Promise<TRPCContext> {
  const supabase = makeSupabase();

  // Network-revalidated auth check — fail-closed on revocation / ban / signout.
  // Wrapped in try/catch: a network failure must not 500 the request; the
  // ergonomic protectedProcedure layer will throw UNAUTHORIZED via the null
  // context branch, mirroring proxy.ts's fail-closed posture.
  let userId: string | null = null;
  try {
    const { data, error } = await supabase.auth.getUser();
    if (!error && data.user) userId = data.user.id;
  } catch {
    userId = null;
  }

  if (!userId) {
    return { session: null, tenantId: null, region: null, db: null, account: null, supabase };
  }

  // The user IS valid — fetch the session for the access token used to drive
  // the request-scoped RLS client. `getSession()` here is safe because we just
  // revalidated the cookie chain above.
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) {
    return { session: null, tenantId: null, region: null, db: null, account: null, supabase };
  }

  const account = await resolveAccount(userId);
  if (!account || account.deletedAt) {
    // Authenticated but no (live) tenant yet — onboarding hasn't created one. Treat as
    // unauthenticated for the purposes of tenant-scoped procedures.
    return { session, tenantId: null, region: null, db: null, account: null, supabase };
  }

  const region = (account.region as Region) ?? DEFAULT_REGION;
  const db = getDbForRegion(region)(session.access_token);
  return { session, tenantId: account.id, region, db, account, supabase };
}
