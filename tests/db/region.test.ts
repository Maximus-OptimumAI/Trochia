/**
 * Region-seam unit test (FND-10). No DB needed — asserts the seam exists and that
 * both `'us'` and `'in'` currently resolve to the same (US) request-client factory.
 */
import { describe, expect, it } from 'vitest';

import { getDbForRegion, DEFAULT_REGION } from '@/db/region';
import { getRequestClient } from '@/db/client';

describe('getDbForRegion (multi-region seam)', () => {
  it('returns a request-client factory for "us"', () => {
    expect(typeof getDbForRegion('us')).toBe('function');
  });

  it('returns a request-client factory for "in"', () => {
    expect(typeof getDbForRegion('in')).toBe('function');
  });

  it('both regions resolve to the same (US) factory today — the seam is not yet split', () => {
    expect(getDbForRegion('us')).toBe(getRequestClient);
    expect(getDbForRegion('in')).toBe(getRequestClient);
    expect(getDbForRegion('us')).toBe(getDbForRegion('in'));
  });

  it('defaults to "us"', () => {
    expect(DEFAULT_REGION).toBe('us');
  });
});
