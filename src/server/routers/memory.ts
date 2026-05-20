/**
 * `memoryRouter` — Business Memory tRPC surface (Phase 2 / KNW-02a + KNW-02b glue).
 *
 * Three procedures, all `protectedProcedure` (tenant context required):
 *
 *   - `extractFromPaste`  — invoke the Sonnet 4.6 extractor agent, upsert the
 *                           draft into `business_memory`, append an `interaction`
 *                           row of kind `paste_extract`. Returns the new draft
 *                           and (if the row was already confirmed) the prior
 *                           confirmed snapshot — the Week-3 conflict UI consumes
 *                           that side-by-side; Week-2 simply does not overwrite.
 *   - `confirmDraft`      — persist founder edits + stamp `confirmedAt`. NOT_FOUND
 *                           if no prior draft exists; rejected fields are nulled
 *                           and tagged via a `rejected_at` provenance addition.
 *                           Appends a second `interaction` row capturing the
 *                           confirmation timing.
 *   - `getDraft`          — read-only fetch of the current row for `ctx.tenantId`,
 *                           or `null` (used by the page server-component on
 *                           initial render + reload-persists proof).
 *
 * ## Tenancy + RLS
 *
 * Every read + write runs inside `ctx.db.rls(tx => ...)` — the request-scoped
 * Drizzle client that issues `SET LOCAL request.jwt.claims = <session JWT>`
 * inside a transaction, so the `tenant_isolation` policy on every Phase-2 table
 * physically prevents cross-tenant reads/writes. The ergonomic `eq(table.accountId,
 * ctx.tenantId)` filter is layered on top — the policy is the backstop, the
 * filter is the read contract.
 *
 * The one-row-per-tenant `business_memory_account_id_uniq` index from Plan 02-01
 * is what makes the upsert safe: an extractor call either inserts (no row) or
 * updates the existing draft (one row guaranteed).
 *
 * ## Logging contract
 *
 * Only `{ accountId, latencyMs, action, hasExistingConfirmed?, injectionFlagged? }`
 * reach `logger.info`. NEVER the draft, NEVER the paste, NEVER provenance
 * snippets — `source_snippet` strings may contain MRR/ARR/valuation text that
 * the SENSITIVE_FIELDS key-substring scrub cannot catch.
 *
 * ## Chokepoint discipline
 *
 * The Anthropic call happens INSIDE `extractFromPasteAgent` — this file imports
 * the AGENT, never the SDK. The XC-05 ESLint boundary forbids the Anthropic
 * client package outside `src/ai/**`; this router sits in `src/server/**` and
 * respects that. Grep for the package name in this file returns zero hits.
 */
import { TRPCError } from '@trpc/server';
import { and, eq, isNull } from 'drizzle-orm';
import { z } from 'zod';

import { extractFromPaste as extractFromPasteAgent } from '@/ai/agents/extract-from-paste.agent';
import {
  businessMemoryConfirmedSchema,
  type BusinessMemoryDraft,
  type Provenance,
} from '@/ai/schemas/business-memory.zod';
import { businessMemory, interaction, type BusinessMemoryRow } from '@/db/schema/memory';
import { AppError, isAppError } from '@/lib/errors';
import { logger } from '@/lib/logger';
import { protectedProcedure, router } from '@/server/trpc';

// ────────────────────────────────────────────────────────────────────────────
// Input schemas
// ────────────────────────────────────────────────────────────────────────────

/**
 * `extractFromPaste` input. Length bounds mirror the agent's defensive guards
 * (MIN_PASTE_CHARS = 500, MAX_PASTE_CHARS = 40_000); the founder UI enforces
 * the matching word-count gate (Task 8). Validating here lets the tRPC layer
 * fail fast — the agent never gets called with a malformed paste.
 */
const extractFromPasteInputSchema = z.object({
  paste: z.string().min(500).max(40_000),
});

/**
 * `confirmDraft` input. The founder's edited copy of the draft, plus the
 * `confirmedAt` server-stamp (re-emitted client-side so the form contract is
 * complete; the server overwrites it with the authoritative `new Date()` to
 * prevent clock-skew lies).
 */
const confirmDraftInputSchema = z.object({
  confirmed: businessMemoryConfirmedSchema,
});

// ────────────────────────────────────────────────────────────────────────────
// Constants
// ────────────────────────────────────────────────────────────────────────────

/** Model id stamped into `interaction.model` for paste-extract rows. */
const EXTRACT_MODEL_ID = 'claude-sonnet-4-6';

// ────────────────────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────────────────────

/**
 * Map an agent-side `AppError` into a tRPC error. Length errors are 400s;
 * banned-output / structured-output failures are 500s (the model misbehaved —
 * this is an internal AI problem, not a caller problem). Anything else
 * re-throws as INTERNAL_SERVER_ERROR.
 */
function rethrowAgentError(err: unknown): never {
  if (isAppError(err)) {
    switch (err.code) {
      case 'PASTE_TOO_SHORT':
      case 'PASTE_TOO_LONG':
        throw new TRPCError({ code: 'BAD_REQUEST', message: err.message, cause: err });
      case 'AI_BANNED_OUTPUT':
      case 'AI_STRUCTURED_OUTPUT_INVALID':
        throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: err.message, cause: err });
      default:
        throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: err.message, cause: err });
    }
  }
  if (err instanceof Error) {
    throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: err.message, cause: err });
  }
  throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Extractor failed.' });
}

/**
 * Extract a Provenance object from a raw row's `provenance` jsonb. The column
 * defaults to `{}::jsonb` (Plan 02-01) — never null — but TypeScript sees it as
 * `unknown` because Drizzle types jsonb loosely. We re-narrow defensively.
 */
function readProvenance(raw: unknown): Provenance {
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    return raw as Provenance;
  }
  return {};
}

// ────────────────────────────────────────────────────────────────────────────
// Router
// ────────────────────────────────────────────────────────────────────────────

export const memoryRouter = router({
  /**
   * Extract a Business Memory draft from a pasted AI-context blob.
   *
   * Flow:
   *   1. Run the Sonnet 4.6 extractor agent (paste sanitized + injection-screened
   *      inside the agent; banned-output guard fires inside the agent).
   *   2. Read the current row for `ctx.tenantId`. Three branches:
   *      - No row → INSERT the draft with `confirmedAt: null`.
   *      - Row exists, `confirmedAt IS NULL` → UPDATE in place (refresh draft +
   *        provenance + `lastUpdatedAt`).
   *      - Row exists, `confirmedAt IS NOT NULL` → DO NOT overwrite. Return the
   *        new draft alongside the prior confirmed row so the Week-3 conflict
   *        UI can offer a side-by-side confirm/replace flow.
   *   3. Append an `interaction` row of kind `paste_extract` carrying the
   *      Langfuse trace id + latency.
   *
   * Returns the new draft (Zod-validated) and `existingConfirmed` (a full row
   * snapshot when the founder re-extracted on an already-confirmed memory,
   * otherwise null).
   */
  extractFromPaste: protectedProcedure
    .input(extractFromPasteInputSchema)
    .mutation(async ({ ctx, input }) => {
      // 1. Run the extractor agent. All untrusted-input handling + the AI call
      //    happen inside this function. Errors re-throw as tRPC errors.
      let agentResult;
      try {
        agentResult = await extractFromPasteAgent({
          accountId: ctx.tenantId,
          paste: input.paste,
        });
      } catch (err) {
        rethrowAgentError(err);
      }

      const { draft, langfuseTraceId, latencyMs, injectionScreen } = agentResult;
      const now = new Date();

      // 2 + 3. Persist + audit inside ONE RLS transaction so a partial failure
      //        cannot leave a `business_memory` row without its audit trail.
      //
      //        TOCTOU safety: instead of SELECT-then-branch (which races against
      //        concurrent `confirmDraft` in another tab — see code-review P2-1
      //        and P2-2), use an atomic `INSERT ... ON CONFLICT DO UPDATE WHERE
      //        confirmed_at IS NULL`. Postgres evaluates the conflict + the
      //        WHERE predicate atomically inside the row's lock, so:
      //          - No row exists → INSERT fires; RETURNING yields the new row
      //          - Draft row exists (confirmedAt IS NULL) → UPDATE fires; RETURNING yields the updated row
      //          - Confirmed row exists (confirmedAt IS NOT NULL) → WHERE excludes the UPDATE; RETURNING is empty
      //        The empty-RETURNING case is the signal that the founder re-extracted
      //        on an already-confirmed memory; we re-read the row to surface it
      //        as `existingConfirmed` for the Week-3 conflict UI. This collapses
      //        the prior 3-branch SELECT-then-WRITE into one atomic statement +
      //        one conditional re-read.
      const persisted = await ctx.db.rls(async (tx) => {
        // Build the persistable column set from the draft. jsonb groups +
        // provenance are written as-is (Zod has already validated their shape).
        const draftColumns = {
          companyName: draft.companyName ?? null,
          oneLiner: draft.oneLiner ?? null,
          sector: draft.sector ?? null,
          stage: draft.stage ?? null,
          geography: draft.geography ?? null,
          incorporationStatus: draft.incorporationStatus ?? null,
          foundingDate: draft.foundingDate ? new Date(draft.foundingDate) : null,
          team: draft.team ?? null,
          traction: draft.traction ?? null,
          narrative: draft.narrative ?? null,
          provenance: draft.provenance,
        };

        const upserted = await tx
          .insert(businessMemory)
          .values({
            accountId: ctx.tenantId,
            ...draftColumns,
            extractedAt: now,
            lastUpdatedAt: now,
            updatedAt: now,
            confirmedAt: null,
          })
          .onConflictDoUpdate({
            target: businessMemory.accountId,
            set: {
              ...draftColumns,
              extractedAt: now,
              lastUpdatedAt: now,
              updatedAt: now,
            },
            setWhere: isNull(businessMemory.confirmedAt),
          })
          .returning({ id: businessMemory.id });

        let existingConfirmed: BusinessMemoryRow | null = null;
        if (upserted.length === 0) {
          // Conflict fired AND the `setWhere` predicate excluded the UPDATE —
          // i.e. the existing row is confirmed. Re-read to surface the prior
          // confirmed snapshot. This read sits inside the same RLS transaction
          // so it cannot leak across tenants.
          const reread = await tx
            .select()
            .from(businessMemory)
            .where(eq(businessMemory.accountId, ctx.tenantId))
            .limit(1);
          existingConfirmed = reread[0] ?? null;
        }

        // Always append an audit row, even on the no-overwrite branch — the
        // extract event happened; the founder paid for the Sonnet call; the
        // eval harness needs to sample from it.
        await tx.insert(interaction).values({
          accountId: ctx.tenantId,
          userId: ctx.session.user.id,
          kind: 'paste_extract',
          query: null,
          answer: null,
          citations: null,
          model: EXTRACT_MODEL_ID,
          langfuseTraceId,
          latencyMs,
        });

        return { existingConfirmed };
      });

      logger.info('memory.extractFromPaste: ok', {
        accountId: ctx.tenantId,
        action: 'extract',
        latencyMs,
        injectionFlagged: injectionScreen.flagged,
        hasExistingConfirmed: persisted.existingConfirmed !== null,
      });

      return {
        draft,
        existingConfirmed: persisted.existingConfirmed,
      };
    }),

  /**
   * Persist founder-edited fields and stamp `confirmedAt`.
   *
   * Targets the draft row (`accountId = ctx.tenantId AND confirmedAt IS NULL`).
   * If no such row exists, throws NOT_FOUND — the founder must extract first.
   *
   * Rejected fields (columns the founder cleared in the UI) are written as
   * `null` and tagged in provenance with a `rejected_at` ISO timestamp so the
   * staleness logic (KNW-08) can distinguish "founder explicitly rejected"
   * from "extractor never populated."
   *
   * The provenance shape is jsonb at the SQL layer (Plan 02-01's deliberate
   * decision) — adding a `rejected_at` key to existing entries does NOT need
   * a migration.
   */
  confirmDraft: protectedProcedure
    .input(confirmDraftInputSchema)
    .mutation(async ({ ctx, input }) => {
      const { confirmed } = input;
      const now = new Date();

      // Run the read + update + audit inside one RLS transaction. The audit
      // row carries no AI cost (no Langfuse trace), only the confirmation
      // timing.
      const persisted = await ctx.db.rls(async (tx) => {
        const existing = await tx
          .select()
          .from(businessMemory)
          .where(
            and(
              eq(businessMemory.accountId, ctx.tenantId),
              isNull(businessMemory.confirmedAt),
            ),
          )
          .limit(1);

        const draftRow = existing[0];
        if (!draftRow) {
          throw new TRPCError({
            code: 'NOT_FOUND',
            message:
              'No Business Memory draft to confirm. Extract from a paste first, then confirm.',
          });
        }

        // Compute the merged provenance:
        //   - Carry forward whatever the existing draft row stored.
        //   - Overlay the founder's submitted provenance entries (those carry
        //     the bumped `last_updated`).
        //   - For any TOP-LEVEL scalar the founder nulled, record a
        //     `rejected_at` marker on its provenance entry without losing the
        //     original snippet (so the audit trail survives).
        const priorProvenance = readProvenance(draftRow.provenance);
        const submittedProvenance: Provenance = confirmed.provenance ?? {};
        const mergedProvenance: Provenance = { ...priorProvenance, ...submittedProvenance };

        const topLevelScalarKeys: Array<keyof BusinessMemoryDraft> = [
          'companyName',
          'oneLiner',
          'sector',
          'stage',
          'geography',
          'incorporationStatus',
          'foundingDate',
        ];
        for (const key of topLevelScalarKeys) {
          const value = confirmed[key];
          const wasPopulated =
            (draftRow as Record<string, unknown>)[key] !== null &&
            (draftRow as Record<string, unknown>)[key] !== undefined;
          const nowEmpty = value === undefined || value === null || value === '';
          if (wasPopulated && nowEmpty && mergedProvenance[key]) {
            // Preserve the existing entry (snippet, confidence, original
            // extracted_at) and tag with rejected_at + bump last_updated.
            // Adding an extra `rejected_at` key into the jsonb is intentional
            // — provenance shape can evolve at the app layer without a SQL
            // migration (Plan 02-01 deliberate decision).
            mergedProvenance[key] = {
              ...mergedProvenance[key],
              last_updated: now.toISOString(),
              rejected_at: now.toISOString(),
            } as Provenance[string] & { rejected_at: string };
          }
        }

        // Concurrent-confirm guard (code-review P2-3): the UPDATE WHERE clause
        // re-asserts `confirmedAt IS NULL` so a second confirm-in-flight cannot
        // silently overwrite the first. If 0 rows match (another tab won the
        // race), `returning()` is empty and we surface a CONFLICT error rather
        // than reporting a phantom-successful confirm to the caller.
        const updated = await tx
          .update(businessMemory)
          .set({
            companyName: confirmed.companyName ?? null,
            oneLiner: confirmed.oneLiner ?? null,
            sector: confirmed.sector ?? null,
            stage: confirmed.stage ?? null,
            geography: confirmed.geography ?? null,
            incorporationStatus: confirmed.incorporationStatus ?? null,
            foundingDate: confirmed.foundingDate ? new Date(confirmed.foundingDate) : null,
            team: confirmed.team ?? null,
            traction: confirmed.traction ?? null,
            narrative: confirmed.narrative ?? null,
            provenance: mergedProvenance,
            confirmedAt: now,
            lastUpdatedAt: now,
            updatedAt: now,
          })
          .where(and(eq(businessMemory.id, draftRow.id), isNull(businessMemory.confirmedAt)))
          .returning({ id: businessMemory.id });

        if (updated.length === 0) {
          throw new TRPCError({
            code: 'CONFLICT',
            message:
              'This Business Memory was confirmed in another session. Reload to see the current state.',
          });
        }

        // Append the confirmation half of the paste-extract event. `latencyMs`
        // null — no AI call here; the confirmation is pure DB work.
        await tx.insert(interaction).values({
          accountId: ctx.tenantId,
          userId: ctx.session.user.id,
          kind: 'paste_extract',
          query: null,
          answer: null,
          citations: null,
          model: EXTRACT_MODEL_ID,
          langfuseTraceId: null,
          latencyMs: null,
        });

        // Re-read the row in the same transaction so the caller sees the
        // canonical post-confirm shape (timestamps, merged provenance, etc.).
        const refreshed = await tx
          .select()
          .from(businessMemory)
          .where(eq(businessMemory.id, draftRow.id))
          .limit(1);

        return refreshed[0];
      });

      logger.info('memory.confirmDraft: ok', {
        accountId: ctx.tenantId,
        action: 'confirm',
      });

      return persisted;
    }),

  /**
   * Read the current Business Memory row for `ctx.tenantId`.
   *
   * Returns `null` when no row exists yet (founder has not pasted) — the page
   * server-component renders the paste textarea in that case. After confirm,
   * a fresh request (page reload) returns the same row, proving persistence
   * — that is the `must_haves` reload-persists truth.
   */
  getDraft: protectedProcedure.query(async ({ ctx }) => {
    const rows = await ctx.db.rls(async (tx) =>
      tx
        .select()
        .from(businessMemory)
        .where(eq(businessMemory.accountId, ctx.tenantId))
        .limit(1),
    );

    logger.info('memory.getDraft: ok', {
      accountId: ctx.tenantId,
      action: 'get',
    });

    return rows[0] ?? null;
  }),
});

/** The router type — exported so client-side type inference can pick it up via `AppRouter`. */
export type MemoryRouter = typeof memoryRouter;

/**
 * Re-export AppError so consumers (e.g. integration tests) that need to
 * pattern-match against the agent's error codes can reach it through this
 * router's barrel without a deep import. Kept narrow on purpose.
 */
export { AppError };
