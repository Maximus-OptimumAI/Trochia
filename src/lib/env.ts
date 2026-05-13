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

  // ── Stripe ── (Plan 07 / 01-07-PLAN.md flipped these to required-in-prod)
  STRIPE_SECRET_KEY: prodRequired(z.string()),
  STRIPE_WEBHOOK_SECRET: prodRequired(z.string()),
  STRIPE_PRICE_PRE_RAISE_MONTHLY: prodRequired(z.string()),
  STRIPE_PRICE_PRE_RAISE_ANNUAL: prodRequired(z.string()),
  STRIPE_PRICE_ACTIVE_RAISE_MONTHLY: prodRequired(z.string()),
  STRIPE_PRICE_ACTIVE_RAISE_ANNUAL: prodRequired(z.string()),

  // ── AI chokepoint ──
  ANTHROPIC_API_KEY: prodRequired(z.string()), // Plan 04 / 01-04-PLAN.md flipped this to required-in-prod
  OPENAI_API_KEY: z.string().optional(), // Plan 04 owns this — only required-in-prod when AI_FALLBACK_ENABLED (kept optional; default-off fallback)
  AI_FALLBACK_ENABLED: booleanish, // Plan 04 owns this flag

  // ── Langfuse ── (Plan 05 / 01-05-PLAN.md flipped these to required-in-prod)
  LANGFUSE_PUBLIC_KEY: prodRequired(z.string()),
  LANGFUSE_SECRET_KEY: prodRequired(z.string()),
  LANGFUSE_HOST: prodRequired(z.string().url()),

  // ── Sentry ── (Plan 05 / 01-05-PLAN.md flipped these to required-in-prod)
  SENTRY_DSN: prodRequired(z.string()),
  NEXT_PUBLIC_SENTRY_DSN: prodRequired(z.string()),
  SENTRY_ORG: prodRequired(z.string()), // build-time source-map upload
  SENTRY_PROJECT: prodRequired(z.string()), // build-time source-map upload
  SENTRY_AUTH_TOKEN: prodRequired(z.string()), // build-time source-map upload

  // ── Amplitude ── (Plan 05 / 01-05-PLAN.md flipped these to required-in-prod)
  AMPLITUDE_API_KEY: prodRequired(z.string()),
  NEXT_PUBLIC_AMPLITUDE_API_KEY: prodRequired(z.string()),

  // ── Resend ── (Plan 05 / 01-05-PLAN.md flipped RESEND_API_KEY to required-in-prod)
  RESEND_API_KEY: prodRequired(z.string()),
  EMAIL_FROM: z.string().optional(), // optional — `src/lib/email/client.ts` derives the from-address from SITE_URL's host when unset (no hardcoded domain)

  // ── Inngest ── (Plan 07 / 01-07-PLAN.md flipped these to required-in-prod;
  // the Vercel↔Inngest integration auto-injects them on Vercel.)
  INNGEST_SIGNING_KEY: prodRequired(z.string()),
  INNGEST_EVENT_KEY: prodRequired(z.string()),

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
