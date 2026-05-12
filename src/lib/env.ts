/**
 * Environment contract (FND-08).
 *
 * Every Phase-1 env var is declared here and validated once at module load.
 * The two site-URL vars (`NEXT_PUBLIC_SITE_URL` / `NEXT_PUBLIC_APP_URL`) are
 * REQUIRED — they already exist in `.env.local` and the whole app reads URLs
 * from here, so a missing one must fail fast. EVERY OTHER Phase-1 var is
 * `.optional()` for now — later plans flip individual vars to required-in-prod
 * via disjoint edits (each such plan lists `src/lib/env.ts` in its
 * `files_modified` and runs in a distinct wave so the edits serialize).
 * No plan re-shapes this schema; it only flips `.optional()` → required where
 * the comment says so.
 *
 * Site URLs are read ONLY from here (`SITE_URL` / `APP_URL`). Hardcoded
 * `https://trochia...` literals are lint-banned everywhere except this file.
 */
import { z } from 'zod';

const booleanish = z
  .union([z.literal('true'), z.literal('false'), z.literal('1'), z.literal('0')])
  .transform((v) => v === 'true' || v === '1')
  .optional();

/**
 * "Required in production, optional elsewhere." A var wrapped in `prodRequired(...)`
 * is `.optional()` in dev/test (so the scaffold and the unit tests run without it)
 * but, when `NODE_ENV === 'production'`, must be present and non-empty — a missing
 * one fails fast at module load on Vercel. Plan 03 flips the Supabase/DB vars to
 * this; later plans flip their own vars the same way (disjoint edits).
 */
const IS_PROD = process.env.NODE_ENV === 'production';
function prodRequired<T extends z.ZodTypeAny>(schema: T) {
  return IS_PROD
    ? schema.refine((v) => v !== undefined && v !== null && String(v).length > 0, {
        message: 'required in production',
      })
    : schema.optional();
}

const envSchema = z.object({
  // ── Site URLs ── REQUIRED (present in .env.local; the app reads all URLs here)
  NEXT_PUBLIC_SITE_URL: z.string().url(), // required — do not make optional
  NEXT_PUBLIC_APP_URL: z.string().url(), // required — do not make optional

  // ── Database ── (Plan 03 / 01-03-PLAN.md flipped these to required-in-prod)
  DATABASE_URL: prodRequired(z.string()), // pooled (Supavisor) connection string — runtime
  DIRECT_URL: prodRequired(z.string()), // direct connection string — drizzle-kit migrations

  // ── Supabase ── (Plan 03 / 01-03-PLAN.md flipped these to required-in-prod)
  // Use the publishable + secret keys, NEVER anon/service_role.
  SUPABASE_URL: prodRequired(z.string().url()),
  SUPABASE_PUBLISHABLE_KEY: prodRequired(z.string()),
  SUPABASE_SECRET_KEY: prodRequired(z.string()), // server-only — never in NEXT_PUBLIC_*
  NEXT_PUBLIC_SUPABASE_URL: prodRequired(z.string().url()),
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: prodRequired(z.string()),

  // ── Stripe ──
  STRIPE_SECRET_KEY: z.string().optional(), // Plan 03 flips this to required-in-prod
  STRIPE_WEBHOOK_SECRET: z.string().optional(), // Plan 03 flips this to required-in-prod
  STRIPE_PRICE_PRE_RAISE_MONTHLY: z.string().optional(), // Plan 03 flips this to required-in-prod
  STRIPE_PRICE_PRE_RAISE_ANNUAL: z.string().optional(), // Plan 03 flips this to required-in-prod
  STRIPE_PRICE_ACTIVE_RAISE_MONTHLY: z.string().optional(), // Plan 03 flips this to required-in-prod
  STRIPE_PRICE_ACTIVE_RAISE_ANNUAL: z.string().optional(), // Plan 03 flips this to required-in-prod

  // ── AI chokepoint ──
  ANTHROPIC_API_KEY: z.string().optional(), // Plan 04 flips this to required-in-prod
  OPENAI_API_KEY: z.string().optional(), // Plan 04 flips this to required-in-prod (only when AI_FALLBACK_ENABLED)
  AI_FALLBACK_ENABLED: booleanish, // Plan 04 owns this flag

  // ── Langfuse ──
  LANGFUSE_PUBLIC_KEY: z.string().optional(), // Plan 05 flips this to required-in-prod
  LANGFUSE_SECRET_KEY: z.string().optional(), // Plan 05 flips this to required-in-prod
  LANGFUSE_HOST: z.string().url().optional(), // Plan 05 owns this (defaults to cloud)

  // ── Sentry ──
  SENTRY_DSN: z.string().optional(), // Plan 05 flips this to required-in-prod
  NEXT_PUBLIC_SENTRY_DSN: z.string().optional(), // Plan 05 flips this to required-in-prod
  SENTRY_ORG: z.string().optional(), // Plan 05 owns this (build-time source maps)
  SENTRY_PROJECT: z.string().optional(), // Plan 05 owns this (build-time source maps)
  SENTRY_AUTH_TOKEN: z.string().optional(), // Plan 05 owns this (build-time source maps)

  // ── Amplitude ──
  AMPLITUDE_API_KEY: z.string().optional(), // Plan 05 flips this to required-in-prod
  NEXT_PUBLIC_AMPLITUDE_API_KEY: z.string().optional(), // Plan 05 flips this to required-in-prod

  // ── Resend ──
  RESEND_API_KEY: z.string().optional(), // Plan 05 flips this to required-in-prod
  EMAIL_FROM: z.string().optional(), // Plan 05 owns this

  // ── Inngest ──
  INNGEST_SIGNING_KEY: z.string().optional(), // Plan 07 flips this to required-in-prod
  INNGEST_EVENT_KEY: z.string().optional(), // Plan 07 flips this to required-in-prod

  // ── Upstash Redis (rate limiting) ──
  UPSTASH_REDIS_REST_URL: z.string().url().optional(), // Plan 04 flips this to required-in-prod
  UPSTASH_REDIS_REST_TOKEN: z.string().optional(), // Plan 04 flips this to required-in-prod
});

export type Env = z.infer<typeof envSchema>;

/**
 * Parsed, validated env. Parsed once at module load — a malformed/invalid var
 * fails fast here rather than silently misconfiguring downstream.
 */
export const env: Env = envSchema.parse(process.env);

/** The ONLY way the rest of the app reads the public site URL. */
export const SITE_URL: string = env.NEXT_PUBLIC_SITE_URL;

/** The ONLY way the rest of the app reads the public app URL. */
export const APP_URL: string = env.NEXT_PUBLIC_APP_URL;
