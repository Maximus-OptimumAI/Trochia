/**
 * The AI chokepoint — the ONLY file that imports `@anthropic-ai/sdk` (ESLint-enforced).
 *
 * Every Anthropic call in Trochia goes through `runAgent<T>()`. That buys us, in one
 * place, for free, for ten more phases:
 *   - prompt caching on the STABLE prefix (XC-06) — `cache_control: { type: 'ephemeral' }`
 *     breakpoints on the stable blocks (system → toolDefs → corpus → businessMemory),
 *     placed BEFORE the volatile suffix (this deck / this turn) which is never cached;
 *   - model routing by task class (`ai/router.ts`: Haiku 4.5 / Sonnet 4.6 / Opus 4.7);
 *   - reliable structured output — the Zod schema becomes a forced-tool-use tool, the
 *     model's tool args are re-parsed with the same Zod schema; one repair retry on a
 *     validation failure, then the config-flagged OpenAI fallback (or a throw);
 *   - Langfuse tracing with the cache metrics (`cache_creation_input_tokens` /
 *     `cache_read_input_tokens` → `cacheWrite` / `cacheRead`) so cache-hit-rate is
 *     INSTRUMENTED, not assumed (XC-06). The Langfuse client comes from
 *     `@/lib/langfuse` (a stub returning `null` until Plan 05 — so the trace path is a
 *     safe no-op now and "just works" once Plan 05 fills the stub; Plan 05 never edits
 *     this file).
 *
 * Untrusted user content (uploaded decks/transcripts/knowledge packs — Phase 2/3)
 * goes through `ai/untrusted.ts` (`delimitUntrusted` + `screenForInjection`) before it
 * lands in `variableSuffix`. Model output NEVER triggers an external action without the
 * founder-approval Dialog (XC-02, XC-07).
 */
import Anthropic from '@anthropic-ai/sdk';
import { z, type ZodType } from 'zod';

import { env } from '@/lib/env';
import { AppError } from '@/lib/errors';
import { getLangfuseClient, flushTracing } from '@/lib/langfuse';
import { logger } from '@/lib/logger';

import {
  actualAnthropicMicroUsd,
  estAnthropicReserveMicroUsd,
  type AnthropicAttemptUsage,
} from './cost/rates';
import {
  refundReservation,
  reserveWithinDailyCap,
  settleSpend,
  type Reservation,
} from './cost/cap';
import { fallbackToOpenAI } from './fallback';
import { pickModel, type TaskClass } from './router';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY ?? '' });

/** Minimal shape of the Langfuse generation handle we use. */
interface GenerationLike {
  end(payload?: Record<string, unknown>): void;
}
/** Minimal shape of the Langfuse trace handle we use (so the stub's `null` is type-safe). */
interface TraceLike {
  update(payload: Record<string, unknown>): void;
  generation(payload: Record<string, unknown>): GenerationLike;
}
const NOOP_GENERATION: GenerationLike = { end: () => undefined };
const NOOP_TRACE: TraceLike = {
  update: () => undefined,
  generation: () => NOOP_GENERATION,
};

const TOOL_NAME = 'emit_result';
const DEFAULT_MAX_TOKENS = 1024;

export interface StablePrefix {
  /** The system instructions — the most-cached block. */
  system: string;
  /** Tool definitions / format spec text (cached after `system`). */
  toolDefs?: unknown;
  /** Retrieved corpus chunks (cached after `toolDefs`). */
  corpus?: string;
  /** The founder's confirmed Business Memory (cached after `corpus`). */
  businessMemory?: string;
}

export interface RunAgentOpts<T> {
  /** Task class → model (classify→Haiku, draft→Sonnet, reason→Opus). */
  taskClass: TaskClass;
  /** The stable, cacheable prefix. Cache breakpoints are placed on these blocks, in order. */
  stablePrefix: StablePrefix;
  /** The volatile per-call payload (this deck / this investor / this turn). NEVER cached. */
  variableSuffix: unknown;
  /** Zod schema the model's structured output must satisfy. Becomes a forced-tool-use tool. */
  schema: ZodType<T>;
  /** Optional override for `max_tokens` (default 1024). */
  maxTokens?: number;
  /**
   * The $5/user/day cost cap context (Plan 02-07 / OD-3). When PRESENT, runAgent:
   *   - MEASURES inputTokenCeiling = Buffer.byteLength(systemBlocksText + variableSuffixText
   *     + JSON.stringify(tools) + JSON.stringify(toolChoice),'utf8') — the COMPLETE billed
   *     input surface (system blocks + variableSuffix + the forced-tool input_schema + the
   *     tool_choice, all of which the request sends and Anthropic bills; cycle-4);
   *   - RESERVES estAnthropicReserveMicroUsd({ inputTokenCeiling, maxTokens }) BEFORE the
   *     first attempt (input priced @ the cache-write rate — P1-A(1));
   *   - DISABLES the OpenAI fallback (P1-A(3)) — a double-validation miss throws
   *     AI_STRUCTURED_OUTPUT_INVALID and NEVER calls fallbackToOpenAI, so a metered call
   *     prices ONLY the (≤2) Anthropic attempts (a provable spend bound);
   *   - in a `finally`, SETTLES the actual across the fired attempts OR REFUNDS on a
   *     pre-call throw, keyed on the reservation token's usageDate (P2-C).
   * When ABSENT (health-check / internal), the cap is skipped and the fallback behaves as today.
   */
  costContext?: { accountId: string };
}

function buildSystemBlocks(prefix: StablePrefix): Anthropic.Messages.TextBlockParam[] {
  const blocks: Anthropic.Messages.TextBlockParam[] = [
    { type: 'text', text: prefix.system },
  ];
  if (prefix.toolDefs !== undefined) {
    blocks.push({
      type: 'text',
      text: typeof prefix.toolDefs === 'string' ? prefix.toolDefs : JSON.stringify(prefix.toolDefs),
    });
  }
  if (prefix.corpus) blocks.push({ type: 'text', text: prefix.corpus });
  if (prefix.businessMemory) blocks.push({ type: 'text', text: prefix.businessMemory });
  // Cache breakpoint on the LAST stable block — Anthropic caches the whole prefix up to it.
  // (Placing it on the final block is sufficient and minimises breakpoint count.)
  blocks[blocks.length - 1] = {
    ...blocks[blocks.length - 1],
    cache_control: { type: 'ephemeral' },
  };
  return blocks;
}

function extractToolArgs(res: Anthropic.Messages.Message): unknown {
  for (const block of res.content) {
    if (block.type === 'tool_use' && block.name === TOOL_NAME) return block.input;
  }
  return undefined;
}

/**
 * Run a single structured Anthropic call. Returns a value validated against `opts.schema`.
 *
 * @throws AppError if the structured output fails validation twice and the fallback is off
 *         (or the fallback also fails), or if the Anthropic call itself errors.
 */
export async function runAgent<T>(opts: RunAgentOpts<T>): Promise<T> {
  const model = pickModel(opts.taskClass);
  const langfuse = getLangfuseClient();
  const trace: TraceLike =
    (langfuse?.trace({
      name: `agent:${opts.taskClass}`,
      // The tenant account id (an internal UUID, not PII) is the natural Langfuse
      // userId — it enables per-tenant cost/usage views. Undefined on un-metered
      // internal calls (health-check), which is fine (optional field).
      userId: opts.costContext?.accountId,
      metadata: { model },
    }) as TraceLike | undefined) ?? NOOP_TRACE;

  // Additive GENERATION observation per Anthropic attempt (LANGFUSE-TRACING-01):
  // carries `model` + token `usageDetails` so Langfuse can compute auto-cost from
  // its model table. KEEP this ADDITIVE — the trace-level cache metadata above is a
  // SEPARATE write the cache-hit eval reads via fetchTraces; do not move it here.
  // Privacy (Trochia CLAUDE.md): NO raw input/output — `variableSuffix` may carry
  // untrusted/PII. usageDetails keys verified against Langfuse docs 2026-06-15.
  function recordGeneration(usage: AnthropicAttemptUsage, repair: boolean): void {
    trace
      .generation({ name: 'anthropic.messages', model, metadata: { repair } })
      .end({
        usageDetails: {
          input: usage.input_tokens,
          output: usage.output_tokens,
          cache_read_input_tokens: usage.cache_read_input_tokens ?? 0,
          cache_creation_input_tokens: usage.cache_creation_input_tokens ?? 0,
        },
      });
  }

  // The Zod schema → a forced-tool-use tool definition (reliable structured output).
  const { $schema: _drop, ...jsonSchema } = z.toJSONSchema(opts.schema) as Record<string, unknown>;
  void _drop;
  const tools: Anthropic.Messages.Tool[] = [
    {
      name: TOOL_NAME,
      description: 'Return the structured result for this task.',
      input_schema: jsonSchema as Anthropic.Messages.Tool.InputSchema,
    },
  ];
  const toolChoice: Anthropic.Messages.ToolChoice = { type: 'tool', name: TOOL_NAME };

  const system = buildSystemBlocks(opts.stablePrefix);
  const userContent =
    typeof opts.variableSuffix === 'string' ? opts.variableSuffix : JSON.stringify(opts.variableSuffix);

  const baseMessages: Anthropic.Messages.MessageParam[] = [{ role: 'user', content: userContent }];
  const maxTokens = opts.maxTokens ?? DEFAULT_MAX_TOKENS;

  async function call(messages: Anthropic.Messages.MessageParam[]): Promise<Anthropic.Messages.Message> {
    try {
      return await anthropic.messages.create({
        model,
        max_tokens: maxTokens,
        system,
        tools,
        tool_choice: toolChoice,
        messages,
      });
    } catch (e) {
      // A / codex#2 / CSO-H1: NEVER write the raw Anthropic e.message (or cause)
      // into the Langfuse trace — a QA synthesis carries the query + retrieved
      // chunks in variableSuffix, and a provider error can echo request content.
      // Use a STATIC status string plus the safe numeric provider status only.
      const providerStatus =
        typeof (e as { status?: unknown }).status === 'number' ? (e as { status: number }).status : undefined;
      // STATIC status-only string — never the provider message/body (CSO-H1).
      const statusMessage =
        providerStatus !== undefined
          ? `anthropic request failed (status ${providerStatus})`
          : 'anthropic request failed';
      trace.update({ level: 'ERROR', statusMessage });
      // Mark an ERROR generation with the SAME static string — no usage, no body.
      trace.generation({ name: 'anthropic.messages', model, level: 'ERROR', statusMessage }).end();
      // R1 (codex re-gate P1 / CSO-H1 second half): do NOT re-throw the raw
      // provider error — its message/body/cause can echo the request content
      // (the query + retrieved chunks in variableSuffix, or paste content on the
      // extract path), which a forwarding caller (e.g. the paste router) would
      // surface to tRPC/Sentry UNSCRUBBED. Throw a STATIC AppError with the safe
      // numeric provider status only, no message text, no cause — closing the leak
      // at the chokepoint for EVERY caller. (AI_DAILY_CAP_EXCEEDED is unaffected:
      // it is thrown earlier from reserveWithinDailyCap, never inside this catch.)
      throw new AppError('anthropic request failed', {
        code: 'AI_PROVIDER_ERROR',
        ...(providerStatus !== undefined ? { status: providerStatus } : {}),
      });
    }
  }

  // ── Cost cap (Plan 02-07 / OD-3 / P1-A / P2-C) ──
  // When costContext is present, RESERVE the upper-bound cost of the WHOLE invocation
  // BEFORE the first Anthropic attempt, then SETTLE-or-REFUND in the `finally`. The
  // reserve measures the COMPLETE billed input surface (system blocks + variableSuffix +
  // the forced-tool input_schema + tool_choice — cycle-4) as a UTF-8 byte ceiling and
  // prices the input at the cache-write rate; the OpenAI fallback is DISABLED below so the
  // metered call prices only the (≤2) Anthropic attempts (a provable bound).
  const metered = opts.costContext !== undefined;
  let reservation: Reservation | undefined;
  const attempts: AnthropicAttemptUsage[] = [];
  if (metered) {
    const systemBlocksText = system.map((b) => b.text).join('');
    const variableSuffixText = userContent;
    const inputTokenCeiling = Buffer.byteLength(
      systemBlocksText + variableSuffixText + JSON.stringify(tools) + JSON.stringify(toolChoice),
      'utf8',
    );
    const est = estAnthropicReserveMicroUsd({ inputTokenCeiling, maxTokens });
    reservation = await reserveWithinDailyCap(opts.costContext!.accountId, est);
  }

  try {
    // ── First attempt ──
    let res = await call(baseMessages);
    if (metered) attempts.push(res.usage);
    trace.update({
      metadata: {
        cacheWrite: res.usage.cache_creation_input_tokens,
        cacheRead: res.usage.cache_read_input_tokens,
        inputTokens: res.usage.input_tokens,
        outputTokens: res.usage.output_tokens,
        model,
      },
    });
    recordGeneration(res.usage, false);

    let parsed = opts.schema.safeParse(extractToolArgs(res));
    if (parsed.success) return parsed.data;

    // ── One repair retry ──
    logger.warn('ai/client: structured output failed validation — attempting one repair retry', {
      taskClass: opts.taskClass,
    });
    const repairMessages: Anthropic.Messages.MessageParam[] = [
      ...baseMessages,
      { role: 'assistant', content: res.content },
      {
        role: 'user',
        content: `Your previous output failed schema validation: ${parsed.error.message}. Call the ${TOOL_NAME} tool again with output that conforms to the schema.`,
      },
    ];
    res = await call(repairMessages);
    if (metered) attempts.push(res.usage);
    trace.update({
      metadata: {
        cacheWrite: res.usage.cache_creation_input_tokens,
        cacheRead: res.usage.cache_read_input_tokens,
        inputTokens: res.usage.input_tokens,
        outputTokens: res.usage.output_tokens,
        model,
        repair: true,
      },
    });
    recordGeneration(res.usage, true);
    parsed = opts.schema.safeParse(extractToolArgs(res));
    if (parsed.success) return parsed.data;

    // ── Still failing ──
    // P1-A(3): under a cost context the OpenAI fallback is DISABLED — a metered call
    // trades the rare resiliency fallback for a PROVABLE spend bound (acceptable for the
    // Q&A path). A double-validation failure throws AI_STRUCTURED_OUTPUT_INVALID (qa-rag
    // maps it to a deterministic "I don't know"/typed error) and NEVER calls fallbackToOpenAI.
    if (!metered && env.AI_FALLBACK_ENABLED === true) {
      return await fallbackToOpenAI<T>({
        taskClass: opts.taskClass,
        stablePrefix: opts.stablePrefix,
        variableSuffix: opts.variableSuffix,
        schema: opts.schema,
      });
    }
    trace.update({ level: 'ERROR', statusMessage: 'structured output failed validation' });
    throw new AppError('AI structured output failed validation (after one repair retry).', {
      code: 'AI_STRUCTURED_OUTPUT_INVALID',
    });
  } finally {
    // SETTLE-or-REFUND, keyed on the reservation token's usageDate (P2-C). If no Anthropic
    // attempt fired (a pre-call throw) → full REFUND; otherwise SETTLE to the actual that
    // already billed (even on a post-call structured-validation throw — the provider spend
    // happened, do not refund it).
    if (reservation) {
      if (attempts.length === 0) {
        await refundReservation(reservation);
      } else {
        await settleSpend(reservation, actualAnthropicMicroUsd(attempts));
      }
    }
    // Deliver buffered trace + generation events before this (serverless / eval /
    // script) context freezes or exits — the langfuse SDK otherwise loses them on
    // its batch timer (LANGFUSE-TRACING-01). Null-safe + never throws. The chokepoint
    // finally is the one flush point every Anthropic call passes through, INCLUDING
    // the eval's own runAgent calls (the eval runner is not a serverless boundary).
    await flushTracing();
  }
}
