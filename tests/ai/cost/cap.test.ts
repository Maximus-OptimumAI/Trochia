/**
 * Cost-cap core — unit tests (Plan 02-07 / T01). DB MOCKED (the headline integration
 * test exercises the REAL atomic Postgres store).
 *
 * Pins (per the converged design): the RESERVE atomic upsert RETURNs the running total +
 * a Reservation token { accountId, usageDate, reservedMicroUsd }; over-cap REFUNDS + throws
 * AI_DAILY_CAP_EXCEEDED; SETTLE applies (actual−reserved) to the TOKEN's usageDate row;
 * refundReservation decrements the token's usageDate row; P2-C lifecycle (pre-call throw →
 * full refund, post-call throw → settle-to-actual, midnight-crossing keys the reserved day,
 * not 'today'); fail-CLOSED on store error; account_id + usage_date present in EVERY query.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// ── Mock the service client. The fake records each executed SQL (flattened to a string
//    that includes the parameter values) and lets a test script the RETURNING running total. ──
const { execMock, executed } = vi.hoisted(() => ({
  execMock: vi.fn(),
  executed: [] as string[],
}));

vi.mock('@/db/client', () => ({
  getServiceClient: () => ({
    execute: execMock,
  }),
}));

/** Flatten a drizzle `sql` object's chunks (text + param values) into a searchable string. */
function flattenSql(arg: unknown): string {
  const chunks = (arg as { queryChunks?: unknown[] }).queryChunks ?? [];
  const parts: string[] = [];
  for (const c of chunks) {
    if (c == null) continue;
    if (typeof c === 'object' && 'value' in (c as Record<string, unknown>)) {
      // StringChunk: { value: string[] }
      const v = (c as { value: unknown }).value;
      parts.push(Array.isArray(v) ? v.join('') : String(v));
    } else if (typeof c === 'object' && 'value' in (c as object) === false) {
      // Param: drizzle wraps bound values; stringify whatever it carries.
      parts.push(JSON.stringify(c));
    } else {
      parts.push(String(c));
    }
  }
  return parts.join(' ') + ' ' + JSON.stringify(arg);
}

import {
  CAP_MICRO_USD,
  refundReservation,
  reserveWithinDailyCap,
  settleSpend,
  type Reservation,
} from '@/ai/cost/cap';
import { AppError } from '@/lib/errors';

beforeEach(() => {
  execMock.mockReset();
  executed.length = 0;
  // Default: record the SQL string; RESERVE returns an under-cap running total.
  execMock.mockImplementation(async (arg: unknown) => {
    executed.push(flattenSql(arg));
    return [{ micro_usd_spent: 1000 }];
  });
});

afterEach(() => {
  vi.useRealTimers();
});

describe('reserveWithinDailyCap', () => {
  it('does an atomic ON CONFLICT upsert that RETURNs the running total + a Reservation token', async () => {
    const token = await reserveWithinDailyCap('acct-1', 2000);
    expect(token.accountId).toBe('acct-1');
    expect(token.reservedMicroUsd).toBe(2000);
    expect(token.usageDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    const sqlStr = executed[0];
    expect(sqlStr).toMatch(/ON CONFLICT/i);
    expect(sqlStr).toMatch(/RETURNING/i);
    expect(sqlStr).toMatch(/ai_usage_daily/);
  });

  it('over-cap: REFUNDS the estimate AND throws AI_DAILY_CAP_EXCEEDED (429)', async () => {
    execMock.mockReset();
    let call = 0;
    execMock.mockImplementation(async (arg: unknown) => {
      executed.push(flattenSql(arg));
      call += 1;
      // First call = RESERVE → over-cap total. Second call = the compensating REFUND.
      return call === 1 ? [{ micro_usd_spent: CAP_MICRO_USD + 1 }] : [];
    });
    await expect(reserveWithinDailyCap('acct-1', 3000)).rejects.toMatchObject({
      code: 'AI_DAILY_CAP_EXCEEDED',
      status: 429,
    });
    // Two writes: the RESERVE and the compensating REFUND.
    expect(executed).toHaveLength(2);
    expect(executed[1]).toMatch(/GREATEST/i); // the clamp-floor refund/decrement
  });

  it('fail-CLOSED: a store error throws AI_COST_METER_UNAVAILABLE (503)', async () => {
    execMock.mockReset();
    execMock.mockRejectedValue(new Error('connection refused'));
    await expect(reserveWithinDailyCap('acct-1', 1000)).rejects.toMatchObject({
      code: 'AI_COST_METER_UNAVAILABLE',
      status: 503,
    });
  });

  it('captures the UTC usageDate ONCE (no recompute) — the token carries today UTC', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-02T23:59:59.000Z'));
    const token = await reserveWithinDailyCap('acct-1', 1000);
    expect(token.usageDate).toBe('2026-06-02');
  });

  it('account_id + usage_date appear in the RESERVE query (tenant-scoped, P2-C key)', async () => {
    await reserveWithinDailyCap('acct-xyz', 500);
    expect(executed[0]).toContain('acct-xyz');
    expect(executed[0]).toMatch(/usage_date/);
  });
});

describe('settleSpend (keys on token.usageDate, never today)', () => {
  it('applies the (actual − reserved) negative delta to the TOKEN row', async () => {
    const token: Reservation = { accountId: 'acct-1', usageDate: '2026-06-02', reservedMicroUsd: 5000 };
    await settleSpend(token, 1200); // delta = -3800
    expect(executed).toHaveLength(1);
    expect(executed[0]).toContain('acct-1');
    expect(executed[0]).toContain('2026-06-02');
    expect(executed[0]).toMatch(/GREATEST/i); // clamp floor at 0
  });

  it('no-ops when actual === reserved (zero delta)', async () => {
    await settleSpend({ accountId: 'a', usageDate: '2026-06-02', reservedMicroUsd: 1000 }, 1000);
    expect(executed).toHaveLength(0);
  });

  it('P2-C midnight crossing: settles the RESERVED (prior) day, not today', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-03T00:00:01.000Z')); // wall clock rolled to D+1
    const token: Reservation = { accountId: 'acct-1', usageDate: '2026-06-02', reservedMicroUsd: 4000 };
    await settleSpend(token, 1000);
    expect(executed[0]).toContain('2026-06-02');
    expect(executed[0]).not.toContain('2026-06-03');
  });
});

describe('refundReservation (pre-call throw path, P2-C)', () => {
  it('decrements the token row by reservedMicroUsd, keyed on the reserved day', async () => {
    const token: Reservation = { accountId: 'acct-1', usageDate: '2026-06-02', reservedMicroUsd: 4000 };
    await refundReservation(token);
    expect(executed).toHaveLength(1);
    expect(executed[0]).toContain('acct-1');
    expect(executed[0]).toContain('2026-06-02');
    expect(executed[0]).toMatch(/GREATEST/i);
  });

  it('a midnight-crossing refund keys the RESERVED (prior) day, not today', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-03T00:00:01.000Z'));
    await refundReservation({ accountId: 'a', usageDate: '2026-06-02', reservedMicroUsd: 1000 });
    expect(executed[0]).toContain('2026-06-02');
    expect(executed[0]).not.toContain('2026-06-03');
  });
});

describe('privacy + invariants', () => {
  it('CAP_MICRO_USD is $5 (5_000_000 micro-USD)', () => {
    expect(CAP_MICRO_USD).toBe(5_000_000);
  });

  it('a thrown over-cap error carries no provider/query payload (static message)', async () => {
    execMock.mockReset();
    let call = 0;
    execMock.mockImplementation(async () => {
      call += 1;
      return call === 1 ? [{ micro_usd_spent: CAP_MICRO_USD + 1 }] : [];
    });
    const err = await reserveWithinDailyCap('acct-1', 3000).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(AppError);
    expect((err as AppError).message).toBe('daily AI spend limit reached');
  });
});
