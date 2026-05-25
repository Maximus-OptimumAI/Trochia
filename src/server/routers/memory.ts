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
 *
 * ## Week-3 additions (Plan 02-03 / Task 11)
 *
 * Five surgical wires landed on top of the Plan 02-02 surface — every 02-02
 * race-condition fix from commit `3be8fa6` (atomic upsert + `isNull(confirmedAt)`
 * confirm guard) is preserved byte-for-byte.
 *
 *   1. **Output shape extension (additive)** — `extractFromPaste` now returns
 *      `pii: { redactionsApplied, byType }` and an extended `injectionScreen`
 *      whose `severity` field surfaces to the UI (the UI banner reads it).
 *      Severity at this point is bounded to `'none' | 'low' | 'medium'`; the
 *      `'high' | 'critical'` bands never reach the procedure body because the
 *      agent throws `AI_INJECTION_REJECTED` first. The destructure carries
 *      defensive defaults so the Plan 02-02 RLS-test mock (which returns the
 *      pre-Week-3 shape) continues to pass — see workaround note inline.
 *
 *   2. **`AI_INJECTION_REJECTED` → `BAD_REQUEST` mapping** — the existing
 *      `rethrowAgentError` switch grew one case. The original `AppError.cause`
 *      is preserved so callers + Sentry can correlate the AI-side throw to the
 *      tRPC-side rejection.
 *
 *   3. **Security-IR audit row on rejection (plan-checker FLAG-1)** — when the
 *      agent throws `AI_INJECTION_REJECTED`, the router writes a fresh
 *      `interaction` row (kind `paste_extract`, `metadata = { rejected: true,
 *      severity, categoryCount }`) BEFORE re-throwing as `BAD_REQUEST`. The
 *      metadata column is the audit boundary: it carries severity band +
 *      category count ONLY. NEVER raw paste content, NEVER matched substrings,
 *      NEVER the `byType` breakdown, NEVER `source_snippet` text. If the
 *      audit-row insert itself fails (DB outage), the failure is logged and
 *      swallowed — the founder still gets the `BAD_REQUEST` response, which is
 *      the correct security posture (rejecting the attack is more important
 *      than the audit trail being complete).
 *
 *      Implementation note: the T6 `AppError` carries `{ status, code, message,
 *      cause }` only — there is no structured `context` field. The message
 *      format is `"Paste rejected: <N> high-severity injection markers across
 *      <M> categories."` (literal "high-severity" regardless of whether the
 *      classifier emitted `'high'` or `'critical'`). We regex-parse `<N>` and
 *      `<M>` from the message; severity records as `null` rather than echoing
 *      a misleading literal. A future `AppError` shape upgrade (structured
 *      `context: { severity, categoryCount }`) would replace this regex with a
 *      direct read. See `tasks/lessons.md` for the deferred follow-up.
 *
 *   4. **`CONFLICT_UNRESOLVED` server backstop on `confirmDraft`** — before
 *      writing, the router walks every `confirmed.provenance` entry. If any
 *      entry is still an array (the founder somehow submitted without
 *      resolving the in-form conflict resolver), throw `TRPCError CONFLICT`
 *      with cause `AppError({ code: 'CONFLICT_UNRESOLVED' })`. The submit gate
 *      in Task 10's confirmation form should prevent this; the server is the
 *      backstop for form-bypass attacks.
 *
 *   5. **Post-confirm conflict-resolution audit metadata** — the confirm-side
 *      `interaction` row's kind switched to `'paste_confirm'` (added in
 *      precursor `d5902ef`). Its `metadata` jsonb captures
 *      `resolvedFields: [{ fieldKey, chosenSourceSnippet (≤ 200 chars),
 *      rejectedCount }]` for every field whose provenance carries a
 *      `rejected_alternatives` audit trail. Snippet is capped at 200 chars
 *      (audit visibility without leaking content to logs); `byType` and full
 *      `source_snippet` never enter `logger.*`. The metadata column is the
 *      audit boundary; the logger remains content-blind. When zero conflicts
 *      were resolved, `resolvedFields` is omitted (no empty-array noise).
 *
 * ## /cso T16-FIX-1 (M1) — trusted founder identity threading
 *
 * The `extractFromPaste` mutation now passes `ctx.session.user.email ?? ''`
 * as `founderEmail` into the agent. The agent feeds this single trusted email
 * to the PII redactor's founder-self exemption — replacing the previous
 * `draft.team?.founders ?? []` source, which was LLM-derived from attacker-
 * controlled paste. The router is the trust boundary: Supabase Auth has
 * already verified the email via `auth.getUser()` (see `src/server/context.
 * ts` revalidation path); the LLM never gets a chance to invent it.
 *
 * Empty string fallback covers signup edge cases where the session shape
 * carries `email: undefined`. The redactor treats an empty exemption set as
 * "redact every email" — conservative; over-redaction beats under-redaction.
 *
 * ## /cso T16-FIX-1 (M2) — confirmDraft TOCTOU guard via lastUpdatedAt
 *
 * The `confirmDraft` SELECT-then-UPDATE block previously gated only on
 * `isNull(confirmedAt)` (P2-3 atomic confirm guard). Between the SELECT (line
 * 565-574) and the UPDATE (line 641-660), a concurrent `extractFromPaste`
 * call could drift the `provenance` jsonb on the same row — and the
 * UPDATE-WHERE predicate would still match. Result: the merged provenance
 * stamps `rejected_at` markers onto snippets the founder never saw.
 *
 * Fix: capture `lastUpdatedAt` from the SELECT, include it in the
 * UPDATE-WHERE predicate alongside `isNull(confirmedAt)`. If a concurrent
 * extractor bumped `lastUpdatedAt`, the UPDATE matches zero rows and the
 * existing CONFLICT branch fires — the founder reloads and re-confirms
 * against the fresh provenance, instead of silently persisting phantom
 * rejected_at markers.
 *
 * Chose the `lastUpdatedAt-in-WHERE` shape over `SELECT FOR UPDATE` because
 * (a) it adds one column to the existing AND-chain rather than a new query-
 * builder verb that Drizzle does not first-class support, and (b) it keeps
 * the lock-free posture of the rest of this router. Both shapes solve the
 * race; this one is the smaller diff.
 *
 * ## /cso T16-FIX-1 (M3) — audit-row swallow log widened
 *
 * The security-IR audit-row write inside the `extractFromPaste` catch (line
 * 308-339) swallowed `auditErr` and logged only `accountId`. On DB transient
 * outages this lost ALL forensic signal for that rejection event.
 *
 * Fix: the swallow log now carries the same redaction-boundary-safe fields
 * that would have gone into `interaction.metadata` — `severity`,
 * `categoryCount`, `markerCount`. Same boundary discipline as the metadata
 * column itself: numeric counts + severity band only. NEVER `auditErr.
 * message` (which can echo DB schema), NEVER matched substrings, NEVER paste
 * content, NEVER `byType` detail.
 */
import { TRPCError } from '@trpc/server';
import { and, eq, isNull } from 'drizzle-orm';
import { z } from 'zod';

import { extractFromPaste as extractFromPasteAgent } from '@/ai/agents/extract-from-paste.agent';
import {
  businessMemoryConfirmedSchema,
  isProvenanceArray,
  type BusinessMemoryDraft,
  type Provenance,
  type ProvenanceField,
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

/**
 * Cap on `chosenSourceSnippet` length inside the post-confirm audit metadata.
 * 200 chars matches the extractor's `source_snippet` instruction in the system
 * prompt (`docs/Trochia_AI_Phase_2_PLAN_v1.md` + the agent's prompt) so the
 * audit row carries the FULL canonical snippet, while still capping in case
 * the extractor emits a longer string. Sets the audit boundary: enough signal
 * for security-IR + eval sampling, not enough to leak full provenance content
 * into the structured-log surface (the `metadata` jsonb column is the only
 * place the snippet lives; logger payloads stay content-blind).
 */
const CONFLICT_AUDIT_SNIPPET_CAP = 200;

// ────────────────────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────────────────────

/**
 * Map an agent-side `AppError` into a tRPC error. Length errors and the Week-3
 * injection-rejection are 400s (caller-facing — the founder can fix and retry);
 * banned-output / structured-output failures are 500s (the model misbehaved —
 * this is an internal AI problem, not a caller problem). Anything else
 * re-throws as INTERNAL_SERVER_ERROR.
 *
 * `AI_INJECTION_REJECTED` (Plan 02-03 / Task 6) → `BAD_REQUEST`. The original
 * `AppError` is preserved as `cause` so Sentry + tRPC error formatters can
 * correlate. The message format from the agent is `"Paste rejected: <N>
 * high-severity injection markers across <M> categor(y|ies)."` — caller-safe
 * (no matched substrings, no paste content).
 */
function rethrowAgentError(err: unknown): never {
  if (isAppError(err)) {
    switch (err.code) {
      case 'PASTE_TOO_SHORT':
      case 'PASTE_TOO_LONG':
      case 'AI_INJECTION_REJECTED':
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
 * Parse a security-IR audit context out of an `AI_INJECTION_REJECTED` message.
 *
 * **Workaround (Plan 02-03 / Task 11):** The current `AppError` shape carries
 * `{ status, code, message, cause }` only — there is no structured `context`
 * field, so the agent's severity + category-count signal is embedded in the
 * message string by T6 (`extract-from-paste.agent.ts:380-383`). We regex-parse
 * what's there:
 *
 *   - `markerCount`: matches `(\d+) high-severity injection markers` — robust;
 *     the agent always emits this exact phrase before the count.
 *   - `categoryCount`: matches `across (\d+) categor` — robust; covers both
 *     `category` and `categories` plural arms.
 *   - `severity`: the agent's message literal is always "high-severity"
 *     regardless of whether the classifier emitted `'high'` or `'critical'`.
 *     Echoing `"high"` from the message would mislead audit IR when the actual
 *     classification was `'critical'`. We return `null` here and rely on the
 *     audit-team's downstream query to join on the classifier's separate trace
 *     when the AppError shape upgrades to carry structured `context`.
 *
 * The acceptable deferred follow-up is to upgrade `AppError` to carry a typed
 * `context` payload (see `src/lib/errors.ts`); when that lands, this helper
 * can be deleted and the values read directly from `err.context.{severity,
 * categoryCount}`. Until then, the regex parse is the audit-data contract.
 */
function extractRejectionContext(message: string): {
  severity: string | null;
  categoryCount: number | null;
  markerCount: number | null;
} {
  const markerMatch = message.match(/(\d+)\s+high-severity injection markers/);
  const categoryMatch = message.match(/across\s+(\d+)\s+categor/);
  return {
    // Severity stays null — see helper-header explanation. The message-literal
    // is always "high-severity"; echoing that would lose the high-vs-critical
    // distinction the classifier actually made.
    severity: null,
    categoryCount: categoryMatch ? Number.parseInt(categoryMatch[1]!, 10) : null,
    markerCount: markerMatch ? Number.parseInt(markerMatch[1]!, 10) : null,
  };
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
      //
      //    On `AI_INJECTION_REJECTED` (Plan 02-03 / Task 11, FLAG-1):
      //    write a security-IR audit row inside a fresh RLS transaction
      //    BEFORE re-throwing as BAD_REQUEST. Metadata redaction boundary:
      //    severity band + category/marker COUNTS only — NEVER matched
      //    substrings, paste content, byType detail, or source_snippets.
      //    If the audit-row insert itself fails (DB outage), the error is
      //    logged and swallowed; rejecting the attack is more important
      //    than the audit trail being complete.
      let agentResult;
      try {
        agentResult = await extractFromPasteAgent({
          accountId: ctx.tenantId,
          paste: input.paste,
          // /cso T16-FIX-1 (M1): trusted founder identity for the PII
          // redactor's founder-self exemption. `ctx.session.user.email` is
          // Supabase-verified (the context layer revalidates via
          // `auth.getUser()` — see src/server/context.ts). Fallback to empty
          // string when the session shape carries `email: undefined`
          // (signup edge case): the agent treats an empty exemption as
          // "redact every email" — conservative over-redaction is preferred
          // to under-redaction of an attacker-injected email.
          founderEmail: ctx.session.user.email ?? '',
        });
      } catch (err) {
        if (isAppError(err) && err.code === 'AI_INJECTION_REJECTED') {
          const rejectionCtx = extractRejectionContext(err.message);
          try {
            await ctx.db.rls(async (tx) => {
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
                metadata: {
                  rejected: true,
                  severity: rejectionCtx.severity,
                  categoryCount: rejectionCtx.categoryCount,
                  markerCount: rejectionCtx.markerCount,
                },
              });
            });
          } catch {
            // /cso T16-FIX-1 (M3): widened swallow-log payload to preserve
            // security-IR forensic signal when the audit-row write fails (DB
            // transient outage, RLS misconfiguration, etc). The same
            // redaction-boundary-safe fields that would have landed in
            // `interaction.metadata` above are surfaced here: severity band
            // + numeric counts ONLY.
            //
            // STILL NEVER logged: `auditErr` payload (DB driver errors can
            // echo schema / query content); the original `err.message`
            // (already carries marker counts destined for BAD_REQUEST surface
            // — no need to duplicate); matched substrings or paste content
            // (those are not in scope at this catch site, by design).
            //
            // The founder still gets BAD_REQUEST — rejecting the attack is
            // more important than the audit trail being complete.
            logger.error('memory.extractFromPaste: audit-row write failed on rejection', {
              accountId: ctx.tenantId,
              severity: rejectionCtx.severity,
              categoryCount: rejectionCtx.categoryCount,
              markerCount: rejectionCtx.markerCount,
            });
          }
        }
        rethrowAgentError(err);
      }

      // Defensive destructure with fallbacks. The agent's Week-3 return shape
      // includes `pii` + `injectionScreen.severity`; the Plan 02-02 RLS-test
      // mock (`tests/integration/memory-paste-rls.test.ts` lines 178-181)
      // returns the pre-Week-3 shape (`injectionScreen: { flagged, matches }`
      // only, no `pii`). Defaults below preserve the RLS regression baseline
      // without test edits — production calls always carry the new fields
      // because the agent (Task 6) always emits them.
      const {
        draft,
        langfuseTraceId,
        latencyMs,
        injectionScreen,
        pii = { redactionsApplied: 0, byType: { email: 0, phone: 0, wallet: 0, ssn: 0 } },
      } = agentResult;
      const injectionSeverity = injectionScreen?.severity ?? 'none';
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

      // Log payload extension (Plan 02-03 / Task 11): adds `redactionsApplied`
      // (count only — NEVER `byType` contents) and `injectionSeverity` (band
      // only — bounded to `'none' | 'low' | 'medium'` here because the
      // `'high' | 'critical'` bands already threw above). The matched-injection
      // snippets carry paste content and NEVER reach `logger.*`.
      logger.info('memory.extractFromPaste: ok', {
        accountId: ctx.tenantId,
        action: 'extract',
        latencyMs,
        injectionFlagged: injectionScreen.flagged,
        injectionSeverity,
        redactionsApplied: pii.redactionsApplied,
        hasExistingConfirmed: persisted.existingConfirmed !== null,
      });

      // Surface the Week-3 sanitizer metadata to the UI. The conflict-resolver
      // banner reads `pii.redactionsApplied` for the count + `pii.byType` for
      // the per-category breakdown; the injection-flag pill reads
      // `injectionScreen.severity`. `injectionScreen.matches` MUST NOT be
      // rendered verbatim in UI — those snippets are paste content.
      return {
        draft,
        existingConfirmed: persisted.existingConfirmed,
        injectionScreen: {
          flagged: injectionScreen.flagged,
          severity: injectionSeverity,
          matches: injectionScreen.matches,
        },
        pii,
        latencyMs,
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

      // ─── CONFLICT_UNRESOLVED server backstop (Plan 02-03 / Task 11) ──────
      // Plan 02-03 / Task 1 upgraded `provenanceEntrySchema` to a union of
      // single-object | multi-candidate-array. The Task-10 confirmation form's
      // submit gate prevents arrays from reaching here — the founder must
      // resolve each conflict (via `chooseProvenance`) before the form
      // submits. The server is the form-bypass backstop: if any entry is
      // STILL an array on the wire, surface `CONFLICT` rather than silently
      // persisting a half-resolved provenance map. This runs BEFORE the RLS
      // transaction — there is nothing to persist if the input is bad.
      const submittedProvenanceForGate: Provenance = confirmed.provenance ?? {};
      for (const [fieldKey, entry] of Object.entries(submittedProvenanceForGate)) {
        if (isProvenanceArray(entry)) {
          throw new TRPCError({
            code: 'CONFLICT',
            message: `Unresolved conflict on field: ${fieldKey}`,
            cause: new AppError(`Unresolved conflict on field: ${fieldKey}`, {
              status: 409,
              code: 'CONFLICT_UNRESOLVED',
            }),
          });
        }
      }

      // ─── Post-confirm conflict-resolution audit (Plan 02-03 / Task 11) ──
      // Build the audit payload BEFORE the RLS transaction so the
      // interaction-row write inside the tx can stamp `metadata.resolvedFields`
      // in one statement. For each field whose provenance carries a
      // `rejected_alternatives` audit trail (Task-1 / `chooseProvenance`
      // output), capture the field name, the chosen snippet (capped at
      // `CONFLICT_AUDIT_SNIPPET_CAP` chars), and the loser count. If zero
      // fields were resolved, omit `resolvedFields` entirely — no empty-array
      // noise in the audit feed.
      const resolvedFields: Array<{
        fieldKey: string;
        chosenSourceSnippet: string;
        rejectedCount: number;
      }> = [];
      for (const [fieldKey, entry] of Object.entries(submittedProvenanceForGate)) {
        // Single-object arm (guarded above). Narrow via the type guard.
        if (!isProvenanceArray(entry)) {
          const winner = entry as ProvenanceField;
          const rejected = winner.rejected_alternatives ?? [];
          if (rejected.length > 0) {
            const snippet = winner.source_snippet ?? '';
            resolvedFields.push({
              fieldKey,
              chosenSourceSnippet: snippet.slice(0, CONFLICT_AUDIT_SNIPPET_CAP),
              rejectedCount: rejected.length,
            });
          }
        }
      }
      // Build the metadata payload only when there is signal. Reserved for
      // the kind='paste_confirm' interaction row inside the RLS transaction
      // below. Future audit metadata keys (e.g. founder-override count) can
      // merge into this object alongside `resolvedFields`.
      const confirmAuditMetadata: Record<string, unknown> | null =
        resolvedFields.length > 0 ? { resolvedFields } : null;

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
        // /cso T16-FIX-1 (M2): capture `lastUpdatedAt` at SELECT time. The
        // UPDATE-WHERE predicate below re-asserts this exact value so a
        // concurrent `extractFromPaste` that drifted the row between this
        // SELECT and the UPDATE will cause the UPDATE to match zero rows —
        // the existing CONFLICT branch then surfaces the race instead of
        // silently merging founder edits onto a provenance jsonb the founder
        // never saw (which would stamp phantom `rejected_at` markers onto
        // snippets the extractor just rewrote).
        const draftLastUpdatedAt = draftRow.lastUpdatedAt;

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
          const existingEntry = mergedProvenance[key];
          // Only single-object provenance entries can carry a `rejected_at`
          // marker; array-form entries (pre-resolve multi-candidate) were
          // already rejected above by the `CONFLICT_UNRESOLVED` backstop.
          // The `!isProvenanceArray` narrow keeps TypeScript happy with the
          // union type from Plan 02-03 / Task 1.
          if (
            wasPopulated &&
            nowEmpty &&
            existingEntry &&
            !isProvenanceArray(existingEntry)
          ) {
            // Preserve the existing entry (snippet, confidence, original
            // extracted_at) and tag with rejected_at + bump last_updated.
            // Adding an extra `rejected_at` key into the jsonb is intentional
            // — provenance shape can evolve at the app layer without a SQL
            // migration (Plan 02-01 deliberate decision).
            mergedProvenance[key] = {
              ...existingEntry,
              last_updated: now.toISOString(),
              rejected_at: now.toISOString(),
            } as ProvenanceField & { rejected_at: string };
          }
        }

        // Concurrent-confirm guard (code-review P2-3): the UPDATE WHERE clause
        // re-asserts `confirmedAt IS NULL` so a second confirm-in-flight cannot
        // silently overwrite the first. If 0 rows match (another tab won the
        // race), `returning()` is empty and we surface a CONFLICT error rather
        // than reporting a phantom-successful confirm to the caller.
        //
        // /cso T16-FIX-1 (M2) — TOCTOU guard: the UPDATE-WHERE predicate ALSO
        // re-asserts `lastUpdatedAt = <value-from-SELECT>`. A concurrent
        // `extractFromPaste` that drifted the provenance between the SELECT
        // above and this UPDATE bumps `lastUpdatedAt`; the predicate no
        // longer matches; CONFLICT surfaces. Without this guard, the merge
        // overlay would stamp `rejected_at` markers onto snippets the
        // founder never saw.
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
          .where(
            and(
              eq(businessMemory.id, draftRow.id),
              isNull(businessMemory.confirmedAt),
              eq(businessMemory.lastUpdatedAt, draftLastUpdatedAt),
            ),
          )
          .returning({ id: businessMemory.id });

        if (updated.length === 0) {
          throw new TRPCError({
            code: 'CONFLICT',
            message:
              'This Business Memory was confirmed or re-extracted in another session. Reload to see the current state.',
          });
        }

        // Append the confirmation event. `latencyMs` null — no AI call here;
        // the confirmation is pure DB work.
        //
        // Plan 02-03 / Task 11: kind = `'paste_confirm'` (added to the enum
        // in precursor commit `d5902ef`) so eval samplers can split draft-vs-
        // confirmed traffic without parsing answer payloads. `metadata` jsonb
        // (added in the same precursor) carries the conflict-resolution audit
        // payload — `resolvedFields` is present only when at least one field
        // was resolved, omitted otherwise to keep the audit feed clean. The
        // chosen snippet is capped at `CONFLICT_AUDIT_SNIPPET_CAP` chars;
        // `byType` PII detail + full `source_snippet` text NEVER reach this
        // row (the metadata column is the audit boundary).
        await tx.insert(interaction).values({
          accountId: ctx.tenantId,
          userId: ctx.session.user.id,
          kind: 'paste_confirm',
          query: null,
          answer: null,
          citations: null,
          model: EXTRACT_MODEL_ID,
          langfuseTraceId: null,
          latencyMs: null,
          metadata: confirmAuditMetadata,
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
