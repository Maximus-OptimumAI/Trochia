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
import { getLangfuseClient } from '@/lib/langfuse';
import { logger } from '@/lib/logger';

import { fallbackToOpenAI } from './fallback';
import { pickModel, type TaskClass } from './router';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY ?? '' });

/** Minimal shape of the Langfuse trace handle we use (so the stub's `null` is type-safe). */
interface TraceLike {
  update(payload: Record<string, unknown>): void;
}
const NOOP_TRACE: TraceLike = { update: () => undefined };

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
    (langfuse?.trace({ name: `agent:${opts.taskClass}`, metadata: { model } }) as TraceLike | undefined) ??
    NOOP_TRACE;

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

  async function call(messages: Anthropic.Messages.MessageParam[]): Promise<Anthropic.Messages.Message> {
    try {
      return await anthropic.messages.create({
        model,
        max_tokens: opts.maxTokens ?? DEFAULT_MAX_TOKENS,
        system,
        tools,
        tool_choice: toolChoice,
        messages,
      });
    } catch (e) {
      trace.update({ level: 'ERROR', statusMessage: e instanceof Error ? e.message : 'anthropic error' });
      throw e;
    }
  }

  // ── First attempt ──
  let res = await call(baseMessages);
  trace.update({
    metadata: {
      cacheWrite: res.usage.cache_creation_input_tokens,
      cacheRead: res.usage.cache_read_input_tokens,
      inputTokens: res.usage.input_tokens,
      outputTokens: res.usage.output_tokens,
      model,
    },
  });

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
  parsed = opts.schema.safeParse(extractToolArgs(res));
  if (parsed.success) return parsed.data;

  // ── Still failing: config-flagged OpenAI fallback, else throw ──
  if (env.AI_FALLBACK_ENABLED === true) {
    return fallbackToOpenAI<T>({
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
}
