// @vitest-environment jsdom
/**
 * `<Sidebar/>` component tests (fix/ui-bundle).
 *
 * The sidebar only ever renders inside the `(app)` route group (proxy-gated,
 * always authenticated), so the logo target is unconditional — no session probe.
 */
import '@testing-library/jest-dom/vitest';
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';

import { Sidebar } from '@/components/shell/sidebar';

afterEach(cleanup);

describe('Sidebar', () => {
  it('C1: the brand logo links to /app (not the marketing hero) and renders at height 32', () => {
    render(<Sidebar activeHref="/app" />);
    // The Logo wraps its <img alt="Trochia"> in a Link with this aria-label.
    const logoLink = screen.getByLabelText('Trochia — home');
    expect(logoLink.tagName).toBe('A');
    expect(logoLink.getAttribute('href')).toBe('/app');
    // Regression guard: never back to the marketing root.
    expect(logoLink.getAttribute('href')).not.toBe('/');
    // Size bump (C4): the mark renders at 32px, not the prior 26.
    const img = screen.getByAltText('Trochia') as HTMLImageElement;
    expect(img.getAttribute('height')).toBe('32');
  });
});
