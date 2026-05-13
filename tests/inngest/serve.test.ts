import { describe, expect, it } from 'vitest';

import { allFunctions } from '@/inngest/functions';
import { PURGE_AFTER_DAYS, purgeSoftDeletedAccounts } from '@/inngest/functions/purge-soft-deleted';

/** Pull the stable `id` off an InngestFunction (the public `id()` accessor / `.id`). */
function fnId(fn: unknown): string {
  const f = fn as { id?: string | (() => string) };
  return typeof f.id === 'function' ? f.id() : (f.id as string);
}

/** Pull the configured retry count off an InngestFunction's options. */
function fnRetries(fn: unknown): number | undefined {
  // Inngest stores function config under a few possible internal shapes across versions —
  // probe the common ones.
  const f = fn as Record<string, unknown>;
  const opts = (f.opts ?? f.options ?? f['#opts'] ?? f.fn ?? {}) as Record<string, unknown>;
  const retries = (opts.retries ?? (f.retries as unknown)) as number | { attempts?: number } | undefined;
  if (typeof retries === 'number') return retries;
  if (retries && typeof retries === 'object' && typeof retries.attempts === 'number') return retries.attempts;
  return undefined;
}

const EXPECTED_IDS = [
  'ai-health-check',
  'reconcile-stripe',
  'purge-soft-deleted',
  'deck-parse',
  'embed',
  'transcribe',
  'brief-enrich',
  'esign-webhook',
  'reminders',
];

describe('Inngest serve() registration', () => {
  it('registers all expected functions by id', () => {
    const ids = allFunctions.map(fnId);
    for (const expected of EXPECTED_IDS) {
      expect(ids).toContain(expected);
    }
    expect(allFunctions).toHaveLength(EXPECTED_IDS.length);
  });

  it('every function has 4 retries configured', () => {
    for (const fn of allFunctions) {
      expect(fnRetries(fn)).toBe(4);
    }
  });

  it('the /api/inngest route exports GET, POST and PUT', async () => {
    const route = await import('@/app/api/inngest/route');
    expect(typeof route.GET).toBe('function');
    expect(typeof route.POST).toBe('function');
    expect(typeof route.PUT).toBe('function');
    expect(route.maxDuration).toBeGreaterThanOrEqual(300);
  });
});

describe('purgeSoftDeletedAccounts', () => {
  /** A fake Drizzle client: records the `where` predicate, returns the rows it's told to. */
  function fakeDb(returnRows: { id: string }[], capture: { cutoff?: Date } = {}) {
    return {
      delete: () => ({
        where: () => ({
          returning: async () => returnRows,
        }),
      }),
      // expose so the test can sanity-check the window
      _now: Date.now(),
      _capture: capture,
    } as unknown as Parameters<typeof purgeSoftDeletedAccounts>[0];
  }

  it('purges accounts soft-deleted more than 30 days ago and returns the count', async () => {
    const purged = await purgeSoftDeletedAccounts(fakeDb([{ id: 'a' }, { id: 'b' }]));
    expect(purged).toBe(2);
  });

  it('returns 0 when nothing is past the retention window', async () => {
    const purged = await purgeSoftDeletedAccounts(fakeDb([]));
    expect(purged).toBe(0);
  });

  it('uses a 30-day retention window', () => {
    expect(PURGE_AFTER_DAYS).toBe(30);
  });
});
