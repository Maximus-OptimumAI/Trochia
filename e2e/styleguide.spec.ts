import { test, expect } from '@playwright/test';

/**
 * /styleguide smoke spec — the Phase-1 design-system exit gate. Asserts the
 * route loads (200), all 19 section headings render, and a few representative
 * components are present (the founder-approval demo's "Send outreach" button,
 * the plain modal's "Keep draft" dismiss, the 8 color swatches).
 */

const SECTION_HEADINGS = [
  '1 · Color tokens',
  '2 · Typography specimens',
  '3 · Spacing scale',
  '4 · Buttons',
  '5 · Inputs & Form',
  '6 · Cards',
  '7 · Dialog',
  '8 · Sheet',
  '9 · Tabs',
  '10 · Toast',
  '11 · NavigationMenu (marketing top bar)',
  '12 · Avatar',
  '13 · Badge',
  '14 · DropdownMenu (sidebar user menu)',
  '15 · Accordion (pricing FAQ)',
  '16 · Cross-cutting primitives',
  '17 · App shell (framed preview)',
  '18 · Motion examples',
  '19 · Iconography',
];

test('/styleguide renders all 19 sections + representative components', async ({ page }) => {
  const res = await page.goto('/styleguide');
  expect(res?.status()).toBe(200);

  for (const heading of SECTION_HEADINGS) {
    await expect(page.getByRole('heading', { name: heading })).toBeVisible();
  }

  // section 1: 8 color swatches
  await expect(page.getByTestId('color-swatches').locator('> div')).toHaveCount(8);

  // section 7: open the founder-approval demo → "Send outreach" primary
  await page.getByRole('button', { name: 'Preview founder-approval' }).click();
  await expect(page.getByRole('button', { name: 'Send outreach' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Keep editing' })).toBeVisible();
  await expect(page.getByRole('button', { name: /^Send$/ })).toHaveCount(0);
  await page.getByRole('button', { name: 'Keep editing' }).click();

  // section 7: the plain modal's dismiss is "Keep draft" (not Cancel/OK/Close)
  await page.getByRole('button', { name: 'Open plain modal' }).click();
  await expect(page.getByRole('button', { name: 'Keep draft' })).toBeVisible();
  await expect(page.getByRole('button', { name: /^(Cancel|OK|Close)$/ })).toHaveCount(0);
});

test('/styleguide is not behind an entitlements gate (route source has no entitlements call)', async ({
  page,
}) => {
  // a smoke proxy: the page renders without auth — if it were entitlement-gated
  // it would redirect / 403 here.
  const res = await page.goto('/styleguide');
  expect(res?.status()).toBe(200);
  await expect(page.getByRole('heading', { name: 'Trochia design system' })).toBeVisible();
});
