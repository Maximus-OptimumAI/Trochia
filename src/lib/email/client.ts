/**
 * Transactional email — Resend + react-email (FND-07 / D-13).
 *
 * Trochia→founder system mail ONLY. Founder-authored investor / intro /
 * follow-up emails (later phases) are sent via the founder's own Gmail through
 * the founder-approval Dialog — NEVER through Resend, NEVER autonomously
 * (XC-02). Code Reviewer rejects any use of `sendEmail` for founder-authored
 * external mail.
 *
 * Surface:
 *   sendEmail({ to, template, props }) — picks the React component from
 *   `EMAIL_TEMPLATES`, renders to HTML, derives the from-address domain from
 *   `SITE_URL` (so the trochia.ai migration is a single env-var swap — no
 *   hardcoded domain in this module), and calls `resend.emails.send`.
 *
 * Best-effort: missing `RESEND_API_KEY` (dev / pre-provisioning) logs + returns
 * rather than throwing — the same fail-soft behavior Plan 06's minimal sender
 * relies on. Errors are caught + logged via the redacting logger (XC-03).
 */
import { render } from '@react-email/render';
import { createElement } from 'react';
import { Resend } from 'resend';

import { SITE_URL, env } from '@/lib/env';
import { logger } from '@/lib/logger';

import {
  EMAIL_TEMPLATES,
  TEMPLATE_SUBJECTS,
  type TemplateName,
  type TemplateProps,
} from './templates';

/**
 * Derive the from-address from `NEXT_PUBLIC_SITE_URL`'s host. `EMAIL_FROM`
 * (optional) overrides the whole address; otherwise the synthesized address
 * is `Trochia <system@{host}>`. The trochia.ai migration becomes an env swap.
 */
export function getEmailFromAddress(): string {
  if (env.EMAIL_FROM) return env.EMAIL_FROM;
  const host = new URL(SITE_URL).host;
  return `Trochia <system@${host}>`;
}

export interface SendEmailArgs<T extends TemplateName> {
  to: string;
  template: T;
  props: TemplateProps<T>;
  /** Optional subject override (defaults to the registry value). */
  subject?: string;
}

let resendClient: Resend | null = null;
function getResend(): Resend | null {
  if (!env.RESEND_API_KEY) return null;
  if (resendClient) return resendClient;
  resendClient = new Resend(env.RESEND_API_KEY);
  return resendClient;
}

/**
 * Render a registered template + send it via Resend. Returns the rendered HTML
 * + send result for test assertions; never throws on send failure (logged).
 */
export async function sendEmail<T extends TemplateName>(
  args: SendEmailArgs<T>,
): Promise<{ html: string; sent: boolean }> {
  const Template = EMAIL_TEMPLATES[args.template] as unknown as (
    props: TemplateProps<T>,
  ) => React.ReactElement;
  const subject = args.subject ?? TEMPLATE_SUBJECTS[args.template];
  const html = await render(createElement(Template, args.props));
  const from = getEmailFromAddress();

  const resend = getResend();
  if (!resend) {
    logger.info('sendEmail: RESEND_API_KEY not set — skipping send', {
      to: args.to,
      template: args.template,
    });
    return { html, sent: false };
  }

  try {
    await resend.emails.send({
      from,
      to: args.to,
      subject,
      html,
    });
    logger.info('sendEmail: sent', { to: args.to, template: args.template });
    return { html, sent: true };
  } catch (err) {
    logger.warn('sendEmail: send failed (non-fatal)', {
      to: args.to,
      template: args.template,
      err,
    });
    return { html, sent: false };
  }
}
