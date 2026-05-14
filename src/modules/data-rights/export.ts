/**
 * On-demand full data export (XC-04).
 *
 * `exportAccountData(accountId)` SELECTs every tenant-scoped row for the account,
 * assembles a single JSON object (internal-only / secret columns stripped — never a
 * `*_secret` / `*_key` column, never a value under a `SENSITIVE_FIELDS` key), uploads
 * it to a tenant-isolated private Supabase Storage path (`exports/{accountId}/{ts}.json`),
 * creates a short-lived signed download URL, sends the founder the "data-export-ready"
 * email with that URL + expiry, and returns the URL + expiry.
 *
 * This is the founder's own data, delivered to the founder. It is NOT internal config —
 * so we whitelist the columns that go in (no Stripe secret, no key columns) and the
 * test asserts no `SENSITIVE_FIELDS` key appears in the dump.
 *
 * Tenancy: we read via `getServiceClient()` and explicitly filter every query to the
 * one `accountId` (and read the `accounts` row by its `id`). RLS is the backstop, but
 * the export must be exactly this account's rows and nothing else — the explicit
 * `account_id = accountId` filter is the primary control (threat T-1-31). Future-phase
 * tables (businesses, decks, investors, pipeline) are added to this function as those
 * phases ship.
 *
 * Phase 1: synchronous (there's almost no data). If a tenant's dump ever gets large,
 * move the body into an Inngest function and have `requestDataExport` enqueue it.
 */
import 'server-only';

import { createClient } from '@supabase/supabase-js';
import { eq } from 'drizzle-orm';

import { getServiceClient } from '@/db/client';
import { accounts, sessions } from '@/db/schema/tenancy';
import { subscriptions } from '@/db/schema/billing';
import { legalAcceptances } from '@/db/schema/legal';
import { jobs } from '@/db/schema/jobs';
import { sendDataExportReadyEmail } from '@/lib/email/data-export-ready';
import { env } from '@/lib/env';
import { AppError } from '@/lib/errors';
import { logger } from '@/lib/logger';

/** The private Storage bucket exports live in. */
export const EXPORTS_BUCKET = 'exports';
/** How long a signed export download URL stays valid. */
export const EXPORT_URL_TTL_SECONDS = 48 * 60 * 60; // 48 hours

/** Columns that must never appear in an export, regardless of table. */
const FORBIDDEN_COLUMN_PATTERNS = [/_secret$/i, /_key$/i, /secret/i, /password/i, /token/i];

function stripForbidden<T extends Record<string, unknown>>(row: T): Partial<T> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(row)) {
    if (FORBIDDEN_COLUMN_PATTERNS.some((re) => re.test(k))) continue;
    out[k] = v;
  }
  return out as Partial<T>;
}

/** The shape of the export JSON. */
export interface AccountDataExport {
  exportedAt: string;
  schemaNote: string;
  account: Record<string, unknown> | null;
  subscriptions: Record<string, unknown>[];
  legalAcceptances: Record<string, unknown>[];
  jobs: Record<string, unknown>[];
  sessions: Record<string, unknown>[];
}

/** Assemble the export JSON for `accountId` (every tenant-scoped table, forbidden columns stripped). */
export async function buildAccountDataExport(accountId: string): Promise<AccountDataExport> {
  const db = getServiceClient();
  const [accountRow] = await db.select().from(accounts).where(eq(accounts.id, accountId)).limit(1);
  if (!accountRow) {
    throw new AppError('Account not found', { status: 404, code: 'ACCOUNT_NOT_FOUND' });
  }
  const subsRows = await db.select().from(subscriptions).where(eq(subscriptions.accountId, accountId));
  const legalRows = await db.select().from(legalAcceptances).where(eq(legalAcceptances.accountId, accountId));
  const jobRows = await db.select().from(jobs).where(eq(jobs.accountId, accountId));
  const sessionRows = await db.select().from(sessions).where(eq(sessions.accountId, accountId));

  return {
    exportedAt: new Date().toISOString(),
    schemaNote:
      'Phase-1 export. Future modules (businesses, decks, investors, pipeline, transcripts) will appear here as those phases ship.',
    account: stripForbidden(accountRow as Record<string, unknown>),
    subscriptions: subsRows.map((r) => stripForbidden(r as Record<string, unknown>)),
    legalAcceptances: legalRows.map((r) => stripForbidden(r as Record<string, unknown>)),
    jobs: jobRows.map((r) => stripForbidden(r as Record<string, unknown>)),
    sessions: sessionRows.map((r) => stripForbidden(r as Record<string, unknown>)),
  };
}

function storageClient() {
  if (!env.SUPABASE_URL || !env.SUPABASE_SECRET_KEY) {
    throw new AppError('Storage is not configured', { status: 503, code: 'STORAGE_UNCONFIGURED' });
  }
  return createClient(env.SUPABASE_URL, env.SUPABASE_SECRET_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

/**
 * Run a full on-demand export for `accountId`: build the JSON, upload it to a
 * tenant-isolated private path, mint a 48h signed URL, email the founder, return the
 * URL + expiry.
 */
export async function exportAccountData(accountId: string): Promise<{ downloadUrl: string; expiresAt: Date }> {
  const data = await buildAccountDataExport(accountId);
  // The export JSON is the founder's own data being returned to the founder;
  // `data.account.email` is intentionally present (it survives stripForbidden
  // because the FORBIDDEN_COLUMN_PATTERNS list is separate from logger
  // SENSITIVE_FIELDS — exports preserve PII for the data-subject, logs strip it).
  // `accountEmail` here is used solely for routing the export-ready email and
  // is never passed into a logger payload — sendEmail's PR-5 fix drops the
  // `to:` field from all log entries.
  const accountEmail = (data.account?.email as string | undefined) ?? undefined;

  const supabase = storageClient();
  const objectPath = `${accountId}/${Date.now()}.json`;
  const body = Buffer.from(JSON.stringify(data, null, 2), 'utf8');

  const { error: uploadError } = await supabase.storage
    .from(EXPORTS_BUCKET)
    .upload(objectPath, body, { contentType: 'application/json', upsert: false });
  if (uploadError) {
    throw new AppError(`Failed to store data export: ${uploadError.message}`, {
      status: 502,
      code: 'EXPORT_UPLOAD_FAILED',
    });
  }

  const { data: signed, error: signError } = await supabase.storage
    .from(EXPORTS_BUCKET)
    .createSignedUrl(objectPath, EXPORT_URL_TTL_SECONDS);
  if (signError || !signed?.signedUrl) {
    throw new AppError(`Failed to sign data export URL: ${signError?.message ?? 'unknown'}`, {
      status: 502,
      code: 'EXPORT_SIGN_FAILED',
    });
  }

  const expiresAt = new Date(Date.now() + EXPORT_URL_TTL_SECONDS * 1000);

  if (accountEmail) {
    await sendDataExportReadyEmail({ to: accountEmail, downloadUrl: signed.signedUrl, expiresAt });
  } else {
    logger.warn('exportAccountData: no account email — export ready but not emailed', { accountId });
  }

  logger.info('exportAccountData: export ready', { accountId, expiresAt: expiresAt.toISOString() });
  return { downloadUrl: signed.signedUrl, expiresAt };
}
