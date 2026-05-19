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
 *
 * **Client vs server (PR-1 follow-up — fixes the marketing-spec hydration crash):**
 * Next.js correctly strips non-`NEXT_PUBLIC_*` env vars from the client bundle.
 * A single `parse(process.env)` over the full server schema therefore throws
 * a ZodError on the client in any production build (NODE_ENV=production), which
 * replaces the page with Next's "This page couldn't load" error boundary — the
 * proxy-gate tests passed because they redirect SSR-side with no hydration,
 * but every marketing route that mounts React hit the crash. The split below
 * runs the strict full-schema validation only on the server; on the client we
 * validate just the `NEXT_PUBLIC_*` subset (the only vars actually present
 * in the bundle), via explicit per-var references so Next's build-time
 * `process.env.NEXT_PUBLIC_X` substitution actually fires for each one.
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

/**
 * The `NEXT_PUBLIC_*` subset — the only vars that exist on the client.
 * Validated on every module load, on both the server and the client.
 */
const clientSchema = z.object({
  // ── Site URLs ── REQUIRED (present in .env.local; the app reads all URLs here)
  NEXT_PUBLIC_SITE_URL: z.string().url(), // required — do not make optional
  NEXT_PUBLIC_APP_URL: z.string().url(), // required — do not make optional

  // ── Supabase (publishable / public-by-design) ──
  NEXT_PUBLIC_SUPABASE_URL: prodRequired(z.string().url()),
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: prodRequired(z.string()),

  // ── Sentry browser SDK (DSN is public-by-design) ──
  NEXT_PUBLIC_SENTRY_DSN: prodRequired(z.string()),

  // ── Amplitude browser SDK ──
  NEXT_PUBLIC_AMPLITUDE_API_KEY: prodRequired(z.string()),
});

/**
 * The full env schema — extends the client schema with server-only vars.
 * Validated on every server module load. Never validated on the client (the
 * server-only vars are correctly stripped from the bundle there).
 */
const serverSchema = clientSchema.extend({
  // ── Database ── (Plan 03 / 01-03-PLAN.md flipped these to required-in-prod)
  DATABASE_URL: prodRequired(z.string()), // pooled (Supavisor) connection string — runtime
  DIRECT_URL: prodRequired(z.string()), // direct connection string — drizzle-kit migrations

  // ── Supabase server-only ── (Plan 03 / 01-03-PLAN.md flipped these to required-in-prod)
  // Use the publishable + secret keys, NEVER anon/service_role.
  SUPABASE_URL: prodRequired(z.string().url()),
  SUPABASE_PUBLISHABLE_KEY: prodRequired(z.string()),
  SUPABASE_SECRET_KEY: prodRequired(z.string()), // server-only — never in NEXT_PUBLIC_*

  // ── Stripe ── (Plan 07 / 01-07-PLAN.md flipped these to required-in-prod)
  STRIPE_SECRET_KEY: prodRequired(z.string()),
  STRIPE_WEBHOOK_SECRET: prodRequired(z.string()),
  STRIPE_PRICE_PRE_RAISE_MONTHLY: prodRequired(z.string()),
  STRIPE_PRICE_PRE_RAISE_ANNUAL: prodRequired(z.string()),
  STRIPE_PRICE_ACTIVE_RAISE_MONTHLY: prodRequired(z.string()),
  STRIPE_PRICE_ACTIVE_RAISE_ANNUAL: prodRequired(z.string()),
  STRIPE_PRICE_CLOSE_MODE_MONTHLY: prodRequired(z.string()),
  STRIPE_PRICE_CLOSE_MODE_ANNUAL: prodRequired(z.string()),
  STRIPE_PRICE_ALUMNI_MONTHLY: prodRequired(z.string()),
  STRIPE_PRICE_ALUMNI_ANNUAL: prodRequired(z.string()),

  // ── AI chokepoint ──
  ANTHROPIC_API_KEY: prodRequired(z.string()), // Plan 04 / 01-04-PLAN.md flipped this to required-in-prod
  OPENAI_API_KEY: z.string().optional(), // Plan 04 owns this — only required-in-prod when AI_FALLBACK_ENABLED (kept optional; default-off fallback)
  AI_FALLBACK_ENABLED: booleanish, // Plan 04 owns this flag

  // ── Langfuse ── (Plan 05 / 01-05-PLAN.md flipped these to required-in-prod)
  LANGFUSE_PUBLIC_KEY: prodRequired(z.string()),
  LANGFUSE_SECRET_KEY: prodRequired(z.string()),
  LANGFUSE_HOST: prodRequired(z.string().url()),

  // ── Sentry server / build-time ── (Plan 05 / 01-05-PLAN.md flipped these to required-in-prod)
  SENTRY_DSN: prodRequired(z.string()),
  SENTRY_ORG: prodRequired(z.string()), // build-time source-map upload
  SENTRY_PROJECT: prodRequired(z.string()), // build-time source-map upload
  SENTRY_AUTH_TOKEN: prodRequired(z.string()), // build-time source-map upload

  // ── Amplitude server SDK ── (Plan 05 / 01-05-PLAN.md flipped this to required-in-prod)
  AMPLITUDE_API_KEY: prodRequired(z.string()),

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

export type Env = z.infer<typeof serverSchema>;

/**
 * CRITICAL for the client: Next.js inlines `NEXT_PUBLIC_*` env-var references
 * AT BUILD TIME via a textual substitution — it replaces specific accesses
 * like `process.env.NEXT_PUBLIC_SITE_URL` with the literal string, but does
 * NOT spread `process.env` as a whole object. So on the client we MUST list
 * each var explicitly below for the build-time replacement to land. Adding
 * a new `NEXT_PUBLIC_*` var to `clientSchema` REQUIRES a matching entry here.
 */
const clientEnvSource: Record<string, string | undefined> = {
  NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL,
  NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
  NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  NEXT_PUBLIC_SENTRY_DSN: process.env.NEXT_PUBLIC_SENTRY_DSN,
  NEXT_PUBLIC_AMPLITUDE_API_KEY: process.env.NEXT_PUBLIC_AMPLITUDE_API_KEY,
};

const isServer = typeof window === 'undefined';

/**
 * Parsed, validated env. On the server: the full server schema. On the
 * client: only the `NEXT_PUBLIC_*` subset (everything else is `undefined`
 * in the client bundle — accessing it returns undefined, never throws).
 *
 * The exported `Env` type still describes the full server shape, which is
 * the practical type for the >95% of imports that run on the server. Client
 * code that accidentally reads a server-only field gets `undefined` at
 * runtime — same as Phase-0 behavior pre-fix; the fix is that the module
 * load no longer crashes the page.
 */
export const env: Env = (isServer
  ? serverSchema.parse(process.env)
  : clientSchema.parse(clientEnvSource)) as Env;

/** The ONLY way the rest of the app reads the public site URL. */
export const SITE_URL: string = env.NEXT_PUBLIC_SITE_URL;

/** The ONLY way the rest of the app reads the public app URL. */
export const APP_URL: string = env.NEXT_PUBLIC_APP_URL;
