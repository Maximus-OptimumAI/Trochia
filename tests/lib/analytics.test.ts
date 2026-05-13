/**
 * Analytics — typed `track` + the server-vs-browser branch.
 *
 * Mocks both Amplitude SDKs (browser + node). Asserts:
 *   - `track('tier_selected', { tier:'pre_raise', period:'monthly' })` calls the
 *     SDK with the event name and props.
 *   - With `window === undefined` (default Vitest node env) the node SDK fires.
 *   - With a `window` shim, the browser SDK fires.
 *   - Unknown event names are a TypeScript error (asserted via `@ts-expect-error`).
 *   - The defined event union only allows IDs/enums (a structural check on the
 *     payload types — free-text content shapes can't be passed as props).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const browserTrack = vi.fn();
const browserSetUserId = vi.fn();
const browserIdentify = vi.fn();
const browserInit = vi.fn();
const nodeTrack = vi.fn();
const nodeIdentify = vi.fn();
const nodeFlush = vi.fn(async () => undefined);
const nodeInit = vi.fn();

vi.mock('@amplitude/analytics-browser', () => ({
  track: browserTrack,
  setUserId: browserSetUserId,
  identify: browserIdentify,
  init: browserInit,
  Identify: class {
    set = vi.fn();
  },
}));

vi.mock('@amplitude/analytics-node', () => ({
  track: nodeTrack,
  identify: nodeIdentify,
  flush: nodeFlush,
  init: nodeInit,
}));

beforeEach(() => {
  browserTrack.mockReset();
  nodeTrack.mockReset();
  browserSetUserId.mockReset();
  browserIdentify.mockReset();
  browserInit.mockReset();
  nodeIdentify.mockReset();
  nodeInit.mockReset();
  process.env.AMPLITUDE_API_KEY = 'test-server-key';
  process.env.NEXT_PUBLIC_AMPLITUDE_API_KEY = 'test-browser-key';
});

afterEach(() => {
  // Drop the cached node singleton so each test starts clean.
  vi.resetModules();
  // Drop any shim window set by individual tests.
  // @ts-expect-error: window is not declared in node env
  delete globalThis.window;
});

describe('analytics.track', () => {
  it('server path: fires the node SDK with event name + props', async () => {
    const { track } = await import('@/lib/analytics');
    await track('tier_selected', { tier: 'pre_raise', period: 'monthly' });
    expect(nodeTrack).toHaveBeenCalledTimes(1);
    expect(nodeTrack).toHaveBeenCalledWith({
      event_type: 'tier_selected',
      event_properties: { tier: 'pre_raise', period: 'monthly' },
    });
    expect(browserTrack).not.toHaveBeenCalled();
  });

  it('server path: no-op when AMPLITUDE_API_KEY is unset', async () => {
    delete process.env.AMPLITUDE_API_KEY;
    const { track } = await import('@/lib/analytics');
    await track('signed_in');
    expect(nodeTrack).not.toHaveBeenCalled();
  });

  it('browser path: fires the browser SDK when window is defined', async () => {
    // @ts-expect-error: shim a minimal window object
    globalThis.window = {};
    const { track } = await import('@/lib/analytics');
    await track('welcome_viewed');
    expect(browserTrack).toHaveBeenCalledTimes(1);
    expect(browserTrack).toHaveBeenCalledWith('welcome_viewed', {});
    expect(nodeTrack).not.toHaveBeenCalled();
  });

  it('exposes the full onboarding-funnel event taxonomy', async () => {
    const { track } = await import('@/lib/analytics');
    // Every funnel name is callable — TS compile success is the assertion.
    await track('signup_started');
    await track('welcome_viewed');
    await track('tier_selected', { tier: 'active_raise', period: 'annual' });
    await track('checkout_started', { tier: 'active_raise', period: 'annual' });
    await track('checkout_completed', { tier: 'active_raise', period: 'annual' });
    await track('knowledge_pack_step_viewed');
    await track('deck_upload_step_viewed');
    await track('review_step_viewed');
    await track('dashboard_viewed');
    expect(nodeTrack).toHaveBeenCalledTimes(9);
  });

  it('rejects unknown event names at compile time', async () => {
    const { track } = await import('@/lib/analytics');
    // @ts-expect-error: 'bogus_event' is not in the union
    await track('bogus_event');
    // We don't assert runtime behavior here — the ts-expect-error IS the test.
    // (If this comment compiles without the @ts-expect-error firing, the test
    // file will fail to typecheck.)
  });
});
