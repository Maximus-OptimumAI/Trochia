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

// NOTE: the Sign out control (a POST <form action="/sign-out"> wrapping a submit
// button via DropdownMenuItem, with `nativeButton` per codex P2) lives inside a
// Base UI <DropdownMenu> portal that only mounts on open. Opening it in jsdom needs
// ResizeObserver/matchMedia polyfills not present in tests/setup.ts — adding them to
// shared infra for one markup assertion is disproportionate. The sign-out *behavior*
// (POST → signOut → 303 → '/') is covered by tests/auth/sign-out.test.ts; the
// form+button markup is validated manually post-deploy.
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

  it('C2: exposes a "Dashboard" nav link pointing at /app', () => {
    render(<Sidebar activeHref="/app" />);
    const dashboard = screen.getByRole('link', { name: 'Dashboard' });
    expect(dashboard.getAttribute('href')).toBe('/app');
  });

  it('C2: the Dashboard item is active on /app and inactive elsewhere (exact-match)', () => {
    // Active state paints the standalone `bg-stone` class (NavLink); the inactive
    // class also carries `hover:bg-stone/50`, so match on exact class tokens.
    const tokens = (name: string) =>
      screen.getByRole('link', { name }).className.split(/\s+/);

    const { rerender } = render(<Sidebar activeHref="/app" />);
    expect(tokens('Dashboard')).toContain('bg-stone');

    rerender(<Sidebar activeHref="/app/memory" />);
    expect(tokens('Dashboard')).not.toContain('bg-stone');
  });
});
