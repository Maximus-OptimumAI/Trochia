/**
 * Product-event analytics (FND-07 / D-13).
 *
 * Single typed surface over Amplitude — browser SDK on the client, node SDK on
 * the server (the server-only path is for non-spoofable lifecycle/revenue events
 * like `checkout_completed`, fired from the Stripe webhook in Plan 07; browser
 * events handle UI-state transitions).
 *
 * The onboarding-funnel taxonomy (D-12 — every stage transition is an event,
 * emitted in Plan 09) is:
 *   signup_started → welcome_viewed → tier_selected → checkout_started →
 *   checkout_completed → knowledge_pack_step_viewed → deck_upload_step_viewed →
 *   review_step_viewed → dashboard_viewed
 *
 * NEVER pass deck text / financial figures / transcript bodies / PII as
 * event props. IDs, enums, and counts only (XC-03 + the no-emoji /
 * no-banned-strings discipline applies to event names too).
 */
import { logger } from '@/lib/logger';

// ── Event taxonomy ──────────────────────────────────────────────────────────

/** The 4-stage onboarding-funnel tier set (D-12, paired with Stripe price ids). */
export type Tier = 'pre_raise' | 'active_raise';
/** Billing period (monthly / annual — D-09 pricing). */
export type Period = 'monthly' | 'annual';

/**
 * The product-event union. Every event added here must be IDs/enums only;
 * free-text content (deck body / transcript / financial figures) is banned —
 * runtime values are not enforceable in the type system so the convention is
 * load-bearing.
 */
export type AnalyticsEvent =
  // ── Onboarding funnel (D-12) ──
  | { name: 'signup_started'; props?: Record<string, never> }
  | { name: 'welcome_viewed'; props?: Record<string, never> }
  | { name: 'tier_selected'; props: { tier: Tier; period: Period } }
  | { name: 'checkout_started'; props: { tier: Tier; period: Period } }
  | { name: 'checkout_completed'; props: { tier: Tier; period: Period } }
  | { name: 'knowledge_pack_step_viewed'; props?: Record<string, never> }
  | { name: 'deck_upload_step_viewed'; props?: Record<string, never> }
  | { name: 'review_step_viewed'; props?: Record<string, never> }
  | { name: 'dashboard_viewed'; props?: Record<string, never> }
  // ── Non-funnel lifecycle ──
  | { name: 'signed_in'; props?: Record<string, never> }
  | { name: 'signed_out'; props?: Record<string, never> }
  | { name: 'manage_billing_clicked'; props?: Record<string, never> };

/** All defined event names — useful for tests and reverse-lookup. */
export type AnalyticsEventName = AnalyticsEvent['name'];

/** Props for a given event name (mapped). */
export type AnalyticsEventProps<N extends AnalyticsEventName> = Extract<
  AnalyticsEvent,
  { name: N }
> extends { props: infer P }
  ? P
  : never;

// ── Server-side singleton (node SDK) ────────────────────────────────────────
//
// We import the node SDK lazily on the server path so the browser bundle does
// not pull it in. Memoized at module scope.

interface NodeAmplitudeClient {
  track(event: { event_type: string; event_properties?: Record<string, unknown>; user_id?: string }): unknown;
  identify(identifyArgs: unknown): unknown;
  flush(): Promise<unknown>;
}

let nodeClient: NodeAmplitudeClient | null = null;
async function getNodeClient(): Promise<NodeAmplitudeClient | null> {
  if (typeof window !== 'undefined') return null;
  if (nodeClient) return nodeClient;
  const apiKey = process.env.AMPLITUDE_API_KEY;
  if (!apiKey) return null;
  const mod = (await import('@amplitude/analytics-node')) as unknown as {
    init: (key: string) => void;
    track: NodeAmplitudeClient['track'];
    identify: NodeAmplitudeClient['identify'];
    flush: NodeAmplitudeClient['flush'];
  };
  mod.init(apiKey);
  nodeClient = { track: mod.track, identify: mod.identify, flush: mod.flush };
  return nodeClient;
}

// ── Browser-side wrapper (browser SDK) ──────────────────────────────────────

interface BrowserAmplitudeClient {
  track(eventType: string, eventProperties?: Record<string, unknown>): unknown;
  setUserId(userId: string | undefined): unknown;
  identify(identify: unknown): unknown;
}

async function getBrowserClient(): Promise<BrowserAmplitudeClient | null> {
  if (typeof window === 'undefined') return null;
  const mod = (await import('@amplitude/analytics-browser')) as unknown as BrowserAmplitudeClient;
  return mod;
}

// ── Public API ──────────────────────────────────────────────────────────────

/**
 * Fire a typed product event. Browser path uses the Amplitude browser SDK
 * (UI-state events); server path uses the node SDK (non-spoofable
 * lifecycle/revenue events — e.g. Plan 07 fires `checkout_completed` from the
 * Stripe webhook).
 *
 * Never pass free-text content as props — IDs / enums / counts only.
 */
export async function track<N extends AnalyticsEventName>(
  name: N,
  ...args: AnalyticsEventProps<N> extends never ? [props?: Record<string, never>] : [props: AnalyticsEventProps<N>]
): Promise<void> {
  const props = (args[0] ?? {}) as Record<string, unknown>;
  try {
    if (typeof window === 'undefined') {
      const client = await getNodeClient();
      if (!client) return;
      client.track({ event_type: name, event_properties: props });
    } else {
      const client = await getBrowserClient();
      if (!client) return;
      client.track(name, props);
    }
  } catch (err) {
    logger.warn('analytics: track failed (non-fatal)', { name, err });
  }
}

/**
 * Identify a signed-in user. Pass ONLY internal identifiers and enums (the
 * account id and the tier). Never email/name/phone/financial — Amplitude is not
 * a CRM, and PII leakage is an XC-03 violation.
 */
export async function identify(
  userId: string,
  traits?: { tier?: Tier },
): Promise<void> {
  try {
    if (typeof window === 'undefined') {
      const client = await getNodeClient();
      if (!client) return;
      // Node SDK identify shape: the import here is intentionally minimal.
      client.identify({ user_id: userId, user_properties: traits ?? {} });
    } else {
      const client = await getBrowserClient();
      if (!client) return;
      client.setUserId(userId);
      // Browser SDK identify shape: pull the Identify class lazily to keep this
      // file synchronous-import-friendly. Best-effort — never blocks UX.
      const mod = (await import('@amplitude/analytics-browser')) as unknown as {
        Identify: new () => { set(k: string, v: unknown): unknown };
        identify: (i: unknown) => unknown;
      };
      const i = new mod.Identify();
      for (const [k, v] of Object.entries(traits ?? {})) i.set(k, v as unknown);
      mod.identify(i);
    }
  } catch (err) {
    logger.warn('analytics: identify failed (non-fatal)', { userId, err });
  }
}
