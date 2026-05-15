/**
 * Regression for /codex 01-07 re-verification 2026-05-15 [P1]:
 * first-login tenant-claim staleness — `src/proxy.ts` resilience layer.
 *
 * Defect (described in tests/auth/callback.test.ts): a first-login session
 * cookie can carry a JWT whose `tenant_id` claim is null because the
 * custom_access_token_hook ran before the `accounts` row existed. proxy.ts's
 * `/app/*` gate then reads `accounts` via the RLS-claims-driven Supabase
 * client; the tenant_isolation policy denies the row, and the gate redirects
 * back to `/onboarding`, looping the founder until JWT TTL or sign-out/in.
 *
 * Fix B (this file): when the first claim-driven lookup returns empty AND
 * the user is authenticated, proxy.ts now retries with
 * `.eq('owner_user_id', user.id)`. The `owner_self_read` RLS policy
 * (migration 0004, src/db/rls.ts:ownerSelfReadPolicy) permits the SELECT.
 *
 * This suite drives `proxy()` with a behavioral mock of `@supabase/ssr`'s
 * `createServerClient` to assert:
 *   1. Stale-claim path: first lookup is empty → fallback `.eq()` query
 *      runs → if it returns a trialing/active account, the gate PASSES
 *      (no redirect).
 *   2. Happy path: first lookup returns the account → fallback NOT called
 *      (no extra round-trip).
 *   3. Stale-claim path + fallback ALSO empty → redirect to /onboarding
 *      (the existing safety-net branch still works after both reads fail).
 *   4. The two-user RLS proof — A reads own via owner_self_read, B cannot
 *      read A's — lives in tests/rls/two-user-isolation.test.ts (the DB
 *      proof is separable from the code-shape proof above).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { NextRequest } from 'next/server';

// ── Mocks (top-level, hoisted by vitest) ───────────────────────────────────
//
// Shape: createServerClient returns a fake supabase. The `auth.getUser()` call
// resolves to a known user.id; the `.from('accounts').select(...)` chain
// resolves to whatever per-test `firstQueryResult` / `fallbackQueryResult`
// holds. The chain tracks whether `.eq('owner_user_id', ...)` was called so
// we can assert the fallback fired (or didn't).
let firstQueryResult: { data: unknown; error: unknown } = { data: null, error: null };
let fallbackQueryResult: { data: unknown; error: unknown } = { data: null, error: null };
let eqCalled = false;
let eqArgs: Array<[string, unknown]> = [];
const getUserMock = vi.fn();

function buildSelectChain(initial: { data: unknown; error: unknown }) {
  const chain = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn((col: string, val: unknown) => {
      eqCalled = true;
      eqArgs.push([col, val]);
      // After .eq is called, the chain produces the fallback result.
      return {
        select: vi.fn().mockReturnThis(),
        limit: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockResolvedValue(fallbackQueryResult),
      };
    }),
    limit: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue(initial),
  };
  return chain;
}

vi.mock('@supabase/ssr', () => ({
  createServerClient: () => ({
    auth: { getUser: getUserMock },
    from: vi.fn(() => buildSelectChain(firstQueryResult)),
  }),
}));

// `@/lib/env`'s `env` constant is parsed at module-load time from the
// process.env snapshot at that moment. `tests/setup.ts` only stubs the SITE /
// APP URLs, so NEXT_PUBLIC_SUPABASE_URL / KEY are undefined at proxy.ts's
// import and the early-return at `src/proxy.ts:80` (`if (!url || !key) return
// response;`) fires before any test logic runs. Stub the env constant
// directly here so the proxy executes its real body.
vi.mock('@/lib/env', () => ({
  env: {
    NEXT_PUBLIC_SUPABASE_URL: 'http://localhost:54321',
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'test-publishable-key',
    SUPABASE_URL: 'http://localhost:54321',
    SUPABASE_PUBLISHABLE_KEY: 'test-publishable-key',
  },
}));

// next/server's NextResponse.redirect uses the URL constructor, which is fine
// in node; we don't mock it.

// `entitlements.isActiveOrTrialing` is a pure read on the returned shape.
// Real implementation lives in src/modules/billing/entitlements.ts — we leave
// it unmocked so the test confirms the full code path.

const { proxy } = await import('@/proxy');

function makeRequest(pathname: string): NextRequest {
  // The proxy reads request.cookies.getAll(), request.nextUrl.pathname, and
  // request.url. A real NextRequest is heavy; a minimal stand-in is enough.
  const url = `http://localhost:3000${pathname}`;
  const cookies = {
    getAll: () => [],
    set: () => undefined,
  };
  return {
    url,
    nextUrl: { pathname },
    cookies,
  } as unknown as NextRequest;
}

describe('proxy.ts /app gate — owner_user_id fallback (PR-6 Fix B)', () => {
  beforeEach(() => {
    eqCalled = false;
    eqArgs = [];
    firstQueryResult = { data: null, error: null };
    fallbackQueryResult = { data: null, error: null };
    getUserMock.mockReset();
    // (The @/lib/env mock above stubs NEXT_PUBLIC_SUPABASE_URL / KEY so the
    // proxy doesn't short-circuit at the missing-config branch. No
    // per-test env setup needed.)
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('stale-claim path: first lookup empty → fallback by owner_user_id resolves → gate PASSES (no redirect)', async () => {
    // Authenticated user (proxy.ts already revalidates via getUser).
    getUserMock.mockResolvedValue({
      data: { user: { id: 'user-A-uuid' } },
      error: null,
    });
    // First query (claim-driven) returns empty — exactly the stale-tenant_id case.
    firstQueryResult = { data: null, error: null };
    // Fallback query (.eq('owner_user_id', userId)) returns the trialing account.
    fallbackQueryResult = {
      data: { subscription_status: 'trialing' },
      error: null,
    };

    const res = await proxy(makeRequest('/app'));

    // The fallback fired.
    expect(eqCalled).toBe(true);
    expect(eqArgs).toEqual([['owner_user_id', 'user-A-uuid']]);
    // No redirect — the gate let the request through.
    expect(res.status).toBe(200);
    // No Location header (we'd see one if it redirected).
    expect(res.headers.get('location')).toBeNull();
  });

  it('happy path: first lookup returns the account → fallback NOT called (no extra round-trip)', async () => {
    getUserMock.mockResolvedValue({
      data: { user: { id: 'user-A-uuid' } },
      error: null,
    });
    firstQueryResult = {
      data: { subscription_status: 'active' },
      error: null,
    };
    fallbackQueryResult = { data: null, error: null }; // would-be no-op if reached

    const res = await proxy(makeRequest('/app'));

    expect(eqCalled).toBe(false);
    expect(res.status).toBe(200);
    expect(res.headers.get('location')).toBeNull();
  });

  it('stale-claim path + fallback ALSO empty → redirect to /onboarding (safety net intact)', async () => {
    getUserMock.mockResolvedValue({
      data: { user: { id: 'user-A-uuid' } },
      error: null,
    });
    firstQueryResult = { data: null, error: null };
    // Even the owner-self-read returned nothing — account row truly doesn't exist
    // (race window where auth callback hasn't completed yet, or the row was
    // deleted concurrently). Fall back to /onboarding.
    fallbackQueryResult = { data: null, error: null };

    const res = await proxy(makeRequest('/app'));

    expect(eqCalled).toBe(true);
    expect(res.status).toBe(307);
    expect(res.headers.get('location')).toMatch(/\/onboarding$/);
  });

  it('claim-driven read returns an error → fallback NOT attempted (error path keeps existing semantics)', async () => {
    // If the first read errors (RLS denial as an error vs empty rows, network
    // blip), proxy.ts treats it as a hard failure and redirects to /onboarding
    // — the fallback was introduced for the EMPTY case, not the ERROR case.
    // Asserting this guards against accidentally papering over real RLS errors.
    getUserMock.mockResolvedValue({
      data: { user: { id: 'user-A-uuid' } },
      error: null,
    });
    firstQueryResult = { data: null, error: { message: 'PostgREST: permission denied' } };
    fallbackQueryResult = {
      data: { subscription_status: 'trialing' },
      error: null,
    };

    const res = await proxy(makeRequest('/app'));

    // The fallback was NOT called — error path short-circuits.
    expect(eqCalled).toBe(false);
    expect(res.status).toBe(307);
    expect(res.headers.get('location')).toMatch(/\/onboarding$/);
  });

  it('unauthenticated → redirect to /sign-in (gate runs BEFORE both reads)', async () => {
    // getUser returns no user — the gate redirects to /sign-in before any
    // accounts read. Neither the first lookup nor the fallback should fire.
    getUserMock.mockResolvedValue({ data: { user: null }, error: null });

    const res = await proxy(makeRequest('/app'));

    expect(eqCalled).toBe(false);
    expect(res.status).toBe(307);
    expect(res.headers.get('location')).toMatch(/\/sign-in$/);
  });
});
