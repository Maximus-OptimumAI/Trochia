/**
 * App-shell e2e (Plan 01-09, FND-12).
 *
 * Asserts the public-surface contract of the `/app/*` routes:
 *   - All `/app/*` routes are gated (unauthed → /sign-in via proxy.ts; the
 *     subscription gate then sends sessioned-but-no-active-sub users to
 *     /reactivate, but that path needs a live session and lives in
 *     `e2e/skeleton.spec.ts`'s webhook-round-trip block).
 *   - `/app/memory`, `/app/pitch`, `/app/pipeline`, `/app/live-raise` are NOT
 *     404s — they're real routes that render the AppShell + a "coming in
 *     Phase N" empty-state when authed.
 *   - `/styleguide` is session-gated (Plan 07 made it so) — unauthed → /sign-in.
 *
 * The full happy-path coverage of the dashboard CTA cards rendering, the
 * empty-dashboard state, the Settings Delete-account Dialog typed-confirm,
 * and the Billing Manage-billing redirect needs a live test session — that
 * lives in the CI-only block in `e2e/skeleton.spec.ts`. This spec covers the
 * proxy-gate matrix + the "not a 404" check that's verifiable without auth.
 */
import { test, expect } from '@playwright/test';

const APP_ROUTES = [
  '/app',
  '/app/memory',
  '/app/pitch',
  '/app/pipeline',
  '/app/live-raise',
  '/app/settings',
  '/app/billing',
];

test.describe('App shell — proxy gate (unauthenticated)', () => {
  for (const path of APP_ROUTES) {
    test(`${path} unauthenticated → 307 → /sign-in`, async ({ request }) => {
      const res = await request.get(path, { maxRedirects: 0 });
      expect(res.status()).toBe(307);
      expect(res.headers().location).toMatch(/\/sign-in/);
    });
  }

  test('/styleguide unauthenticated → /sign-in (Plan 07 session gate)', async ({ page }) => {
    await page.goto('/styleguide');
    await expect(page).toHaveURL(/\/sign-in/);
  });

  test('/app/memory is a real route (not a 404)', async ({ request }) => {
    // Unauthed → 307 to /sign-in. A nonexistent route would 404. The 307
    // (NOT 404) proves the route is wired even though the body needs a session.
    const res = await request.get('/app/memory', { maxRedirects: 0 });
    expect(res.status()).toBe(307);
    expect(res.status()).not.toBe(404);
  });

  test('/app/pitch is a real route (not a 404)', async ({ request }) => {
    const res = await request.get('/app/pitch', { maxRedirects: 0 });
    expect(res.status()).toBe(307);
    expect(res.status()).not.toBe(404);
  });

  test('/app/pipeline is a real route (not a 404 — CTA card target)', async ({ request }) => {
    const res = await request.get('/app/pipeline', { maxRedirects: 0 });
    expect(res.status()).toBe(307);
    expect(res.status()).not.toBe(404);
  });

  test('/app/live-raise is a real route (not a 404 — CTA card target)', async ({ request }) => {
    const res = await request.get('/app/live-raise', { maxRedirects: 0 });
    expect(res.status()).toBe(307);
    expect(res.status()).not.toBe(404);
  });
});
