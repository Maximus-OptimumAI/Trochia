/**
 * Data-export-ready email — sent when an on-demand data export finishes
 * (Plan 06 wires the send: src/modules/data-rights/export.ts → sendEmail).
 *
 * Operator voice. No emoji. No banned strings. The download link is a 48-hour
 * Supabase Storage signed URL — `expiresAt` is rendered in UTC.
 */
import { Button, Section, Text } from '@react-email/components';

import { EmailShell, emailStyles } from './_shared';

export interface DataExportReadyEmailProps {
  /** The 48-hour Supabase Storage signed URL. */
  downloadUrl: string;
  /** ISO timestamp when the signed URL expires. */
  expiresAt: string;
}

export function DataExportReadyEmail({ downloadUrl, expiresAt }: DataExportReadyEmailProps) {
  return (
    <EmailShell
      preview="Your data export is ready."
      heading="Your data export is ready."
    >
      <Text style={emailStyles.paragraph}>
        The JSON export of your Trochia account is ready to download. The link
        expires at {expiresAt}. After that, request a new export from your
        account settings.
      </Text>
      <Section style={{ margin: '24px 0' }}>
        <Button href={downloadUrl} style={emailStyles.button}>
          Download export
        </Button>
      </Section>
      <Text style={emailStyles.paragraph}>
        The file contains every record we hold against your account: business
        memory, investor pipeline, pitch reviews, and account metadata.
      </Text>
    </EmailShell>
  );
}

export default DataExportReadyEmail;
