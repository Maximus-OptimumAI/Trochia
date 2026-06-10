/**
 * Sign-out route (fix/ui-bundle / C4).
 *
 * Behavioral contract: POST clears the Supabase session and 303-redirects the
 * founder to the marketing hero "/". Replaces the prior 404 (the sidebar linked
 * /sign-out with no route behind it).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const signOutMock = vi.fn();

vi.mock('@/lib/supabase/server', () => ({
  createServerSupabaseClient: async () => ({
    auth: { signOut: signOutMock },
  }),
}));

// Defer-import so the mock is wired before the route module loads.
const { POST } = await import('@/app/(auth)/sign-out/route');

describe('sign-out route (C4)', () => {
  beforeEach(() => {
    signOutMock.mockReset();
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('clears the Supabase session and 303-redirects to the hero "/"', async () => {
    signOutMock.mockResolvedValue({ error: null });

    const res = await POST();

    expect(signOutMock).toHaveBeenCalledTimes(1);
    // 303 See Other → the browser follows with GET (not a method-preserving 307).
    expect(res.status).toBe(303);
    const location = res.headers.get('location');
    expect(location).not.toBeNull();
    // Root of the app — assert the path, not the (env-driven) origin.
    expect(new URL(location as string).pathname).toBe('/');
  });
});
