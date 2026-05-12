// @vitest-environment jsdom
/**
 * Cross-cutting UI primitive tests — the copywriting-contract invariants that
 * Code Reviewer would otherwise have to catch by eye:
 *   - FounderApprovalDialog: primary action is the noun-bearing "Send {thing}",
 *     never a bare "Send"; dismiss is "Keep editing", never a bare "Cancel".
 *   - DestructiveConfirmDialog: confirm stays disabled until the typed
 *     confirmation matches.
 *   - LegalDisclaimerBanner: renders the canonical "not a law firm … does not
 *     provide legal advice" copy.
 */
import '@testing-library/jest-dom/vitest';
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';

import { FounderApprovalDialog } from '@/components/primitives/founder-approval-dialog';
import { DestructiveConfirmDialog } from '@/components/primitives/destructive-confirm-dialog';
import { LegalDisclaimerBanner } from '@/components/primitives/legal-disclaimer-banner';

afterEach(cleanup);

describe('FounderApprovalDialog', () => {
  it('renders the noun-bearing "Send outreach" primary, never a bare "Send", never a bare "Cancel"', () => {
    render(
      <FounderApprovalDialog
        thing="outreach"
        recipient="Jane Partner — Acme Ventures"
        contentPreview="Hi Jane, …"
        onSend={vi.fn()}
        onKeepEditing={vi.fn()}
        open
        onOpenChange={vi.fn()}
      />
    );

    expect(screen.getByRole('button', { name: 'Send outreach' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Keep editing' })).toBeInTheDocument();
    // exact-text "Send" / "Cancel" buttons must NOT exist
    expect(screen.queryByRole('button', { name: 'Send' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Cancel' })).toBeNull();
    // the recipient shows in the read-only preview
    expect(screen.getByText('Jane Partner — Acme Ventures')).toBeInTheDocument();
  });

  it('resolves a different noun, e.g. "Send follow-up"', () => {
    render(
      <FounderApprovalDialog
        thing="follow-up"
        recipient="x"
        contentPreview="y"
        onSend={vi.fn()}
        onKeepEditing={vi.fn()}
        open
        onOpenChange={vi.fn()}
      />
    );
    expect(screen.getByRole('button', { name: 'Send follow-up' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Send' })).toBeNull();
  });
});

describe('DestructiveConfirmDialog', () => {
  it('keeps the confirm button disabled until the typed confirmation matches; dismiss is "Keep my account"', () => {
    render(
      <DestructiveConfirmDialog
        title="Delete your account?"
        body="This soft-deletes your account now and permanently purges all your data after 30 days."
        confirmVerbNoun="Delete account"
        dismissKeepNoun="Keep my account"
        requireTypedConfirmation="DELETE"
        onConfirm={vi.fn()}
        onDismiss={vi.fn()}
        open
        onOpenChange={vi.fn()}
      />
    );

    const confirm = screen.getByRole('button', { name: 'Delete account' });
    expect(confirm).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Keep my account' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Cancel' })).toBeNull();

    const input = screen.getByLabelText('Type DELETE to confirm');
    fireEvent.change(input, { target: { value: 'DELE' } });
    expect(confirm).toBeDisabled();
    fireEvent.change(input, { target: { value: 'DELETE' } });
    expect(confirm).not.toBeDisabled();
  });
});

describe('LegalDisclaimerBanner', () => {
  it('renders the canonical not-legal-advice copy', () => {
    render(<LegalDisclaimerBanner variant="not-legal-advice" />);
    const note = screen.getByRole('note');
    expect(note).toHaveTextContent('is not a law firm');
    expect(note).toHaveTextContent('does not provide legal advice');
  });

  it('renders the affiliate variant', () => {
    render(<LegalDisclaimerBanner variant="affiliate" />);
    expect(screen.getByRole('note')).toHaveTextContent('referral fee');
  });
});
