/**
 * `qaRouter` — ambient Q&A tRPC surface (Phase 2 / KNW-05c).
 *
 * One procedure, `protectedProcedure` (tenant context required):
 *
 *   - `ask` — run the qa-rag agent (`askQa`) over the founder's confirmed
 *             knowledge, return the grounded + cited answer, and append a
 *             metadata-only `qa_sidebar` interaction row.
 *
 * ## The privacy boundary — the load-bearing T04 property (Codex P2-D)
 *
 * `askQa` returns `AskQaResult { answer, debug }`. The `debug` surface
 * (droppedCitationCount / maxVectorScore / retrievedKeys) is an EVAL-ONLY
 * observability surface — it carries the retrieved-set evidence the eval
 * harness consumes (Plan 02-07 / T03). It MUST NOT cross the tRPC boundary.
 *
 * This router returns `result.answer` ONLY. `result.debug` is destructured
 * away and never forwarded, logged, or persisted. The sidebar (`<QaSidebar/>`)
 * only ever receives a `QaAnswer`. A grep for `.debug` in this file shows it
 * is destructured-and-discarded, never returned.
 *
 * ## Error mapping (no query echo, no fabricated content)
 *
 *   - `AI_DAILY_CAP_EXCEEDED` (OD-8 HARD-block, propagated UNCHANGED from
 *     runAgent → askQa) → `TRPCError { code: 'TOO_MANY_REQUESTS', message:
 *     'Daily AI limit reached — resets at midnight UTC.' }`. The message is a
 *     STATIC constant — never the query, never an answer. The sidebar renders
 *     this as its own distinct non-fabricated, non-error "limit reached" state.
 *   - `QA_SYNTHESIS_FAILED` (static, redacted from the agent) → INTERNAL_SERVER_ERROR
 *     with NO content (the agent already stripped query/answer/chunk text at
 *     its throw site). The client surfaces a generic message — never the raw
 *     error, never the query.
 *
 * ## No duplicate screening (F-2 / T-02-07-03)
 *
 * Prompt-injection screening (the delimit + injection-screen pass) lives INSIDE
 * `qa-rag.agent.ts` (T02) — the router consumes the already-screened path and
 * does NOT add a second screening layer. A grep for those screening symbols in
 * this file returns ZERO.
 *
 * ## Metadata-only persistence (OD-5 + F-3)
 *
 * The `qa_sidebar` interaction row populates every NOT NULL column —
 * `accountId` (NOT NULL, from ctx.tenantId), `userId` (NOT NULL, from
 * ctx.session.user.id), `kind: 'qa_sidebar'` — plus the metadata columns
 * (`citations`, `model`, `langfuseTraceId`, `latencyMs`) and a `grounded`
 * flag in the `metadata` jsonb. `query`/`answer` are left NULL per OD-5
 * (confidentiality — the founder's question + the synthesized answer are
 * never persisted; the opt-in audit path is FOLLOWUP-QA-PERSISTENCE-AUDIT-OPT-IN).
 * The `result.debug` surface is NOT persisted.
 *
 * ## Content-blind logging (guardrail #3)
 *
 * Only `{ accountId, userId, action, latencyMs, grounded, citationCount }`
 * reach `logger.info` — mirroring memory.ts. NEVER the query, NEVER the
 * answer, NEVER chunk text. The cap-exceeded path logs a content-blind
 * marker only.
 *
 * ## Chokepoint discipline
 *
 * The Anthropic call happens INSIDE `askQa` → `runAgent` → `src/ai/client.ts`
 * (the XC-05 chokepoint). This router imports the AGENT, never the SDK.
 */
import { TRPCError } from '@trpc/server';
import { z } from 'zod';

import { askQa, type AskQaCtx } from '@/ai/agents/qa-rag.agent';
import { OPUS_MODEL } from '@/ai/router';
import { interaction } from '@/db/schema/memory';
import { isAppError } from '@/lib/errors';
import { logger } from '@/lib/logger';
import { protectedProcedure, router } from '@/server/trpc';

// ────────────────────────────────────────────────────────────────────────────
// Constants
// ────────────────────────────────────────────────────────────────────────────

/**
 * The typed cap-exceeded code propagated UNCHANGED from runAgent → askQa
 * (T01 / OD-8). The router maps it to the user-facing limit-reached state.
 */
const CAP_EXCEEDED_CODE = 'AI_DAILY_CAP_EXCEEDED';

/**
 * The EXACT user-facing copy for the daily-cap HARD-block (OD-8 RATIFIED
 * 2026-06-01). Mirrored verbatim in `src/components/qa/sidebar.tsx`. NO query
 * echo, NO fabricated answer — this is a non-error, non-fabricated state.
 */
const CAP_REACHED_MESSAGE = 'Daily AI limit reached — resets at midnight UTC.';

// ────────────────────────────────────────────────────────────────────────────
// Input schema
// ────────────────────────────────────────────────────────────────────────────

/**
 * `ask` input. The founder's untrusted question. Length bounds mirror the
 * agent's defensive posture (a 1-char min rejects empty submits; a 2000-char
 * max keeps the synthesis input bounded). The query is screened + delimited
 * INSIDE the agent (F-2) — not here.
 */
const askInputSchema = z.object({
  query: z.string().min(1).max(2000),
});

// ────────────────────────────────────────────────────────────────────────────
// Router
// ────────────────────────────────────────────────────────────────────────────

export const qaRouter = router({
  /**
   * Answer a founder's question from their confirmed knowledge, grounded +
   * cited. Returns `result.answer` ONLY — the `debug` surface is stripped
   * before the tRPC boundary (P2-D).
   *
   * @throws TOO_MANY_REQUESTS — on AI_DAILY_CAP_EXCEEDED (OD-8 HARD-block).
   *         Message is the static CAP_REACHED_MESSAGE — no query echo.
   * @throws INTERNAL_SERVER_ERROR — on QA_SYNTHESIS_FAILED / any other agent
   *         failure. No content (the agent already redacted at its throw site).
   */
  ask: protectedProcedure.input(askInputSchema).mutation(async ({ ctx, input }) => {
    const startedAt = Date.now();

    let result;
    try {
      // The agent owns ALL untrusted-input handling (screen + delimit) and the
      // metered Anthropic call. Account-scoped end to end: ctx.tenantId is the
      // tenant, ctx.db.rls is the request-scoped RLS runner the retriever uses.
      //
      // The request client's `rls` runner is typed against the FULL Drizzle
      // schema; the agent's `AskQaCtx['rls']` declares the structurally-loose
      // `PgTransaction<never,never,never>` runner (retrieve.ts). Runtime
      // behaviour is identical (a db.transaction wrapper) — cast across the
      // variance boundary, matching the qa-grounding eval check's pattern.
      result = await askQa(
        { accountId: ctx.tenantId, query: input.query },
        { rls: ctx.db.rls as unknown as AskQaCtx['rls'] },
      );
    } catch (err) {
      // OD-8: the typed cap-exceeded error maps to the user-facing limit state.
      // Content-blind: log a marker only (accountId + userId + action), NEVER
      // the query. The message is the STATIC cap copy — no query echo.
      if (isAppError(err) && err.code === CAP_EXCEEDED_CODE) {
        logger.warn('qa.ask: daily cap exceeded', {
          accountId: ctx.tenantId,
          userId: ctx.session.user.id,
          action: 'ask',
        });
        throw new TRPCError({ code: 'TOO_MANY_REQUESTS', message: CAP_REACHED_MESSAGE });
      }
      // QA_SYNTHESIS_FAILED + any other failure → INTERNAL with NO content. The
      // agent already discarded query/answer/chunk text at its throw site; we
      // surface a static message and NEVER attach the original error as cause
      // (a cause string could carry text that escapes the structured-field
      // redactor — the 02-06 lesson).
      logger.error('qa.ask: synthesis failed', {
        accountId: ctx.tenantId,
        userId: ctx.session.user.id,
        action: 'ask',
      });
      throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Q&A synthesis failed.' });
    }

    // STRIP the debug surface BEFORE the tRPC boundary (P2-D). `debug` is read
    // here for the server-side observability log ONLY — it is NEVER forwarded;
    // the client only ever receives `answer` (see the `return answer` below).
    // The retrievedKeys/scores/counts stay server-side.
    const { answer, debug } = result;

    const latencyMs = Date.now() - startedAt;

    // Metadata-only persistence (OD-5 + F-3). Populate EVERY NOT NULL column —
    // accountId (NOT NULL), userId (NOT NULL, references users.id), kind. The
    // metadata columns carry citations/model/trace/latency; `grounded` rides in
    // the metadata jsonb. query/answer stay NULL (confidentiality). The write
    // runs inside ctx.db.rls so it cannot leak across tenants.
    //
    // A persistence failure must NOT fail the answer the founder already paid
    // for — wrap in try/catch + content-blind log (same posture as memory.ts's
    // audit-row swallow). The eval samples from real traffic; a missed audit
    // row is acceptable, a swallowed answer is not.
    try {
      await ctx.db.rls(async (tx) => {
        await tx.insert(interaction).values({
          accountId: ctx.tenantId,
          userId: ctx.session.user.id,
          kind: 'qa_sidebar',
          query: null,
          answer: null,
          // citations array — shape mirrors interaction.citations' documented
          // contract; carries (sourceType, sourceId, chunkIdx) refs ONLY, no
          // chunk text. On the "I don't know" path this is an empty array.
          citations: answer.citations,
          model: OPUS_MODEL,
          langfuseTraceId: null,
          latencyMs,
          metadata: { grounded: answer.grounded },
        });
      });
    } catch {
      // Content-blind swallow — NEVER log the error payload (DB driver errors
      // can echo schema/query). The founder still gets their answer.
      logger.error('qa.ask: interaction-row write failed', {
        accountId: ctx.tenantId,
        userId: ctx.session.user.id,
        action: 'ask',
      });
    }

    // Content-blind success log — counts + flags + scores only, NEVER query/answer.
    // `maxVectorScore` is the strongest retrieved cosine similarity (a bare float
    // ∈ [-1, 1], no content); logging it makes the grounding-floor decision
    // (askQa returns the deterministic "I don't know" when maxVectorScore < the
    // 0.6 GROUNDING_THRESHOLD) observable in prod without exposing it to the
    // client. It does NOT cross the tRPC boundary — only this server log.
    logger.info('qa.ask: ok', {
      accountId: ctx.tenantId,
      userId: ctx.session.user.id,
      action: 'ask',
      latencyMs,
      grounded: answer.grounded,
      citationCount: answer.citations.length,
      maxVectorScore: debug.maxVectorScore,
    });

    // Return the stripped answer ONLY (P2-D). No debug surface crosses here.
    return answer;
  }),
});

/** The router type — exported so client-side type inference picks it up via `AppRouter`. */
export type QaRouter = typeof qaRouter;
