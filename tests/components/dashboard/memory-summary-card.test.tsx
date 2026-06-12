// @vitest-environment jsdom
/**
 * `<MemorySummaryCard/>` tests (fix/ui-bundle / C3).
 *
 * The confirmed-memory dashboard state: it links into the memory workspace and
 * must NOT render the EmptyDashboard "Start Business Memory" onboarding CTA.
 */
import '@testing-library/jest-dom/vitest';
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';

import { MemorySummaryCard } from '@/components/dashboard/memory-summary-card';

afterEach(cleanup);

describe('MemorySummaryCard', () => {
  it('links to the memory workspace and omits the start-onboarding CTA copy', () => {
    render(<MemorySummaryCard companyName="ClockPay" />);
    // Base UI Buttons rendered as <Link> expose role="button" (nativeButton
    // ={false}, the prescribed non-<button> path — design-adoption A9); the
    // navigation contract is asserted via the href.
    const link = screen.getByRole('button', { name: /view workspace/i });
    expect(link.getAttribute('href')).toBe('/app/memory');
    // The confirmed state replaces — never duplicates — the empty-state CTA.
    expect(screen.queryByText(/start business memory/i)).toBeNull();
  });

  it('shows the company name when present and falls back to a plain heading when absent', () => {
    const { rerender } = render(<MemorySummaryCard companyName="ClockPay" />);
    expect(screen.getByText(/ClockPay/)).toBeInTheDocument();

    rerender(<MemorySummaryCard companyName={null} />);
    expect(screen.getByRole('heading', { name: 'Business Memory' })).toBeInTheDocument();
  });

  it('uses operator voice — no banned help/want/feel/love verbs', () => {
    const { container } = render(<MemorySummaryCard companyName="ClockPay" />);
    const text = container.textContent ?? '';
    expect(text).not.toMatch(/\bhelps?\b/i);
    expect(text).not.toMatch(/\bwants?\b/i);
    expect(text).not.toMatch(/\bfeels?\b/i);
    expect(text).not.toMatch(/\bloves?\b/i);
  });
});
