/**
 * Cost-cap rate table + pure reserve/settle math (Plan 02-07 / T01 / OBS-COST-01).
 *
 * The provable upper-bound RESERVE that makes the $5/user/day HARD cap (OD-8) a TRUE
 * bound, not a tracking estimate. Pure functions — no I/O, no live deps. The atomic
 * store side lives in `cap.ts`; the chokepoints (client.ts / voyage.adapter.ts) thread
 * these helpers around each metered provider invocation.
 *
 * ## The upper-bound proof (Codex cycle-3 P1-A / cycle-2 P1-B)
 *
 * `estAnthropicReserveMicroUsd` is a PROVABLE upper bound of the (≤2)-Anthropic-attempt
 * invocation by three properties, so `actual ≤ reserve` for ANY execution:
 *
 *   (1) INPUT PRICED AT THE CACHE-WRITE RATE. Anthropic cache_creation (cache-write)
 *       tokens cost the most on the input side (cache-write ≥ cache-read ≥ base input).
 *       The reserve prices its ENTIRE input component at OPUS_CACHE_WRITE. No matter how
 *       the ACTUAL usage splits across input / cache_creation / cache_read buckets, each
 *       actual bucket rate ≤ OPUS_CACHE_WRITE ⇒ actual input cost ≤ reserved input cost.
 *
 *   (2) INPUT CEILING MEASURED, NOT ESTIMATED. `inputTokenCeiling` is passed in by the
 *       caller as `Buffer.byteLength(systemBlocks + variableSuffix + JSON.stringify(tools)
 *       + JSON.stringify(toolChoice), 'utf8')` — the COMPLETE billed input surface (system
 *       blocks + variableSuffix + the forced-tool input_schema + tool_choice, cycle-4). A
 *       token is ≥ 1 byte, so byte-length ≥ token-count ⇒ a true upper bound. This helper
 *       never guesses a maxInputTokens constant.
 *
 *   (3) NO FALLBACK TERM. The OpenAI fallback is DISABLED under costContext (cycle-3
 *       P1-A(3)), so a metered call prices ONLY the (≤2) Anthropic attempts — there is no
 *       unpriced provider and there are NO FALLBACK_* constants on this reserve path.
 *
 * For Voyage (P1-B): `voyageReserveMicroUsd` sums `Buffer.byteLength(text,'utf8')` over the
 * actual ≤8-text batch — a token is ≥ 1 byte so byte-length ≥ token-count ALWAYS holds (a
 * multibyte/short-token text that would break `char/4` cannot break byte-length). Never
 * char/4, never a fixed 1-query ceiling.
 *
 * ## Rate figures (FOLLOWUP-COST-RATES-RATIFY)
 *
 * Sourced from Anthropic + Voyage public pricing as of authoring (2026-06-01). Founder
 * ratifies the exact figures at convergence. Stored as micro-USD per token (1 USD =
 * 1_000_000 micro-USD) so the ledger is integer-friendly.
 *
 *   Anthropic Claude Opus 4.x (per Anthropic public pricing):
 *     - input        $15.00 / 1M tokens   → 15.0 micro-USD/token
 *     - output       $75.00 / 1M tokens   → 75.0 micro-USD/token
 *     - cache write  $18.75 / 1M tokens   → 18.75 micro-USD/token  (1.25× base input — the HIGHEST input-side rate)
 *     - cache read   $1.50  / 1M tokens   → 1.5  micro-USD/token   (cheapest input-side rate)
 *   Voyage voyage-3-large (per Voyage public pricing):
 *     - embeddings   $0.18 / 1M tokens    → 0.18 micro-USD/token
 *
 * These are TUNABLE; only the ORDERING (cache_write ≥ input ≥ cache_read on the input side)
 * is load-bearing for the upper-bound proof. The reserve prices input at the MAX input-side
 * rate (cache_write), which the tests pin directly.
 */

// ── Anthropic Opus 4.x micro-USD per token (FOLLOWUP-COST-RATES-RATIFY) ──
export const OPUS_INPUT_MICRO_USD_PER_TOKEN = 15.0;
export const OPUS_OUTPUT_MICRO_USD_PER_TOKEN = 75.0;
/** cache_creation (cache-write) — the HIGHEST input-side per-token rate (~1.25× base input). */
export const OPUS_CACHE_WRITE_MICRO_USD_PER_TOKEN = 18.75;
/** cache_read — the cheapest input-side per-token rate. */
export const OPUS_CACHE_READ_MICRO_USD_PER_TOKEN = 1.5;

// ── Voyage voyage-3-large micro-USD per token ──
export const VOYAGE_MICRO_USD_PER_TOKEN = 0.18;

/**
 * Bounds the repair retry's EXTRA input over the base ceiling: the validation-error
 * string + the re-sent tool schema (the echoed prior assistant tool_use content is
 * bounded separately by `maxTokens`). A documented constant — P1-A.
 */
export const REPAIR_OVERHEAD_TOKENS = 512;

/**
 * The highest input-side per-token rate. The reserve prices its ENTIRE input component
 * at this rate (P1-A(1)) so actual ≤ reserve regardless of the input/cache_creation/
 * cache_read bucket split. Asserted in rates.test.ts to equal OPUS_CACHE_WRITE.
 */
export const MAX_INPUT_SIDE_MICRO_USD_PER_TOKEN = Math.max(
  OPUS_INPUT_MICRO_USD_PER_TOKEN,
  OPUS_CACHE_WRITE_MICRO_USD_PER_TOKEN,
  OPUS_CACHE_READ_MICRO_USD_PER_TOKEN,
);

/** Per-attempt actual usage as Anthropic reports it (`res.usage`). */
export interface AnthropicAttemptUsage {
  input_tokens: number;
  output_tokens: number;
  /** cache_creation_input_tokens — billed at the cache-write rate. */
  cache_creation_input_tokens?: number | null;
  /** cache_read_input_tokens — billed at the cache-read rate. */
  cache_read_input_tokens?: number | null;
}

/**
 * The PROVABLE UPPER-BOUND reserve of the (≤2)-Anthropic-attempt invocation (P1-A).
 *
 * reserve = attempt1(inputTokenCeiling × cache_write + maxTokens × output)
 *         + attempt2(repairInputCeiling × cache_write + maxTokens × output)
 *
 * where repairInputCeiling = inputTokenCeiling + maxTokens + REPAIR_OVERHEAD_TOKENS
 * (the repair re-sends attempt1's assistant tool_use content ≤ maxTokens + the
 * validation-error + the re-sent tool schema ≤ REPAIR_OVERHEAD_TOKENS).
 *
 * The ENTIRE input side is priced at OPUS_CACHE_WRITE (the highest input-side rate),
 * over a MEASURED `inputTokenCeiling` (the caller's `Buffer.byteLength` of the complete
 * billed input surface). No fallback term — the OpenAI fallback is disabled under
 * costContext (P1-A(3)).
 *
 * Invariant: reserve input @ cache-write-rate over a byte-length ceiling covering the
 * COMPLETE billed input surface ≥ any actual input-bucket mix; fallback disabled ⇒ no
 * unpriced provider ⇒ actual billed ≤ reserved ⇒ actual ≤ reserve.
 */
export function estAnthropicReserveMicroUsd(args: {
  inputTokenCeiling: number;
  maxTokens: number;
}): number {
  const { inputTokenCeiling, maxTokens } = args;
  const attempt1 =
    inputTokenCeiling * OPUS_CACHE_WRITE_MICRO_USD_PER_TOKEN +
    maxTokens * OPUS_OUTPUT_MICRO_USD_PER_TOKEN;
  const repairInputCeiling = inputTokenCeiling + maxTokens + REPAIR_OVERHEAD_TOKENS;
  const attempt2 =
    repairInputCeiling * OPUS_CACHE_WRITE_MICRO_USD_PER_TOKEN +
    maxTokens * OPUS_OUTPUT_MICRO_USD_PER_TOKEN;
  return attempt1 + attempt2;
}

/**
 * Post-call ACTUAL spend across the fired Anthropic attempts (≤2), each priced at its
 * REAL per-bucket rate. Because every actual input-bucket rate ≤ OPUS_CACHE_WRITE (the
 * rate the reserve priced the input at), the accumulated actual ≤ the reserve. There is
 * no fallback term — the fallback is disabled under costContext (P1-A(3)).
 */
export function actualAnthropicMicroUsd(attempts: readonly AnthropicAttemptUsage[]): number {
  let total = 0;
  for (const u of attempts) {
    total +=
      u.input_tokens * OPUS_INPUT_MICRO_USD_PER_TOKEN +
      (u.cache_creation_input_tokens ?? 0) * OPUS_CACHE_WRITE_MICRO_USD_PER_TOKEN +
      (u.cache_read_input_tokens ?? 0) * OPUS_CACHE_READ_MICRO_USD_PER_TOKEN +
      u.output_tokens * OPUS_OUTPUT_MICRO_USD_PER_TOKEN;
  }
  return total;
}

/**
 * The UPPER-BOUND Voyage embed reserve from the ACTUAL batch (P1-B):
 *   Σ over texts of Buffer.byteLength(text, 'utf8') × VOYAGE_MICRO_USD_PER_TOKEN
 *
 * A token is ≥ 1 byte ⇒ UTF-8 byte-length ≥ token-count ALWAYS holds — a true upper
 * bound that multibyte/short-token texts cannot break (unlike `ceil(len / CHARS_PER_TOKEN)`,
 * which is only an estimate). NEVER char/4; NEVER a fixed 1-query ceiling. Bounded by the
 * ≤8-text batch cap enforced in voyage.adapter.ts.
 */
export function voyageReserveMicroUsd(texts: readonly string[]): number {
  let tokens = 0;
  for (const text of texts) {
    tokens += Buffer.byteLength(text, 'utf8');
  }
  return tokens * VOYAGE_MICRO_USD_PER_TOKEN;
}

/** Actual Voyage spend from `json.usage.total_tokens`. */
export function voyageMicroUsd(totalTokens: number): number {
  return totalTokens * VOYAGE_MICRO_USD_PER_TOKEN;
}
