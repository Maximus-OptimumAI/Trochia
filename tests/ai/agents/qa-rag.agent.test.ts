/**
 * qa-rag agent — unit test (Plan 02-07 / T02 / KNW-05b).
 *
 * The agent's PUBLIC contract:
 *   1. Retrieve via hybridRetrieve (mocked) under ctx.rls.
 *   2. Stage-1 floor: max vectorScore < 0.6 → deterministic "I don't know",
 *      runAgent NOT called (the no-Opus-on-weak cost guarantee).
 *   3. Synthesize via runAgent('reason', costContext) (mocked) with the query +
 *      chunks screened/delimited in variableSuffix (never stablePrefix.system).
 *   4. Stage-2 validation: any dropped/fabricated citation → grounded:false +
 *      the "I don't know" body (P2-E). grounded:true requires ≥1 valid + 0 dropped.
 *   5. AskQaResult.debug carries counts/scores/keys ONLY — no text (P2-D).
 *   6. The typed AI_DAILY_CAP_EXCEEDED propagates UNCHANGED (OD-8); every other
 *      failure → static QA_SYNTHESIS_FAILED with no query/answer/chunk text.
 *
 * ## Mock strategy — mock @/ai/rag/retrieve::hybridRetrieve + @/ai/client::runAgent
 *
 * No live providers (guardrail #6). The chokepoint + the retriever have their
 * own tests; here we control the candidate set + the model output to exercise
 * the agent's grounding + privacy + cost-threading logic.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/ai/rag/retrieve', () => ({
  hybridRetrieve: vi.fn(),
}));
vi.mock('@/ai/client', () => ({
  runAgent: vi.fn(),
}));

import { hybridRetrieve, type Candidate } from '@/ai/rag/retrieve';
import { runAgent } from '@/ai/client';
import {
  askQa,
  validateCitations,
  citationKey,
  GROUNDING_THRESHOLD,
} from '@/ai/agents/qa-rag.agent';
import type { QaAnswer } from '@/ai/schemas/qa-answer.zod';
import { AppError } from '@/lib/errors';

const hybridRetrieveMock = vi.mocked(hybridRetrieve);
const runAgentMock = vi.mocked(runAgent);

const ACCOUNT_ID = 'acct-qa-test';
const QUERY = 'What is our current MRR and runway?';
// A confidential marker that must NEVER appear in any trace/log/error/debug arg.
const SECRET_CHUNK = 'CONFIDENTIAL-CHUNK-TEXT-mrr-42000-runway-18mo';
const SECRET_ANSWER = 'CONFIDENTIAL-ANSWER-your-mrr-is-42000';

/** A fake request-scoped rls runner — never actually invoked (retrieve mocked). */
const ctx = { rls: (async (fn: unknown) => fn) as never };

function candidate(over: Partial<Candidate> = {}): Candidate {
  return {
    sourceType: 'memory',
    sourceId: 'mem-1',
    chunkIdx: 0,
    chunkText: SECRET_CHUNK,
    vectorScore: 0.82,
    ftsScore: null,
    rrfScore: 0.016,
    ...over,
  };
}

beforeEach(() => {
  hybridRetrieveMock.mockReset();
  runAgentMock.mockReset();
});

describe('validateCitations (pure)', () => {
  it('all-valid citations → dropped is empty', () => {
    const keys = new Set([citationKey('mem-1', 0), citationKey('corpus-9', 3)]);
    const { valid, dropped } = validateCitations(
      [
        { sourceType: 'memory', sourceId: 'mem-1', chunkIdx: 0 },
        { sourceType: 'corpus', sourceId: 'corpus-9', chunkIdx: 3 },
      ],
      keys,
    );
    expect(valid).toHaveLength(2);
    expect(dropped).toHaveLength(0);
  });

  it('a citation not in the retrieved set lands in dropped', () => {
    const keys = new Set([citationKey('mem-1', 0)]);
    const { valid, dropped } = validateCitations(
      [
        { sourceType: 'memory', sourceId: 'mem-1', chunkIdx: 0 },
        { sourceType: 'memory', sourceId: 'mem-FABRICATED', chunkIdx: 7 },
      ],
      keys,
    );
    expect(valid).toHaveLength(1);
    expect(dropped).toHaveLength(1);
    expect(dropped[0].sourceId).toBe('mem-FABRICATED');
  });

  it('accepts an array of keys as well as a Set', () => {
    const { valid } = validateCitations(
      [{ sourceType: 'corpus', sourceId: 'c1', chunkIdx: 2 }],
      [citationKey('c1', 2)],
    );
    expect(valid).toHaveLength(1);
  });
});

describe('askQa — stage-1 grounding floor', () => {
  it('weak retrieval (max vectorScore < 0.6) → "I don\'t know" and runAgent NOT called', async () => {
    hybridRetrieveMock.mockResolvedValueOnce([
      candidate({ vectorScore: 0.41 }),
      candidate({ sourceId: 'mem-2', vectorScore: 0.55 }),
    ]);

    const result = await askQa({ accountId: ACCOUNT_ID, query: QUERY }, ctx);

    expect(runAgentMock).toHaveBeenCalledTimes(0); // no Opus on weak retrieval
    expect(result.answer.grounded).toBe(false);
    expect(result.answer.citations).toEqual([]);
    expect(result.answer.answer).toMatch(/don't have that in your knowledge/i);
    expect(result.debug.droppedCitationCount).toBe(0);
    expect(result.debug.maxVectorScore).toBeCloseTo(0.55, 5);
  });

  it('empty retrieval → below floor → "I don\'t know", runAgent NOT called, maxVectorScore -1', async () => {
    hybridRetrieveMock.mockResolvedValueOnce([]);
    const result = await askQa({ accountId: ACCOUNT_ID, query: QUERY }, ctx);
    expect(runAgentMock).toHaveBeenCalledTimes(0);
    expect(result.answer.grounded).toBe(false);
    expect(result.debug.maxVectorScore).toBe(-1);
    expect(result.debug.retrievedKeys).toEqual([]);
  });

  it('GROUNDING_THRESHOLD is 0.6 (the 02-CONTEXT floor)', () => {
    expect(GROUNDING_THRESHOLD).toBe(0.6);
  });
});

describe('askQa — synthesis + stage-2 citation validation', () => {
  it('fully-valid grounded path → grounded:true with the validated citations', async () => {
    hybridRetrieveMock.mockResolvedValueOnce([
      candidate({ sourceId: 'mem-1', chunkIdx: 0 }),
      candidate({ sourceId: 'corpus-3', chunkIdx: 1, sourceType: 'corpus' }),
    ]);
    const model: QaAnswer = {
      answer: SECRET_ANSWER,
      citations: [
        { sourceType: 'memory', sourceId: 'mem-1', chunkIdx: 0 },
        { sourceType: 'corpus', sourceId: 'corpus-3', chunkIdx: 1 },
      ],
      grounded: true,
    };
    runAgentMock.mockResolvedValueOnce(model);

    const result = await askQa({ accountId: ACCOUNT_ID, query: QUERY }, ctx);

    expect(result.answer.grounded).toBe(true);
    expect(result.answer.answer).toBe(SECRET_ANSWER);
    expect(result.answer.citations).toHaveLength(2);
    expect(result.debug.droppedCitationCount).toBe(0);
  });

  it('P2-E: a fabricated citation is dropped → grounded:false AND body becomes "I don\'t know"', async () => {
    hybridRetrieveMock.mockResolvedValueOnce([candidate({ sourceId: 'mem-1', chunkIdx: 0 })]);
    const model: QaAnswer = {
      answer: SECRET_ANSWER, // a model body backed by a fabricated source
      citations: [{ sourceType: 'memory', sourceId: 'mem-FAKE', chunkIdx: 99 }],
      grounded: true, // the model claims grounded — the agent MUST override
    };
    runAgentMock.mockResolvedValueOnce(model);

    const result = await askQa({ accountId: ACCOUNT_ID, query: QUERY }, ctx);

    expect(result.answer.grounded).toBe(false);
    expect(result.answer.answer).toMatch(/don't have that in your knowledge/i);
    expect(result.answer.answer).not.toContain(SECRET_ANSWER);
    expect(result.debug.droppedCitationCount).toBe(1);
  });

  it('a model output with zero valid citations → grounded:false (needs ≥1 valid)', async () => {
    hybridRetrieveMock.mockResolvedValueOnce([candidate({ sourceId: 'mem-1', chunkIdx: 0 })]);
    runAgentMock.mockResolvedValueOnce({ answer: SECRET_ANSWER, citations: [], grounded: true });

    const result = await askQa({ accountId: ACCOUNT_ID, query: QUERY }, ctx);
    expect(result.answer.grounded).toBe(false);
    expect(result.debug.droppedCitationCount).toBe(0);
  });
});

describe('askQa — chunks land in variableSuffix, screened (T-02-07-03)', () => {
  it('retrieved chunks pass into variableSuffix, never stablePrefix.system', async () => {
    hybridRetrieveMock.mockResolvedValueOnce([candidate({ sourceId: 'mem-1', chunkIdx: 0 })]);
    runAgentMock.mockResolvedValueOnce({
      answer: SECRET_ANSWER,
      citations: [{ sourceType: 'memory', sourceId: 'mem-1', chunkIdx: 0 }],
      grounded: true,
    });

    await askQa({ accountId: ACCOUNT_ID, query: QUERY }, ctx);

    const call = runAgentMock.mock.calls[0][0];
    // chunks + query in variableSuffix (delimited as DATA)
    const suffix = typeof call.variableSuffix === 'string' ? call.variableSuffix : JSON.stringify(call.variableSuffix);
    expect(suffix).toContain(SECRET_CHUNK);
    expect(suffix).toContain('RETRIEVED_CONTEXT_BEGIN'); // delimitUntrusted fence
    // NEVER in the system block
    expect(call.stablePrefix.system).not.toContain(SECRET_CHUNK);
    expect(call.stablePrefix.system).not.toContain(QUERY);
    // metered + Opus
    expect(call.costContext).toEqual({ accountId: ACCOUNT_ID });
    expect(call.taskClass).toBe('reason');
  });
});

describe('askQa — privacy (P2-D + guardrail #3)', () => {
  it('debug carries counts/scores/keys ONLY — no query/answer/chunk text', async () => {
    hybridRetrieveMock.mockResolvedValueOnce([candidate({ sourceId: 'mem-1', chunkIdx: 0 })]);
    runAgentMock.mockResolvedValueOnce({
      answer: SECRET_ANSWER,
      citations: [{ sourceType: 'memory', sourceId: 'mem-1', chunkIdx: 0 }],
      grounded: true,
    });

    const result = await askQa({ accountId: ACCOUNT_ID, query: QUERY }, ctx);

    const debugStr = JSON.stringify(result.debug);
    expect(debugStr).not.toContain(SECRET_CHUNK);
    expect(debugStr).not.toContain(SECRET_ANSWER);
    expect(debugStr).not.toContain(QUERY);
    // shape: counts/scores/keys only
    expect(typeof result.debug.droppedCitationCount).toBe('number');
    expect(typeof result.debug.maxVectorScore).toBe('number');
    expect(result.debug.retrievedKeys).toEqual(['mem-1|0']);
  });

  it('a retrieve throw → static QA_SYNTHESIS_FAILED with no query/chunk text or cause', async () => {
    hybridRetrieveMock.mockRejectedValueOnce(new Error(`boom carrying ${QUERY} and ${SECRET_CHUNK}`));
    try {
      await askQa({ accountId: ACCOUNT_ID, query: QUERY }, ctx);
      expect.unreachable('should throw');
    } catch (err) {
      expect(err).toBeInstanceOf(AppError);
      const e = err as AppError;
      expect(e.code).toBe('QA_SYNTHESIS_FAILED');
      expect(e.message).toBe('q&a synthesis failed');
      expect(e.message).not.toContain(QUERY);
      expect(e.message).not.toContain(SECRET_CHUNK);
      expect(e.cause).toBeUndefined();
    }
  });

  it('a non-cap runAgent throw → static QA_SYNTHESIS_FAILED (no answer/chunk leak)', async () => {
    hybridRetrieveMock.mockResolvedValueOnce([candidate({ sourceId: 'mem-1', chunkIdx: 0 })]);
    runAgentMock.mockRejectedValueOnce(new Error(`model error mentioning ${SECRET_ANSWER}`));
    try {
      await askQa({ accountId: ACCOUNT_ID, query: QUERY }, ctx);
      expect.unreachable('should throw');
    } catch (err) {
      const e = err as AppError;
      expect(e.code).toBe('QA_SYNTHESIS_FAILED');
      expect(e.message).not.toContain(SECRET_ANSWER);
    }
  });
});

describe('askQa — OD-8 cap-exceeded propagates UNCHANGED', () => {
  it('runAgent throws AI_DAILY_CAP_EXCEEDED → re-thrown with the SAME typed code (not swallowed, not an answer)', async () => {
    hybridRetrieveMock.mockResolvedValue([candidate({ sourceId: 'mem-1', chunkIdx: 0 })]);
    const capErr = new AppError('daily AI spend limit reached', {
      code: 'AI_DAILY_CAP_EXCEEDED',
      status: 429,
    });
    runAgentMock.mockRejectedValue(capErr);

    // The SAME typed error re-throws — NOT swallowed into QA_SYNTHESIS_FAILED,
    // NOT converted to an "I don't know" answer.
    await expect(askQa({ accountId: ACCOUNT_ID, query: QUERY }, ctx)).rejects.toBe(capErr);
    await expect(askQa({ accountId: ACCOUNT_ID, query: QUERY }, ctx)).rejects.toMatchObject({
      code: 'AI_DAILY_CAP_EXCEEDED',
      status: 429,
    });
  });
});
