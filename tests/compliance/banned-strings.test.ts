import { describe, expect, it } from 'vitest';
import { scanText } from '../../scripts/check-banned-strings.mjs';

describe('banned-strings scanner', () => {
  it('flags a hard-banned term', () => {
    const v = scanText('Trochia is basically a rolling fund for founders.');
    expect(v.some((x: { term: string }) => x.term === 'rolling fund')).toBe(true);
  });

  it('allows "legal advice" when preceded by a negation (allowlist)', () => {
    const v = scanText('Trochia is not a law firm and does not provide legal advice.');
    expect(v).toHaveLength(0);
  });

  it('flags "legal advice" without a negation', () => {
    const v = scanText('Trochia provides legal advice to founders.');
    expect(v.some((x: { term: string }) => x.term === 'legal advice')).toBe(true);
  });

  it('flags "investment advice" without a negation but allows it with one', () => {
    expect(scanText('We give investment advice.').some((x: { term: string }) => x.term === 'investment advice')).toBe(
      true,
    );
    expect(scanText('This is not investment advice.')).toHaveLength(0);
  });

  it('flags "investment vehicle" and "adviser" unconditionally', () => {
    expect(scanText('It functions as an investment vehicle.').length).toBeGreaterThan(0);
    expect(scanText('Trochia is your adviser.').length).toBeGreaterThan(0);
  });

  it('does not flag the bare word "fund" / "funding"', () => {
    expect(scanText('Close your funding round faster.')).toHaveLength(0);
  });
});
