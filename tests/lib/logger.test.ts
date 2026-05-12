import { afterEach, describe, expect, it, vi } from 'vitest';
import { logger, redactSensitive, SENSITIVE_FIELDS } from '@/lib/logger';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('lib/logger', () => {
  it('exports the SENSITIVE_FIELDS set', () => {
    expect(SENSITIVE_FIELDS).toBeInstanceOf(Set);
    expect(SENSITIVE_FIELDS.has('amount')).toBe(true);
    expect(SENSITIVE_FIELDS.has('valuationCap')).toBe(true);
  });

  it('does not emit the value of a sensitive field', () => {
    const spy = vi.spyOn(console, 'info').mockImplementation(() => {});
    logger.info({ amount: 4200, name: 'x' });
    const serialized = JSON.stringify(spy.mock.calls);
    expect(serialized).not.toContain('4200');
    expect(serialized).toContain('[redacted]');
    expect(serialized).toContain('"name":"x"');
  });

  it('deep-redacts nested sensitive fields and arrays', () => {
    const out = redactSensitive({
      user: { ssn: '123-45-6789', email: 'a@b.c' },
      rounds: [{ valuationCap: 8_000_000 }, { valuationCap: 12_000_000 }],
    }) as Record<string, unknown>;
    const s = JSON.stringify(out);
    expect(s).not.toContain('123-45-6789');
    expect(s).not.toContain('8000000');
    expect(s).not.toContain('12000000');
    expect(s).toContain('a@b.c');
  });

  it('matches compound sensitive keys (e.g. stripeSecret, userPassword)', () => {
    const out = redactSensitive({ stripeSecret: 'sk_live_x', userPassword: 'hunter2' }) as Record<
      string,
      unknown
    >;
    expect(out.stripeSecret).toBe('[redacted]');
    expect(out.userPassword).toBe('[redacted]');
  });

  it('handles circular references without throwing', () => {
    const a: Record<string, unknown> = { x: 1 };
    a.self = a;
    expect(() => redactSensitive(a)).not.toThrow();
  });
});
