import { test, expect } from '@playwright/test';

/**
 * Marketing e2e — homepage + /pricing + /manifesto + /legal/{privacy,terms,
 * security,dpa} + the nav/footer contracts (UI-SPEC §"Route / Screen
 * Contract"). Phase-1 exit gate companion to the Lighthouse > 90 CI gate.
 */

test('homepage `/` renders the 8 sections with the operator-voice copy', async ({ page }) => {
  const res = await page.goto('/');
  expect(res?.status()).toBe(200);

  // 1 · Hero — H1 is the operator-voice copy; CENTER-stack per canon
  // (docs/design/DESIGN.md §5 / C2, founder-locked in the design adoption).
  await expect(
    page.getByRole('heading', { level: 1, name: 'Run your raise from one operator.' })
  ).toBeVisible();
  await expect(page.getByText('THE AGENTIC OPERATOR FOR YOUR RAISE', { exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Start your raise' }).first()).toBeVisible();
  await expect(page.getByRole('link', { name: 'See how it works →' })).toBeVisible();

  // Honest trust line inside the hero (D2-B founder-ruled copy; names text-only)
  await expect(page.getByText(/Techstars, Antler and beyond/i)).toBeVisible();

  // Below-fold sections sit behind the M4 scroll reveal (visibility:hidden
  // until intersection — DESIGN.md §9). Hidden elements leave the a11y tree,
  // so role queries can't resolve them: scroll the whole page once (as a
  // reader would) to fire every reveal, then assert.
  await page.evaluate(async () => {
    for (let y = 0; y <= document.body.scrollHeight; y += 600) {
      window.scrollTo(0, y);
      await new Promise((r) => setTimeout(r, 80));
    }
    window.scrollTo(0, 0);
  });

  // 3 · How it works — section heading + step 01 + step 04 (scoped to the list)
  await expect(page.getByRole('heading', { name: 'Four steps, one operator.' })).toBeVisible();
  const steps = page.getByLabel('How Trochia works');
  await expect(steps.getByText('01', { exact: true })).toBeVisible();
  await expect(steps.getByText('04', { exact: true })).toBeVisible();

  // 4 · Modules — section heading + all 6 module names
  await expect(page.getByRole('heading', { name: 'Six modules. One memory.' })).toBeVisible();
  for (const m of [
    'Business Memory',
    'Pitch Lab',
    'Investor Pipeline',
    'Live Raise',
    'Data Room',
    'Raise Ops',
  ]) {
    await expect(page.getByRole('heading', { name: m, level: 3 })).toBeVisible();
  }

  // 5 · Proof-of-work carousel (replaced the founder-voices placeholder, A7)
  await expect(
    page.getByRole('heading', { name: 'What the operator produces.' })
  ).toBeVisible();

  // 6 · Pricing teaser — 4 tier names + "See full pricing →"
  for (const t of ['Pre-Raise', 'Active Raise', 'Close Mode', 'Alumni']) {
    await expect(page.getByRole('heading', { name: t, level: 3 }).first()).toBeVisible();
  }
  await expect(page.getByRole('link', { name: 'See full pricing →' })).toBeVisible();

  // 7 · Final CTA
  await expect(
    page.getByRole('heading', { name: 'Stop juggling. Start raising.' })
  ).toBeVisible();
});

test('homepage hero is the canonical center-stack (DESIGN.md §5 / C2)', async ({ page }) => {
  await page.goto('/');
  const h1 = page.getByRole('heading', { level: 1, name: 'Run your raise from one operator.' });
  // C2 (founder-locked, design adoption 2026-06-11): the LANDING hero is
  // center-aligned. The pre-adoption left-aligned contract is repealed —
  // interior pages and app screens stay left-aligned, the landing hero does not.
  const align = await h1.evaluate((el) => {
    let node: HTMLElement | null = el as HTMLElement;
    while (node) {
      const ta = window.getComputedStyle(node).textAlign;
      if (ta && ta !== 'inherit' && ta !== 'unset') return ta;
      node = node.parentElement;
    }
    return 'left';
  });
  expect(align).toBe('center');
});

test('/pricing renders all 4 tiers, badges, the Tabs toggle, the feature matrix, and the FAQ', async ({
  page,
}) => {
  const res = await page.goto('/pricing');
  expect(res?.status()).toBe(200);

  // All 4 tier headings present (cards render tier name in <h3>)
  for (const t of ['Pre-Raise', 'Active Raise', 'Close Mode', 'Alumni']) {
    await expect(page.getByRole('heading', { name: t, level: 3 }).first()).toBeVisible();
  }

  // Tier dollar amounts present somewhere on the page
  await expect(page.getByText(/\$49/).first()).toBeVisible();
  await expect(page.getByText(/\$199/).first()).toBeVisible();
  await expect(page.getByText(/\$399/).first()).toBeVisible();
  await expect(page.getByText(/\$19/).first()).toBeVisible();

  // Most chosen badge on Active Raise
  await expect(page.getByText('Most chosen').first()).toBeVisible();

  // "Available with the close stack" badge appears for Close Mode + Alumni
  await expect(page.getByText('Available with the close stack').first()).toBeVisible();

  // Close Mode + Alumni show "Activates at launch" (no purchase CTA on those)
  await expect(page.getByText('Activates at launch.').first()).toBeVisible();

  // Monthly / Annual Tabs toggle
  await expect(page.getByRole('tab', { name: 'Monthly' })).toBeVisible();
  await expect(page.getByRole('tab', { name: 'Annual' })).toBeVisible();

  // Switch to annual: Pre-Raise's $39 + Active Raise's $159 should now be visible
  await page.getByRole('tab', { name: 'Annual' }).click();
  await expect(page.getByText(/\$39/).first()).toBeVisible();
  await expect(page.getByText(/\$159/).first()).toBeVisible();

  // Feature-matrix table
  await expect(page.getByRole('heading', { name: 'All 4 tiers, side by side.' })).toBeVisible();

  // FAQ — at least 8 trigger rows
  await expect(page.getByRole('heading', { name: 'Questions founders ask.' })).toBeVisible();
  const faqTriggers = page.getByRole('button', { name: /\?$/ });
  expect(await faqTriggers.count()).toBeGreaterThanOrEqual(8);
});

test('/manifesto and /legal/{privacy,terms,security,dpa} return 200', async ({ page }) => {
  for (const path of [
    '/manifesto',
    '/legal/privacy',
    '/legal/terms',
    '/legal/security',
    '/legal/dpa',
  ]) {
    const res = await page.goto(path);
    expect(res?.status(), `${path} should return 200`).toBe(200);
  }
});

test('/legal/dpa renders the DPA content + a download link to /legal/dpa.pdf', async ({
  page,
}) => {
  await page.goto('/legal/dpa');
  // First DPA section heading from `dpa-sections.ts`
  await expect(page.getByRole('heading', { name: /1\. Parties and scope/i })).toBeVisible();
  // Download link to the committed PDF
  const pdfLink = page.locator('a[href="/legal/dpa.pdf"]').first();
  await expect(pdfLink).toBeVisible();
});

test('marketing top bar nav = How it works / Pricing / Manifesto (no Docs / Changelog)', async ({
  page,
}) => {
  await page.goto('/');
  const nav = page.locator('header').first();
  await expect(nav.getByRole('link', { name: 'How it works' })).toBeVisible();
  await expect(nav.getByRole('link', { name: 'Pricing' })).toBeVisible();
  await expect(nav.getByRole('link', { name: 'Manifesto' })).toBeVisible();
  await expect(nav.getByRole('link', { name: /^Docs$/ })).toHaveCount(0);
  await expect(nav.getByRole('link', { name: /^Changelog$/ })).toHaveCount(0);
});

test('footer product-nav = Pricing / Manifesto / Status (no Changelog)', async ({ page }) => {
  await page.goto('/');
  const footer = page.locator('footer').first();
  await expect(footer.getByRole('link', { name: 'Pricing' })).toBeVisible();
  await expect(footer.getByRole('link', { name: 'Manifesto' })).toBeVisible();
  await expect(footer.getByRole('link', { name: 'Status' })).toBeVisible();
  await expect(footer.getByRole('link', { name: /^Changelog$/ })).toHaveCount(0);
});

test('homepage `/` has no application console errors', async ({ page }) => {
  const errors: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() !== 'error') return;
    const text = msg.text();
    // Filter known infra noise from the marketing surface:
    //   - the Sentry tunnel (/monitoring) returns 404 against the CI fallback DSN
    //   - the Amplitude POST returns 4xx against the ci-amplitude-key fallback
    //   - generic "Failed to load resource" 404s without an app source map are
    //     also infra (the relevant ones are surfaced as actual JS errors below)
    if (/\/monitoring|sentry|amplitude|Failed to load resource/i.test(text)) return;
    errors.push(text);
  });
  await page.goto('/');
  // Give the hero motion a moment to start.
  await page.waitForTimeout(500);
  expect(errors, errors.join('\n')).toEqual([]);
});
