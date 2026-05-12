/**
 * Drizzle client factories.
 *
 * ┌─ getRequestClient(accessToken) → { rls } ───────────────────────────────────┐
 * │ A request-scoped Drizzle client. `client.rls(tx => ...)` runs the callback   │
 * │ inside a transaction that first does                                          │
 * │   SET LOCAL role = 'authenticated';                                           │
 * │   SET LOCAL request.jwt.claims = '<the request JWT's claims JSON>';           │
 * │ — so `auth.jwt()` / `auth.uid()` resolve inside RLS policies and a query      │
 * │ physically cannot return another tenant's rows (the `tenant_isolation` policy │
 * │ is keyed on `auth.jwt() ->> 'tenant_id'`, the claim our Custom Access Token   │
 * │ Auth Hook injects). This is the ONLY client tRPC `protectedProcedure` hands   │
 * │ to application code — all tenant reads/writes go through `ctx.db.rls(...)`.   │
 * │ (This is the documented Supabase "Drizzle + RLS" pattern.)                    │
 * └──────────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ getServiceClient() ─────────────────────────────────────────────────────────┐
 * │ An RLS-BYPASSING client (the Supabase pooled connection as the table owner).  │
 * │ A narrow, audited escape hatch. Its ONLY legitimate callers are:               │
 * │   1. src/server/context.ts  — resolveAccount() (auth.users.id → accounts row),│
 * │                               to learn the tenant + region before the request │
 * │                               client can exist.                                │
 * │   2. Stripe webhook handlers — no user session; tenant comes from the event    │
 * │                               payload (Plan 07).                               │
 * │   3. Inngest job functions   — carry an explicit tenantId and re-assert it      │
 * │                               (Plan 04).                                        │
 * │   4. Account deletion        — must reach every tenant's rows.                  │
 * │ Never expose this to a user session; never put the secret/owner connection     │
 * │ string in a `NEXT_PUBLIC_*` var (env.ts validates `SUPABASE_SECRET_KEY` /      │
 * │ `DATABASE_URL` as server-only). Code Reviewer + CI grep for new callers.       │
 * └──────────────────────────────────────────────────────────────────────────────┘
 *
 * Connection strings: runtime uses the POOLED `DATABASE_URL` (Supavisor transaction
 * pooler) — serverless-safe. Migrations use `DIRECT_URL` (see drizzle.config.ts).
 */
import 'server-only';

import { sql } from 'drizzle-orm';
import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';

import * as schema from '@/db/schema';
import { env } from '@/lib/env';

export type DrizzleDb = PostgresJsDatabase<typeof schema>;
type Tx = Parameters<Parameters<DrizzleDb['transaction']>[0]>[0];

/** A request-scoped client: `rls(fn)` runs `fn(tx)` as `authenticated` with the JWT claims set. */
export interface RequestDb {
  /** Run a unit of work as the authenticated tenant. RLS applies inside `fn`. */
  rls<T>(fn: (tx: Tx) => Promise<T>): Promise<T>;
}

function requireDatabaseUrl(): string {
  if (!env.DATABASE_URL) {
    throw new Error(
      'DATABASE_URL is not set — provision Supabase and inject the pooled connection string (see 01-03-PLAN.md Task 1).',
    );
  }
  return env.DATABASE_URL;
}

// One pooled postgres.js instance + Drizzle wrapper per process for the service client.
let servicePg: ReturnType<typeof postgres> | undefined;
let serviceDb: DrizzleDb | undefined;

/** The RLS-bypassing client. See the header comment for its only legitimate callers. */
export function getServiceClient(): DrizzleDb {
  if (!serviceDb) {
    servicePg = postgres(requireDatabaseUrl(), { prepare: false });
    serviceDb = drizzle(servicePg, { schema });
  }
  return serviceDb;
}

/**
 * Decode the JSON claims payload out of a JWS-compact JWT (`header.payload.sig`).
 * We set `request.jwt.claims` to this JSON string; Supabase's `auth.jwt()` parses it.
 * Signature is NOT re-verified here — Supabase Auth signed it and the cookie/session
 * layer validated it before we got the token.
 */
function decodeJwtClaims(jwt: string): string {
  const parts = jwt.split('.');
  if (parts.length < 2) return '{}';
  const payload = parts[1].replace(/-/g, '+').replace(/_/g, '/');
  return Buffer.from(payload, 'base64').toString('utf8');
}

/**
 * Build a request-scoped client for `accessToken` (the Supabase session JWT, which
 * already carries the `tenant_id` claim). Pooled connection (Supavisor) — serverless-safe.
 *
 * `accessToken === ''` is allowed for tests that mint claims directly; pass the raw
 * claims JSON instead via {@link runAsClaims} in that case.
 */
export function getRequestClient(accessToken: string): RequestDb & { db: DrizzleDb } {
  const client = postgres(requireDatabaseUrl(), { prepare: false });
  const db = drizzle(client, { schema });
  const claimsJson = accessToken === '' ? '{}' : decodeJwtClaims(accessToken);
  return {
    db,
    rls: <T>(fn: (tx: Tx) => Promise<T>) =>
      db.transaction(async (tx) => {
        await tx.execute(sql`select set_config('role', 'authenticated', true)`);
        await tx.execute(sql`select set_config('request.jwt.claims', ${claimsJson}, true)`);
        return fn(tx);
      }),
  };
}

/**
 * Test-only convenience: build a request-scoped client from a raw claims JSON object
 * (e.g. `{ sub, role: 'authenticated', tenant_id }`) rather than a signed JWT — so
 * the two-user isolation test doesn't need the Supabase JWT secret. Same `rls(fn)`
 * contract as {@link getRequestClient}.
 */
export function getRequestClientFromClaims(claims: Record<string, unknown>): RequestDb & {
  db: DrizzleDb;
} {
  const client = postgres(requireDatabaseUrl(), { prepare: false });
  const db = drizzle(client, { schema });
  const claimsJson = JSON.stringify(claims);
  return {
    db,
    rls: <T>(fn: (tx: Tx) => Promise<T>) =>
      db.transaction(async (tx) => {
        await tx.execute(sql`select set_config('role', 'authenticated', true)`);
        await tx.execute(sql`select set_config('request.jwt.claims', ${claimsJson}, true)`);
        return fn(tx);
      }),
  };
}

/** Close pooled service connections (used by the test harness teardown). */
export async function closeServicePool(): Promise<void> {
  if (servicePg) {
    await servicePg.end({ timeout: 5 });
    servicePg = undefined;
    serviceDb = undefined;
  }
}
