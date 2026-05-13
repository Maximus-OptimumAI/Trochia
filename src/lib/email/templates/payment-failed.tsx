/**
 * Payment-failed email — sent on Stripe `invoice.payment_failed` (Plan 07
 * billing flow wires the send).
 *
 * Operator voice. Direct, no apology theater. No emoji. No banned strings.
 */
import { Button, Section, Text } from '@react-email/components';

import { EmailShell, emailStyles } from './_shared';

export interface PaymentFailedEmailProps {
  /** Stripe Customer Portal URL for the founder to update the payment method. */
  updatePaymentUrl: string;
}

export function PaymentFailedEmail({ updatePaymentUrl }: PaymentFailedEmailProps) {
  return (
    <EmailShell
      preview="We could not process your payment."
      heading="We could not process your payment."
    >
      <Text style={emailStyles.paragraph}>
        Stripe declined the most recent charge on your Trochia subscription.
        Update the payment method to keep your raise running without
        interruption.
      </Text>
      <Text style={emailStyles.paragraph}>
        Stripe will retry automatically for the next several days. If it still
        fails, the account moves to read-only — your data stays put, but
        outbound drafting pauses.
      </Text>
      <Section style={{ margin: '24px 0' }}>
        <Button href={updatePaymentUrl} style={emailStyles.button}>
          Update payment method
        </Button>
      </Section>
    </EmailShell>
  );
}

export default PaymentFailedEmail;
