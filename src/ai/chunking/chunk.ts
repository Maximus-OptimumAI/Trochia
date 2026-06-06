/**
 * Deterministic text chunker (Plan 02-04 / KNW-04b / Task 3).
 *
 * Pure function. Zero I/O. Zero logger calls. Zero async. Zero randomness.
 * Same input → same output, byte-for-byte, every call. The chunk test suite
 * pins this with a 100-iteration determinism case (Case 1).
 *
 * Strategy: char-budgeted sliding window with sentence-aware boundary cut.
 *   - target chunk size: 800 tokens (config: opts.size)
 *   - overlap: 200 tokens (config: opts.overlap)
 *   - boundary: prefer the LAST sentence-end (.!?) inside the trailing 200
 *     chars of the window; fall back to last whitespace; fall back to mid-word
 *     cut as last resort.
 *
 * Token counting (cycle-1 review LOW #1 — drift caveat):
 *   - `@anthropic-ai/tokenizer` is NOT a dependency (checked package.json on
 *     2026-05-27 during T03 implementation). We use the fallback heuristic:
 *
 *       1 token ≈ 4 characters
 *
 *     which is the published OpenAI/Anthropic rule-of-thumb for English text.
 *   - The `tokenCount` field on every Chunk is therefore an ESTIMATE under the
 *     heuristic path. It is explicitly labeled below in the type. Voyage's
 *     32K-token input limit is far above any 800-token-target chunk under
 *     either path, so drift here does not threaten correctness — only the
 *     cost-tracking fidelity in Plan 02-07's OBS-COST-01 budgeting. Plan 02-05
 *     swaps in a real tokenizer if eval shows drift.
 *   - Lessons.md carries the documented choice + the cycle-1 `estimated`
 *     labeling decision.
 *
 * Output rows:
 *   { text: string; idx: number; tokenCount: number }
 *
 * `idx` is 0-indexed and contiguous (0, 1, 2, ..., N-1). Empty input throws
 * `CHUNK_INPUT_EMPTY`. Invalid opts throw `CHUNK_OPTS_INVALID`.
 */
import { AppError } from '@/lib/errors';

export type ChunkOptions = {
  /** target tokens per chunk */
  size: number;
  /** tokens of overlap between adjacent chunks */
  overlap: number;
};

export type Chunk = {
  text: string;
  idx: number;
  /** estimated under heuristic (1 token ≈ 4 chars); exact under @anthropic-ai/tokenizer if added later */
  tokenCount: number;
};

export const DEFAULT_CHUNK_OPTIONS: ChunkOptions = { size: 800, overlap: 200 };

/** Heuristic: 1 token ≈ 4 characters (English text). See module-level docstring. */
const TOKENS_PER_CHAR = 1 / 4;

/**
 * Pure, deterministic chunker.
 *
 * @param text  raw input. Empty or whitespace-only input throws CHUNK_INPUT_EMPTY.
 * @param opts  { size, overlap } in TOKENS. Defaults to DEFAULT_CHUNK_OPTIONS (800/200).
 *              `size` must be > 0, `overlap` must be ≥ 0 and < size.
 */
export function chunkText(
  text: string,
  opts: ChunkOptions = DEFAULT_CHUNK_OPTIONS,
): Chunk[] {
  if (!text || text.trim().length === 0) {
    throw new AppError('chunkText called with empty or whitespace-only input', {
      code: 'CHUNK_INPUT_EMPTY',
    });
  }
  if (opts.size <= 0 || opts.overlap < 0 || opts.overlap >= opts.size) {
    throw new AppError(
      `chunkText called with invalid opts: size=${opts.size}, overlap=${opts.overlap}`,
      { code: 'CHUNK_OPTS_INVALID' },
    );
  }

  const sizeChars = Math.floor(opts.size / TOKENS_PER_CHAR); // 3200 chars for 800 tokens
  const overlapChars = Math.floor(opts.overlap / TOKENS_PER_CHAR); // 800 chars for 200 tokens

  const chunks: Chunk[] = [];
  let cursor = 0;
  let idx = 0;

  while (cursor < text.length) {
    const windowEnd = Math.min(cursor + sizeChars, text.length);
    let cutAt = windowEnd;

    // Prefer sentence boundary inside the trailing 200 chars of the window.
    // If no sentence boundary, fall back to last whitespace. If neither, cut
    // at windowEnd (mid-token — last resort).
    if (cutAt < text.length) {
      const tailStart = Math.max(cutAt - 200, cursor);
      const tail = text.slice(tailStart, cutAt);
      const lastPeriod = tail.lastIndexOf('. ');
      const lastBang = tail.lastIndexOf('! ');
      const lastQ = tail.lastIndexOf('? ');
      const lastSentence = Math.max(lastPeriod, lastBang, lastQ);
      if (lastSentence > 0) {
        // include the punctuation + the space after it
        cutAt = tailStart + lastSentence + 2;
      } else {
        const lastSpace = tail.lastIndexOf(' ');
        if (lastSpace > 0) cutAt = tailStart + lastSpace;
      }
    }

    const chunkContent = text.slice(cursor, cutAt).trim();
    if (chunkContent.length === 0) break;

    chunks.push({
      text: chunkContent,
      idx,
      tokenCount: Math.ceil(chunkContent.length * TOKENS_PER_CHAR),
    });
    idx += 1;

    if (cutAt >= text.length) break;
    // Advance cursor by (window - overlap). Floor at cursor+1 to guarantee
    // forward progress on pathological inputs (overlap region == whole chunk).
    cursor = Math.max(cutAt - overlapChars, cursor + 1);
  }

  return chunks;
}
