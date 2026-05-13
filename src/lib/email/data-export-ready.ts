/**
 * The "your data export is ready" system email (sent to the founder after an
 * on-demand data export — XC-04).
 *
 * Phase-1 minimal sender: uses Resend when `RESEND_API_KEY` + `EMAIL_FROM` are set,
 * otherwise logs and returns (dev / test / pre-provisioning). Plan 05 owns the full
 * email layer (React Email templates, the shared `src/lib/email/client.ts`, retries,
 * the rest of the transactional set) — when it lands it can replace this with the
 * `data-export-ready` React Email template; the call signature here is what
 * `src/modules/data-rights/export.ts` depends on, so keep it stable.
 *
 * No autonomous external sends beyond Trochia→founder system mail (global rule).
 */
import { Resend } from 'resend';

import { env } from '@/lib/env';
import { logger } from '@/lib/logger';

export interface DataExportReadyEmailInput {
  /** The recipient (the founder's account email). */
  to: string;
  /** The signed download URL for the export JSON. */
  downloadUrl: string;
  /** When the signed URL stops working. */
  expiresAt: Date;
}

/** Send the data-export-ready email. Best-effort: never throws on a send failure. */
export async function sendDataExportReadyEmail(input: DataExportReadyEmailInput): Promise<void> {
  const { to, downloadUrl, expiresAt } = input;
  const subject = 'Your Trochia data export is ready';
  const expiryText = expiresAt.toUTCString();
  const text = [
    'Your data export is ready to download.',
    '',
    `Download: ${downloadUrl}`,
    `This link expires: ${expiryText}`,
    '',
    'The export is a JSON file containing your account data. If the link has expired, request a new export from your account settings.',
  ].join('\n');

  if (!env.RESEND_API_KEY || !env.EMAIL_FROM) {
    logger.info('sendDataExportReadyEmail: email not configured — skipping send', {
      to,
      expiresAt: expiryText,
    });
    return;
  }

  try {
    const resend = new Resend(env.RESEND_API_KEY);
    await resend.emails.send({ from: env.EMAIL_FROM, to, subject, text });
    logger.info('sendDataExportReadyEmail: sent', { to, expiresAt: expiryText });
  } catch (err) {
    logger.warn('sendDataExportReadyEmail: send failed (non-fatal)', { to, err });
  }
}
