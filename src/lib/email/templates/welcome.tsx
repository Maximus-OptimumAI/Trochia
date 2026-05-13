/**
 * Welcome email — sent after first sign-in (Plan 09 onboarding wires the send).
 *
 * Operator voice (docs/BRAND.md). No emoji. No banned compliance strings.
 */
import { Button, Section, Text } from '@react-email/components';

import { EmailShell, emailStyles } from './_shared';

export interface WelcomeEmailProps {
  /** Where the founder lands when they click through. */
  appUrl: string;
}

export function WelcomeEmail({ appUrl }: WelcomeEmailProps) {
  return (
    <EmailShell
      preview="Your operator is set up."
      heading="Your operator is set up."
    >
      <Text style={emailStyles.paragraph}>
        Trochia holds your business memory, drafts your outreach, and tracks
        every investor conversation. The shorter your raise, the better the
        product works.
      </Text>
      <Text style={emailStyles.paragraph}>
        Three steps to go live:
      </Text>
      <Text style={emailStyles.paragraph}>
        1. Import your context — deck, one-pager, founder bio.<br />
        2. Upload the deck you would send today.<br />
        3. Review the first scorecard.
      </Text>
      <Section style={{ margin: '24px 0' }}>
        <Button href={appUrl} style={emailStyles.button}>
          Open Trochia
        </Button>
      </Section>
    </EmailShell>
  );
}

export default WelcomeEmail;
