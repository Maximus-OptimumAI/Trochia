/**
 * Phase-2 memory paste flow — RLS integration test (Plan 02-02 / Task 9).
 *
 * Sits on top of the Plan 02-01 schema-foundation RLS proof
 * (`tests/integration/rls-memory.test.ts`). That file proves the SCHEMA holds
 * tenancy. This file proves the PROCEDURE surface in
 * `src/server/routers/memory.ts` (Plan 02-02 / Task 7) wires the paste →
 * extract → confirm → re-read flow through RLS without leaking across
 * tenants, without overwriting confirmed memory, and without skipping the
 * `interaction` audit trail.
 *
 * Mocked boundary: `@/ai/agents/extract-from-paste.agent`. The agent itself
 * is unit-tested elsewhere (Task 4 / `tests/ai/extract-from-paste.test.ts`).
 * Mocking here keeps integration runs deterministic AND off the live
 * Anthropic API — the integration suite asserts ROUTER + DB + RLS, not LLM
 * quality. The live-Sonnet end-to-end pass is the Plan 02-05 eval harness.
 *
 * Live boundary: Drizzle, Supabase Postgres (via `TEST_DATABASE_URL`), the
 * `tenant_isolation` RLS policies from Plan 02-01, the JWT-claims-driven
 * request-scoped client (`getRequestClientFromClaims`), and the actual
 * `memoryRouter` procedures.
 *
 * Skips cleanly when `TEST_DATABASE_URL` is unset (`HAS_TEST_DB ? describe :
 * describe.skip` — same gating Plan 02-01 uses; CI sets the secret).
 *
 * Test cases (`it()`):
 *   1. Tenant A extracts + confirms → tenant B sees null on getDraft (cross-
 *      tenant read isolation through the procedure surface).
 *   2. Reload-persists: a FRESH caller for tenant A returns the same
 *      confirmed row (the must_haves "survives a page reload" truth).
 *   3. Re-extract on existing draft UPDATEs in place — one row per tenant
 *      (the Plan 02-01 unique index + the router's UPDATE branch).
 *   4. Re-extract on already-confirmed memory does NOT overwrite — the
 *      router's third branch surfaces `existingConfirmed` instead.
 *   5. confirmDraft on a tenant with no prior extract → TRPCError NOT_FOUND.
 *   6. Audit-row count — every extract + confirm appends an `interaction`
 *      row of kind `paste_extract` for the calling tenant.
 *
 * Defense-in-depth note (orchestrator brief case 6): the router's
 * `extractFromPaste` and `confirmDraft` inputs accept NO accountId field —
 * the tenant comes from `ctx.tenantId` only (proof-by-construction). A
 * malicious tenant-A-caller cannot pass tenant-B's accountId because the
 * input schema rejects unknown keys. This is asserted indirectly: every
 * persisted row is keyed by the caller's `ctx.tenantId`, never by client
 * input.
 */
import { sql } from 'drizzle-orm';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import type { TRPCContext } from '@/server/context';
import { appRouter } from '@/server/routers';
import { createCallerFactory } from '@/server/trpc';
import {
  HAS_TEST_DB,
  cleanup,
  closeTestDb,
  createTenant,
  getServiceClientForTests,
  migrateTestDb,
  tenantClient,
  type TestTenant,
} from '../db/test-db';

// ── Mock the extractor agent ────────────────────────────────────────────────
// Vitest hoists `vi.mock()` to the top of the file, before any imports. We
// route the mock through `vi.hoisted()` so each test can swap the return
// value via `extractMock.mockResolvedValueOnce(...)` without re-mocking.
const { extractMock } = vi.hoisted(() => ({ extractMock: vi.fn() }));

vi.mock('@/ai/agents/extract-from-paste.agent', () => ({
  extractFromPaste: extractMock,
}));

// ── Build the caller factory once + derive the caller type from it ──────────
const createCaller = createCallerFactory(appRouter);
type AppCaller = ReturnType<typeof createCaller>;

const d = HAS_TEST_DB ? describe : describe.skip;

d('Phase-2 paste flow — RLS integration (memoryRouter)', () => {
  let A: TestTenant;
  let B: TestTenant;

  /**
   * Build a tRPC caller whose context is scoped to `t`. The caller goes
   * through `protectedProcedure`'s middleware (which only checks that the
   * five tenancy fields are truthy), then routes to the memoryRouter — which
   * uses ctx.db.rls(...) for every read/write. The `db` we hand in is the
   * test-DB request-scoped client built from `t.claims`, so RLS policies
   * apply just like in production.
   *
   * We synthesize the minimum `account` + `session` shape the middleware
   * needs. The router only reads `ctx.session.user.id` and `ctx.tenantId`
   * directly; everything else is consumed via `ctx.db`.
   */
  function callerFor(t: TestTenant): AppCaller {
    const rls = tenantClient(t.claims);
    const ctx = {
      session: { user: { id: t.userId } },
      tenantId: t.accountId,
      region: 'us',
      db: { rls: rls.rls },
      account: { id: t.accountId, ownerUserId: t.userId, region: 'us' },
      supabase: {} as TRPCContext['supabase'],
    } as unknown as TRPCContext;
    return createCaller(ctx);
  }

  /** Deterministic draft that satisfies `businessMemoryDraftSchema` with ≥8 fields + ≥3 source_snippets. */
  function buildDraft(overrides: { companyName?: string; oneLiner?: string } = {}) {
    const now = new Date().toISOString();
    return {
      draft: {
        companyName: overrides.companyName ?? 'Acme Fintech',
        oneLiner: overrides.oneLiner ?? 'B2B treasury automation for SMB CFOs',
        sector: 'Fintech B2B',
        stage: 'Pre-seed',
        geography: 'United States',
        incorporationStatus: 'Delaware C-Corp',
        foundingDate: '2024-09-01T00:00:00.000Z',
        team: {
          founders: [{ name: 'Jane Founder', role: 'CEO' }],
        },
        traction: { mrr: 12_000, currency: 'USD' },
        narrative: { problem: 'CFOs reconcile treasury manually.' },
        provenance: {
          companyName: {
            source_snippet: 'Acme Fintech is a B2B treasury automation company.',
            confidence: 0.95,
            extracted_at: now,
            last_updated: now,
            snooze_until: null,
          },
          oneLiner: {
            source_snippet: 'We sell treasury automation to SMB CFOs.',
            confidence: 0.9,
            extracted_at: now,
            last_updated: now,
            snooze_until: null,
          },
          sector: {
            source_snippet: 'We are a B2B fintech.',
            confidence: 0.85,
            extracted_at: now,
            last_updated: now,
            snooze_until: null,
          },
          stage: {
            source_snippet: 'Currently pre-seed.',
            confidence: 0.9,
            extracted_at: now,
            last_updated: now,
            snooze_until: null,
          },
          geography: {
            source_snippet: 'US-based.',
            confidence: 0.95,
            extracted_at: now,
            last_updated: now,
            snooze_until: null,
          },
          incorporationStatus: {
            source_snippet: 'Incorporated in Delaware.',
            confidence: 0.85,
            extracted_at: now,
            last_updated: now,
            snooze_until: null,
          },
          foundingDate: {
            source_snippet: 'Founded Q3 2024.',
            confidence: 0.75,
            extracted_at: now,
            last_updated: now,
            snooze_until: null,
          },
        },
      },
      injectionScreen: { flagged: false, matches: [] },
      latencyMs: 1234,
      langfuseTraceId: 'test-trace-id-abc',
    };
  }

  /** A valid 600-char paste — clears the router's `min(500)` Zod gate. */
  const VALID_PASTE = 'We are building a B2B fintech for SMB CFOs. '.repeat(20);

  /**
   * Per-test timeout — integration tests round-trip ≥6 DB calls to a remote
   * Supabase test instance; each call costs ~500ms on Windows + a regional
   * pooler. Vitest's default 5s default is too tight even on healthy
   * networks. 30s matches the latency budget the predecessor RLS suite
   * implicitly assumes (its longest single-tx case still lands under 25s).
   */
  const TEST_TIMEOUT_MS = 30_000;

  beforeAll(async () => {
    await migrateTestDb();
    await cleanup();
  }, TEST_TIMEOUT_MS);

  beforeEach(async () => {
    extractMock.mockReset();
    extractMock.mockResolvedValue(buildDraft());
    await cleanup();
    A = await createTenant('us');
    B = await createTenant('us');
  }, TEST_TIMEOUT_MS);

  afterEach(() => {
    vi.restoreAllMocks();
  });

  afterAll(async () => {
    await cleanup();
    await closeTestDb();
  });

  // ───────────────────────────────────────────────────────────────────────
  // Case 1 — Cross-tenant isolation across the procedure surface
  // ───────────────────────────────────────────────────────────────────────

  it("tenant A extracts + confirms → tenant B's getDraft returns null", { timeout: TEST_TIMEOUT_MS }, async () => {
    const aCaller = callerFor(A);
    const bCaller = callerFor(B);

    // A extracts a draft.
    const extractResult = await aCaller.memory.extractFromPaste({ paste: VALID_PASTE });
    expect(extractResult.draft.companyName).toBe('Acme Fintech');
    expect(extractResult.existingConfirmed).toBeNull();

    // A confirms the draft.
    const confirmedResult = await aCaller.memory.confirmDraft({
      confirmed: {
        ...extractResult.draft,
        confirmedAt: new Date().toISOString(),
      },
    });
    expect(confirmedResult.confirmedAt).not.toBeNull();
    expect(confirmedResult.accountId).toBe(A.accountId);

    // B reads via the SAME procedure surface — RLS denies cross-tenant rows.
    const bDraft = await bCaller.memory.getDraft();
    expect(bDraft, 'tenant B must not see tenant A\'s confirmed memory').toBeNull();

    // Belt-and-braces: query the raw RLS-scoped client as B and count rows
    // visible for A's accountId. Must be zero.
    const bRls = tenantClient(B.claims);
    await bRls.rls(async (tx) => {
      const rows = await tx.execute<{ n: string }>(
        sql`select count(*)::text as n from public.business_memory where account_id = ${A.accountId}`,
      );
      expect(Number(rows[0].n)).toBe(0);
    });
  });

  // ───────────────────────────────────────────────────────────────────────
  // Case 2 — Reload-persists (fresh caller returns the same confirmed row)
  // ───────────────────────────────────────────────────────────────────────

  it("reload-persists: a fresh caller for tenant A returns the same confirmed row", { timeout: TEST_TIMEOUT_MS }, async () => {
    const aCaller = callerFor(A);

    const extracted = await aCaller.memory.extractFromPaste({ paste: VALID_PASTE });
    const editedOneLiner = 'Edited: treasury automation for SMB CFOs';
    const confirmed = await aCaller.memory.confirmDraft({
      confirmed: {
        ...extracted.draft,
        oneLiner: editedOneLiner,
        confirmedAt: new Date().toISOString(),
      },
    });
    const firstConfirmedAt = confirmed.confirmedAt;
    expect(firstConfirmedAt).toBeInstanceOf(Date);
    expect(confirmed.oneLiner).toBe(editedOneLiner);

    // Simulate page reload — construct a NEW caller with a fresh ctx + a
    // fresh request-scoped DB client. Same JWT claims, same tenancy.
    const freshCaller = callerFor(A);
    const reloaded = await freshCaller.memory.getDraft();

    expect(reloaded, 'getDraft must return the persisted row on reload').not.toBeNull();
    expect(reloaded?.accountId).toBe(A.accountId);
    expect(reloaded?.confirmedAt?.toISOString()).toBe(firstConfirmedAt?.toISOString());
    expect(reloaded?.companyName).toBe('Acme Fintech');
    expect(reloaded?.oneLiner).toBe(editedOneLiner);

    // Provenance survived — companyName entry should still carry its snippet.
    const provenance = reloaded?.provenance as Record<string, { source_snippet?: string }>;
    expect(provenance.companyName?.source_snippet).toBe(
      'Acme Fintech is a B2B treasury automation company.',
    );
  });

  // ───────────────────────────────────────────────────────────────────────
  // Case 3 — Three-branch (a) INSERT + (b) UPDATE in place
  // ───────────────────────────────────────────────────────────────────────

  it("re-extract on an existing UNCONFIRMED draft updates in place (one row per tenant)", { timeout: TEST_TIMEOUT_MS }, async () => {
    const aCaller = callerFor(A);

    // First extract (branch a — no row → INSERT).
    extractMock.mockResolvedValueOnce(buildDraft({ companyName: 'First-Pass Co' }));
    const first = await aCaller.memory.extractFromPaste({ paste: VALID_PASTE });
    expect(first.draft.companyName).toBe('First-Pass Co');

    // Second extract — same tenant, NOT confirmed (branch b → UPDATE).
    extractMock.mockResolvedValueOnce(buildDraft({ companyName: 'Second-Pass Inc' }));
    const second = await aCaller.memory.extractFromPaste({ paste: VALID_PASTE });
    expect(second.draft.companyName).toBe('Second-Pass Inc');
    expect(second.existingConfirmed, 'no confirmed row yet → null').toBeNull();

    // Assert exactly one row exists for A — the Plan 02-01 unique index would
    // throw on a second INSERT, so a successful test here is structural proof
    // that the router took the UPDATE branch.
    const adb = getServiceClientForTests();
    const countRows = await adb.execute<{ n: string }>(
      sql`select count(*)::text as n from public.business_memory where account_id = ${A.accountId}`,
    );
    expect(Number(countRows[0].n)).toBe(1);

    // The row reflects the SECOND extract.
    const persisted = await aCaller.memory.getDraft();
    expect(persisted?.companyName).toBe('Second-Pass Inc');
    expect(persisted?.confirmedAt).toBeNull();
  });

  // ───────────────────────────────────────────────────────────────────────
  // Case 4 — Three-branch (c) preserve + surface existingConfirmed
  // ───────────────────────────────────────────────────────────────────────

  it("re-extract on already-confirmed memory does NOT overwrite — surfaces existingConfirmed", { timeout: TEST_TIMEOUT_MS }, async () => {
    const aCaller = callerFor(A);

    // Extract + confirm.
    extractMock.mockResolvedValueOnce(buildDraft({ companyName: 'Confirmed Co' }));
    const extracted = await aCaller.memory.extractFromPaste({ paste: VALID_PASTE });
    const confirmedRow = await aCaller.memory.confirmDraft({
      confirmed: {
        ...extracted.draft,
        confirmedAt: new Date().toISOString(),
      },
    });
    const originalConfirmedAt = confirmedRow.confirmedAt;
    expect(originalConfirmedAt).toBeInstanceOf(Date);
    expect(confirmedRow.companyName).toBe('Confirmed Co');

    // Re-extract on the now-confirmed row — branch c.
    extractMock.mockResolvedValueOnce(buildDraft({ companyName: 'Tried-To-Overwrite Co' }));
    const reExtract = await aCaller.memory.extractFromPaste({ paste: VALID_PASTE });

    // The NEW draft is returned in the response (Week-3 conflict UI consumes it),
    // but the persisted row is NOT overwritten and `existingConfirmed` carries
    // the prior confirmed snapshot.
    expect(reExtract.draft.companyName).toBe('Tried-To-Overwrite Co');
    expect(reExtract.existingConfirmed, 'prior confirmed row must surface').not.toBeNull();
    expect(reExtract.existingConfirmed?.companyName).toBe('Confirmed Co');
    expect(reExtract.existingConfirmed?.confirmedAt?.toISOString()).toBe(
      originalConfirmedAt?.toISOString(),
    );

    // The persisted row still reflects the original confirmation.
    const persisted = await aCaller.memory.getDraft();
    expect(persisted?.companyName).toBe('Confirmed Co');
    expect(persisted?.confirmedAt?.toISOString()).toBe(originalConfirmedAt?.toISOString());
  });

  // ───────────────────────────────────────────────────────────────────────
  // Case 5 — confirmDraft NOT_FOUND when no prior extract
  // ───────────────────────────────────────────────────────────────────────

  it("confirmDraft rejects with NOT_FOUND when the tenant has no prior draft", { timeout: TEST_TIMEOUT_MS }, async () => {
    const aCaller = callerFor(A);
    // Build a syntactically-valid `confirmed` payload — the router gates on
    // a DB-side row lookup, not on input shape, so a clean payload still hits
    // the NOT_FOUND branch.
    const { draft } = buildDraft();

    await expect(
      aCaller.memory.confirmDraft({
        confirmed: { ...draft, confirmedAt: new Date().toISOString() },
      }),
    ).rejects.toThrow(/no business memory draft to confirm/i);
  });

  // ───────────────────────────────────────────────────────────────────────
  // Case 6 — `interaction` audit rows on every extract + confirm
  // ───────────────────────────────────────────────────────────────────────

  it("appends an `interaction` row of kind 'paste_extract' on every extract and every confirm", { timeout: TEST_TIMEOUT_MS }, async () => {
    const aCaller = callerFor(A);

    // 1 extract → 1 interaction row.
    await aCaller.memory.extractFromPaste({ paste: VALID_PASTE });

    const adb = getServiceClientForTests();

    type InteractionRow = {
      account_id: string;
      kind: string;
      model: string | null;
      langfuse_trace_id: string | null;
      latency_ms: string | null;
      query: string | null;
      answer: string | null;
    };
    const afterExtract = await adb.execute<InteractionRow>(sql`
      select account_id, kind, model, langfuse_trace_id, latency_ms, query, answer
        from public.interaction
       where account_id = ${A.accountId}
         and kind = 'paste_extract'
       order by created_at asc
    `);
    expect(afterExtract.length).toBe(1);
    expect(afterExtract[0].account_id).toBe(A.accountId);
    expect(afterExtract[0].model).toBe('claude-sonnet-4-6');
    expect(afterExtract[0].langfuse_trace_id).toBe('test-trace-id-abc');
    expect(Number(afterExtract[0].latency_ms)).toBe(1234);
    // `query` / `answer` are null per src/db/schema/memory.ts header — paste
    // extract has no question/answer shape.
    expect(afterExtract[0].query).toBeNull();
    expect(afterExtract[0].answer).toBeNull();

    // 1 confirm → +1 interaction row (also kind=paste_extract; latency null).
    await aCaller.memory.confirmDraft({
      confirmed: {
        ...buildDraft().draft,
        confirmedAt: new Date().toISOString(),
      },
    });

    const afterConfirm = await adb.execute<InteractionRow>(sql`
      select account_id, kind, model, langfuse_trace_id, latency_ms, query, answer
        from public.interaction
       where account_id = ${A.accountId}
         and kind = 'paste_extract'
       order by created_at asc
    `);
    expect(afterConfirm.length).toBe(2);
    // The confirm row carries null latency + null trace id (no AI call here).
    expect(afterConfirm[1].latency_ms).toBeNull();
    expect(afterConfirm[1].langfuse_trace_id).toBeNull();
    expect(afterConfirm[1].model).toBe('claude-sonnet-4-6');

    // Cross-tenant: tenant B has zero paste_extract rows in its view.
    const bRls = tenantClient(B.claims);
    await bRls.rls(async (tx) => {
      const rows = await tx.execute<{ n: string }>(
        sql`select count(*)::text as n from public.interaction where kind = 'paste_extract'`,
      );
      expect(Number(rows[0].n)).toBe(0);
    });
  });
});
