import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright config.
 *
 * - `testDir: ./e2e` — e2e specs are added by later plans (auth/onboarding,
 *   styleguide gate, etc.).
 * - `baseURL` from PLAYWRIGHT_BASE_URL (CI sets it to the Vercel preview URL);
 *   falls back to the local dev server.
 * - Local runs build + start the app via `webServer`; in CI, when
 *   PLAYWRIGHT_BASE_URL is set to a NON-EMPTY value, the webServer is skipped.
 *
 * **Empty-string handling (PR-1 CI fix):** GitHub Actions resolves
 * `${{ secrets.PLAYWRIGHT_BASE_URL }}` to `""` (empty string, not undefined)
 * when the secret is unset. JavaScript's `??` operator only falls back on
 * `null`/`undefined`, so `process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:3000'`
 * returns `""` in CI — yielding an unreachable baseURL and breaking every
 * `request.get(path)` call. The trim + length check below treats empty,
 * whitespace-only, and unset values uniformly as "use the local webServer".
 */
const rawBaseURL = (process.env.PLAYWRIGHT_BASE_URL ?? '').trim();
const useExternalServer = rawBaseURL.length > 0;
const baseURL = useExternalServer ? rawBaseURL : 'http://localhost:3000';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL,
    trace: 'on-first-retry',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: useExternalServer
    ? undefined
    : {
        command: 'npm run build && npm run start',
        url: baseURL,
        reuseExistingServer: !process.env.CI,
        timeout: 180_000,
      },
});
