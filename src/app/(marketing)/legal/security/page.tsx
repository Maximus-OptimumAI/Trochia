import type { Metadata } from 'next';
import Link from 'next/link';
import { SectionDivider } from '@/components/primitives/section-divider';

/**
 * `/legal/security` — Trochia's security posture. Operator voice, factual,
 * banned-string clean. Describes RLS / encryption / vendor posture / SOC 2
 * Type I prep (Phase 11). References docs/vendor-data-flow.md.
 */
export const metadata: Metadata = {
  title: 'Security',
  description: 'How Trochia protects customer data — architecture, controls, and roadmap.',
};

const PARAGRAPH = 'text-body text-ink leading-[1.65] [&+&]:mt-5';
const SUBHEAD = 'text-h3 text-ink mt-12 mb-4';

export default function SecurityPage() {
  return (
    <article className="py-20 md:py-32">
      <div className="mx-auto max-w-3xl px-6 md:px-12">
        <header className="mb-12 flex flex-col gap-4">
          <p className="text-mono-sm uppercase tracking-wider text-graphite">SECURITY</p>
          <h1 className="text-h2 tracking-tight text-ink md:text-display">Security posture</h1>
          <p className="text-mono-sm text-graphite">Last reviewed May 2026</p>
        </header>

        <SectionDivider />

        <div className="max-w-prose">
          <p className={PARAGRAPH}>
            This page describes how Trochia is built, what we do to keep customer data
            safe, and what we are working toward. It is updated when material things
            change.
          </p>

          <h2 className={SUBHEAD}>Tenancy and isolation</h2>
          <p className={PARAGRAPH}>
            Every table in the application database carries an <span className="font-mono">account_id</span>
            and is gated by Postgres row-level security with a default-deny policy. A
            request is bound to one account; queries cannot return rows from another
            tenant. A two-tenant isolation test runs in CI on the database schema as the
            schema evolves.
          </p>

          <h2 className={SUBHEAD}>Encryption</h2>
          <p className={PARAGRAPH}>
            Data is encrypted in transit (TLS 1.2+) and at rest (the database
            provider&apos;s native at-rest encryption). Sensitive fields — secrets, API
            keys, tokens — never enter logs, error reports, or product analytics. A
            field-scrubbing pass runs before payloads leave the application.
          </p>

          <h2 className={SUBHEAD}>Authentication</h2>
          <p className={PARAGRAPH}>
            Sign-in is handled by Supabase Auth — Google SSO and magic-link email at MVP;
            multi-factor authentication lands at V2. Server-side session validation runs
            on every authenticated request; the API never trusts a client-supplied
            account identifier.
          </p>

          <h2 className={SUBHEAD}>The AI surface</h2>
          <p className={PARAGRAPH}>
            All model calls route through a single chokepoint in the application (
            <span className="font-mono">src/ai/client.ts</span>). That chokepoint enforces
            prompt caching, structured-output validation, rate limits, and the no-training
            contract with the model provider. The fallback path is config-flagged off by
            default. The chokepoint is lint-enforced — modules under the financial
            primitives (the SAFE generator and the cap-table engine) cannot import from
            it.
          </p>

          <h2 className={SUBHEAD}>External sends</h2>
          <p className={PARAGRAPH}>
            Anything Trochia sends outside the product on behalf of a founder — outreach,
            intros, signature requests — routes through an explicit founder-approval
            dialog. No autonomous send.
          </p>

          <h2 className={SUBHEAD}>Vendors</h2>
          <p className={PARAGRAPH}>
            The full sub-processor inventory — every vendor that sees customer data, its
            training posture, its retention window, and its contract status — lives in
            our internal vendor-data-flow document and is referenced from the Data
            Processing Addendum at{' '}
            <Link href="/legal/dpa" className="text-ink underline hover:text-signal">
              /legal/dpa
            </Link>
            . The headline commitment: no customer data enters a model-training pipeline.
          </p>

          <h2 className={SUBHEAD}>Data lifecycle</h2>
          <p className={PARAGRAPH}>
            Account deletion is a 30-day soft-delete window followed by permanent purge
            from primary databases. A founder can export every tenant-scoped record at
            any time as a JSON dump delivered via a private signed URL.
          </p>

          <h2 className={SUBHEAD}>Operational controls</h2>
          <p className={PARAGRAPH}>
            Production deploys go through CI: lint, type-check, unit and integration
            tests, a banned-string scan on copy, a Lighthouse perf+a11y+SEO gate on the
            homepage. Errors and traces flow to Sentry; model-call metrics flow to
            Langfuse. The on-call founder reviews production alerts daily.
          </p>

          <h2 className={SUBHEAD}>Reporting a vulnerability</h2>
          <p className={PARAGRAPH}>
            Email <span className="font-mono">security@trochia.ai</span>. Please include
            steps to reproduce, an estimate of the impact, and any artifacts. We respond
            within 72 hours and credit researchers who report in good faith.
          </p>

          <h2 className={SUBHEAD}>Roadmap</h2>
          <p className={PARAGRAPH}>
            SOC 2 Type I preparation begins at Phase 11 (public launch). EU data
            residency lands at V2 (Phase 8) alongside multi-factor authentication.
            Detailed audit logging and customer-facing access logs land alongside the
            data-room module.
          </p>
        </div>
      </div>
    </article>
  );
}
