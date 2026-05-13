/**
 * Auth surface e2e (Plan 01-07, FND-04).
 *
 * Asserts the unauthenticated public surface:
 *   - `/sign-up` returns 200 and the response body contains "Start your raise",
 *     the Google button label, the Terms/Privacy line, and the DPA clickwrap
 *     line.
 *   - `/sign-in` returns 200 + "Welcome back".
 *   - `/app`, `/reactivate`, `/onboarding` redirect to `/sign-in` when there
 *     is no session.
 *
 * The OAuth round-trip + the full session-based gate matrix (none →
 * /reactivate, trialing → /app) needs a live Supabase test user; those checks
 * are wired into `e2e/skeleton.spec.ts` and run in CI against the Vercel
 * preview (test users are minted via the admin API there).
 *
 * Implementation note: this spec uses `request.get()` (Playwright's request
 * fixture, which calls the server directly without a browser) instead of
 * `page.goto()`. Headless Chromium under Windows + Next 16's gzip-encoded HTML
 * + the cached-prerender bytes occasionally renders Chrome's "this page
 * couldn't load" instead of the served HTML — the bytes ARE the real page
 * (`curl` confirms it), so the page-render assertion was racing the browser.
 * `request.get()` asserts the server-side bytes directly, which is what the
 * "is the auth surface live?" question actually wants.
 */
import { test, expect } from '@playwright/test';

test.describe('Auth surface (unauthenticated)', () => {
  test('/sign-up returns 200 + the start-your-raise card + Google + legal + DPA lines', async ({
    request,
  }) => {
    const res = await request.get('/sign-up');
    expect(res.status()).toBe(200);
    const html = await res.text();
    expect(html).toContain('Start your raise');
    expect(html).toContain('Continue with Google');
    expect(html).toMatch(/By continuing you agree to our/);
    expect(html).toMatch(/Data Processing Addendum/);
    // No hardcoded site URL leaks into the surface.
    expect(html).not.toContain('https://trochia.ai/sign-up');
  });

  test('/sign-in returns 200 + the welcome-back card + Google + the new-to-Trochia link', async ({
    request,
  }) => {
    const res = await request.get('/sign-in');
    expect(res.status()).toBe(200);
    const html = await res.text();
    expect(html).toContain('Welcome back');
    expect(html).toContain('Continue with Google');
    expect(html).toContain('Start raising');
  });

  test('/app unauthenticated → 307 → /sign-in (the proxy.ts gate)', async ({ request, page }) => {
    // The proxy emits a 307. Disable redirect-following on the request fixture
    // to see the bare status.
    const res = await request.get('/app', { maxRedirects: 0 });
    expect(res.status()).toBe(307);
    expect(res.headers().location).toMatch(/\/sign-in/);
    // And the browser actually lands on /sign-in (this is also a behavior check).
    await page.goto('/app');
    await expect(page).toHaveURL(/\/sign-in/);
  });

  test('/reactivate unauthenticated → /sign-in', async ({ page }) => {
    await page.goto('/reactivate');
    await expect(page).toHaveURL(/\/sign-in/);
  });

  test('/onboarding unauthenticated → /sign-in', async ({ page }) => {
    await page.goto('/onboarding');
    await expect(page).toHaveURL(/\/sign-in/);
  });
});
