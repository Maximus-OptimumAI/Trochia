/**
 * The "your data export is ready" system email (sent to the founder after an
 * on-demand data export — XC-04).
 *
 * Plan 06 introduced this as a minimal Resend sender; Plan 05 migrated it
 * behind `src/lib/email/client.ts` (the real layer: typed registry + react-email
 * templates). The call signature (`sendDataExportReadyEmail({ to, downloadUrl,
 * expiresAt: Date })`) is preserved — `src/modules/data-rights/export.ts`
 * depends on it.
 *
 * No autonomous external sends beyond Trochia→founder system mail (XC-02).
 */
import { sendEmail } from './client';

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
  await sendEmail({
    to: input.to,
    template: 'data-export-ready',
    props: {
      downloadUrl: input.downloadUrl,
      expiresAt: input.expiresAt.toUTCString(),
    },
  });
}
