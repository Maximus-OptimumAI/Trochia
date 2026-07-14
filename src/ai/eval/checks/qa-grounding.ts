/**
 * QA-grounding check (Phase 2 exit gate criteria 6 + 7) - Plan 02-07 / T03.
 *
 * Flips from the 'pending' stub (Plan 02-04 close) to a REAL check now that the
 * qa-rag agent (02-07 / T02) has landed. It runs the REAL `askQa` (→ real
 * hybridRetrieve + runAgent) over the qa-grounding fixture Q-set and asserts:
 *
 *   - criterion 7 (zero fabrication): every in-scope Q's
 *     `result.debug.droppedCitationCount === 0`. The eval consumes the
 *     TYPE-SEPARATED `AskQaResult.debug` surface (Codex P2-D) - the dropped count
 *     is computed by the agent comparing emitted (sourceId, chunkIdx) citations
 *     against the SAME turn's retrieved set via the exported `validateCitations`,
 *     so the eval OBSERVES the drop, it does not rely on a hidden internal drop.
 *   - criterion 6 ("I don't know" on out-of-scope): every deliberately
 *     out-of-scope Q returns `result.answer.grounded === false`.
 *   - cosine separation (memory-answerable T2): the weakest in-scope
 *     `maxVectorScore` sits above the strongest out-of-scope one
 *     (`min(in-scope) > max(out-of-scope)`) - so the threshold decision is
 *     eval-backed, not guessed. A per-question top-hit chunk_idx/label sweep is
 *     written to stdout so wrong-chunk matches are visible.
 *
 * `metric = droppedCitationCount` (summed across in-scope Qs), `threshold = 0`.
 *
 * ## Status model (mirrors extraction-floor)
 *
 *   - ANTHROPIC_API_KEY absent → 'skip' (env-unavailable; askQa is NEVER called).
 *     Non-blocking on PR/local; the runner promotes it to a FAILURE when
 *     EVAL_LIVE_REQUIRED==='1'.
 *   - all in-scope droppedCitationCount===0 AND all out-of-scope grounded:false
 *     → 'pass'; else 'fail'.
 *
 * ## Privacy
 *
 * `reason` carries ONLY counts (dropped total + per-bucket Q counts). The
 * question text, the answer, and the chunk text NEVER reach `reason` or any log.
 * Anthropic + Voyage are touched ONLY via askQa → runAgent / voyage.adapter (the
 * chokepoints); this file imports NO provider SDK.
 *
 * ## Execution boundary (F-6)
 *
 * THIS check (env-gated) calls the REAL askQa → real hybridRetrieve + runAgent.
 * The UNIT test (tests/ai/eval/checks/qa-grounding.test.ts) MOCKS askQa entirely
 * so a present-but-invalid key in .env.local never fires a real call (the 02-05
 * env-gate-keys-on-presence lesson).
 */
import { askQa, type AskQaCtx } from '@/ai/agents/qa-rag.agent';
import {
  QA_GROUNDING_FIXTURE_PATHS,
  loadQaGroundingFixtures,
} from '../fixtures';
import { evalChunkLabels } from '../fixtures/eval-corpus';
import type { EvalCheck } from '../types';

/** Zero-fabrication threshold (Phase 2 exit gate criterion 7). LOCKED, not moved. */
const DROPPED_THRESHOLD = 0;

/**
 * Systematic-fabrication trip (EVAL-TOLERANCE-01, tightening 2). If this many or
 * more DISTINCT in-scope fixtures drop a citation on the first pass, that is a
 * systematic drop, not the known single-fixture variance (QA-GROUNDING-VARIANCE-01)
 * - FAIL IMMEDIATELY with NO re-run. Only 1 or 2 dropped fixtures are re-run once
 * each; a drop that REPRODUCES on the re-run is also systematic and hard-fails. The
 * bar stays EXACTLY zero: a fabrication must reproduce (or already be systematic) to
 * pass through as a fail; nothing raises DROPPED_THRESHOLD.
 */
const SYSTEMATIC_DROPPED_FIXTURES = 3;

export const qaGrounding: EvalCheck = {
  id: 'qa-grounding',
  description:
    'qa-rag agent emits zero fabricated citations + "I don\'t know" on out-of-scope Qs (Phase 2 exit gate criteria 6+7)',
  async run() {
    // Env-gate: no ANTHROPIC_API_KEY → skip (env-unavailable). askQa is NOT
    // called. The runner treats this skip as non-blocking on PR/local and as a
    // RED gate when EVAL_LIVE_REQUIRED==='1'.
    if (!process.env.ANTHROPIC_API_KEY) {
      return {
        id: this.id,
        description: this.description,
        status: 'skip' as const,
        reason:
          'ANTHROPIC_API_KEY not set - live qa-grounding skipped (env-unavailable, non-blocking)',
      };
    }

    // Dynamic import AFTER the env-gate so the PR-sim ('skip') path never loads
    // @/db/client - it imports `server-only`, which throws under the tsx eval
    // runtime (npm run eval:run). Only the LIVE path (key present) needs it.
    const { getRequestClientFromClaims } = await import('@/db/client');

    // One grounded ask for a single fixture, building the request-scoped rls ctx
    // for the eval tenant. Shared by the first pass AND the bounded re-run so both
    // exercise the identical real path (hybridRetrieve + runAgent inside askQa).
    const askFixture = (f: { accountId: string; question: string }) => {
      const { rls } = getRequestClientFromClaims({
        sub: `eval-user-${f.accountId}`,
        role: 'authenticated',
        tenant_id: f.accountId,
      });
      // The request client's rls runner is typed against the full Drizzle schema;
      // hybridRetrieve (via AskQaCtx) declares the structurally-loose PgTransaction
      // runner (retrieve.ts). Runtime behavior is identical (a db.transaction
      // wrapper): cast across the variance boundary.
      const ctx = { rls: rls as unknown as AskQaCtx['rls'] };
      return askQa({ accountId: f.accountId, query: f.question }, ctx);
    };

    const fixtures = loadQaGroundingFixtures(QA_GROUNDING_FIXTURE_PATHS);
    const labels = evalChunkLabels(); // chunk_idx -> human label (deterministic seed)

    let droppedTotal = 0;
    let inScopeCount = 0;
    let outOfScopeCount = 0;
    let outOfScopeMisses = 0;
    // codex#5: verify grounding, not just absence of fabrication. An all-"I don't
    // know" run would pass criterion 7 vacuously (droppedTotal===0) - count
    // in-scope Qs that did NOT come back grounded with ≥1 citation as misses.
    let inScopeMisses = 0;
    // In-scope fixtures that dropped >=1 citation on the first pass. Drives the
    // bounded re-run (tightening 2); never re-run for misses/separation.
    const droppedInScope: Array<{ accountId: string; question: string }> = [];

    // Cosine sweep (memory-answerable T2): collect per-bucket maxVectorScore so
    // the threshold decision is eval-backed - keep 0.52 iff min(in-scope) clears
    // it with margin over max(out-of-scope). Plus a per-question top-hit
    // chunk_idx/label log so wrong-chunk matches are visible.
    const inScopeScores: number[] = [];
    const outScopeScores: number[] = [];
    const sweep: string[] = [];

    for (const [fxIdx, fx] of fixtures.entries()) {
      // First pass: the REAL read path via the shared askFixture helper, which
      // builds the request-scoped rls runner for the eval tenant and drives real
      // hybridRetrieve + runAgent inside askQa (no Supabase JWT secret needed; live
      // runs carry DATABASE_URL).
      const result = await askFixture(fx);

      const topHit = result.debug.topHit;
      const topLabel = topHit ? (labels[topHit.chunkIdx] ?? `#${topHit.chunkIdx}`) : '(none)';
      // CONTENT-BLIND validation-time top-hit log (codex+cso LOW, eval-sweep-
      // question-log): identify the fixture by INDEX + its expectedRetrievableMarker
      // - NEVER the question text - so the sweep doesn't leak fixture content into
      // CI logs if a future fixture becomes sensitive. Keeps maxVS, chunkIdx, label.
      sweep.push(
        `  ${fx.isOutOfScope ? 'OUT' : 'in '} maxVS=${result.debug.maxVectorScore.toFixed(4)} ` +
          `topHit=[idx ${topHit?.chunkIdx ?? '-'} "${topLabel}"] grounded=${result.answer.grounded} ` +
          `:: fixture#${fxIdx} marker=${fx.expectedRetrievableMarker || '(none)'}`,
      );

      if (fx.isOutOfScope) {
        outOfScopeCount += 1;
        outScopeScores.push(result.debug.maxVectorScore);
        // criterion 6: out-of-scope must return grounded:false ("I don't know").
        if (result.answer.grounded !== false) outOfScopeMisses += 1;
      } else {
        inScopeCount += 1;
        inScopeScores.push(result.debug.maxVectorScore);
        // criterion 7: zero fabricated citations, read from the type-separated debug.
        droppedTotal += result.debug.droppedCitationCount;
        if (result.debug.droppedCitationCount > 0) {
          droppedInScope.push({ accountId: fx.accountId, question: fx.question });
        }
        // codex#5: an in-scope Q must actually be answered grounded + cited.
        if (result.answer.grounded !== true || result.answer.citations.length < 1) inScopeMisses += 1;
      }
    }

    // Cosine separation: the in-scope floor must sit cleanly above the
    // out-of-scope ceiling. Empty buckets are non-blocking (±Infinity guards).
    const minInScope = inScopeScores.length ? Math.min(...inScopeScores) : Infinity;
    const maxOutScope = outScopeScores.length ? Math.max(...outScopeScores) : -Infinity;
    const separation = minInScope > maxOutScope;

    // Emit the sweep + top-hit log to stdout (synthetic data; not the eval
    // report's content-blind `reason`). This is the artifact the threshold
    // decision is read from.
    process.stdout.write(
      `\n[qa-grounding sweep] min(in-scope)=${Number.isFinite(minInScope) ? minInScope.toFixed(4) : 'n/a'} ` +
        `max(out-of-scope)=${Number.isFinite(maxOutScope) ? maxOutScope.toFixed(4) : 'n/a'} ` +
        `separation=${separation} (floor GROUNDING_THRESHOLD applied inside askQa)\n` +
        sweep.join('\n') +
        '\n',
    );

    // Bounded re-run for the known single-fixture drop variance (tightening 2).
    // droppedTotal>0 on the first pass is EITHER QA-GROUNDING-VARIANCE-01 (Opus
    // randomly emits one out-of-set citation the guard correctly drops) OR a
    // systematic fabrication. Distinguish WITHOUT moving the bar off zero:
    //   - >= SYSTEMATIC_DROPPED_FIXTURES distinct dropped fixtures: systematic,
    //     FAIL now, NO re-run.
    //   - 1 or 2 dropped fixtures: re-run each ONCE. A drop that REPRODUCES is
    //     systematic (fail); all-clean re-runs mean the drop was variance.
    // The re-run reads ONLY droppedCitationCount. inScopeMisses / outOfScopeMisses /
    // separation keep their first-pass zero-tolerance values and are NEVER re-run.
    let effectiveDropped = droppedTotal;
    let reRunNote = '';
    if (droppedTotal > 0) {
      if (droppedInScope.length >= SYSTEMATIC_DROPPED_FIXTURES) {
        reRunNote = `${droppedInScope.length} in-scope fixtures dropped on first pass (>= ${SYSTEMATIC_DROPPED_FIXTURES}); systematic, no re-run`;
      } else {
        let reproducedDropped = 0;
        let reproducedFixtures = 0;
        for (const df of droppedInScope) {
          const rr = await askFixture(df);
          if (rr.debug.droppedCitationCount > 0) {
            reproducedDropped += rr.debug.droppedCitationCount;
            reproducedFixtures += 1;
          }
        }
        if (reproducedFixtures > 0) {
          effectiveDropped = reproducedDropped;
          reRunNote = `${droppedInScope.length} fixture(s) dropped on first pass; ${reproducedFixtures} reproduced on re-run; systematic`;
        } else {
          effectiveDropped = 0;
          reRunNote = `${droppedInScope.length} fixture(s) dropped on first pass; re-run clean; treated as variance`;
        }
      }
    }

    const pass =
      effectiveDropped === DROPPED_THRESHOLD &&
      outOfScopeMisses === 0 &&
      inScopeMisses === 0 &&
      separation;
    const status = pass ? ('pass' as const) : ('fail' as const);

    // reason carries ONLY counts + scores + the re-run verdict (no question /
    // answer / chunk text). Both the first-pass dropped count AND the re-run outcome
    // are surfaced so a variance-cleared night and a systematic red are BOTH visible.
    const dropDetail =
      droppedTotal === 0
        ? `dropped citations 0 across ${inScopeCount} in-scope Qs (threshold ${DROPPED_THRESHOLD})`
        : `dropped citations ${effectiveDropped} across ${inScopeCount} in-scope Qs (threshold ${DROPPED_THRESHOLD}; first-pass ${droppedTotal}; ${reRunNote})`;
    return {
      id: this.id,
      description: this.description,
      status,
      metric: effectiveDropped,
      threshold: DROPPED_THRESHOLD,
      reason: `${dropDetail}; in-scope grounded+cited ${inScopeCount - inScopeMisses}/${inScopeCount}; out-of-scope grounded:false ${outOfScopeCount - outOfScopeMisses}/${outOfScopeCount}; cosine min(in)=${Number.isFinite(minInScope) ? minInScope.toFixed(4) : 'n/a'} max(out)=${Number.isFinite(maxOutScope) ? maxOutScope.toFixed(4) : 'n/a'} separation=${separation}`,
    };
  },
};
