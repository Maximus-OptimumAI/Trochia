/**
 * Q&A answer — the forced-tool-use contract + the citation-validation reference
 * shape for the qa-rag agent (Phase 2 / KNW-05c).
 *
 * `qaAnswerSchema` is the Zod schema `runAgent<QaAnswer>()` turns into a
 * forced-tool-use tool: the Opus synthesis MUST emit `{ answer, citations[],
 * grounded }`. Every emitted citation is then re-validated against the SAME
 * turn's retrieved candidate set (`validateCitations` in `qa-rag.agent.ts`);
 * any citation whose `(sourceId, chunkIdx)` is not in the retrieved set is
 * DROPPED, which forces `grounded:false` + the deterministic "I don't know"
 * body (Codex P2-E).
 *
 * `AskQaResult` is the AGENT return type. Its `debug` surface is COMPUTED by the
 * agent (counts/scores/keys ONLY) — it is NOT part of the Zod tool schema, the
 * model never emits it, and the tRPC router strips it before the client boundary
 * (Codex P2-D). It carries NO query/answer/chunk TEXT (the privacy contract,
 * guardrail #3).
 */
import { z } from 'zod';

/**
 * The forced-tool-use structured output the Opus synthesis must return.
 *
 *  - `answer`: the synthesized, operator-voice answer grounded in the retrieved
 *    chunks (or the deterministic "I don't know" body on weak retrieval / a
 *    dropped citation).
 *  - `citations`: each entry traces to a retrieved chunk by `(sourceType,
 *    sourceId, chunkIdx)`. `sourceType` mirrors the retriever's source types
 *    ('memory' | 'corpus'). Validated post-synthesis against the retrieved set.
 *  - `grounded`: true ONLY when ≥1 citation is valid AND zero citations were
 *    dropped (Codex P2-E). The agent OVERRIDES the model's `grounded` to false
 *    on any dropped citation.
 */
export const qaAnswerSchema = z.object({
  answer: z.string(),
  citations: z.array(
    z.object({
      sourceType: z.enum(['memory', 'corpus']),
      sourceId: z.string(),
      chunkIdx: z.number().int(),
    }),
  ),
  grounded: z.boolean(),
});

/** The validated structured output of the Opus synthesis. */
export type QaAnswer = z.infer<typeof qaAnswerSchema>;

/** A single citation entry (the forced-tool-use citation shape). */
export type QaCitation = QaAnswer['citations'][number];

/**
 * The qa-rag agent's return type. `answer` is the client-facing structured
 * output; `debug` is the eval/observability surface — TYPE-SEPARATED from the
 * answer (Codex P2-D), COMPUTED by the agent (not model-emitted), and carrying
 * NO query/answer/chunk TEXT (counts/scores/keys only — the privacy contract).
 *
 * The tRPC router (T04) returns `result.answer` ONLY and strips `debug` before
 * the boundary so the client never receives the debug surface. The qa-grounding
 * eval (T03) consumes `result.debug.droppedCitationCount` to assert zero
 * fabrication across the fixture Q-set.
 */
export type AskQaResult = {
  /** The client-facing structured answer. */
  answer: QaAnswer;
  /** Eval/observability evidence — counts/scores/keys ONLY, never text. */
  debug: {
    /** How many emitted citations were dropped as not-in-retrieved-set. */
    droppedCitationCount: number;
    /** The max cosine similarity over the retrieved candidates (∈ [-1, 1]). */
    maxVectorScore: number;
    /** The retrieved candidate keys ("sourceId|chunkIdx") for this turn. */
    retrievedKeys: string[];
  };
};
