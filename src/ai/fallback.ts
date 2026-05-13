/**
 * OpenAI / Codex fallback — config-flagged, NOT the default production path.
 *
 * ⚠️ This module has NO DATABASE CREDENTIALS and must never gain any. The codex
 * bridge is a build-time / emergency-fallback tool — it never touches tenant data
 * and is never the default route for production traffic (architectural boundary;
 * PITFALLS §5). It runs ONLY when `env.AI_FALLBACK_ENABLED === true` (default off).
 *
 * This is the ONLY file in the repo allowed to import `openai` (ESLint-enforced;
 * `@anthropic-ai/sdk` lives only in `ai/client.ts`).
 *
 * Phase 1 scope: a minimal forced-JSON-mode call that returns a value validated
 * against the same Zod schema `runAgent` uses. Later phases harden it (streaming,
 * tool use, retries) if it ever proves necessary — it should not.
 */
import OpenAI from 'openai';
import { z, type ZodType } from 'zod';

import { AppError } from '@/lib/errors';
import { logger } from '@/lib/logger';

/** Options mirror the relevant subset of `runAgent`'s options. */
export interface FallbackOpts<T> {
  taskClass: 'classify' | 'draft' | 'reason';
  stablePrefix: { system: string; toolDefs?: unknown; corpus?: string; businessMemory?: string };
  variableSuffix: unknown;
  schema: ZodType<T>;
}

let openaiClient: OpenAI | undefined;
function getOpenAI(): OpenAI {
  if (!process.env.OPENAI_API_KEY) {
    throw new AppError('OPENAI_API_KEY is not set — cannot use the AI fallback.', {
      code: 'AI_FALLBACK_MISCONFIGURED',
    });
  }
  if (!openaiClient) openaiClient = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  return openaiClient;
}

/**
 * Best-effort OpenAI fallback. Invoked by `runAgent` ONLY when the Anthropic path
 * fails validation twice AND `env.AI_FALLBACK_ENABLED === true`.
 */
export async function fallbackToOpenAI<T>(opts: FallbackOpts<T>): Promise<T> {
  logger.warn('ai/fallback: Anthropic path failed validation — using the OpenAI fallback', {
    taskClass: opts.taskClass,
  });
  const client = getOpenAI();
  const jsonSchema = z.toJSONSchema(opts.schema);

  const systemParts = [
    opts.stablePrefix.system,
    opts.stablePrefix.corpus,
    opts.stablePrefix.businessMemory,
    `Respond with ONLY a JSON object conforming to this JSON Schema:\n${JSON.stringify(jsonSchema)}`,
  ].filter(Boolean);

  const completion = await client.chat.completions.create({
    // A general-purpose JSON-capable model; bump alongside Anthropic's IDs if needed.
    model: 'gpt-4o',
    response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: systemParts.join('\n\n') },
      { role: 'user', content: typeof opts.variableSuffix === 'string' ? opts.variableSuffix : JSON.stringify(opts.variableSuffix) },
    ],
  });

  const raw = completion.choices[0]?.message?.content ?? '{}';
  let obj: unknown;
  try {
    obj = JSON.parse(raw);
  } catch {
    throw new AppError('AI fallback returned non-JSON output.', { code: 'AI_FALLBACK_INVALID_OUTPUT' });
  }
  const parsed = opts.schema.safeParse(obj);
  if (!parsed.success) {
    throw new AppError('AI fallback output failed schema validation.', { code: 'AI_FALLBACK_INVALID_OUTPUT' });
  }
  return parsed.data;
}
