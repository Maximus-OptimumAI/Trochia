/**
 * Regression for /codex 01-07 re-verification 2026-05-15 [P1]:
 * first-login tenant-claim staleness in src/app/auth/callback/route.ts.
 *
 * Defect: on a first-time OAuth callback, `exchangeCodeForSession()` minted
 * the JWT BEFORE the `accounts` row existed, so the custom_access_token_hook
 * resolved `tenant_id = null` and stamped that on the cookie. After the route
 * inserted the account and redirected, the founder's session still carried
 * the stale-null claim. proxy.ts's RLS-claims read on /app/* then denied the
 * row (the `tenant_isolation` policy keys on the claim), looping back to
 * /onboarding until JWT TTL or sign-out/in.
 *
 * Fix A (this file): the route now calls `supabase.auth.refreshSession()`
 * AFTER the account upsert so the next token re-runs the hook against the
 * now-existing row and stamps a populated `tenant_id`.
 *
 * This suite asserts the BEHAVIORAL contract: `refreshSession()` is called
 * after the upsert and before the redirect. The literal-claim-population
 * assertion (decode the cookie's JWT, check `tenant_id` is non-null) requires
 * a live Supabase project + the custom_access_token_hook installed and runs
 * as an e2e against the Vercel preview; see `e2e/skeleton.spec.ts`.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// ── Mocks (top-level, hoisted by vitest) ───────────────────────────────────
const exchangeCodeForSessionMock = vi.fn();
const refreshSessionMock = vi.fn();

vi.mock('@/lib/supabase/server', () => ({
  createServerSupabaseClient: async () => ({
    auth: {
      exchangeCodeForSession: exchangeCodeForSessionMock,
      refreshSession: refreshSessionMock,
    },
  }),
}));

// Track call order across the service client + refreshSession so we can assert
// refreshSession runs AFTER the upsert (the whole point of the fix).
const callOrder: string[] = [];
const insertMock = vi.fn(() => ({
  values: () => ({
    onConflictDoNothing: () => {
      callOrder.push('insert.users');
      return Promise.resolve();
    },
  }),
}));
const executeMock = vi.fn(() => {
  callOrder.push('execute.accounts.upsert');
  return Promise.resolve();
});
const findFirstMock = vi.fn();

vi.mock('@/db/client', () => ({
  getServiceClient: () => ({
    insert: insertMock,
    execute: executeMock,
    query: {
      accounts: {
        findFirst: findFirstMock,
      },
    },
  }),
}));

// Track is best-effort and fire-and-forget; mock to a no-op promise so the
// `void track(...).catch()` doesn't surface unhandled rejections in vitest.
vi.mock('@/lib/analytics', () => ({
  track: vi.fn().mockResolvedValue(undefined),
}));

// Defer-import so the mocks above are wired before the route module loads.
const { GET } = await import('@/app/auth/callback/route');

function makeRequest(code = 'pkce_code_xxx') {
  return new Request(`http://localhost:3000/auth/callback?code=${code}`) as Parameters<
    typeof GET
  >[0];
}

// fix/preview-auth-01: a request that arrives on a Vercel `*.vercel.app` preview
// host. The post-exchange redirect must STAY on this host (not bounce to the
// pinned prod APP_URL), so the session cookie set here remains visible.
function makePreviewRequest(host = 'trochia-git-fix-preview-auth-01.vercel.app', code = 'pkce_code_xxx') {
  return new Request(`https://${host}/auth/callback?code=${code}`) as Parameters<typeof GET>[0];
}

describe('auth/callback: first-login session refresh (PR-6 Fix A)', () => {
  beforeEach(() => {
    exchangeCodeForSessionMock.mockReset();
    refreshSessionMock.mockReset();
    insertMock.mockClear();
    executeMock.mockClear();
    findFirstMock.mockReset();
    callOrder.length = 0;
    // Track is a stable mock; no per-test reset needed for our assertions.
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('calls supabase.auth.refreshSession() AFTER the account upsert and BEFORE redirect', async () => {
    // Happy path: code exchange succeeds, returns a user.
    exchangeCodeForSessionMock.mockResolvedValue({
      data: {
        user: { id: '00000000-0000-0000-0000-000000000001', email: 'founder@test.local' },
      },
      error: null,
    });
    // Track the refresh call in the order log so we can assert sequence.
    refreshSessionMock.mockImplementation(async () => {
      callOrder.push('auth.refreshSession');
      return { data: { session: null }, error: null };
    });
    // The account row exists after upsert; not yet onboarded so we redirect to /onboarding.
    findFirstMock.mockResolvedValue({ id: 'acct_xxx', dpaAcceptedAt: null, subscriptionStatus: 'none' });

    const res = await GET(makeRequest());

    // Critical: refreshSession was called.
    expect(refreshSessionMock).toHaveBeenCalledTimes(1);
    // Sequence: users-insert → accounts-upsert → refreshSession (the fix runs
    // AFTER both DB writes commit, not before).
    expect(callOrder).toEqual(['insert.users', 'execute.accounts.upsert', 'auth.refreshSession']);
    // And the response is the redirect, not a 500 / unrelated path.
    expect(res.status).toBe(307);
    expect(res.headers.get('location')).toMatch(/\/onboarding$/);
  });

  it('preview host: post-exchange redirect STAYS on the *.vercel.app host (fix/preview-auth-01)', async () => {
    exchangeCodeForSessionMock.mockResolvedValue({
      data: {
        user: { id: '00000000-0000-0000-0000-000000000001', email: 'founder@test.local' },
      },
      error: null,
    });
    refreshSessionMock.mockResolvedValue({ data: { session: null }, error: null });
    findFirstMock.mockResolvedValue({ id: 'acct_xxx', dpaAcceptedAt: null, subscriptionStatus: 'none' });

    const res = await GET(makePreviewRequest('trochia-git-fix-preview-auth-01.vercel.app'));

    // Lands back on the SAME preview host the round-trip came from (full origin,
    // not just the path) so the host-only session cookie is visible.
    expect(res.status).toBe(307);
    expect(res.headers.get('location')).toBe(
      'https://trochia-git-fix-preview-auth-01.vercel.app/onboarding',
    );
  });

  it('preview host + exchange failure: error redirect STAYS on the preview host', async () => {
    exchangeCodeForSessionMock.mockResolvedValue({
      data: null,
      error: { message: 'invalid PKCE code', status: 400 },
    });

    const res = await GET(makePreviewRequest('trochia-git-fix-preview-auth-01.vercel.app'));

    expect(res.status).toBe(307);
    expect(res.headers.get('location')).toBe(
      'https://trochia-git-fix-preview-auth-01.vercel.app/sign-in?error=exchange_failed',
    );
  });

  it('refreshSession throws → still redirects (best-effort; proxy fallback covers)', async () => {
    exchangeCodeForSessionMock.mockResolvedValue({
      data: {
        user: { id: '00000000-0000-0000-0000-000000000001', email: 'founder@test.local' },
      },
      error: null,
    });
    // Simulate a Supabase Auth network hiccup on the refresh.
    refreshSessionMock.mockImplementation(async () => {
      callOrder.push('auth.refreshSession');
      throw new Error('ECONNRESET: supabase auth unreachable');
    });
    findFirstMock.mockResolvedValue({ id: 'acct_xxx', dpaAcceptedAt: null, subscriptionStatus: 'none' });

    const res = await GET(makeRequest());

    // The refresh was attempted (best-effort).
    expect(refreshSessionMock).toHaveBeenCalledTimes(1);
    // The redirect still landed; the founder is not blocked by a transient
    // refresh failure. The proxy.ts owner_user_id fallback covers the next
    // request's gate read until a successful refresh lands.
    expect(res.status).toBe(307);
    expect(res.headers.get('location')).toMatch(/\/onboarding$/);
  });

  it('exchangeCodeForSession fails → redirects to /sign-in?error=exchange_failed; refreshSession NOT called', async () => {
    exchangeCodeForSessionMock.mockResolvedValue({
      data: null,
      error: { message: 'invalid PKCE code', status: 400 },
    });

    const res = await GET(makeRequest());

    expect(res.status).toBe(307);
    expect(res.headers.get('location')).toMatch(/\/sign-in\?error=exchange_failed$/);
    // We never reached the upsert + refresh layer; guard against accidentally
    // refreshing a non-session on the exchange-failure path.
    expect(insertMock).not.toHaveBeenCalled();
    expect(executeMock).not.toHaveBeenCalled();
    expect(refreshSessionMock).not.toHaveBeenCalled();
  });

  it('account upsert fails → redirects to /sign-in?error=account_setup_failed; refreshSession NOT called', async () => {
    exchangeCodeForSessionMock.mockResolvedValue({
      data: {
        user: { id: '00000000-0000-0000-0000-000000000001', email: 'founder@test.local' },
      },
      error: null,
    });
    // Force the accounts upsert to throw.
    executeMock.mockImplementationOnce(() => {
      throw new Error('FK violation: auth.users row missing');
    });

    const res = await GET(makeRequest());

    expect(res.status).toBe(307);
    expect(res.headers.get('location')).toMatch(/\/sign-in\?error=account_setup_failed$/);
    // Critical: a failed upsert must NOT trigger a refresh; refreshing on a
    // session whose row creation failed would write a useless cookie and mask
    // the real failure mode.
    expect(refreshSessionMock).not.toHaveBeenCalled();
  });
});
