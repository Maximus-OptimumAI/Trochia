/**
 * Trial-ending email — sent N days before the 7-day trial closes (Plan 07
 * billing flow wires the send).
 *
 * Operator voice. Direct. No emoji. No banned strings.
 */
import { Button, Section, Text } from '@react-email/components';

import { EmailShell, emailStyles } from './_shared';

export interface TrialEndingEmailProps {
  /** Days left in the trial — integer; the copy is "in {daysLeft} days". */
  daysLeft: number;
  /** Stripe Customer Portal URL for the founder to manage billing. */
  manageBillingUrl: string;
}

export function TrialEndingEmail({ daysLeft, manageBillingUrl }: TrialEndingEmailProps) {
  const daysText =
    daysLeft === 1 ? '1 day' : `${daysLeft} days`;
  return (
    <EmailShell
      preview={`Your Trochia trial ends in ${daysText}.`}
      heading={`Your trial ends in ${daysText}.`}
    >
      <Text style={emailStyles.paragraph}>
        After {daysText}, Trochia bills the tier you selected at sign-up. You
        keep your business memory, your investor pipeline, and every scorecard
        Trochia has written.
      </Text>
      <Text style={emailStyles.paragraph}>
        Change tier, switch to annual, or cancel from the billing portal.
      </Text>
      <Section style={{ margin: '24px 0' }}>
        <Button href={manageBillingUrl} style={emailStyles.button}>
          Manage billing
        </Button>
      </Section>
    </EmailShell>
  );
}

export default TrialEndingEmail;
