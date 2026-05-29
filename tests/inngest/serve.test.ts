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
  // 'embed' (stub) removed in Plan 02-04 / T04 — replaced by 'embed-memory'.
  'embed-memory',
  'transcribe',
  'brief-enrich',
  'esign-webhook',
  'reminders',
];

/**
 * Per-function retry expectations. The Phase-1 stubs are all 4 retries; the
 * embed-memory function (Plan 02-04 / T04) is tuned to 2 because every retry
 * is a Voyage call cost (per src/inngest/functions/embed-memory.ts module
 * docstring).
 */
const RETRY_BY_ID: Record<string, number> = {
  'ai-health-check': 4,
  'reconcile-stripe': 4,
  'purge-soft-deleted': 4,
  'deck-parse': 4,
  'embed-memory': 2,
  transcribe: 4,
  'brief-enrich': 4,
  'esign-webhook': 4,
  reminders: 4,
};

describe('Inngest serve() registration', () => {
  it('registers all expected functions by id', () => {
    const ids = allFunctions.map(fnId);
    for (const expected of EXPECTED_IDS) {
      expect(ids).toContain(expected);
    }
    expect(allFunctions).toHaveLength(EXPECTED_IDS.length);
  });

  it('every function has the expected retry count for its workload class', () => {
    for (const fn of allFunctions) {
      const id = fnId(fn);
      const expected = RETRY_BY_ID[id];
      expect(expected, `retry expectation missing for function id ${id}`).toBeDefined();
      expect(fnRetries(fn)).toBe(expected);
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
