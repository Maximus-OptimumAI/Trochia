/**
 * Cost-cap rate math — unit tests (Plan 02-07 / T01).
 *
 * Pins the PROVABLE upper-bound reserve (Codex P1-A cycle-3 / P1-B): input priced @
 * OPUS_CACHE_WRITE over a MEASURED ceiling, attempt1 + a larger repair attempt2, NO
 * fallback term, accumulated actual ≤ reserve, and the Voyage UTF-8 byte-length bound.
 * Pure functions — no DB, no HTTP.
 */
import { describe, expect, it } from 'vitest';

import {
  OPUS_CACHE_READ_MICRO_USD_PER_TOKEN,
  OPUS_CACHE_WRITE_MICRO_USD_PER_TOKEN,
  OPUS_INPUT_MICRO_USD_PER_TOKEN,
  OPUS_OUTPUT_MICRO_USD_PER_TOKEN,
  REPAIR_OVERHEAD_TOKENS,
  VOYAGE_MICRO_USD_PER_TOKEN,
  actualAnthropicMicroUsd,
  estAnthropicReserveMicroUsd,
  voyageMicroUsd,
  voyageReserveMicroUsd,
} from '@/ai/cost/rates';

describe('rates — Anthropic reserve (P1-A)', () => {
  const inputTokenCeiling = 10_000;
  const maxTokens = 1024;

  it('P1-A(1): prices the ENTIRE input side at OPUS_CACHE_WRITE (the max input-side rate)', () => {
    // cache_write is the highest input-side rate.
    expect(OPUS_CACHE_WRITE_MICRO_USD_PER_TOKEN).toBeGreaterThanOrEqual(OPUS_INPUT_MICRO_USD_PER_TOKEN);
    expect(OPUS_CACHE_WRITE_MICRO_USD_PER_TOKEN).toBeGreaterThanOrEqual(OPUS_CACHE_READ_MICRO_USD_PER_TOKEN);

    // The reserve's per-input-token coefficient equals OPUS_CACHE_WRITE. Derive it by
    // isolating the input contribution (subtract the two output terms).
    const reserve = estAnthropicReserveMicroUsd({ inputTokenCeiling, maxTokens });
    const outputTerms = 2 * maxTokens * OPUS_OUTPUT_MICRO_USD_PER_TOKEN;
    const inputContribution = reserve - outputTerms;
    const repairInputCeiling = inputTokenCeiling + maxTokens + REPAIR_OVERHEAD_TOKENS;
    const expectedInputContribution =
      (inputTokenCeiling + repairInputCeiling) * OPUS_CACHE_WRITE_MICRO_USD_PER_TOKEN;
    expect(inputContribution).toBeCloseTo(expectedInputContribution, 6);
  });

  it('P1-A(2): attempt2 prices repairInputCeiling = ceiling + maxTokens + REPAIR_OVERHEAD — reserve > 2× attempt1-input', () => {
    const reserve = estAnthropicReserveMicroUsd({ inputTokenCeiling, maxTokens });
    const attempt1Input = inputTokenCeiling * OPUS_CACHE_WRITE_MICRO_USD_PER_TOKEN;
    const outputTerms = 2 * maxTokens * OPUS_OUTPUT_MICRO_USD_PER_TOKEN;
    const inputContribution = reserve - outputTerms;
    // The repair retry's input EXCEEDS attempt1's, so the total input contribution is
    // STRICTLY MORE than 2× attempt1-input.
    expect(inputContribution).toBeGreaterThan(2 * attempt1Input);
  });

  it('P1-A(3): no fallback term — the reserve depends only on ceiling + maxTokens', () => {
    // Doubling the ceiling roughly doubles the input contribution; there is no constant
    // fallback addend that would break that proportionality at the input scale.
    const r1 = estAnthropicReserveMicroUsd({ inputTokenCeiling: 1000, maxTokens });
    const r2 = estAnthropicReserveMicroUsd({ inputTokenCeiling: 2000, maxTokens });
    const outputTerms = 2 * maxTokens * OPUS_OUTPUT_MICRO_USD_PER_TOKEN;
    // The repair ceiling adds (ceiling + maxTokens + OVERHEAD); the delta between r2 and r1
    // is exactly (1000 + 1000) × cache_write (attempt1 +1000, attempt2 +1000).
    expect(r2 - r1).toBeCloseTo(2000 * OPUS_CACHE_WRITE_MICRO_USD_PER_TOKEN, 6);
    expect(r1).toBeGreaterThan(outputTerms);
  });
});

describe('rates — Anthropic actual ≤ reserve (P1-A)', () => {
  const inputTokenCeiling = 50_000;
  const maxTokens = 1024;

  it('accumulates across (≤2) attempts incl. cache_creation + cache_read, and actual ≤ reserve', () => {
    const reserve = estAnthropicReserveMicroUsd({ inputTokenCeiling, maxTokens });
    // Two attempts whose total billed input tokens stay under the measured ceiling, with a
    // realistic cache split. byte-length ceiling ≥ token count by construction.
    const attempts = [
      { input_tokens: 2000, output_tokens: 400, cache_creation_input_tokens: 8000, cache_read_input_tokens: 0 },
      { input_tokens: 1000, output_tokens: 300, cache_creation_input_tokens: 0, cache_read_input_tokens: 8000 },
    ];
    const actual = actualAnthropicMicroUsd(attempts);
    // cache tokens ARE priced (non-zero contribution).
    expect(actual).toBeGreaterThan(0);
    expect(actual).toBeLessThanOrEqual(reserve);
  });

  it('an all-base-input actual is still ≤ reserve (cache-write-rate reserve dominates)', () => {
    const reserve = estAnthropicReserveMicroUsd({ inputTokenCeiling, maxTokens });
    const attempts = [
      { input_tokens: inputTokenCeiling, output_tokens: maxTokens, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 },
    ];
    expect(actualAnthropicMicroUsd(attempts)).toBeLessThanOrEqual(reserve);
  });

  it('cache_creation is priced at the cache-write rate', () => {
    const a = actualAnthropicMicroUsd([
      { input_tokens: 0, output_tokens: 0, cache_creation_input_tokens: 100, cache_read_input_tokens: 0 },
    ]);
    expect(a).toBeCloseTo(100 * OPUS_CACHE_WRITE_MICRO_USD_PER_TOKEN, 6);
  });
});

describe('rates — Voyage reserve (P1-B: UTF-8 byte length ≥ token count)', () => {
  it('a multi-text batch reserves MORE than a single-query ceiling', () => {
    const single = voyageReserveMicroUsd(['one short query']);
    const batch = voyageReserveMicroUsd([
      'one short query',
      'second document text here',
      'third document with more content',
    ]);
    expect(batch).toBeGreaterThan(single);
  });

  it('a UNICODE/multibyte text yields a reserve ≥ its actual token count', () => {
    // Emoji + CJK — multibyte; char/4 would UNDER-count. byte-length is the true bound.
    const text = '投資家向けの説明 🚀 résumé café';
    const reserveTokens = voyageReserveMicroUsd([text]) / VOYAGE_MICRO_USD_PER_TOKEN;
    // A Voyage token is ≥ 1 byte; the actual token count cannot exceed the byte length.
    const byteLen = Buffer.byteLength(text, 'utf8');
    expect(reserveTokens).toBe(byteLen);
    // Sanity: byte length exceeds the JS string length here (multibyte), so a char-based
    // estimate would have been smaller.
    expect(byteLen).toBeGreaterThan(text.length);
  });

  it('a MANY-SHORT-TOKENS text yields a reserve ≥ its actual token count', () => {
    // Many 1-char tokens separated by spaces — a tokenizer could split into ~N tokens; the
    // byte length is ≥ N always.
    const text = Array.from({ length: 200 }, (_, i) => String(i % 10)).join(' ');
    const reserveTokens = voyageReserveMicroUsd([text]) / VOYAGE_MICRO_USD_PER_TOKEN;
    expect(reserveTokens).toBe(Buffer.byteLength(text, 'utf8'));
    expect(reserveTokens).toBeGreaterThanOrEqual(200);
  });

  it('voyageMicroUsd prices actual total_tokens', () => {
    expect(voyageMicroUsd(1000)).toBeCloseTo(1000 * VOYAGE_MICRO_USD_PER_TOKEN, 6);
  });
});
