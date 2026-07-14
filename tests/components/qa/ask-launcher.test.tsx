// @vitest-environment jsdom
/**
 * `<AskLauncher/>` component tests (ASK-UX-01).
 *
 * The launcher owns the sheet open-state and two triggers. These pin:
 *   1. the floating "Ask Trochia" pill renders and the sheet starts closed;
 *   2. clicking the pill opens the right-side sheet (the QaSidebar mounts);
 *   3. Cmd-K / Ctrl-K opens the same sheet;
 *   4. the global keydown listener is removed on unmount (no leak);
 *   5. ONBOARDING-FIX-01: on an `/onboarding/*` path the launcher renders
 *      NOTHING and the Cmd-K shortcut does not open a sheet (listener absent).
 *
 * tRPC + react-query are MOCKED (same harness as sidebar.test.tsx) so the
 * QaSidebar inside the sheet renders without a real Opus/Voyage call. The
 * `usePathname` hook is mocked per-test so we can drive the route-gate. This
 * file asserts ONLY the launcher wiring; the QaSidebar states are covered in
 * sidebar.test.tsx.
 */
import '@testing-library/jest-dom/vitest';
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';

type MutationOpts = {
  onSuccess?: (data: unknown) => void;
  onError?: (err: unknown) => void;
};

vi.mock('@/lib/trpc-client', () => ({
  useTRPC: () => ({
    qa: { ask: { mutationOptions: (o: MutationOpts) => o } },
  }),
}));

vi.mock('@tanstack/react-query', () => ({
  useMutation: () => ({ mutate: () => undefined, isPending: false }),
}));

// `usePathname` is mocked so each test can pin the current route. Defaults to a
// non-onboarding app path; the onboarding test overrides it.
const mockPathname = vi.fn<() => string>(() => '/app/memory');
vi.mock('next/navigation', () => ({
  usePathname: () => mockPathname(),
}));

// Imported AFTER the mocks are registered.
import { AskLauncher } from '@/components/qa/ask-launcher';

beforeEach(() => {
  mockPathname.mockReturnValue('/app/memory');
});
afterEach(cleanup);

describe('AskLauncher', () => {
  it('renders the floating pill and starts with the sheet closed', () => {
    render(<AskLauncher />);
    const pill = screen.getByTestId('ask-launcher-pill');
    expect(pill).toBeInTheDocument();
    expect(pill).toHaveTextContent('Ask Trochia');
    // Sheet closed: the QaSidebar (its textarea) is not mounted yet.
    expect(screen.queryByTestId('qa-sidebar-input')).toBeNull();
  });

  it('opens the sheet with the QaSidebar when the pill is clicked', async () => {
    render(<AskLauncher />);
    fireEvent.click(screen.getByTestId('ask-launcher-pill'));
    // The sheet mounts the existing QaSidebar (same testids).
    expect(await screen.findByTestId('qa-sidebar')).toBeInTheDocument();
    expect(await screen.findByTestId('qa-sidebar-input')).toBeInTheDocument();
    expect(await screen.findByTestId('qa-sidebar-submit')).toBeInTheDocument();
  });

  it('opens the sheet on Cmd-K (metaKey + k)', async () => {
    render(<AskLauncher />);
    expect(screen.queryByTestId('qa-sidebar-input')).toBeNull();
    fireEvent.keyDown(window, { key: 'k', metaKey: true });
    expect(await screen.findByTestId('qa-sidebar-input')).toBeInTheDocument();
  });

  it('opens the sheet on Ctrl-K (ctrlKey + k)', async () => {
    render(<AskLauncher />);
    expect(screen.queryByTestId('qa-sidebar-input')).toBeNull();
    fireEvent.keyDown(window, { key: 'k', ctrlKey: true });
    expect(await screen.findByTestId('qa-sidebar-input')).toBeInTheDocument();
  });

  it('removes the global keydown listener on unmount (no leak)', () => {
    const removeSpy = vi.spyOn(window, 'removeEventListener');
    const { unmount } = render(<AskLauncher />);
    unmount();
    const removedKeydown = removeSpy.mock.calls.some(([type]) => type === 'keydown');
    expect(removedKeydown).toBe(true);
    removeSpy.mockRestore();
  });

  it('renders nothing and does not register Cmd-K on an /onboarding path (ONBOARDING-FIX-01)', () => {
    mockPathname.mockReturnValue('/onboarding/welcome');
    const addSpy = vi.spyOn(window, 'addEventListener');
    render(<AskLauncher />);

    // No pill and no sheet: the launcher renders nothing on onboarding.
    expect(screen.queryByTestId('ask-launcher-pill')).toBeNull();
    expect(screen.queryByTestId('qa-sidebar-input')).toBeNull();

    // The keydown listener was never registered, so Cmd-K cannot open a sheet.
    const registeredKeydown = addSpy.mock.calls.some(([type]) => type === 'keydown');
    expect(registeredKeydown).toBe(false);
    fireEvent.keyDown(window, { key: 'k', metaKey: true });
    expect(screen.queryByTestId('qa-sidebar-input')).toBeNull();

    addSpy.mockRestore();
  });
});
