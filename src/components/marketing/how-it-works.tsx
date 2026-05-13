import { Card } from '@/components/ui/card';

/**
 * HowItWorks — 4 numbered horizontal step cards (UI-SPEC §"Route / Screen
 * Contract" homepage section 3). Each card carries:
 *   - the step number (01–04) in `text-mono text-signal`
 *   - an H3 title
 *   - a 2-sentence body in operator voice
 *
 * Arrow connectors render between cards on desktop. Trochia drafts/matches/
 * tracks — it never feels/loves/wants/helps.
 */
const STEPS: { num: string; title: string; body: string }[] = [
  {
    num: '01',
    title: 'Drop your context',
    body: 'Paste your existing AI context — ChatGPT instructions, Claude project notes, a Notion brief. Trochia builds your Business Memory from it.',
  },
  {
    num: '02',
    title: 'Trochia matches investors',
    body: 'A ranked list of VCs and accelerators scored against your sector, stage, and check size. One-line rationale per match. You decide who is in.',
  },
  {
    num: '03',
    title: 'Run your pitches',
    body: 'Pre-call briefs from the partner’s recent posts and portfolio, post-call follow-ups grounded in the transcript. You approve every send.',
  },
  {
    num: '04',
    title: 'Close',
    body: 'Generate SAFEs from your template, track signatures, and watch the cap table update. The round closes through one operator.',
  },
];

export function HowItWorks() {
  return (
    <section id="how-it-works" className="border-t border-stone py-20 md:py-32">
      <div className="mx-auto max-w-content px-6 md:px-12">
        <header className="mb-12 flex flex-col gap-3 md:mb-16">
          <p className="text-label text-graphite">HOW IT WORKS</p>
          <h2 className="max-w-2xl text-h2 text-ink">Four steps, one operator.</h2>
        </header>

        <ol
          className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-4"
          aria-label="How Trochia works"
        >
          {STEPS.map((step, i) => (
            <li key={step.num} className="relative">
              <Card className="h-full">
                <span className="text-mono text-signal">{step.num}</span>
                <h3 className="text-h3 text-ink">{step.title}</h3>
                <p className="text-body-sm text-graphite">{step.body}</p>
              </Card>
              {i < STEPS.length - 1 && (
                <span
                  aria-hidden
                  className="hidden lg:absolute lg:top-1/2 lg:-right-4 lg:block lg:-translate-y-1/2 lg:text-graphite"
                >
                  →
                </span>
              )}
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
