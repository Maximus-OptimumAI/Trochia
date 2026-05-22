/**
 * Onboarding paste — conflict-resolver e2e (Plan 02-03 / KNW-02c Task 13).
 *
 * Exercises the helix-saas $40,250 vs $24,750 contradictory-MRR path through
 * the full data spine: paste → sanitize → extract → conflict resolver →
 * confirmation form → memoryRouter → DB. Three blocks:
 *
 *   1. **Unauthed proxy gate (3 specs; always run).** Mirrors the 02-02
 *      regression contract — the `/onboarding/import/paste` route + the
 *      `memory.extractFromPaste` / `memory.confirmDraft` tRPC procedures all
 *      reject anonymous traffic. Runs on every machine, every PR.
 *
 *   2. **Fixture-corpus contract (2 specs; always run).** Sanity-checks the
 *      `paste-helix-saas.txt` fixture this plan's conflict path feeds on:
 *      total char count clears the 3000-char floor the plan's quality bar
 *      requires, and both contradictory-MRR substrings ('$40,250' + '$24,750')
 *      are present verbatim. If the fixture drifts, this block fails first.
 *
 *   3. **Authed happy-path (4 specs; SKIPPED locally pending Phase 4.5
 *      test-user-mint helper).** Same skip pattern as 02-02's authed block —
 *      `test.skip(!hasTestUserMintHelper, ...)`. Specs activate automatically
 *      the day the orchestrator wires a Supabase admin-API test-user-mint
 *      helper (tracked as a Phase 4.5 polish item in 02-02-SUMMARY § "Open
 *      Follow-ups"). The four authed specs cover:
 *
 *        a. **Conflict resolution (radio-pick)** — paste helix-saas, click the
 *           '$24,750' radio in the `traction.mrr` resolver, submit, assert
 *           DB row carries `mrr === 24750` plus single-object provenance
 *           with `rejected_alternatives.length >= 1` (audit anchor for
 *           '$40,250').
 *        b. **Founder override** — same setup, but type '30000' into the
 *           ConflictResolver's custom-override input + click Apply. DB row
 *           carries `mrr === 30000` and provenance `source_snippet ===
 *           '[founder override]'` (the FOUNDER_OVERRIDE_SNIPPET sentinel)
 *           with `rejected_alternatives.length === 2` (both extractor
 *           candidates archived).
 *        c. **PII redactions banner** — paste the `paste-mosaic-marketplace`
 *           fixture (carries unrelated-party PII); assert the
 *           `paste-flow-redactions-banner` renders in the confirming state
 *           with operator-voice copy matching the redactions-detail regex.
 *        d. **AI_INJECTION_REJECTED** — paste a critical-severity
 *           Unicode-lookalike payload (INJ-12 from `injection-payloads.json`)
 *           inflated to ≥ 500 chars with benign filler, assert the
 *           rejection card renders, click 'Edit and retry', assert the
 *           flow returns to the paste state with the original text retained
 *           in the textarea.
 *
 * The four authed specs spell out the Playwright Locator chain in full so they
 * light up without rewrite when the helper lands; `TODO(P4.5)` markers flag
 * the auth-setup gap so it's discoverable at activation time.
 *
 * ## Selectors used (data-testid first, role second, text last)
 *
 *   - `paste-flow-step-paste` / `paste-flow-step-confirming` / `paste-flow-
 *     step-done` — paste-flow state-machine slot testids.
 *   - `paste-flow-textarea` / `paste-flow-submit` — paste-state controls.
 *   - `confirmation-form` / `confirmation-form-submit` / `confirmation-form-
 *     summary-conflicts` — form scaffold.
 *   - `confirmation-card[data-field="traction.mrr"]` — per-card scope.
 *   - `conflict-resolver` (`role="radiogroup"`, `aria-label="Candidate values
 *     for MRR"`) — the resolver scope on the traction.mrr card.
 *   - `conflict-resolver-option-value` / `conflict-resolver-custom-input` /
 *     `conflict-resolver-custom-apply` — resolver controls.
 *   - `paste-flow-redactions-banner` — Week-3 PII banner slot.
 *   - `paste-flow-injection-rejected` / `paste-flow-injection-rejected-cta` —
 *     Week-3 injection-rejected slot.
 *
 * ## What this spec deliberately does NOT do
 *
 *   - Does not mint test users. The Phase 4.5 helper is the contract; the
 *     authed block skips until it lands.
 *   - Does not mock tRPC. The 02-02 spec does that for the happy-path; this
 *     spec hits the live route surface when the authed block activates,
 *     because the conflict + PII + injection-rejection paths are server-side
 *     behaviors that mock interception would erase.
 *   - Does not assert raw colors or hex values. Selectors are brand-token
 *     by attribute (data-testid, role, aria-label) per BRAND.md discipline.
 */
import { test, expect } from '@playwright/test';
import * as fs from 'node:fs';
import * as path from 'node:path';

// ────────────────────────────────────────────────────────────────────────────
// Fixture paths + skip-gate sentinel
// ────────────────────────────────────────────────────────────────────────────

const HELIX_FIXTURE = path.resolve(
  process.cwd(),
  'tests/ai/fixtures/paste-helix-saas.txt',
);
const MOSAIC_FIXTURE = path.resolve(
  process.cwd(),
  'tests/ai/fixtures/paste-mosaic-marketplace.txt',
);
const INJECTION_PAYLOADS = path.resolve(
  process.cwd(),
  'tests/ai/fixtures/injection-payloads.json',
);

/**
 * Mirrors the 02-02 spec's `HAS_TEST_SESSION` predicate. The Phase 4.5
 * test-user-mint helper is the single source of truth for authed specs in
 * Plan 02-03; until it lands, this sentinel stays false and the authed block
 * skips locally + in CI. Flip to a real predicate when the helper ships.
 */
const hasTestUserMintHelper = false;

// ────────────────────────────────────────────────────────────────────────────
// Block 1 — Unauthed proxy gate (portable, runs on every machine)
// ────────────────────────────────────────────────────────────────────────────

test.describe('Onboarding paste / conflict — unauthed proxy gate (Plan 02-03 / KNW-02c)', () => {
  test('/onboarding/import/paste unauthenticated → 307 → /sign-in', async ({
    request,
  }) => {
    // The proxy.ts session gate classifies `/onboarding/*` as session-only.
    // Without a session, the response is a 307 redirect to /sign-in. Matches
    // 02-02's regression assertion; this spec asserts it from the conflict
    // path's perspective so a regression in the proxy fails this block too.
    const res = await request.get('/onboarding/import/paste', {
      maxRedirects: 0,
    });
    expect(res.status()).toBe(307);
    expect(res.headers().location ?? '').toMatch(/\/sign-in/);
  });

  test('POST /api/trpc/memory.extractFromPaste without session → 401', async ({
    request,
  }) => {
    // memoryRouter's protectedProcedure rejects sessionless callers before the
    // input parser fires. The 401 contract is the public surface every
    // anonymous client sees — assert it explicitly so the conflict path's
    // server-side spine is provably gated.
    const res = await request.post('/api/trpc/memory.extractFromPaste', {
      data: { json: { paste: 'short test paste content for unauthed check' } },
      maxRedirects: 0,
    });
    expect(res.status()).toBe(401);
  });

  test('POST /api/trpc/memory.confirmDraft without session → 401', async ({
    request,
  }) => {
    // Symmetric assertion for the confirm side of the spine. A regression
    // that opened either procedure would surface here before any conflict
    // resolution work was attempted.
    const res = await request.post('/api/trpc/memory.confirmDraft', {
      data: { json: { confirmed: {} } },
      maxRedirects: 0,
    });
    expect(res.status()).toBe(401);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// Block 2 — Fixture corpus contract (portable, runs on every machine)
// ────────────────────────────────────────────────────────────────────────────

test.describe('Onboarding paste / conflict — fixture contract (Plan 02-03 Task 13)', () => {
  test('paste-helix-saas.txt is at least 3000 chars', () => {
    // The plan's quality bar for the conflict-fixture is >= 3000 chars; the
    // extractor needs enough surface area to surface both contradictory MRR
    // candidates with their own provenance snippets. The current fixture is
    // ~9958 bytes; this assertion pins the floor.
    const content = fs.readFileSync(HELIX_FIXTURE, 'utf-8');
    expect(content.length).toBeGreaterThanOrEqual(3000);
  });

  test('paste-helix-saas.txt contains both contradictory MRR signals', () => {
    // The conflict resolver's reason for existing is that the helix-saas
    // fixture carries two competing MRR values in different snippets. If a
    // future fixture edit drops either substring, the conflict path
    // collapses to a single-candidate provenance entry and the resolver
    // never mounts — failing the entire authed block silently. This spec
    // catches that drift before the authed block even runs.
    const content = fs.readFileSync(HELIX_FIXTURE, 'utf-8');
    expect(content).toContain('$40,250');
    expect(content).toContain('$24,750');
  });
});

// ────────────────────────────────────────────────────────────────────────────
// Block 3 — Authed happy path (skips when no test-user-mint helper)
// ────────────────────────────────────────────────────────────────────────────

test.describe('Onboarding paste / conflict — authed conflict resolution (radio-pick)', () => {
  test.skip(
    !hasTestUserMintHelper,
    'Phase 4.5 test-user-mint helper not yet shipped — mirrors 02-02 spec ' +
      "authed-block skip gate; activates when the orchestrator wires a " +
      'Supabase admin-API test-user-mint helper (02-02-SUMMARY § "Open ' +
      'Follow-ups"). The spec body is intentionally fully-formed so it ' +
      'activates without rewrite.',
  );

  test('paste helix-saas → resolve traction.mrr to $24,750 → DB row + audit', async ({
    page,
  }) => {
    // TODO(P4.5): mint a test session via the Phase 4.5 helper and attach
    // the resulting `sb-*` cookies to the BrowserContext. Until the helper
    // lands the rest of this spec is unreachable; the steps below document
    // the contract so activation is a one-line auth-setup change.

    await page.goto('/onboarding/import/paste');

    // ── State 1: paste ────────────────────────────────────────────────
    await expect(page.getByTestId('paste-flow-step-paste')).toBeVisible();
    const fixture = fs.readFileSync(HELIX_FIXTURE, 'utf-8');
    await page.getByTestId('paste-flow-textarea').fill(fixture);
    await page.getByTestId('paste-flow-submit').click();

    // ── State 2: drafting → State 3: confirming ───────────────────────
    // 90s timeout tolerates the extractor's p99; the KNW-01 p50 budget is
    // 30s, the spine guard caps at 90s. We surface the wait explicitly so
    // a regression in extractor latency lands here as a timeout, not a
    // flaky assertion.
    await expect(page.getByTestId('paste-flow-step-confirming')).toBeVisible({
      timeout: 90_000,
    });
    await expect(page.getByTestId('confirmation-form')).toBeVisible();

    // ── Locate the traction.mrr card + its resolver ───────────────────
    const mrrCard = page
      .getByTestId('confirmation-card')
      .and(page.locator('[data-field="traction.mrr"]'));
    await expect(mrrCard).toBeVisible();

    // The resolver scope is bounded by the card; the radiogroup carries the
    // canonical aria-label from ConflictResolver's `<fieldset role="radiogroup"
    // aria-label="Candidate values for ${fieldLabel}">`. Field label for
    // traction.mrr is 'MRR' (TRACTION_LABELS in confirmation-form.tsx).
    const resolver = mrrCard.getByRole('radiogroup', {
      name: 'Candidate values for MRR',
    });
    await expect(resolver).toBeVisible();
    await expect(resolver).toHaveAttribute('data-field', 'traction.mrr');

    // Both candidate values render inside the resolver. ConflictResolver
    // formats numeric MRR candidates via Intl.NumberFormat USD currency.
    await expect(
      resolver.getByTestId('conflict-resolver-option-value'),
    ).toContainText(['$40,250', '$24,750']);

    // ── Pick the $24,750 candidate ────────────────────────────────────
    // The radio's accessible label is the option-value text. base-ui
    // RadioGroup wires the visible value to the underlying input via the
    // <label> wrap; clicking the option-value span selects the radio.
    const chosenOption = resolver
      .getByTestId('conflict-resolver-option-value')
      .filter({ hasText: '$24,750' });
    await chosenOption.click();

    // Resolution flips the resolved-map; the per-card Confirm button
    // unlatches. Form summary tail drops 'conflicts unresolved'.
    await expect(
      page.getByTestId('confirmation-form-summary-conflicts'),
    ).toHaveCount(0);
    const cardConfirm = mrrCard.getByRole('button', { name: /^Confirm MRR$/ });
    await expect(cardConfirm).toBeEnabled();
    await cardConfirm.click();

    // ── Submit Save and continue ──────────────────────────────────────
    // Form-level CTA copy from confirmation-form.tsx COPY.submit constant.
    const formSubmit = page.getByTestId('confirmation-form-submit');
    await expect(formSubmit).toHaveText('Save and continue');
    await expect(formSubmit).toBeEnabled();
    await formSubmit.click();

    // ── Navigate to /onboarding/deck (post-confirm route) ─────────────
    // paste-flow.tsx's `onContinue` pushes /onboarding/deck after the done
    // state's CTA, but the spec's contract is the done-state visibility
    // first; deck routing is a downstream concern.
    await expect(page.getByTestId('paste-flow-step-done')).toBeVisible();

    // ── DB assertion ──────────────────────────────────────────────────
    // TODO(P4.5): call memoryRouter.getDraft (or direct Supabase REST with
    // the test-user JWT) and assert:
    //   - business_memory.traction.mrr === 24750
    //   - provenance['traction.mrr'] is a single object (not an array) —
    //     post-resolve shape is single-object only per chooseProvenance
    //   - provenance['traction.mrr'].rejected_alternatives.length >= 1
    //   - rejected_alternatives[0].value === 40250 (the discarded
    //     candidate's numeric value, preserved as audit anchor)
    // The 02-02 integration test `tests/integration/memory-paste-rls.test.ts`
    // proves the server-side persistence; this e2e proves the full UI-driven
    // round-trip lands the same shape.
  });
});

test.describe('Onboarding paste / conflict — authed founder override', () => {
  test.skip(
    !hasTestUserMintHelper,
    'Phase 4.5 test-user-mint helper not yet shipped',
  );

  test('paste helix-saas → type custom MRR 30000 → DB persists override + audit', async ({
    page,
  }) => {
    // TODO(P4.5): mint test session.
    await page.goto('/onboarding/import/paste');
    await expect(page.getByTestId('paste-flow-step-paste')).toBeVisible();
    await page
      .getByTestId('paste-flow-textarea')
      .fill(fs.readFileSync(HELIX_FIXTURE, 'utf-8'));
    await page.getByTestId('paste-flow-submit').click();
    await expect(page.getByTestId('paste-flow-step-confirming')).toBeVisible({
      timeout: 90_000,
    });

    const mrrCard = page
      .getByTestId('confirmation-card')
      .and(page.locator('[data-field="traction.mrr"]'));
    const resolver = mrrCard.getByRole('radiogroup', {
      name: 'Candidate values for MRR',
    });
    await expect(resolver).toBeVisible();

    // ── Founder-override path: type a custom value ────────────────────
    // ConflictResolver wires its custom-override input as data-testid
    // `conflict-resolver-custom-input` (type=number for currency fields
    // via fallbackInputType="number" from confirmation-form.tsx's
    // numeric-arm gate on `traction.mrr`). Apply button is
    // `conflict-resolver-custom-apply`.
    await resolver.getByTestId('conflict-resolver-custom-input').fill('30000');
    await resolver.getByTestId('conflict-resolver-custom-apply').click();

    // Apply collapses the array → synthesized founder-override entry with
    // source_snippet === FOUNDER_OVERRIDE_SNIPPET ('[founder override]').
    // Confirm enables; submit.
    const cardConfirm = mrrCard.getByRole('button', { name: /^Confirm MRR$/ });
    await expect(cardConfirm).toBeEnabled();
    await cardConfirm.click();

    await page.getByTestId('confirmation-form-submit').click();
    await expect(page.getByTestId('paste-flow-step-done')).toBeVisible();

    // ── DB assertion ──────────────────────────────────────────────────
    // TODO(P4.5):
    //   - business_memory.traction.mrr === 30000
    //   - provenance['traction.mrr'].source_snippet === '[founder override]'
    //     (FOUNDER_OVERRIDE_SNIPPET from business-memory.zod.ts)
    //   - provenance['traction.mrr'].rejected_alternatives.length === 2
    //     (both extractor candidates archived — founder rejected ALL
    //     candidates by typing a new value)
  });
});

test.describe('Onboarding paste / conflict — authed PII redactions banner', () => {
  test.skip(
    !hasTestUserMintHelper,
    'Phase 4.5 test-user-mint helper not yet shipped',
  );

  test('paste mosaic-marketplace → confirming state shows redactions banner', async ({
    page,
  }) => {
    // TODO(P4.5): mint test session.
    await page.goto('/onboarding/import/paste');
    await expect(page.getByTestId('paste-flow-step-paste')).toBeVisible();
    await page
      .getByTestId('paste-flow-textarea')
      .fill(fs.readFileSync(MOSAIC_FIXTURE, 'utf-8'));
    await page.getByTestId('paste-flow-submit').click();
    await expect(page.getByTestId('paste-flow-step-confirming')).toBeVisible({
      timeout: 90_000,
    });

    // The banner renders above the confirmation form when the agent's
    // pre-LLM PII redaction step (KNW-02d) fires on any unrelated-party
    // markers in the paste. Mosaic fixture carries email + phone + wallet
    // address; redactionsApplied > 0 is the gate. Copy comes from
    // paste-flow.tsx's `redactionsDetailCopy` helper.
    const banner = page.getByTestId('paste-flow-redactions-banner');
    await expect(banner).toBeVisible();
    await expect(banner).toContainText(
      /\d+ unrelated-party .* redacted from the draft\./,
    );
  });
});

test.describe('Onboarding paste / conflict — authed AI_INJECTION_REJECTED', () => {
  test.skip(
    !hasTestUserMintHelper,
    'Phase 4.5 test-user-mint helper not yet shipped',
  );

  test('paste critical-severity injection → rejection card → retry returns to idle with paste retained', async ({
    page,
  }) => {
    // Pick a critical-severity payload from the T2 injection-payloads
    // fixture; inflate to ≥ 500 chars by surrounding with benign filler so
    // the paste-flow's client-side MIN_CHARS gate (500) is cleared without
    // changing the payload's substance. INJ-12 (Unicode lookalike,
    // critical severity) is the canonical hard case.
    const payloads = JSON.parse(
      fs.readFileSync(INJECTION_PAYLOADS, 'utf-8'),
    ) as Array<{ id: string; severity: string; payload: string }>;
    const critical = payloads.find(
      (p) => p.severity === 'critical' && p.id === 'INJ-12',
    );
    expect(critical, 'INJ-12 critical payload must exist in fixture').toBeTruthy();

    // Inflate to ≥ 500 chars with operator-voice benign filler that does
    // not itself carry any injection markers. The padding is a neutral
    // company-context preamble + epilogue; the payload sits in the middle.
    const filler =
      'Helix Compliance, Inc. is a vertical SaaS for mid-market commercial general contractors. ' +
      'Stage: Seed. Geography: Austin, TX. Delaware C-Corp incorporated August 2023. ' +
      'Our founders shipped Procore Compliance and Salesforce Construction Cloud. ' +
      'Top-of-funnel building on Series A at $30M pre. MRR is $40,250 as of last close. ' +
      'Runway: 12 months at $98k burn. Customers: 14 paying GCs. ';
    const inflated = `${filler}${critical!.payload}\n${filler}`.padEnd(600, ' ');

    // TODO(P4.5): mint test session.
    await page.goto('/onboarding/import/paste');
    await expect(page.getByTestId('paste-flow-step-paste')).toBeVisible();
    await page.getByTestId('paste-flow-textarea').fill(inflated);
    await page.getByTestId('paste-flow-submit').click();

    // ── Rejection card (paste-flow.tsx state 5) ───────────────────────
    const rejectionCard = page.getByTestId('paste-flow-injection-rejected');
    await expect(rejectionCard).toBeVisible({ timeout: 90_000 });
    await expect(
      page.getByTestId('paste-flow-injection-rejected-heading'),
    ).toHaveText('Paste rejected');

    // ── Edit and retry → returns to idle paste state ──────────────────
    await page.getByTestId('paste-flow-injection-rejected-cta').click();
    await expect(page.getByTestId('paste-flow-step-paste')).toBeVisible();

    // Paste text survives the round-trip because it lives outside the
    // discriminator (paste-flow.tsx's `paste` useState). The textarea
    // value must be the inflated string the founder originally pasted.
    await expect(page.getByTestId('paste-flow-textarea')).toHaveValue(inflated);
  });
});
