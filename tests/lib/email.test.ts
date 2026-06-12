/**
 * Email — typed `sendEmail` + the from-address-from-SITE_URL discipline + the
 * banned-string scan over the rendered HTML.
 *
 * Mocks the Resend SDK so no network is touched. The `scanText` core from
 * `scripts/check-banned-strings.mjs` is reused (its exported function) to
 * assert each template's HTML carries no banned compliance strings.
 */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const resendSend = vi.fn(async () => ({ data: { id: 'em_test' }, error: null }));

vi.mock('resend', () => {
  class Resend {
    emails = { send: resendSend };
    constructor(_apiKey?: string) {
      void _apiKey;
    }
  }
  return { Resend };
});

beforeAll(() => {
  // Hermetic env (HARDCODED-DOMAIN-REGEX-01): the "not a trochia domain"
  // from-address assertion must hold regardless of .env.local / a missing
  // .env.test — stub BOTH url vars to neutral test values.
  vi.stubEnv('NEXT_PUBLIC_SITE_URL', 'https://test.example');
  vi.stubEnv('NEXT_PUBLIC_APP_URL', 'https://app.test.example');
});

afterAll(() => {
  vi.unstubAllEnvs();
});

beforeEach(() => {
  resendSend.mockClear();
  process.env.RESEND_API_KEY = 're_test_key';
  delete process.env.EMAIL_FROM;
});

afterEach(() => {
  vi.resetModules();
});

describe('sendEmail', () => {
  it('renders the trial-ending template + sends via Resend with day count + a SITE_URL-derived from-address', async () => {
    const { sendEmail } = await import('@/lib/email/client');

    const result = await sendEmail({
      to: 'founder@example.com',
      template: 'trial-ending',
      props: { daysLeft: 3, manageBillingUrl: 'https://billing.example.com/x' },
    });

    expect(resendSend).toHaveBeenCalledTimes(1);
    const calls = resendSend.mock.calls as unknown as Array<[
      { from: string; to: string; subject: string; html: string },
    ]>;
    const arg = calls[0][0];
    expect(arg.to).toBe('founder@example.com');
    expect(arg.html).toContain('3 days');
    expect(arg.subject).toMatch(/trial/i);

    // from-address domain must be derived from SITE_URL's host (no hardcoded
    // trochia.* domain in the email module).
    const siteHost = new URL(process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000').host;
    expect(arg.from).toContain(siteHost);
    expect(arg.from).not.toMatch(/trochia\.ai|trochia\.asranest/);

    expect(result.sent).toBe(true);
  });

  it('renders all four registered templates with no banned strings + no emoji', async () => {
    const { scanText } = await import('../../scripts/check-banned-strings.mjs');
    const { sendEmail } = await import('@/lib/email/client');

    const samples = [
      {
        template: 'welcome' as const,
        props: { appUrl: 'https://app.example.com' },
      },
      {
        template: 'trial-ending' as const,
        props: { daysLeft: 5, manageBillingUrl: 'https://billing.example.com/x' },
      },
      {
        template: 'payment-failed' as const,
        props: { updatePaymentUrl: 'https://billing.example.com/update' },
      },
      {
        template: 'data-export-ready' as const,
        props: { downloadUrl: 'https://files.example.com/x.json', expiresAt: 'Wed, 13 May 2026 12:00:00 GMT' },
      },
    ];

    for (const s of samples) {
      const out = await sendEmail({ to: 'founder@example.com', ...s });
      const violations = scanText(out.html);
      expect(violations, `template=${s.template} html should be banned-string-clean`).toEqual([]);
      // Operator voice: no emoji in product copy.
      expect(out.html).not.toMatch(/\p{Extended_Pictographic}/u);
    }
  });

  it('rejects unknown template names at compile time', async () => {
    const { sendEmail } = await import('@/lib/email/client');
    await sendEmail({
      to: 'x@y.com',
      // @ts-expect-error: 'bogus' is not a registered template
      template: 'bogus',
      // @ts-expect-error: no props type for an unregistered template
      props: {},
    }).catch(() => undefined);
    // Pure type-level assertion — the @ts-expect-error directives ARE the test.
  });

  it('returns sent=false (no throw) when RESEND_API_KEY is unset', async () => {
    delete process.env.RESEND_API_KEY;
    const { sendEmail } = await import('@/lib/email/client');
    const out = await sendEmail({
      to: 'founder@example.com',
      template: 'welcome',
      props: { appUrl: 'https://app.example.com' },
    });
    expect(out.sent).toBe(false);
    expect(resendSend).not.toHaveBeenCalled();
  });
});
