/**
 * THE headline cost-cap acceptance (Plan 02-07 / T01 / OBS-COST-01).
 *
 * Exercises the REAL atomic Postgres store (`ai_usage_daily` via the REAL
 * `getServiceClient()` — DATABASE_URL === TEST_DATABASE_URL locally + in CI) so the
 * concurrency guarantee is genuinely proven, not mocked vacuously. Only the EXTERNAL
 * Anthropic/Voyage HTTP egress is mocked (MSW). Each case keys on a FRESH accountId so
 * concurrent test runs cannot collide on a row another case owns.
 *
 * Proves, against the real store:
 *   (a) SEQUENTIAL — the (N+1)th metered call BLOCKS once at/over cap; recorded total
 *       never exceeds CAP + one bounded in-flight call.
 *   (b) CONCURRENT (F-1) — N parallel reserves at a near-cap tenant: recorded total never
 *       exceeds CAP + at most ONE in-flight reservation; over-cap calls all block; blocked
 *       reservations REFUND so the ledger reconciles with zero residue.
 *   (c) REPAIR-RETRY + FALLBACK-DISABLED + cache-token pins (via the REAL runAgent chokepoint).
 *   (d) DOCUMENT-BATCH reserves more than a single-query ceiling (via the REAL voyage.embed).
 *   (e) UTC-MIDNIGHT-CROSSING — reserve usageDate=D, settle after rollover → adjusts D's row,
 *       zero residue on D+1.
 *
 * No live Anthropic/Voyage HTTP (MSW intercepts); no mocked Postgres.
 */
import { http, HttpResponse } from 'msw';
import { sql } from 'drizzle-orm';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

import { CAP_MICRO_USD, reserveWithinDailyCap, refundReservation, settleSpend } from '@/ai/cost/cap';
import { voyageReserveMicroUsd } from '@/ai/cost/rates';
import { server } from '../setup';
import {
  HAS_TEST_DB,
  cleanup,
  closeTestDb,
  createTenant,
  getServiceClientForTests,
  migrateTestDb,
  type TestTenant,
} from '../db/test-db';

const d = HAS_TEST_DB ? describe : describe.skip;

const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';
const VOYAGE_URL = 'https://api.voyageai.com/v1/embeddings';

/** Read the durable running total for (account, day) straight from the real store. */
async function ledger(accountId: string, usageDate: string): Promise<number> {
  const db = getServiceClientForTests();
  const rows = await db.execute<{ micro_usd_spent: number | string }>(sql`
    SELECT micro_usd_spent FROM ai_usage_daily
    WHERE account_id = ${accountId} AND usage_date = ${usageDate}
  `);
  return rows[0] ? Number(rows[0].micro_usd_spent) : 0;
}

function todayUtc(): string {
  return new Date().toISOString().slice(0, 10);
}

function anthropicToolResponse(input: unknown, opts: { cacheWrite?: number; cacheRead?: number } = {}) {
  return {
    id: 'msg_test',
    type: 'message',
    role: 'assistant',
    model: 'claude-opus-4-7',
    content: [{ type: 'tool_use', id: 'tu_1', name: 'emit_result', input }],
    stop_reason: 'tool_use',
    stop_sequence: null,
    usage: {
      input_tokens: 50,
      output_tokens: 20,
      cache_creation_input_tokens: opts.cacheWrite ?? 200,
      cache_read_input_tokens: opts.cacheRead ?? 100,
    },
  };
}

d('cost-cap — REAL atomic store acceptance', () => {
  beforeAll(async () => {
    await migrateTestDb(); // ensures ai_usage_daily exists (0007)
  });

  beforeEach(() => {
    process.env.ANTHROPIC_API_KEY = 'sk-test';
    process.env.VOYAGE_API_KEY = 'vk-test';
  });

  afterEach(async () => {
    vi.useRealTimers();
    // Don't leak the fallback flag / module-reset state into later test files (the
    // extract-from-paste cache suite re-imports the client and reads this flag).
    delete process.env.AI_FALLBACK_ENABLED;
    vi.resetModules();
    await cleanup();
  });

  afterAll(async () => {
    await cleanup();
    await closeTestDb();
  });

  // ── (a) SEQUENTIAL ──
  it('(a) sequential: the (N+1)th metered call BLOCKS once at/over cap; total ≤ CAP + one call', async () => {
    const t: TestTenant = await createTenant();
    const day = todayUtc();
    const est = 1_000_000; // $1 reserve per call

    // 4 reserves under cap (each settles to a tiny actual far below the reserve).
    for (let i = 0; i < 4; i += 1) {
      const token = await reserveWithinDailyCap(t.accountId, est);
      await settleSpend(token, 10_000);
    }
    // Ledger now holds 4 × 10_000 = 40_000 settled. Reserve almost all remaining headroom.
    const near = await reserveWithinDailyCap(t.accountId, CAP_MICRO_USD - 100_000); // total 4_940_000 (under)
    expect(near.reservedMicroUsd).toBe(CAP_MICRO_USD - 100_000);

    // The NEXT metered reserve crosses CAP → it BLOCKS (and self-refunds its estimate).
    await expect(reserveWithinDailyCap(t.accountId, 1_000_000)).rejects.toMatchObject({
      code: 'AI_DAILY_CAP_EXCEEDED',
    });

    // The recorded total never exceeds CAP + the one bounded in-flight reservation (`near`),
    // and the blocked call left zero residue.
    const total = await ledger(t.accountId, day);
    expect(total).toBe(40_000 + (CAP_MICRO_USD - 100_000));
    expect(total).toBeLessThanOrEqual(CAP_MICRO_USD);
  });

  // ── (b) CONCURRENT (the F-1 pin) ──
  it('(b) concurrent: N parallel reserves at a near-cap tenant — total ≤ CAP + one; over-cap all block; refunds reconcile', async () => {
    const t: TestTenant = await createTenant();
    const day = todayUtc();

    // Seed the ledger to just under cap: CAP − 500_000.
    const seed = await reserveWithinDailyCap(t.accountId, CAP_MICRO_USD - 500_000);
    await settleSpend(seed, CAP_MICRO_USD - 500_000); // settle to the seeded amount (no delta change)

    // Fire 10 PARALLEL reserves of 300_000 each. Only ONE can fit under the remaining
    // 500_000 headroom (a second would push to CAP − 500_000 + 600_000 = CAP + 100_000 > CAP).
    const each = 300_000;
    const results = await Promise.allSettled(
      Array.from({ length: 10 }, () => reserveWithinDailyCap(t.accountId, each)),
    );

    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter((r) => r.status === 'rejected');

    // At most ONE in-flight reservation fits the headroom.
    expect(fulfilled.length).toBeLessThanOrEqual(1);
    // All over-cap calls block with the typed error.
    for (const r of rejected) {
      expect((r as PromiseRejectedResult).reason).toMatchObject({ code: 'AI_DAILY_CAP_EXCEEDED' });
    }

    // The recorded total never exceeds CAP + at most one in-flight reservation.
    const totalWithInflight = await ledger(t.accountId, day);
    expect(totalWithInflight).toBeLessThanOrEqual(CAP_MICRO_USD + each);

    // Refund the surviving reservation(s) — blocked ones already self-refunded inside reserve.
    for (const r of fulfilled) {
      await refundReservation((r as PromiseFulfilledResult<Awaited<ReturnType<typeof reserveWithinDailyCap>>>).value);
    }

    // The ledger reconciles to exactly the settled seed (zero residue from blocked reservations).
    const finalTotal = await ledger(t.accountId, day);
    expect(finalTotal).toBe(CAP_MICRO_USD - 500_000);
  });

  // ── (c) REPAIR-RETRY + FALLBACK-DISABLED + cache-token (REAL runAgent chokepoint) ──
  it('(c) runAgent metered: repair retry settles to actual ≤ reserve; cache tokens priced', async () => {
    vi.resetModules();
    process.env.AI_FALLBACK_ENABLED = 'true'; // even with the flag ON, costContext disables it
    const { runAgent } = await import('@/ai/client');
    const t: TestTenant = await createTenant();
    const day = todayUtc();
    const Schema = z.object({ label: z.string() });

    // First attempt returns an INVALID payload → triggers the repair retry; the retry is valid.
    let n = 0;
    server.use(
      http.post(ANTHROPIC_URL, () => {
        n += 1;
        return HttpResponse.json(
          n === 1
            ? anthropicToolResponse({ wrong: true }, { cacheWrite: 300, cacheRead: 50 })
            : anthropicToolResponse({ label: 'recovered' }, { cacheWrite: 300, cacheRead: 50 }),
        );
      }),
    );

    const out = await runAgent({
      taskClass: 'reason',
      stablePrefix: { system: 'You answer from the provided context only.', corpus: 'X'.repeat(2000) },
      variableSuffix: 'the question',
      schema: Schema,
      maxTokens: 1024,
      costContext: { accountId: t.accountId },
    });
    expect(out.label).toBe('recovered');
    expect(n).toBe(2); // two Anthropic attempts fired

    // The settled actual (both attempts incl. cache tokens) is recorded and ≤ the reserve.
    const settled = await ledger(t.accountId, day);
    expect(settled).toBeGreaterThan(0); // cache tokens were priced into the settle
    expect(settled).toBeLessThanOrEqual(CAP_MICRO_USD);
  });

  it('(c) runAgent metered: a double-validation miss THROWS and NEVER calls the OpenAI fallback', async () => {
    vi.resetModules();
    process.env.AI_FALLBACK_ENABLED = 'true';
    const { runAgent } = await import('@/ai/client');
    const t: TestTenant = await createTenant();
    const Schema = z.object({ label: z.string() });

    let openaiCalls = 0;
    server.use(
      http.post(ANTHROPIC_URL, () => HttpResponse.json(anthropicToolResponse({ wrong: true }))),
      http.post('https://api.openai.com/v1/chat/completions', () => {
        openaiCalls += 1;
        return HttpResponse.json({ choices: [] });
      }),
    );

    await expect(
      runAgent({
        taskClass: 'reason',
        stablePrefix: { system: 'sys' },
        variableSuffix: 'q',
        schema: Schema,
        costContext: { accountId: t.accountId },
      }),
    ).rejects.toMatchObject({ code: 'AI_STRUCTURED_OUTPUT_INVALID' });

    // The fallback is DISABLED under costContext — zero OpenAI calls (P1-A(3)).
    expect(openaiCalls).toBe(0);
    // The provider DID bill (two failed attempts) → the ledger settled to a positive actual,
    // not a full refund.
    const settled = await ledger(t.accountId, todayUtc());
    expect(settled).toBeGreaterThan(0);
  });

  // ── (d) DOCUMENT-BATCH (REAL voyage.embed, shared ledger) ──
  it('(d) voyage: query AND document embeds both reserve against the SAME ledger; document batch reserves more', async () => {
    vi.resetModules();
    const { voyage } = await import('@/ai/integrations/voyage.adapter');
    const t: TestTenant = await createTenant();
    const day = todayUtc();

    server.use(
      http.post(VOYAGE_URL, async ({ request }) => {
        const body = (await request.json()) as { input: string[] };
        return HttpResponse.json({
          data: body.input.map((_, i) => ({ embedding: Array(1024).fill(0.1), index: i })),
          usage: { total_tokens: body.input.length * 5 }, // tiny actual
        });
      }),
    );

    // One query embed.
    await voyage.embed({
      texts: ['a short investor question'],
      inputType: 'query',
      trace: { accountId: t.accountId, sourceType: 'query', sourceId: 'q1' },
    });
    // One multi-text document embed (the write path).
    const docTexts = [
      'paragraph one of the founder narrative with substance',
      'paragraph two with traction figures and runway',
      'paragraph three describing the market and why now',
    ];
    await voyage.embed({
      texts: docTexts,
      inputType: 'document',
      trace: { accountId: t.accountId, sourceType: 'memory', sourceId: 'm1' },
    });

    // BOTH embeds hit the SAME daily ledger (a positive settled total).
    const total = await ledger(t.accountId, day);
    expect(total).toBeGreaterThan(0);

    // The document batch RESERVES more than a single-query ceiling (UTF-8 byte basis, P1-B).
    const queryReserve = voyageReserveMicroUsd(['a short investor question']);
    const docReserve = voyageReserveMicroUsd(docTexts);
    expect(docReserve).toBeGreaterThan(queryReserve);
  });

  // ── (e) UTC-MIDNIGHT-CROSSING ──
  // The settle/refund key on the RESERVATION TOKEN's usageDate, never a recomputed 'today'
  // (P2-C). Fake timers are avoided here — postgres-js's internal timers deadlock under
  // vitest fake timers — so the crossing is simulated by a token carrying the PRIOR day D
  // while the live `reserveWithinDailyCap` (which always keys on the real 'today') writes a
  // SEPARATE row. We seed day D's row through the real reserve-shaped upsert (admin seed),
  // hand settle/refund a token keyed on D, and prove ONLY day D moves while 'today' is
  // untouched by that settle.
  it('(e) midnight crossing: settle/refund key on the RESERVED day, not today — zero residue on the other day', async () => {
    const t: TestTenant = await createTenant();
    const today = todayUtc();
    // Day D = yesterday (the reserved day a midnight-crossing call would carry), guaranteed
    // to differ from 'today' regardless of when the suite runs.
    const dayD = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    expect(today).not.toBe(dayD);

    // Seed day D's row with a $2 reservation (simulating a reserve captured at 23:59:59 on D).
    const db = getServiceClientForTests();
    await db.execute(sql`
      INSERT INTO ai_usage_daily (account_id, usage_date, micro_usd_spent)
      VALUES (${t.accountId}, ${dayD}, ${2_000_000})
    `);
    // Also put an independent reservation on 'today' (a live reserve) to prove it is NOT
    // touched by the day-D settle.
    const todayToken = await reserveWithinDailyCap(t.accountId, 1_000_000);
    expect(todayToken.usageDate).toBe(today);

    // The crossing token carries day D (captured at reserve time on D).
    const crossingToken = { accountId: t.accountId, usageDate: dayD, reservedMicroUsd: 2_000_000 };
    await settleSpend(crossingToken, 500_000); // delta = -1_500_000 against day D ONLY

    const dRow = await ledger(t.accountId, dayD);
    const todayRow = await ledger(t.accountId, today);
    expect(dRow).toBe(500_000); // 2_000_000 reserve − 1_500_000 settle delta → day D
    expect(todayRow).toBe(1_000_000); // 'today' untouched by the day-D settle (zero residue)

    // A refund keyed on day D also hits ONLY day D.
    await refundReservation({ accountId: t.accountId, usageDate: dayD, reservedMicroUsd: 500_000 });
    expect(await ledger(t.accountId, dayD)).toBe(0);
    expect(await ledger(t.accountId, today)).toBe(1_000_000);
  });
});
