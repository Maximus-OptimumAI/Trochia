import type { Metadata } from 'next';
import Link from 'next/link';
import { SectionDivider } from '@/components/primitives/section-divider';
import { DpaContent } from '@/lib/compliance/dpa-content';
import { DPA_VERSION } from '@/lib/compliance/dpa';

/**
 * `/legal/dpa` — the Data Processing Addendum page. Renders Plan 06's
 * `<DpaContent />` (the single source of the DPA text, also rendered into the
 * downloadable PDF) and links the committed `public/legal/dpa.pdf`.
 *
 * The page does NOT duplicate the DPA text — it re-uses `dpa-content.tsx` so
 * the page and the PDF can never drift. `DPA_VERSION` is shown.
 *
 * Sign-up clickwrap (Plan 07) accepts THIS document at THIS version.
 */
export const metadata: Metadata = {
  title: 'Data Processing Addendum',
  description:
    'The Data Processing Addendum that governs how Trochia processes customer data on your behalf.',
};

const SUBHEAD = 'text-h3 text-ink mt-12 mb-4';

export default function DpaPage() {
  return (
    <article className="py-20 md:py-32">
      <div className="mx-auto max-w-3xl px-6 md:px-12">
        <header className="mb-12 flex flex-col gap-4">
          <p className="text-mono-sm uppercase tracking-wider text-graphite">
            DATA PROCESSING ADDENDUM
          </p>
          <h1 className="text-h2 tracking-tight text-ink md:text-display">
            Data Processing Addendum
          </h1>
          <p className="text-mono-sm text-graphite">
            Version {DPA_VERSION} · effective May 2026
          </p>
          <div className="flex flex-wrap items-center gap-4 pt-2">
            <Link
              href="/legal/dpa.pdf"
              className="inline-flex h-11 items-center rounded-lg bg-ink px-6 text-body-sm font-medium text-paper transition-colors hover:bg-ink/90 active:scale-[0.98]"
              download
            >
              Download PDF
            </Link>
            <Link
              href="/legal/privacy"
              className="text-body-sm font-medium text-ink hover:text-signal"
            >
              See Privacy →
            </Link>
          </div>
          <p className="mt-2 text-body-sm text-graphite">
            Signing up for Trochia constitutes clickwrap acceptance of this addendum at the
            version shown.
          </p>
        </header>

        <SectionDivider />

        {/*
          DpaContent renders one <section> per DPA_SECTIONS entry from
          `src/lib/compliance/dpa-sections.ts` (Plan 06's single source). Style
          the headings/paragraphs from the outside so we don't fork the text.
        */}
        <div
          className={
            'max-w-prose ' +
            '[&_h2]:text-h3 [&_h2]:text-ink [&_h2]:mt-12 [&_h2]:mb-4 ' +
            '[&_p]:text-body [&_p]:text-ink [&_p]:leading-[1.65] [&_p]:mt-5 ' +
            '[&_section:first-child_h2]:mt-0'
          }
        >
          <DpaContent />
        </div>

        <h2 className={SUBHEAD}>Where this fits</h2>
        <p className="text-body text-ink leading-[1.65]">
          This addendum sits alongside our{' '}
          <Link href="/legal/terms" className="text-ink underline hover:text-signal">
            Terms
          </Link>{' '}
          and{' '}
          <Link href="/legal/privacy" className="text-ink underline hover:text-signal">
            Privacy
          </Link>{' '}
          documents. On data processing it controls. The sub-processor inventory it
          references is documented internally and listed by category in Section 5.
        </p>
      </div>
    </article>
  );
}
