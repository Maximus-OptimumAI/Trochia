/**
 * Tests for humanizeFieldError (memory-answerable / T4b).
 * The load-bearing guarantee: a raw Zod string is NEVER surfaced to the founder.
 */
import { describe, it, expect } from 'vitest';

import { humanizeFieldError } from '@/components/memory/humanize-error';

describe('humanizeFieldError', () => {
  it('returns undefined when there is no error', () => {
    expect(humanizeFieldError('Currency', undefined)).toBeUndefined();
    expect(humanizeFieldError('Currency', '')).toBeUndefined();
  });

  it('maps common Zod shapes to friendly, label-aware copy', () => {
    expect(humanizeFieldError('Company name', 'Required')).toBe('Company name is needed to save this field.');
    expect(humanizeFieldError('Customers', 'Expected number, received string')).toBe('Customers should be a number.');
    expect(humanizeFieldError('Founding date', 'Invalid datetime')).toBe('Founding date should be a date, like 2024-01-15.');
    expect(humanizeFieldError('One-liner', 'String must contain at most 280 character(s)')).toBe(
      'One-liner is too long. Shorten it a little.',
    );
  });

  it('NEVER leaks a raw Zod string — unknown shapes get a generic friendly fallback', () => {
    const raws = [
      'String must contain at most 3 character(s)',
      'Expected number, received string',
      'Invalid input: expected string, received undefined',
      'some unrecognized zod internal',
    ];
    for (const raw of raws) {
      const out = humanizeFieldError('Sector', raw)!;
      expect(out).not.toContain('String must contain');
      expect(out).not.toContain('Expected number, received');
      expect(out).not.toContain('expected string, received');
      expect(out.startsWith('Sector')).toBe(true);
    }
  });
});
