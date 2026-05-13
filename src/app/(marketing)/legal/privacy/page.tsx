import type { Metadata } from 'next';
import Link from 'next/link';
import { SectionDivider } from '@/components/primitives/section-divider';
import { PRIVACY_VERSION } from '@/lib/compliance/dpa';

/**
 * `/legal/privacy` — Trochia's privacy policy (the company's own, NOT the
 * Legal Stack module). Operator voice, banned-string clean. Same type
 * treatment as `/manifesto` (UI-SPEC §"Route / Screen Contract" /legal/*).
 *
 * Cross-references:
 *   - `docs/vendor-data-flow.md` is the sub-processor inventory (XC-01)
 *   - the DPA (`/legal/dpa`) is the binding processing addendum
 *   - the Terms (`/legal/terms`) cover the commercial relationship
 */
export const metadata: Metadata = {
  title: 'Privacy',
  description: 'How Trochia handles your data, and what we never do with it.',
};

const PARAGRAPH = 'text-body text-ink leading-[1.65] [&+&]:mt-5';
const SUBHEAD = 'text-h3 text-ink mt-12 mb-4';

export default function PrivacyPage() {
  return (
    <article className="py-20 md:py-32">
      <div className="mx-auto max-w-3xl px-6 md:px-12">
        <header className="mb-12 flex flex-col gap-4">
          <p className="text-mono-sm uppercase tracking-wider text-graphite">PRIVACY</p>
          <h1 className="text-h2 tracking-tight text-ink md:text-display">Privacy policy</h1>
          <p className="text-mono-sm text-graphite">
            Version {PRIVACY_VERSION} · effective May 2026
          </p>
        </header>

        <SectionDivider />

        <div className="max-w-prose">
          <p className={PARAGRAPH}>
            This policy explains what data Trochia collects, what we do with it, what we do
            not do with it, and how to get it back or delete it. We tried to write it the
            way we would explain it to a founder — short, specific, in plain English.
          </p>

          <h2 className={SUBHEAD}>What we collect</h2>
          <p className={PARAGRAPH}>
            Account data: name, email, authentication metadata, billing identifiers (the
            payment-card number itself is handled by our payments sub-processor — Trochia
            never sees it).
          </p>
          <p className={PARAGRAPH}>
            Customer content: the material you put into Trochia. In Phase 1, that is your
            business memory, your decks, your investor pipeline. In later modules it
            includes meeting transcripts and signed SAFE documents.
          </p>
          <p className={PARAGRAPH}>
            Product analytics: pseudonymous event identifiers — which pages you visit, which
            features you use, which onboarding step you reach. Free-text content (deck
            bodies, transcripts, financial figures) is never sent as an event property.
          </p>
          <p className={PARAGRAPH}>
            Operational logs: error reports and request traces, scrubbed of sensitive fields
            before they leave the application.
          </p>

          <h2 className={SUBHEAD}>What we do with it</h2>
          <p className={PARAGRAPH}>
            We use customer content only to operate the product features you invoke, secure
            and maintain the service, and comply with your instructions. We do not sell
            customer data. We do not share it for advertising. We do not let our vendors
            use it for anything other than running the Service.
          </p>

          <h2 className={SUBHEAD}>What we never do</h2>
          <p className={PARAGRAPH}>
            <strong className="text-ink">No training.</strong> Your business memory, decks,
            transcripts, and pipeline never enter a model-training pipeline. Not ours, not
            our model provider&apos;s, not any sub-processor&apos;s. The commitment is
            contractual with the model providers we use, reflected in the Data Processing
            Addendum, and documented in the sub-processor inventory at{' '}
            <Link href="/legal/dpa" className="text-ink underline hover:text-signal">
              /legal/dpa
            </Link>
            .
          </p>
          <p className={PARAGRAPH}>
            <strong className="text-ink">No autonomous external sends.</strong> Trochia
            drafts outreach, follow-ups, and signature requests; the founder approves each
            one before it leaves the product. That is a feature of how the product works,
            not just a policy.
          </p>
          <p className={PARAGRAPH}>
            <strong className="text-ink">No call-speaker mode.</strong> Trochia ingests
            transcripts and drafts follow-ups; it does not speak in your calls.
          </p>

          <h2 className={SUBHEAD}>Sub-processors</h2>
          <p className={PARAGRAPH}>
            We use a short list of trusted vendors to operate the service — Supabase
            (database + storage), Stripe (payments), our model provider, Resend
            (transactional email), Sentry (error monitoring), Amplitude (product
            analytics), Langfuse (model-call tracing), Inngest (background jobs), Vercel
            (hosting). Each is bound by a data-processing contract that mirrors the
            commitments here. The full inventory — with each vendor&apos;s training
            posture, retention window, and contract status — lives in our internal
            vendor-data-flow document and is referenced from the DPA.
          </p>

          <h2 className={SUBHEAD}>Your rights</h2>
          <p className={PARAGRAPH}>
            You can export your data at any time — a JSON dump of every tenant-scoped table
            we hold for your account, delivered as a private signed URL.
          </p>
          <p className={PARAGRAPH}>
            You can delete your account at any time. Deletion is a 30-day soft-delete
            window — during which you can restore — followed by permanent purge across our
            primary databases. Backups age out on their normal cycle.
          </p>
          <p className={PARAGRAPH}>
            Both flows live in your account settings.
          </p>

          <h2 className={SUBHEAD}>Geography</h2>
          <p className={PARAGRAPH}>
            Today, Trochia operates in the US, UK, and India. Data is stored in the US
            region of our database provider. EU data residency is on the V2 roadmap. We
            apply Standard Contractual Clauses and the UK International Data Transfer
            Addendum where required.
          </p>

          <h2 className={SUBHEAD}>Children</h2>
          <p className={PARAGRAPH}>
            Trochia is not designed for and not directed at anyone under 16. We do not
            knowingly collect data from minors.
          </p>

          <h2 className={SUBHEAD}>Changes to this policy</h2>
          <p className={PARAGRAPH}>
            We bump the version and notify the account owner by email on material changes.
            Cosmetic edits (grammar, broken links) do not bump the version.
          </p>

          <h2 className={SUBHEAD}>Contact</h2>
          <p className={PARAGRAPH}>
            Email <span className="font-mono">privacy@trochia.ai</span> for any
            privacy-related request. We reply within 14 days — usually sooner.
          </p>
        </div>
      </div>
    </article>
  );
}
