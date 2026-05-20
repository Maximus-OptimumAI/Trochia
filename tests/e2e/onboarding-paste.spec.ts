/**
 * Onboarding paste flow e2e (Plan 02-02 / KNW-02b Task 10).
 *
 * The Playwright spec that exercises `/onboarding/import/paste`:
 *
 *   1. **Unauthed surface contract** — the proxy.ts session gate redirects
 *      anonymous traffic to `/sign-in`. This mirrors the Phase-1
 *      `e2e/onboarding.spec.ts` pattern (`request.get()` over `page.goto()`
 *      because Next 16 + gzip + headless Chromium on Windows races the
 *      "page couldn't load" Chrome chrome). Runs on every machine.
 *
 *   2. **Fixture corpus is paste-able** — the Plan 02-02 Task 2 fixtures
 *      satisfy the 500–40,000 char band the agent + the page-level submit
 *      gate enforces, and clear the hard-banned compliance phrases (the
 *      banned-string check that `npm run check:banned` runs over `src/**`
 *      does not glob `tests/**`, so this spec carries the assertion). Runs
 *      on every machine.
 *
 *   3. **Authed happy path** — paste fixture → mocked tRPC extract returns
 *      a synthetic draft with ≥8 populated fields and ≥3 source snippets →
 *      confirmation form renders ≥8 cards → confirm-all → submit → done
 *      state visible + reload-behavior asserted. Wraps in `test.describe`
 *      with a skip predicate that activates only when a test session can be
 *      minted (matches Phase-1's `IS_CI_AGAINST_PREVIEW` pattern from
 *      `e2e/skeleton.spec.ts`). Skipped in local CI; activates once the
 *      orchestrator wires the Supabase admin-mint test-user helper.
 *
 *   4. **A11y + banned-string DOM sweep** — runs INSIDE the authed describe
 *      because both need the page rendered post-auth. A11y is checked via
 *      keyboard navigation (the plan's bar is operator-grade Tab order on
 *      the first card); the banned-string sweep grabs `page.content()` and
 *      asserts none of the hard-banned compliance phrases from
 *      `tasks/banned-strings.txt` appear in the rendered HTML.
 *
 * ## Mock strategy
 *
 * `page.route('** /api/trpc/**')` intercepts the tRPC POST batch and
 * returns a synthetic `BusinessMemoryDraft` for `memory.extractFromPaste`
 * and a synthetic confirmed row for `memory.confirmDraft`. tRPC v11 uses
 * `httpBatchLink` so the POST URL is `/api/trpc/memory.extractFromPaste`
 * (single call) or `/api/trpc/memory.extractFromPaste,memory.confirmDraft`
 * (batched). The matcher uses substring containment to cover both.
 *
 * The mocked Anthropic call therefore never happens — the test is exercising
 * the FE/BE wiring of the page + the confirmation form, not the live Sonnet
 * extraction (that ships in Plan 02-05's eval harness).
 *
 * ## Reload behavior — Week-2 vs Week-3 contract
 *
 * The Plan 02-02 verification language calls for reload-persistence (the
 * confirmed Business Memory still renders after a page reload). The
 * IMPLEMENTED page at `src/app/(app)/onboarding/import/paste/page.tsx`
 * deliberately does NOT pre-fetch the current draft — that work is deferred
 * to Plan 02-03 (Week 3) per the page's own header comment. The integration
 * test `tests/integration/memory-paste-rls.test.ts` Task 9 already proves
 * the SERVER side of reload-persistence (the row survives across new
 * tRPC callers; that is the truth the plan's must_haves contract demands).
 *
 * This spec therefore asserts the CURRENT behavior — reload returns the
 * page to its `paste` initial state — and documents the gap with a TODO so
 * the Week-3 escalation lands a real reload-persistence assertion here.
 *
 * ## What this spec deliberately does NOT do
 *
 * - It does not load a real Anthropic key. The agent boundary is mocked.
 * - It does not load `@axe-core/playwright`. The package is not installed
 *   in this repo, and the plan's a11y bar (operator-grade Tab order) is
 *   satisfied by Playwright's built-in keyboard navigation + role
 *   selectors. Adding a new dep right before a test-only file ship is a
 *   risk this plan does not take; if a deeper a11y harness is wanted, it
 *   can be added in Plan 02-03 alongside the conflict-UI a11y pass.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { test, expect, type Page } from '@playwright/test';

// ────────────────────────────────────────────────────────────────────────────
// Constants + fixture loader
// ────────────────────────────────────────────────────────────────────────────

const FIXTURE_PATH = resolve(
  process.cwd(),
  'tests/ai/fixtures/paste-helix-saas.txt',
);

/**
 * Phase-2 hard-banned compliance phrases. Mirrors `tasks/banned-strings.txt`
 * hard-ban set. The two negation-allowed phrases ("investment advice" /
 * "legal advice") are intentionally absent — the rendered UI must not
 * surface either in any form on this surface.
 */
const HARD_BANNED_PHRASES = [
  'rolling fund',
  'investment vehicle',
  'adviser',
  'AI-as-call-speaker',
];

/**
 * Negation-allowed phrases. The npm check-banned scanner allows these when
 * a negation appears within ~30 chars before. For the rendered DOM, this
 * spec asserts a strict NO-OCCURRENCE policy — the paste-flow UI surface
 * has no need to mention either phrase at all.
 */
const NEGATION_REQUIRED_PHRASES = ['investment advice', 'legal advice'];

/**
 * Whether a live test session can be minted in this run. Matches the
 * predicate `e2e/skeleton.spec.ts` uses: requires a non-fallback
 * SUPABASE_SECRET_KEY and a real PLAYWRIGHT_BASE_URL (the CI-against-
 * Vercel-preview path). Locally we cannot drive Supabase OAuth or the
 * `custom_access_token_hook` that materializes `tenant_id` on the JWT, so
 * the live-session block skips.
 */
const HAS_TEST_SESSION =
  !!process.env.PLAYWRIGHT_BASE_URL &&
  !!process.env.SUPABASE_SECRET_KEY &&
  !process.env.SUPABASE_SECRET_KEY.startsWith('ci-') &&
  process.env.SUPABASE_SECRET_KEY !== 'sk_test_dummy' &&
  !!process.env.TEST_USER_EMAIL;

/**
 * Synthetic draft returned by the mocked `memory.extractFromPaste` tRPC
 * call. Populates 10 top-level fields (all 7 scalars + populated team /
 * traction / narrative groups) with 6 provenance entries carrying
 * `source_snippet` strings. The snippets are short, clean, and contain no
 * banned phrases. The shape mirrors `BusinessMemoryDraft` from
 * `src/ai/schemas/business-memory.zod.ts`.
 */
function buildMockDraft() {
  const nowIso = new Date().toISOString();
  return {
    companyName: 'Helix Compliance, Inc.',
    oneLiner: 'Vertical SaaS for commercial GCs to track subcontractor compliance docs.',
    sector: 'Construction SaaS',
    stage: 'Seed',
    geography: 'Austin, TX (Delaware C-Corp on paper)',
    incorporationStatus: 'Delaware C-Corp',
    foundingDate: '2023-08-01T00:00:00.000Z',
    team: {
      founders: [
        {
          name: 'Jordan Vasquez',
          role: 'CEO',
          background: 'ex-Procore PM, ex-Turner project engineer',
          equity_pct: 39,
        },
        {
          name: 'Marcus Liang',
          role: 'CTO',
          background: 'ex-Salesforce staff engineer on Vlocity',
          equity_pct: 39,
        },
      ],
    },
    traction: {
      mrr: 28000,
      currency: 'USD',
      customers: 14,
      runway: '12 months at $98k burn',
      growth: 'Top-of-funnel building on Series A at $30M pre',
    },
    narrative: {
      problem:
        'Mid-market GCs track subcontractor compliance docs in spreadsheets and email; expired certs become jobsite shutdown risk.',
      solution:
        'A single dashboard that auto-chases the subs and flags expired docs before they become a shutdown risk.',
      why_now:
        'OSHA enforcement is up; insurance carriers are pulling coverage from GCs without clean compliance ops.',
      why_us:
        'Founders shipped Procore Compliance and Salesforce Construction Cloud; we know this buyer cold.',
    },
    provenance: {
      companyName: {
        source_snippet: 'Legal name: Helix Compliance, Inc.',
        confidence: 0.98,
        extracted_at: nowIso,
        last_updated: nowIso,
        snooze_until: null,
      },
      oneLiner: {
        source_snippet:
          'Helix is a vertical SaaS for mid-market commercial general contractors (GCs).',
        confidence: 0.91,
        extracted_at: nowIso,
        last_updated: nowIso,
        snooze_until: null,
      },
      sector: {
        source_snippet: 'vertical SaaS for mid-market commercial general contractors',
        confidence: 0.84,
        extracted_at: nowIso,
        last_updated: nowIso,
        snooze_until: null,
      },
      stage: {
        source_snippet: 'Stage: Seed.',
        confidence: 0.97,
        extracted_at: nowIso,
        last_updated: nowIso,
        snooze_until: null,
      },
      incorporationStatus: {
        source_snippet: 'Delaware C-Corp, incorporated August 2023.',
        confidence: 0.96,
        extracted_at: nowIso,
        last_updated: nowIso,
        snooze_until: null,
      },
      foundingDate: {
        source_snippet: 'incorporated August 2023',
        confidence: 0.9,
        extracted_at: nowIso,
        last_updated: nowIso,
        snooze_until: null,
      },
    },
  };
}

/**
 * tRPC-shaped batched response. superjson transformer is wired in
 * `src/lib/trpc-client.ts`, so the response body must use the
 * `{ result: { data: { json: <payload> } } }` envelope that the
 * server-side handler produces.
 */
function trpcBatchResponse(payloads: Array<Record<string, unknown> | null>) {
  return payloads.map((p) => ({
    result: { data: { json: p } },
  }));
}

/**
 * Intercept tRPC procedure calls. Both single + batched URLs are matched
 * because `httpBatchLink` may collapse a single call onto one URL.
 */
async function mockTrpc(page: Page, draft: Record<string, unknown>) {
  await page.route('**/api/trpc/**', async (route) => {
    const url = route.request().url();
    if (url.includes('memory.extractFromPaste')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(
          trpcBatchResponse([{ draft, existingConfirmed: null }]),
        ),
      });
      return;
    }
    if (url.includes('memory.confirmDraft')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(trpcBatchResponse([{ confirmed: true }])),
      });
      return;
    }
    if (url.includes('memory.getDraft')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(trpcBatchResponse([null])),
      });
      return;
    }
    await route.continue();
  });
}

function loadFixturePaste(): string {
  return readFileSync(FIXTURE_PATH, 'utf-8');
}

// ────────────────────────────────────────────────────────────────────────────
// Block 1 — Unauthed surface (portable, runs on every machine)
// ────────────────────────────────────────────────────────────────────────────

test.describe('Onboarding paste — unauthed proxy gate (Plan 02-02 / KNW-02b)', () => {
  test('/onboarding/import/paste unauthenticated → 307 → /sign-in', async ({
    request,
  }) => {
    // The proxy.ts session gate classifies `/onboarding/*` as session-only.
    // Without a session, the response is a 307 redirect to `/sign-in`. A
    // 404 here would mean the route is not wired; a 200 here would mean the
    // proxy is open. We assert the exact in-between behavior.
    const res = await request.get('/onboarding/import/paste', { maxRedirects: 0 });
    expect(res.status()).toBe(307);
    expect(res.headers().location ?? '').toMatch(/\/sign-in/);
  });

  test('/onboarding/import/paste is a real route (not a 404)', async ({
    request,
  }) => {
    const res = await request.get('/onboarding/import/paste', { maxRedirects: 0 });
    expect(res.status()).not.toBe(404);
    // 307 → confirms the proxy is doing its job, not that the route is missing.
    expect(res.status()).toBe(307);
  });

  test('/onboarding/import/paste session gate is NOT the subscription gate (→ /sign-in, not /reactivate)', async ({
    request,
  }) => {
    // Per `proxy.ts::classify`, `/onboarding/*` requires session but NOT an
    // active subscription (founders pick a tier inside onboarding). The
    // unauthed redirect MUST land on /sign-in and MUST NOT land on /reactivate.
    const res = await request.get('/onboarding/import/paste', { maxRedirects: 0 });
    const location = res.headers().location ?? '';
    expect(location).toMatch(/\/sign-in/);
    expect(location).not.toMatch(/\/reactivate/);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// Block 2 — Fixture corpus contract (portable, runs on every machine)
// ────────────────────────────────────────────────────────────────────────────

test.describe('Onboarding paste — fixture corpus contract (Plan 02-02 Task 2 + Task 10)', () => {
  test('paste-helix-saas.txt fits the 500–40,000 char extractor band', () => {
    const fixture = loadFixturePaste();
    expect(fixture.length).toBeGreaterThanOrEqual(500);
    expect(fixture.length).toBeLessThanOrEqual(40_000);
  });

  test('paste-helix-saas.txt contains zero hard-banned compliance phrases', () => {
    const fixture = loadFixturePaste().toLowerCase();
    for (const phrase of HARD_BANNED_PHRASES) {
      expect(
        fixture.includes(phrase.toLowerCase()),
        `Fixture must not contain hard-banned phrase: ${phrase}`,
      ).toBe(false);
    }
  });

  test('paste-helix-saas.txt contains no unguarded "investment advice" / "legal advice"', () => {
    // The check-banned scanner allows these phrases when preceded by a
    // negation within ~30 chars on the same logical line. The fixture is
    // a founder's first-person notes; for the e2e contract we hold the
    // stricter line: neither phrase should appear at all.
    const fixture = loadFixturePaste().toLowerCase();
    for (const phrase of NEGATION_REQUIRED_PHRASES) {
      expect(
        fixture.includes(phrase.toLowerCase()),
        `Fixture must not contain unguarded compliance phrase: ${phrase}`,
      ).toBe(false);
    }
  });

  test('mocked draft contract: ≥8 populated top-level fields + ≥3 source snippets', () => {
    // The plan's quality bar for the extractor (Task 4) is that every
    // fixture produces ≥8 populated fields with ≥3 provenance source
    // snippets. The mocked draft this e2e returns to the FE must clear the
    // same bar — the confirmation form's ≥8-cards assertion depends on it.
    const draft = buildMockDraft();
    let populated = 0;
    const topLevelScalars = [
      'companyName',
      'oneLiner',
      'sector',
      'stage',
      'geography',
      'incorporationStatus',
      'foundingDate',
    ] as const;
    for (const key of topLevelScalars) {
      if (draft[key]) populated++;
    }
    if (draft.team && Object.keys(draft.team).length > 0) populated++;
    if (draft.traction && Object.keys(draft.traction).length > 0) populated++;
    if (draft.narrative && Object.keys(draft.narrative).length > 0) populated++;
    expect(populated).toBeGreaterThanOrEqual(8);

    const provenanceWithSnippets = Object.values(draft.provenance).filter(
      (entry) => entry.source_snippet.trim().length > 0,
    ).length;
    expect(provenanceWithSnippets).toBeGreaterThanOrEqual(3);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// Block 3 — Authed happy path (skips when no test session is available)
// ────────────────────────────────────────────────────────────────────────────

test.describe('Onboarding paste — authed happy path (Plan 02-02 / KNW-02b Task 10)', () => {
  test.skip(
    !HAS_TEST_SESSION,
    'Requires PLAYWRIGHT_BASE_URL + real SUPABASE_SECRET_KEY + TEST_USER_EMAIL — ' +
      'matches the Phase-1 CI-only test-user-mint pattern from e2e/skeleton.spec.ts. ' +
      'When the orchestrator wires the Phase-2 test-user-mint helper, this block ' +
      'activates without spec changes.',
  );

  test('paste → confirm → done; ≥8 cards render with source affordances', async ({
    page,
  }) => {
    await mockTrpc(page, buildMockDraft());

    // The session-bootstrap step lives in the orchestrator's Phase-2 test-
    // user helper (mint a Supabase user via the admin API; sign in via the
    // service-role JWT; set the resulting `sb-*` cookies on the
    // BrowserContext). When that helper lands, replace this comment with
    // its invocation — the rest of this spec stays unchanged.

    await page.goto('/onboarding/import/paste');

    // ── State 1: paste ─────────────────────────────────────────────────
    await expect(
      page.getByTestId('paste-flow-step-paste'),
      'Expected the paste step shell to render',
    ).toBeVisible();
    const textarea = page.getByTestId('paste-flow-textarea');
    await expect(textarea).toBeVisible();
    await textarea.fill(loadFixturePaste());

    const submit = page.getByTestId('paste-flow-submit');
    await expect(submit).toBeEnabled();
    // Operator-voice copy from `src/app/(app)/onboarding/import/paste/paste-flow.tsx`.
    await expect(submit).toHaveText('Draft Business Memory');
    await submit.click();

    // ── State 2: drafting → State 3: confirming ────────────────────────
    await expect(page.getByTestId('paste-flow-step-confirming')).toBeVisible({
      timeout: 10_000,
    });
    await expect(page.getByTestId('confirmation-form')).toBeVisible();

    // ≥8 confirmation cards rendered — the plan's quality bar.
    const cards = page.getByTestId('confirmation-card');
    await expect(async () => {
      const count = await cards.count();
      expect(count).toBeGreaterThanOrEqual(8);
    }).toPass();

    // Source affordance on the first card reveals the verbatim snippet.
    const firstSourceTrigger = page
      .getByTestId('confirmation-card-source-trigger')
      .first();
    await firstSourceTrigger.click();
    const firstSnippet = page
      .getByTestId('confirmation-card-source-snippet')
      .first();
    await expect(firstSnippet).toBeVisible();
    await expect(firstSnippet).toContainText('Helix Compliance, Inc.');

    // ── Confirm every card so the submit gate unlatches ────────────────
    const cardCount = await cards.count();
    for (let i = 0; i < cardCount; i++) {
      const confirmButton = cards
        .nth(i)
        .getByRole('button', { name: /^Confirm/ });
      await confirmButton.click();
    }

    // ── Submit "Save and continue" ─────────────────────────────────────
    const formSubmit = page.getByTestId('confirmation-form-submit');
    await expect(formSubmit).toBeEnabled();
    await expect(formSubmit).toHaveText('Save and continue');
    await formSubmit.click();

    // ── State 4: done ──────────────────────────────────────────────────
    await expect(page.getByTestId('paste-flow-step-done')).toBeVisible();
    await expect(page.getByTestId('paste-flow-continue')).toHaveText(
      'Continue to deck upload',
    );
  });

  test('reload returns to paste state (Week-3 will escalate to reload-persists)', async ({
    page,
  }) => {
    await mockTrpc(page, buildMockDraft());

    // The currently-shipped page deliberately does NOT pre-fetch the
    // current draft (see header comment in
    // `src/app/(app)/onboarding/import/paste/page.tsx`). Reload-persistence
    // of the confirmed Business Memory is server-truth — proven by the
    // integration test `tests/integration/memory-paste-rls.test.ts` Task 9
    // — but the FE re-hydration is a Plan 02-03 / Week-3 deliverable.
    //
    // This test pins the CURRENT behavior: after a reload, the user lands
    // in the paste state again. When Plan 02-03 escalates the page to
    // fetch + hydrate the confirmed row on mount, flip this assertion to
    // verify the confirmation cards render in their confirmed state.

    await page.goto('/onboarding/import/paste');
    await expect(page.getByTestId('paste-flow-step-paste')).toBeVisible();

    // Quick paste + extract round-trip to reach the confirming state.
    await page.getByTestId('paste-flow-textarea').fill(loadFixturePaste());
    await page.getByTestId('paste-flow-submit').click();
    await expect(page.getByTestId('paste-flow-step-confirming')).toBeVisible({
      timeout: 10_000,
    });

    // Now reload.
    await page.reload();

    // CURRENT behavior assertion (Week-2). TODO(plan-02-03): replace with
    // an assertion that the confirmation cards render in confirmed state.
    await expect(page.getByTestId('paste-flow-step-paste')).toBeVisible();
  });

  test('rendered DOM contains zero hard-banned compliance phrases', async ({
    page,
  }) => {
    await mockTrpc(page, buildMockDraft());

    await page.goto('/onboarding/import/paste');
    await page.getByTestId('paste-flow-textarea').fill(loadFixturePaste());
    await page.getByTestId('paste-flow-submit').click();
    await expect(page.getByTestId('paste-flow-step-confirming')).toBeVisible({
      timeout: 10_000,
    });

    // The confirming state is the largest surface this flow renders.
    // Sweep the full body text for any hard-banned compliance phrase.
    // `tasks/banned-strings.txt` lists the canonical set; this spec mirrors
    // the hard-ban subset (the two negation-allowed phrases are also
    // checked strictly here — the paste-flow UI has no business mentioning
    // either, ever).
    const body = (await page.locator('body').innerText()).toLowerCase();
    for (const phrase of [...HARD_BANNED_PHRASES, ...NEGATION_REQUIRED_PHRASES]) {
      expect(
        body.includes(phrase.toLowerCase()),
        `Rendered DOM must not contain banned phrase: ${phrase}`,
      ).toBe(false);
    }

    // Emoji ban: the BRAND.md voice rule forbids emoji in product copy.
    // Scan the rendered body for the common emoji ranges. A match means
    // someone slipped an emoji into a component string.
    const emojiRegex =
      /[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/u;
    expect(
      emojiRegex.test(body),
      'Rendered DOM must not contain emoji (BRAND.md operator-voice rule)',
    ).toBe(false);
  });

  test('first confirmation card supports keyboard a11y (Tab order + role region)', async ({
    page,
  }) => {
    await mockTrpc(page, buildMockDraft());

    await page.goto('/onboarding/import/paste');
    await page.getByTestId('paste-flow-textarea').fill(loadFixturePaste());
    await page.getByTestId('paste-flow-submit').click();
    await expect(page.getByTestId('paste-flow-step-confirming')).toBeVisible({
      timeout: 10_000,
    });

    // The plan's a11y bar (operator-grade) lives at the card boundary. The
    // first ConfirmationCard renders with `role="region"` + an
    // `aria-label` matching its field label — a screen reader user
    // navigating by region jumps directly to it.
    const firstCard = page.getByTestId('confirmation-card').first();
    await expect(firstCard).toHaveAttribute('role', 'region');
    const ariaLabel = await firstCard.getAttribute('aria-label');
    expect(ariaLabel ?? '').not.toBe('');

    // Tab from the form root reaches an action button inside the first
    // card. We do not assert every step of the Tab order (that's brittle
    // across browsers); we assert that tab navigation eventually focuses a
    // button inside the first card, which is the operator-grade bar.
    const formRegion = firstCard;
    await formRegion.focus();
    // Step through a small number of Tabs and assert that at least one
    // focus stop lands on a button inside the first card.
    let buttonFocused = false;
    for (let i = 0; i < 6; i++) {
      await page.keyboard.press('Tab');
      const focusedInsideCard = await firstCard.evaluate((node) => {
        const active = document.activeElement;
        return (
          active !== null &&
          active.tagName === 'BUTTON' &&
          node.contains(active)
        );
      });
      if (focusedInsideCard) {
        buttonFocused = true;
        break;
      }
    }
    expect(
      buttonFocused,
      'Tab from the first card should focus at least one action button inside it',
    ).toBe(true);
  });
});
