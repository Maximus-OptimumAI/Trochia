// @vitest-environment jsdom
/**
 * `<ConfirmationForm/>` — UI↔mutation seam regression guard (BLOCKER-1).
 *
 * The prod smoke test surfaced "Save and continue" as a SILENT no-op: the form's
 * resolver validated the WRAPPED form value `{ payload: ... }` against the
 * UNWRAPPED `businessMemoryConfirmedSchema`, so it always failed on the two
 * required top-level keys (`provenance`, `confirmedAt`); `form.handleSubmit`
 * (no `onInvalid`) then swallowed the failure → `onSubmit`/`confirmDraft` never
 * fired → no `memory.confirmed` → no embed. `errorCount` (rendered-cards-only)
 * left the failure invisible. The two `as never` casts hid the shape error.
 *
 * This file locks the contract:
 *   1. (pure) the BARE schema REJECTS the wrapped `{ payload }` value (the bug),
 *      the WRAPPED schema ACCEPTS it (the fix), and `buildPayload`'s unwrapped
 *      data is VALID against the schema (data was never the problem).
 *   2. (seam) rendering the real form, confirming every card, and clicking
 *      "Save and continue" calls `onSubmit` exactly once with a payload that
 *      passes `businessMemoryConfirmedSchema`. RED before the resolver fix
 *      (onSubmit never fires); GREEN after.
 *
 * No tRPC/network here — `ConfirmationForm` is pure (takes `onSubmit`); this is
 * the cheap unit guard that would have caught BLOCKER-1. The authed Playwright
 * paste→confirm→save E2E is the durable guard (fast-follow; needs the
 * test-user-mint helper, deferred from P4.5).
 */
import '@testing-library/jest-dom/vitest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { z } from 'zod';

import {
  businessMemoryConfirmedSchema,
  type BusinessMemoryConfirmed,
  type BusinessMemoryDraft,
} from '@/ai/schemas/business-memory.zod';
import { ConfirmationForm } from '@/components/memory/confirmation-form';

const ISO = '2024-09-01T00:00:00.000Z';

function prov(snippet: string) {
  return {
    source_snippet: snippet,
    confidence: 0.9,
    extracted_at: ISO,
    last_updated: ISO,
    snooze_until: null,
  };
}

/** A representative 7-scalar draft with valid provenance for each field. */
function clockpayDraft(): BusinessMemoryDraft {
  return {
    companyName: 'ClockPay',
    oneLiner: 'Payroll timing automation for SMB finance teams',
    sector: 'Fintech B2B',
    stage: 'Pre-seed',
    geography: 'United States',
    incorporationStatus: 'Delaware C-Corp',
    foundingDate: ISO,
    provenance: {
      companyName: prov('ClockPay automates payroll timing.'),
      oneLiner: prov('We automate payroll timing for SMB finance teams.'),
      sector: prov('A B2B fintech company.'),
      stage: prov('Currently pre-seed.'),
      geography: prov('US-based, Delaware incorporated.'),
      incorporationStatus: prov('Delaware C-Corp.'),
      foundingDate: prov('Founded September 2024.'),
    },
  };
}

afterEach(() => cleanup());

describe('ConfirmationForm — resolver shape contract (BLOCKER-1, pure)', () => {
  it('the BARE schema REJECTS the wrapped {payload} value (this was the bug)', () => {
    const wrapped = { payload: { ...clockpayDraft(), confirmedAt: ISO } };
    // businessMemoryConfirmedSchema expects provenance + confirmedAt at the TOP
    // level; against `{ payload }` both are missing → fail. This is exactly what
    // the old `zodResolver(businessMemoryConfirmedSchema.transform(...))` did.
    expect(businessMemoryConfirmedSchema.safeParse(wrapped).success).toBe(false);
  });

  it('the WRAPPED schema ACCEPTS the wrapped {payload} value (this is the fix)', () => {
    const wrapped = { payload: { ...clockpayDraft(), confirmedAt: ISO } };
    expect(z.object({ payload: businessMemoryConfirmedSchema }).safeParse(wrapped).success).toBe(true);
  });

  it("buildPayload's unwrapped data is VALID against the schema (data was never the problem)", () => {
    const payload = { ...clockpayDraft(), confirmedAt: ISO };
    expect(businessMemoryConfirmedSchema.safeParse(payload).success).toBe(true);
  });
});

describe('ConfirmationForm — UI↔mutation seam (BLOCKER-1, RED before the resolver fix)', () => {
  it('confirm every field → Save and continue → onSubmit fires once with a schema-valid payload', async () => {
    const onSubmit = vi.fn<(c: BusinessMemoryConfirmed) => void>();
    render(<ConfirmationForm initialDraft={clockpayDraft()} onSubmit={onSubmit} />);

    // Confirm every card. Each card's Confirm button has accessible name
    // "Confirm <fieldLabel>"; after a click the card flips to confirmed and the
    // button is replaced by an Undo affordance, so re-query until none remain.
    for (let guard = 0; guard < 50; guard++) {
      const confirmButtons = screen.queryAllByRole('button', { name: /^Confirm / });
      if (confirmButtons.length === 0) break;
      fireEvent.click(confirmButtons[0]);
    }
    expect(screen.queryAllByRole('button', { name: /^Confirm / })).toHaveLength(0);

    // Submit. With the BROKEN resolver, validation fails on the wrapped shape,
    // `onInvalid` fires (form-level error), and onSubmit is never called → RED.
    // With the FIX, validation passes → onSubmit fires once with the assembled
    // BusinessMemoryConfirmed. Dispatch on the form element (jsdom does not
    // reliably perform the implicit submit from a button click).
    expect(screen.getByTestId('confirmation-form-submit')).not.toBeDisabled();
    fireEvent.submit(screen.getByTestId('confirmation-form'));

    // rhf validation is async; a heavy 7-card form in jsdom is slow — allow margin.
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1), { timeout: 8000 });
    // The never-silent guard must NOT have tripped on a valid submit.
    expect(screen.queryByTestId('confirmation-form-form-error')).not.toBeInTheDocument();

    const payload = onSubmit.mock.calls[0][0];
    expect(businessMemoryConfirmedSchema.safeParse(payload).success).toBe(true);
  }, 20000);

  it('an invalid payload surfaces the form-level error and never calls onSubmit (never silent)', async () => {
    const onSubmit = vi.fn<(c: BusinessMemoryConfirmed) => void>();
    const bad = clockpayDraft();
    bad.oneLiner = 'x'.repeat(200); // exceeds businessMemoryConfirmedSchema oneLiner.max(140)
    render(<ConfirmationForm initialDraft={bad} onSubmit={onSubmit} />);

    for (let guard = 0; guard < 50; guard++) {
      const confirmButtons = screen.queryAllByRole('button', { name: /^Confirm / });
      if (confirmButtons.length === 0) break;
      fireEvent.click(confirmButtons[0]);
    }
    fireEvent.submit(screen.getByTestId('confirmation-form'));

    await waitFor(
      () => expect(screen.getByTestId('confirmation-form-form-error')).toBeInTheDocument(),
      { timeout: 8000 },
    );
    expect(onSubmit).not.toHaveBeenCalled();
  }, 20000);
});
