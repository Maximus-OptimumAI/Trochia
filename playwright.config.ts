import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright config.
 *
 * - `testDir: ./e2e` — e2e specs are added by later plans (auth/onboarding,
 *   styleguide gate, etc.).
 * - `baseURL` from PLAYWRIGHT_BASE_URL (CI sets it to the Vercel preview URL);
 *   falls back to the local dev server.
 * - Local runs build + start the app via `webServer`; in CI, when
 *   PLAYWRIGHT_BASE_URL is set, the webServer is skipped.
 */
const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:3000';
const useExternalServer = Boolean(process.env.PLAYWRIGHT_BASE_URL);

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
