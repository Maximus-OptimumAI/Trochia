/**
 * Tests for src/ai/chunking/chunk.ts (Plan 02-04 / KNW-04b / Task 3).
 *
 * 10 cases — Case 1 is the 100-iteration determinism gate (Gate 6 of T03).
 * The chunker is a pure function; no MSW / no DB / no env required.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { chunkText, DEFAULT_CHUNK_OPTIONS } from '@/ai/chunking/chunk';
import { AppError } from '@/lib/errors';

/** ~4 KB of repeatable English-ish text — well over a single 3200-char chunk window */
function buildLongText(): string {
  // 100 repeated sentences of ~50 chars each ≈ 5,000 chars → at least 2 chunks
  // under default opts (3200-char window / 800-char overlap).
  const sentence =
    'The Trochia platform drafts investor briefs deterministically. ';
  return sentence.repeat(120); // ≈ 7,560 chars → 3+ chunks
}

describe('chunkText (Plan 02-04 / KNW-04b / Task 3)', () => {
  // ── Case 1 ── DETERMINISM (Gate 6: 100-iteration loop, byte-identical output) ──
  it('Case 1 — is deterministic across 100 iterations (byte-identical output)', () => {
    const longText = buildLongText();
    const baseline = chunkText(longText);
    const baselineJson = JSON.stringify(baseline);

    for (let i = 0; i < 100; i++) {
      const out = chunkText(longText);
      expect(JSON.stringify(out)).toBe(baselineJson);
    }
  });

  // ── Case 2 ── EMPTY INPUT THROWS ──
  it('Case 2 — empty and whitespace-only input throws CHUNK_INPUT_EMPTY', () => {
    expect(() => chunkText('')).toThrow(AppError);
    expect(() => chunkText('   ')).toThrow(AppError);
    expect(() => chunkText('\n\t  \n')).toThrow(AppError);
    try {
      chunkText('');
    } catch (e) {
      expect((e as AppError).code).toBe('CHUNK_INPUT_EMPTY');
    }
    try {
      chunkText('  ');
    } catch (e) {
      expect((e as AppError).code).toBe('CHUNK_INPUT_EMPTY');
    }
  });

  // ── Case 3 ── INVALID OPTS THROW (size <= 0) ──
  it('Case 3 — invalid opts (size <= 0) throw CHUNK_OPTS_INVALID', () => {
    expect(() => chunkText('x', { size: 0, overlap: 0 })).toThrow(AppError);
    try {
      chunkText('x', { size: 0, overlap: 0 });
    } catch (e) {
      expect((e as AppError).code).toBe('CHUNK_OPTS_INVALID');
    }
    expect(() => chunkText('x', { size: -1, overlap: 0 })).toThrow(AppError);
  });

  // ── Case 4 ── OVERLAP >= SIZE THROWS ──
  it('Case 4 — overlap >= size throws CHUNK_OPTS_INVALID', () => {
    expect(() => chunkText('x', { size: 100, overlap: 100 })).toThrow(AppError);
    expect(() => chunkText('x', { size: 100, overlap: 150 })).toThrow(AppError);
    try {
      chunkText('x', { size: 100, overlap: 100 });
    } catch (e) {
      expect((e as AppError).code).toBe('CHUNK_OPTS_INVALID');
    }
  });

  // ── Case 5 ── SHORT INPUT → SINGLE CHUNK ──
  it('Case 5 — 50-char input with default opts → 1 chunk, idx 0', () => {
    const short = 'The quick brown fox jumps over the lazy dog today.'; // 50 chars
    expect(short.length).toBe(50);
    const out = chunkText(short);
    expect(out).toHaveLength(1);
    expect(out[0].idx).toBe(0);
    expect(out[0].text).toBe(short);
    expect(out[0].tokenCount).toBeGreaterThan(0);
  });

  // ── Case 6 ── CONTIGUOUS INDEXING 0..N-1 ──
  it('Case 6 — idx is 0-indexed and contiguous across many chunks', () => {
    // 50,000 chars → many chunks
    const big = 'A '.repeat(25_000);
    const out = chunkText(big);
    expect(out.length).toBeGreaterThan(5);
    const expected = Array.from({ length: out.length }, (_, i) => i);
    expect(out.map((c) => c.idx)).toEqual(expected);
  });

  // ── Case 7 ── SENTENCE-BOUNDARY PREFERENCE ──
  it('Case 7 — prefers sentence boundary in trailing 200 chars of the window', () => {
    // Construct: ~3050 chars of filler, then a sentence ending "... done. ",
    // then "Start of sentence two..." extending past 3200 chars. The cut
    // should land at the period (within the trailing-200 window of the cut),
    // so chunk[0] ends with "done." and chunk[1] starts with "Start".
    const filler = 'word '.repeat(610); // ~3050 chars; each "word " = 5 chars
    const seam = 'end of sentence one done. Start of sentence two begins now ';
    // Pad past the 3200-char window to force a split
    const tail = 'tail '.repeat(200); // 1000 chars
    const input = filler + seam + tail;
    expect(input.length).toBeGreaterThan(3200);

    const out = chunkText(input);
    expect(out.length).toBeGreaterThanOrEqual(2);
    // Chunk 0 should end at the sentence boundary — last char before any trim
    // is a period (possibly followed by trimmed whitespace).
    expect(out[0].text.endsWith('done.')).toBe(true);
    // Chunk 1 should contain the post-boundary content
    expect(out[1].text.includes('Start of sentence two')).toBe(true);
  });

  // ── Case 8 ── OVERLAP PRESENCE ──
  it('Case 8 — adjacent chunks share content from the overlap region', () => {
    // Long enough to produce ≥ 2 chunks
    const longText = buildLongText();
    const out = chunkText(longText);
    expect(out.length).toBeGreaterThanOrEqual(2);
    // Take the last 200 chars of chunk[0] and confirm a meaningful slice of
    // them appears at/near the start of chunk[1]. Overlap is 800 chars by
    // default, but sentence-boundary trim may shrink it. Assert ≥ 100 chars
    // of contiguous overlap.
    const tailOfFirst = out[0].text.slice(-400);
    const headOfSecond = out[1].text.slice(0, 800);
    // Find the longest common substring between tailOfFirst (last 400 chars)
    // and headOfSecond. We assert at least 100 chars overlap as substring
    // containment — find any 100-char window of tailOfFirst inside headOfSecond.
    let foundOverlap = 0;
    for (let i = 0; i + 100 <= tailOfFirst.length; i++) {
      const probe = tailOfFirst.slice(i, i + 100);
      if (headOfSecond.includes(probe)) {
        foundOverlap = 100;
        break;
      }
    }
    expect(foundOverlap).toBeGreaterThanOrEqual(100);
  });

  // ── Case 9 ── TOKEN COUNT BOUNDED ──
  it('Case 9 — every chunk has tokenCount within size + slack', () => {
    const longText = buildLongText();
    const out = chunkText(longText);
    const slack = 10; // small slack for sentence-boundary expansion
    for (const c of out) {
      expect(c.tokenCount).toBeGreaterThan(0);
      expect(c.tokenCount).toBeLessThanOrEqual(
        DEFAULT_CHUNK_OPTIONS.size + slack,
      );
    }
  });

  // ── Case 10 ── TROCHIA FIXTURE: paste-tributary-healthtech.txt ──
  it('Case 10 — Tributary fixture (~15 KB) produces 5–10 chunks, each ≤ 4000 chars', () => {
    const fixturePath = join(
      process.cwd(),
      'tests/ai/fixtures/paste-tributary-healthtech.txt',
    );
    const text = readFileSync(fixturePath, 'utf-8');
    const out = chunkText(text);
    // 15 KB / 3200 chars-per-chunk ≈ 4.7 chunks; with 800-char overlap → 5-7
    // typical. Acceptance bound 5-10 per plan.
    expect(out.length).toBeGreaterThanOrEqual(5);
    expect(out.length).toBeLessThanOrEqual(10);
    for (const c of out) {
      expect(c.text.length).toBeLessThanOrEqual(4000);
    }
    // Indexing sanity
    expect(out.map((c) => c.idx)).toEqual(
      Array.from({ length: out.length }, (_, i) => i),
    );
    // Determinism re-check on the real fixture
    const second = chunkText(text);
    expect(JSON.stringify(second)).toBe(JSON.stringify(out));
  });
});
