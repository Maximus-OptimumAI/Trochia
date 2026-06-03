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
 * ## Rate figures (FOLLOWUP-COST-RATES-RATIFY — RATIFIED 2026-06-03)
 *
 * VERIFIED + RATIFIED by the founder on 2026-06-03 against the official Anthropic +
 * Voyage published pricing (source: platform.claude.com/docs/en/about-claude/pricing,
 * pulled 2026-06-03). Stored as micro-USD per token (1 USD = 1_000_000 micro-USD) so the
 * ledger is integer-friendly.
 *
 *   Anthropic Claude Opus 4.6 / 4.7 / 4.8 (the `reason` model is Opus 4.7 — router.ts):
 *     - input        $5.00  / 1M tokens   → 5.0   micro-USD/token   (single source of truth)
 *     - output       $25.00 / 1M tokens   → 25.0  micro-USD/token
 *     - cache write  $6.25  / 1M tokens   → input × 1.25 = 6.25     (5-min write — the HIGHEST input-side rate)
 *     - cache read   $0.50  / 1M tokens   → input × 0.10 = 0.50     (cheapest input-side rate)
 *   Voyage voyage-3-large (per Voyage public pricing):
 *     - embeddings   $0.18 / 1M tokens    → 0.18 micro-USD/token
 *
 * PRIOR (pre-2026-06-03) the Opus constants carried the DEPRECATED Opus 4 / 4.1 card
 * ($15 / $75 / $18.75 / $1.50) — 3× the current Opus 4.6/4.7/4.8 rates. That stale card
 * metered the live cap at 3× real cost (the "$5/user/day" HARD-blocked at ~$1.67/day of
 * real Opus spend). Corrected here; the absolute input rate is now pinned in rates.test.ts
 * so a future absolute-rate drift fails CI (the ORDERING/proportion checks alone let the
 * 3× error sit invisible — see tasks/lessons.md 2026-06-03).
 *
 * These are TUNABLE; only the ORDERING (cache_write ≥ input ≥ cache_read on the input side)
 * is load-bearing for the upper-bound proof. The reserve prices input at the MAX input-side
 * rate (cache_write); rates.test.ts pins both that ordering AND the absolute input rate.
 */

// ── Anthropic Opus 4.6/4.7/4.8 micro-USD per token (FOLLOWUP-COST-RATES-RATIFY) ──
// INPUT is the single source of truth; the cache rates DERIVE from it via the
// official published multipliers, so the four numbers can never drift apart.
export const OPUS_INPUT_MICRO_USD_PER_TOKEN = 5.0;
export const OPUS_OUTPUT_MICRO_USD_PER_TOKEN = 25.0;
/** cache_creation (5-min cache-write) — the HIGHEST input-side per-token rate (1.25× base input, the official 5-min multiplier). */
export const OPUS_CACHE_WRITE_MICRO_USD_PER_TOKEN = OPUS_INPUT_MICRO_USD_PER_TOKEN * 1.25;
/** cache_read (hit) — the cheapest input-side per-token rate (0.1× base input, the official cache-read multiplier). */
export const OPUS_CACHE_READ_MICRO_USD_PER_TOKEN = OPUS_INPUT_MICRO_USD_PER_TOKEN * 0.1;

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
