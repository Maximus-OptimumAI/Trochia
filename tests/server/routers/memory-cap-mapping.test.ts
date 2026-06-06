/**
 * memoryRouter cap-mapping — unit test (codex re-gate / P1_extract_cap_mapping).
 *
 * GUARDS: the paste/extract path is now METERED (codex#1 added `costContext` in
 * `extract-from-paste.agent.ts`), so `reserveWithinDailyCap` can throw the typed
 * `AI_DAILY_CAP_EXCEEDED` AppError through `runAgent` → the agent → the router's
 * `rethrowAgentError`. Before the fix that error fell through to a generic 500
 * (`INTERNAL_SERVER_ERROR`). The router must instead surface the OD-8 HARD-block
 * state — `TOO_MANY_REQUESTS` (429) with the STATIC limit copy, NO content echo —
 * exactly as `qaRouter.ask` already maps it.
 *
 * ## Mock strategy — mock the extractor agent + the Inngest client (no DB needed).
 *
 * The cap throw happens INSIDE the mocked agent (we reject with the typed
 * AppError). On that path the router's catch skips the `AI_INJECTION_REJECTED`
 * audit branch and calls `rethrowAgentError(err)` BEFORE touching `ctx.db` — so a
 * stub `db.rls` that is never invoked is sufficient. This mirrors the qa over-cap
 * test (mock the metered call, assert the typed cap state propagates), at the
 * router-mapping layer instead of the agent layer.
 */
import { TRPCError } from '@trpc/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AppError } from '@/lib/errors';
import type { TRPCContext } from '@/server/context';
import { appRouter } from '@/server/routers';
import { createCallerFactory } from '@/server/trpc';

// ── Mock the extractor agent + Inngest client at module scope ────────────────
const { extractMock, inngestSendMock } = vi.hoisted(() => ({
  extractMock: vi.fn(),
  inngestSendMock: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/ai/agents/extract-from-paste.agent', () => ({
  extractFromPaste: extractMock,
}));

vi.mock('@/inngest/client', () => ({
  inngest: { send: inngestSendMock },
}));

const createCaller = createCallerFactory(appRouter);
type AppCaller = ReturnType<typeof createCaller>;

/**
 * Minimal caller whose ctx satisfies `protectedProcedure` (the five tenancy
 * fields are truthy). `db.rls` is a stub the cap path never invokes — the agent
 * rejects before any persist.
 */
function caller(): AppCaller {
  const ctx = {
    session: { user: { id: 'user-1', email: 'founder@example.com' } },
    tenantId: 'acct-1',
    region: 'us',
    db: { rls: vi.fn() },
    account: { id: 'acct-1', ownerUserId: 'user-1', region: 'us' },
    supabase: {} as TRPCContext['supabase'],
  } as unknown as TRPCContext;
  return createCaller(ctx);
}

// A paste that satisfies the input schema (min 500 chars). Content is irrelevant
// — the agent is mocked and rejects before it is read.
const VALID_PASTE = 'A'.repeat(600);

const CAP_REACHED_MESSAGE = 'Daily AI limit reached — resets at midnight UTC.';

describe('memoryRouter.extractFromPaste — AI_DAILY_CAP_EXCEEDED mapping (P1_extract_cap_mapping)', () => {
  beforeEach(() => {
    extractMock.mockReset();
    inngestSendMock.mockClear();
  });

  it('over-cap extract surfaces TOO_MANY_REQUESTS (429) with the static OD-8 copy — NOT a 500', async () => {
    extractMock.mockRejectedValueOnce(
      new AppError('daily AI spend limit reached', { code: 'AI_DAILY_CAP_EXCEEDED', status: 429 }),
    );

    const err = await caller()
      .memory.extractFromPaste({ paste: VALID_PASTE })
      .then(
        () => {
          throw new Error('expected extractFromPaste to reject on the daily cap');
        },
        (e: unknown) => e,
      );

    expect(err).toBeInstanceOf(TRPCError);
    const trpcErr = err as TRPCError;
    expect(trpcErr.code).toBe('TOO_MANY_REQUESTS');
    expect(trpcErr.code).not.toBe('INTERNAL_SERVER_ERROR');
    expect(trpcErr.message).toBe(CAP_REACHED_MESSAGE);
    // Content-blind: the static cap copy carries no query/paste echo, and the
    // raw provider AppError is NOT chained as `cause` (mirrors qaRouter.ask).
    expect(trpcErr.cause).toBeUndefined();
  });

  it('a NON-cap agent failure still maps to INTERNAL_SERVER_ERROR (no regression)', async () => {
    extractMock.mockRejectedValueOnce(
      new AppError('AI structured output failed validation (after one repair retry).', {
        code: 'AI_STRUCTURED_OUTPUT_INVALID',
      }),
    );

    const err = await caller()
      .memory.extractFromPaste({ paste: VALID_PASTE })
      .then(
        () => {
          throw new Error('expected extractFromPaste to reject');
        },
        (e: unknown) => e,
      );

    expect(err).toBeInstanceOf(TRPCError);
    expect((err as TRPCError).code).toBe('INTERNAL_SERVER_ERROR');
  });
});
