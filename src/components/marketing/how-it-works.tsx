import { cn } from '@/lib/utils';
import { Reveal } from '@/components/marketing/reveal';

/**
 * HowItWorks — the §5 canonical feature pattern (docs/design/DESIGN.md v1.1):
 * a bg-card band holding 4 alternating 2-col rows — text side (mono step
 * number + heading + operator-voice body) | product-surface panel on the
 * other side, sides alternating per row. Panels show REAL Trochia surfaces
 * with real-shaped data (§7 mockup rules — no lorem, no fabricated proof).
 *
 * Surface inversion: inside a white band, panels sit on bg-paper with a stone
 * border (a white card on a white band has no edge; the two-tone system
 * inverts). Step numbers are graphite — Signal is never text (§4). Each row
 * fade-up reveals once on intersection (M4).
 */
type Panel = {
  title: string;
  rows: { primary: string; secondary: string; meta: string }[];
  footer: string;
};

const STEPS: { num: string; title: string; body: string; panel: Panel }[] = [
  {
    num: '01',
    title: 'Drop your context',
    body: 'Paste your existing AI context — ChatGPT instructions, Claude project notes, a Notion brief. Trochia builds your Business Memory from it.',
    panel: {
      title: 'Business Memory — confirm what Trochia read',
      rows: [
        { primary: 'Stage', secondary: 'Pre-seed, raising $750K', meta: 'confirmed' },
        { primary: 'Traction', secondary: '212 weekly actives, 9% w/w', meta: 'confirmed' },
        { primary: 'Round target', secondary: '$750K on a $6M cap', meta: 'review' },
      ],
      footer: 'You confirm every fact before it enters memory.',
    },
  },
  {
    num: '02',
    title: 'Trochia matches investors',
    body: 'A ranked list of VCs and accelerators scored against your sector, stage, and check size. One-line rationale per match. You decide who is in.',
    panel: {
      title: 'Investor Pipeline — top matches',
      rows: [
        { primary: 'Crestline Ventures', secondary: 'Leads pre-seed B2B; 3 portfolio adjacents', meta: '0.91' },
        { primary: 'Harbor Field Capital', secondary: 'Writes $100–250K first checks at your stage', meta: '0.87' },
        { primary: 'Northbeam Angels', secondary: 'Operator syndicate, workflow-tools thesis', meta: '0.82' },
      ],
      footer: 'Ranked against your memory.',
    },
  },
  {
    num: '03',
    title: 'Run your pitches',
    body: 'Pre-call briefs from the partner’s recent posts and portfolio, post-call follow-ups grounded in the transcript. You approve every send.',
    panel: {
      title: 'Live Raise — follow-up draft',
      rows: [
        { primary: 'To: Dana Okafor', secondary: 'Re: Thursday — the trailer-axle question', meta: 'draft' },
        { primary: 'Attached', secondary: 'Cohort table the call asked for', meta: 'draft' },
        { primary: 'Grounded in', secondary: 'Call transcript · Deck v4', meta: 'cited' },
      ],
      footer: 'Awaiting your approval — Trochia never sends on its own.',
    },
  },
  {
    num: '04',
    title: 'Close',
    body: 'Generate SAFEs from your template, track signatures, and watch the cap table update. The round closes through one operator.',
    panel: {
      title: 'Raise Ops — cap table',
      rows: [
        { primary: 'Founders', secondary: 'Common', meta: '83.4%' },
        { primary: 'SAFE round', secondary: '$750K post-money', meta: '11.1%' },
        { primary: 'Option pool', secondary: 'Reserved', meta: '5.5%' },
      ],
      footer: 'Deterministic math — unit-tested, never inferred by a model.',
    },
  },
];

function SurfacePanel({ panel }: { panel: Panel }) {
  return (
    <div className="rounded-3xl border border-stone bg-paper p-6">
      <p className="text-mono-sm text-graphite uppercase">{panel.title}</p>
      <ul className="mt-4 flex flex-col">
        {panel.rows.map((row) => (
          <li
            key={row.primary}
            className="flex items-baseline justify-between gap-4 border-t border-stone py-3 first:border-t-0"
          >
            <span className="flex min-w-0 flex-col">
              <span className="text-body-sm font-medium text-ink">{row.primary}</span>
              <span className="truncate text-body-sm text-graphite">{row.secondary}</span>
            </span>
            <span className="text-mono-sm shrink-0 text-graphite">{row.meta}</span>
          </li>
        ))}
      </ul>
      <p className="mt-3 border-t border-stone pt-3 text-body-sm text-graphite">
        {panel.footer}
      </p>
    </div>
  );
}

export function HowItWorks() {
  return (
    <section id="how-it-works" className="bg-card py-20 md:py-32">
      <div className="mx-auto max-w-content px-6 md:px-12">
        <header className="mb-14 flex flex-col items-center gap-3 text-center md:mb-20">
          <p className="rounded-full border border-stone bg-paper px-3 py-1 text-label text-graphite">
            HOW IT WORKS
          </p>
          <h2 className="max-w-2xl text-heading-lg text-ink">Four steps, one operator.</h2>
        </header>

        <ol className="flex flex-col gap-16 md:gap-24" aria-label="How Trochia works">
          {STEPS.map((step, i) => (
            <li key={step.num}>
              <Reveal
                className={cn(
                  'grid grid-cols-1 items-center gap-8 lg:grid-cols-2 lg:gap-16'
                )}
              >
                <div
                  className={cn(
                    'flex flex-col gap-4',
                    i % 2 === 1 && 'lg:order-2' // alternate sides per row
                  )}
                >
                  <span className="text-mono text-graphite">{step.num}</span>
                  <h3 className="text-heading text-ink">{step.title}</h3>
                  <p className="max-w-prose text-body text-graphite">{step.body}</p>
                </div>
                <div className={cn(i % 2 === 1 && 'lg:order-1')}>
                  <SurfacePanel panel={step.panel} />
                </div>
              </Reveal>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
