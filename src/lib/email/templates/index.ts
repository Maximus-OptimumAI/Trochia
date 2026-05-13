/**
 * Typed template registry. Add a new transactional template by:
 *   1. creating `src/lib/email/templates/{name}.tsx` exporting a default React
 *      component + a named `Props` interface;
 *   2. registering it in `EMAIL_TEMPLATES` below;
 * `sendEmail({ template: '...', props: {...} })` then becomes type-safe.
 */
import { DataExportReadyEmail, type DataExportReadyEmailProps } from './data-export-ready';
import { PaymentFailedEmail, type PaymentFailedEmailProps } from './payment-failed';
import { TrialEndingEmail, type TrialEndingEmailProps } from './trial-ending';
import { WelcomeEmail, type WelcomeEmailProps } from './welcome';

/**
 * The Trochia transactional registry. Per `src/lib/email/client.ts`, this is
 * Trochia→founder system mail ONLY — founder-authored investor email goes via
 * the founder's own Gmail through the founder-approval Dialog, NEVER Resend.
 */
export const EMAIL_TEMPLATES = {
  welcome: WelcomeEmail,
  'trial-ending': TrialEndingEmail,
  'payment-failed': PaymentFailedEmail,
  'data-export-ready': DataExportReadyEmail,
} as const;

export type TemplateName = keyof typeof EMAIL_TEMPLATES;

/** Maps each template name to its props type. */
export interface TemplatePropsMap {
  welcome: WelcomeEmailProps;
  'trial-ending': TrialEndingEmailProps;
  'payment-failed': PaymentFailedEmailProps;
  'data-export-ready': DataExportReadyEmailProps;
}

export type TemplateProps<T extends TemplateName> = TemplatePropsMap[T];

/** Per-template subject lines (kept here so the client.ts logic stays generic). */
export const TEMPLATE_SUBJECTS: Record<TemplateName, string> = {
  welcome: 'Welcome to Trochia',
  'trial-ending': 'Your Trochia trial is ending',
  'payment-failed': 'We could not process your payment',
  'data-export-ready': 'Your Trochia data export is ready',
};
