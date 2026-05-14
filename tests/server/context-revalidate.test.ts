/**
 * Regression for /codex 01-07 review [P1] finding #1:
 * "Revalidate tRPC sessions with getUser()" — src/server/context.ts.
 *
 * Before PR-2, `createTRPCContext` called `supabase.auth.getSession()`, which
 * trusts the cookie's JWT without round-tripping to Supabase Auth. A revoked
 * / banned / signed-out account could therefore keep invoking protected tRPC
 * procedures until the cached JWT's ≤1h TTL expired (the proxy's `getUser()`
 * gate only fires on `/app/*` page navigations, not on `/api/trpc/*`).
 *
 * PR-2 swaps to `supabase.auth.getUser()` (a JWKS-revalidated server call) as
 * the FIRST auth check in `createTRPCContext`. This suite asserts:
 *   1. A revoked session (getUser returns AuthApiError) → context shape is
 *      fully null (session/tenantId/db all null) → protectedProcedure throws
 *      UNAUTHORIZED on the first call, not after TTL.
 *   2. A network failure on getUser is treated as "no session" (fail-closed),
 *      not a 500.
 *   3. A valid getUser response → context proceeds to fetch the session for
 *      the access token used by the RLS-driven request client.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// ── Mocks (top-level, hoisted by vitest) ───────────────────────────────────
const getUserMock = vi.fn();
const getSessionMock = vi.fn();

vi.mock('next/headers', () => ({
  cookies: async () => ({
    getAll: () => [],
    set: () => undefined,
  }),
}));

vi.mock('@supabase/ssr', () => ({
  createServerClient: () => ({
    auth: {
      getUser: getUserMock,
      getSession: getSessionMock,
    },
  }),
}));

// `getServiceClient` is called by `resolveAccount` — for the revoked-session
// path it MUST NOT be reached. We register a throw so any accidental call
// fails the test loudly.
vi.mock('@/db/client', () => ({
  getServiceClient: () => {
    throw new Error('getServiceClient must not be called when auth fails');
  },
}));

// `getDbForRegion` is also reached only after auth — same guard.
vi.mock('@/db/region', () => ({
  getDbForRegion: () => () => ({
    rls: () => Promise.reject(new Error('rls() must not be reached on revoked auth')),
  }),
  DEFAULT_REGION: 'us',
}));

// Defer-import so the mocks above are wired before module evaluation.
const { createTRPCContext } = await import('@/server/context');

describe('createTRPCContext — auth revalidation (PR-2)', () => {
  beforeEach(() => {
    getUserMock.mockReset();
    getSessionMock.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('revoked session (getUser returns error) → fully null context, no DB access', async () => {
    // Simulate Supabase Auth saying "this user is no longer valid" — equivalent
    // to a revoked refresh token, banned user, or a signed-out session whose
    // cookie is still in the browser.
    getUserMock.mockResolvedValue({
      data: { user: null },
      error: { message: 'JWT expired or user revoked', status: 401, name: 'AuthApiError' },
    });
    // getSession would still return the cached cookie's session — but we should
    // never even reach it after getUser rejects.
    getSessionMock.mockResolvedValue({
      data: {
        session: {
          access_token: 'should-not-be-trusted',
          user: { id: '00000000-0000-0000-0000-000000000001' },
        },
      },
    });

    const ctx = await createTRPCContext({ req: new Request('http://localhost/api/trpc/foo') });

    expect(ctx.session).toBeNull();
    expect(ctx.tenantId).toBeNull();
    expect(ctx.region).toBeNull();
    expect(ctx.db).toBeNull();
    expect(ctx.account).toBeNull();
    expect(getUserMock).toHaveBeenCalledTimes(1);
    // Critical: getSession was NOT called — revoked-user path returns before
    // the access-token fetch. This is the defense against TTL-lag.
    expect(getSessionMock).not.toHaveBeenCalled();
  });

  it('network failure on getUser → fail-closed (no DB access, no 500)', async () => {
    getUserMock.mockRejectedValue(new Error('ECONNRESET — supabase auth unreachable'));

    const ctx = await createTRPCContext({ req: new Request('http://localhost/api/trpc/foo') });

    expect(ctx.session).toBeNull();
    expect(ctx.tenantId).toBeNull();
    expect(ctx.db).toBeNull();
    expect(getUserMock).toHaveBeenCalledTimes(1);
    expect(getSessionMock).not.toHaveBeenCalled();
  });

  it('no user (getUser returns null user, no error) → null context, no DB access', async () => {
    // The other common shape: unauthenticated request with no cookie at all.
    getUserMock.mockResolvedValue({ data: { user: null }, error: null });

    const ctx = await createTRPCContext({ req: new Request('http://localhost/api/trpc/foo') });

    expect(ctx.session).toBeNull();
    expect(ctx.tenantId).toBeNull();
    expect(getSessionMock).not.toHaveBeenCalled();
  });

  it('valid user → getSession IS called to obtain the access token', async () => {
    getUserMock.mockResolvedValue({
      data: { user: { id: '00000000-0000-0000-0000-000000000001' } },
      error: null,
    });
    // getSession returns a real-shaped session — but resolveAccount throws via
    // the getServiceClient mock above. We only care that we got PAST the
    // revalidation gate; the throw confirms we entered the "valid user" branch.
    getSessionMock.mockResolvedValue({
      data: {
        session: {
          access_token: 'jwt.token.value',
          user: { id: '00000000-0000-0000-0000-000000000001' },
        },
      },
    });

    await expect(
      createTRPCContext({ req: new Request('http://localhost/api/trpc/foo') }),
    ).rejects.toThrow('getServiceClient must not be called when auth fails');

    expect(getUserMock).toHaveBeenCalledTimes(1);
    expect(getSessionMock).toHaveBeenCalledTimes(1);
  });
});
