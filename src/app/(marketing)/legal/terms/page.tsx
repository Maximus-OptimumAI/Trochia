import type { Metadata } from 'next';
import Link from 'next/link';
import { SectionDivider } from '@/components/primitives/section-divider';
import { LegalDisclaimerBanner } from '@/components/primitives/legal-disclaimer-banner';
import { TOS_VERSION } from '@/lib/compliance/dpa';

/**
 * `/legal/terms` — Trochia's terms of service (the company's own). Operator
 * voice, banned-string clean. The DPA is the controlling document on data
 * processing; these terms cover the commercial relationship + acceptable use.
 */
export const metadata: Metadata = {
  title: 'Terms',
  description: 'The terms of using Trochia, what we agree to, what you agree to.',
};

const PARAGRAPH = 'text-body text-ink leading-[1.65] [&+&]:mt-5';
const SUBHEAD = 'text-h3 text-ink mt-12 mb-4';

export default function TermsPage() {
  return (
    <article className="py-20 md:py-32">
      <div className="mx-auto max-w-3xl px-6 md:px-12">
        <header className="mb-12 flex flex-col gap-4">
          <p className="text-mono-sm uppercase tracking-wider text-graphite">TERMS</p>
          <h1 className="text-h2 tracking-tight text-ink md:text-display">Terms of service</h1>
          <p className="text-mono-sm text-graphite">
            Version {TOS_VERSION} · effective May 2026
          </p>
        </header>

        <SectionDivider />

        <div className="flex max-w-prose flex-col gap-6">
          <LegalDisclaimerBanner variant="not-legal-advice" />

          <p className={PARAGRAPH}>
            These terms govern your use of Trochia. They are short on purpose. The longer
            a terms-of-service document is, the less likely anyone reads it.
          </p>

          <h2 className={SUBHEAD}>The deal</h2>
          <p className={PARAGRAPH}>
            Trochia provides a software product that helps founders run their raise. You
            pay a monthly or annual subscription, you use the product, we keep it running.
            Either side can end the relationship by cancelling.
          </p>

          <h2 className={SUBHEAD}>Pricing and trial</h2>
          <p className={PARAGRAPH}>
            Pricing is published at{' '}
            <Link href="/pricing" className="text-ink underline hover:text-signal">
              /pricing
            </Link>
            . A new account gets a 7-day trial with a card on file at signup. No permanent
            free tier. After the trial, the card is charged at the tier you selected. You
            can cancel any time. You keep access until the end of the current billing
            period.
          </p>

          <h2 className={SUBHEAD}>Your account</h2>
          <p className={PARAGRAPH}>
            You are responsible for keeping your sign-in credentials safe and for the
            actions taken under your account. Tell us if you suspect your account has been
            compromised. We do not log into customer accounts to do work on your behalf.
          </p>

          <h2 className={SUBHEAD}>Your content</h2>
          <p className={PARAGRAPH}>
            Your content is yours. You grant Trochia the limited rights it needs to
            operate the product: store it, run the features you invoke against it, back
            it up, serve it back to you. Nothing more.
          </p>
          <p className={PARAGRAPH}>
            Trochia does not use your content to train AI models. This commitment is in
            the Data Processing Addendum at{' '}
            <Link href="/legal/dpa" className="text-ink underline hover:text-signal">
              /legal/dpa
            </Link>
            .
          </p>

          <h2 className={SUBHEAD}>Acceptable use</h2>
          <p className={PARAGRAPH}>
            Do not use Trochia to send mass unsolicited outreach, scrape platforms in ways
            their terms forbid, attempt to break the security of the service or other
            tenants, or process data you do not have the right to process. We may suspend
            an account that breaks these rules.
          </p>

          <h2 className={SUBHEAD}>Founder-approved external action</h2>
          <p className={PARAGRAPH}>
            Anything Trochia sends outside the product on your behalf (outreach, intros,
            signature requests) requires your explicit approval first. This is a product
            commitment as much as a legal one.
          </p>

          <h2 className={SUBHEAD}>Modules involving regulated work</h2>
          <p className={PARAGRAPH}>
            The SAFE Generator (later phase) uses deterministic substitution into
            established templates from YC and Cooley GO, with a mandatory lawyer-review
            gate before any download. Trochia does not draft custom legal language. This
            is not legal advice; consult your lawyer before signing anything.
          </p>
          <p className={PARAGRAPH}>
            The Legal Stack module recommends vendors and may earn a referral fee from
            partner programs. That disclosure is visible on every recommendation. The
            module does not provide legal advice and does not interpret documents.
          </p>
          <p className={PARAGRAPH}>
            The cap-table module uses unit-tested deterministic math against a 30-scenario
            oracle. None of the math is inferred by a model.
          </p>
          <p className={PARAGRAPH}>
            The F&amp;F module is a tracker. Trochia is not a broker-dealer, is not a
            registered investment advisor, and does not operate a pooled investment
            structure. You and your investors handle the securities side.
          </p>

          <h2 className={SUBHEAD}>Cancellation and deletion</h2>
          <p className={PARAGRAPH}>
            Cancel in the billing screen. Access continues to the end of the period.
            Delete your account in settings. A 30-day soft-delete window applies, after
            which the data is permanently purged from the primary databases. You can
            export your data before, during, or after either flow.
          </p>

          <h2 className={SUBHEAD}>Service availability</h2>
          <p className={PARAGRAPH}>
            We aim for high availability but make no specific uptime guarantee at this
            stage. If a long outage materially affects your ability to run the raise,
            email <span className="font-mono">support@trochia.ai</span> and we will work
            it out.
          </p>

          <h2 className={SUBHEAD}>Liability</h2>
          <p className={PARAGRAPH}>
            To the extent the law allows it, Trochia&apos;s aggregate liability under
            these terms is capped at the fees you paid in the 12 months preceding the
            event. Trochia is not liable for indirect or consequential damages.
          </p>

          <h2 className={SUBHEAD}>Changes to these terms</h2>
          <p className={PARAGRAPH}>
            We bump the version and notify the account owner by email on material changes.
            Continued use after the effective date counts as acceptance; you can cancel
            instead if you disagree.
          </p>

          <h2 className={SUBHEAD}>Governing law</h2>
          <p className={PARAGRAPH}>
            These terms are governed by the laws of the State of Delaware, USA. Disputes
            go to the state and federal courts located in Delaware.
          </p>

          <h2 className={SUBHEAD}>Contact</h2>
          <p className={PARAGRAPH}>
            Email <span className="font-mono">legal@trochia.ai</span> for any
            terms-related question.
          </p>
        </div>
      </div>
    </article>
  );
}
