/**
 * Deterministic synthetic eval corpus (memory-answerable / T2).
 *
 * ONE representative confirmed business memory, ClockPay-SHAPED but entirely
 * SYNTHETIC - never a prod pull (XC-01: no real customer data in the build/eval
 * path). It backs the qa-grounding eval: `scripts/seed-eval-corpus.ts` runs
 * `buildMemoryChunks(EVAL_MEMORY)` + Voyage-embeds the chunks into the
 * `embeddings` table for `EVAL_ACCOUNT_ID`, and the in-scope fixtures
 * (MRR / problem / stage / sector / name / "what do you do") resolve against it.
 *
 * This module is PURE (no `server-only`, no DB, no Voyage) so the eval CHECK can
 * import it to map a top-hit `chunkIdx` → a human label WITHOUT putting chunk
 * text on the agent's debug surface (which stays counts/scores/keys only). The
 * field→chunk_idx mapping is deterministic because `buildMemoryChunks` is pure.
 */
import { buildMemoryChunks, labelOf, type ChunkableMemoryRow } from '@/ai/chunking/memory-chunks';

/** The eval tenant - mirrored verbatim in the qa-grounding fixture JSON files. */
export const EVAL_ACCOUNT_ID = 'e7a1c0de-0000-4000-8000-000000000001';

/** The synthetic memory's stable source id (the embeddings `source_id`). */
export const EVAL_SOURCE_ID = 'e7a1c0de-0000-4000-8000-0000000000a1';

/**
 * The synthetic confirmed memory. Populated so every in-scope fixture has a
 * matching labeled chunk: `traction.mrr` (MRR), `narrative.problem` (problem),
 * `stage`, `sector`, `companyName`, `oneLiner` ("what the company does").
 */
export const EVAL_MEMORY: ChunkableMemoryRow = {
  companyName: 'Cadence Labs',
  oneLiner: 'Cadence Labs builds automated reconciliation software for finance teams.',
  sector: 'Fintech accounting automation',
  stage: 'Seed',
  geography: 'United States',
  incorporationStatus: 'Delaware C-Corp',
  foundingDate: '2024-02-01T00:00:00.000Z',
  // team populated (qa-robustness T4 + EVAL SEED) so the "Who is the founder?"
  // in-scope fixture has a labeled Founder chunk to ground against. equity_pct is
  // deliberately absent here - buildMemoryChunks never embeds it regardless.
  team: {
    founders: [
      {
        name: 'Jordan Rivera',
        role: 'CEO and co-founder',
        background: 'Led reconciliation infrastructure at two prior payments companies.',
      },
    ],
    advisors: [
      {
        name: 'Priya Anand',
        background: 'Former CFO who scaled finance operations at a public fintech.',
      },
    ],
  },
  traction: {
    mrr: 42000,
    arr: 504000,
    customers: '120',
    currency: 'USD',
    growth: '20% month over month for the last two quarters',
    runway: '20 months at the current burn rate',
    // ASK-UX-RETRIEVAL-01 (Step 2): gives the 1b volume/throughput eval case a
    // target. Synthetic - Cadence reconciles customer transaction volume.
    volumeProcessed: 'Over $2.4B in customer transaction volume reconciled to date',
  },
  narrative: {
    problem:
      'Finance teams reconcile transactions by hand across spreadsheets and bank exports, which is slow, error-prone, and does not scale as transaction volume grows.',
    solution:
      'Cadence Labs ingests bank and ledger data and reconciles it automatically, flagging only the exceptions a human needs to resolve.',
    why_now:
      'Real-time payment rails and embedded finance have multiplied transaction volume faster than finance headcount can keep up.',
    why_us:
      'The founding team shipped reconciliation infrastructure at two prior payments companies.',
  },
};

/** field-aligned labels in chunk_idx order - `evalChunkLabels()[chunkIdx]` → label. */
export function evalChunkLabels(): string[] {
  return buildMemoryChunks(EVAL_MEMORY).map((c) => labelOf(c.text));
}
