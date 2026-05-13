/**
 * Auth surface e2e (Plan 01-07, FND-04).
 *
 * Asserts:
 *   - `/sign-up` renders "Start your raise" + Google button + Terms/Privacy +
 *     DPA clickwrap line
 *   - `/sign-in` renders "Welcome back"
 *   - `/app` unauthenticated → `/sign-in` (the `proxy.ts` gate)
 *   - `/reactivate` for an unauthenticated user → `/sign-in`
 *
 * The OAuth round-trip + the session-based gate matrix (none → /reactivate,
 * trialing → /app, /onboarding reachable for `none`) needs a live Supabase
 * test user; those checks are wired into the Walking-Skeleton e2e
 * (e2e/skeleton.spec.ts) which runs in CI against the Vercel preview, where a
 * test Supabase user + session can be minted via the admin API. This spec
 * runs against the local webServer and covers the unauthenticated surface.
 */
import { test, expect } from '@playwright/test';

test.describe('Auth surface (unauthenticated)', () => {
  test('/sign-up renders the start-your-raise card + Google + legal', async ({ page }) => {
    await page.goto('/sign-up');
    await expect(page.getByRole('heading', { name: 'Start your raise' })).toBeVisible();
    await expect(page.getByRole('button', { name: /continue with google/i })).toBeVisible();
    await expect(page.getByText(/By continuing you agree to our/i)).toBeVisible();
    await expect(
      page.getByText(/By signing up you agree to our Data Processing Addendum/i),
    ).toBeVisible();
    await expect(page.getByRole('link', { name: /sign in/i })).toBeVisible();
  });

  test('/sign-in renders welcome-back + Google + the "new to Trochia" link', async ({ page }) => {
    await page.goto('/sign-in');
    await expect(page.getByRole('heading', { name: 'Welcome back' })).toBeVisible();
    await expect(page.getByRole('button', { name: /continue with google/i })).toBeVisible();
    await expect(page.getByRole('link', { name: /start raising/i })).toBeVisible();
  });

  test('/app unauthenticated → /sign-in (proxy gate)', async ({ page }) => {
    const response = await page.goto('/app');
    // The proxy 307s to /sign-in. Playwright follows redirects by default, so
    // we end up on /sign-in.
    expect(response).toBeTruthy();
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
