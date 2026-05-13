import Link from 'next/link';
import { Card } from '@/components/ui/card';
import { Logo } from '@/components/brand/logo';

/**
 * ModulesGrid — the "What Trochia operates" 2×3 module grid (UI-SPEC §"Route /
 * Screen Contract" homepage section 4). Each card carries:
 *   - the Ink mark (small, top-left)
 *   - an H3 module name
 *   - a 2–3 sentence body in operator voice
 *   - a "See how →" link
 *
 * Phase 1 per-module marketing pages don't exist yet — the links point at
 * `/pricing` (where the tier-to-module mapping is visible) until the deep-link
 * marketing pages ship.
 */
const MODULES: { name: string; body: string; href: string }[] = [
  {
    name: 'Business Memory',
    body: 'The shared spine. Trochia ingests your existing AI context — paste or upload — and builds a normalized memory every other module reads from.',
    href: '/pricing',
  },
  {
    name: 'Pitch Lab',
    body: 'Drop your deck. Trochia returns slide-level issues — factual gaps, vague language, missing context — with suggested rewrites you can accept or reject.',
    href: '/pricing',
  },
  {
    name: 'Investor Pipeline',
    body: 'A ranked list of VCs and accelerators matched to your sector, stage, and check size. Drafts the outreach and tracks the pipeline. You approve every send.',
    href: '/pricing',
  },
  {
    name: 'Live Raise',
    body: 'Pre-call briefs from the partner’s recent posts and portfolio. Post-call follow-ups grounded in the transcript. Calendars and stages update as you move.',
    href: '/pricing',
  },
  {
    name: 'Data Room',
    body: 'Vertical-aware checklists, Drive-orchestrated folders, per-investor share links, and access analytics — Trochia stores metadata, never your files.',
    href: '/pricing',
  },
  {
    name: 'Raise Ops',
    body: 'SAFE generation from YC-standard templates, deterministic cap-table math, and a F&F round tracker. Math is unit-tested, never inferred by a model.',
    href: '/pricing',
  },
];

export function ModulesGrid() {
  return (
    <section id="modules" className="border-t border-stone py-20 md:py-32">
      <div className="mx-auto max-w-content px-6 md:px-12">
        <header className="mb-12 flex flex-col gap-3 md:mb-16">
          <p className="text-label text-graphite">WHAT TROCHIA OPERATES</p>
          <h2 className="max-w-2xl text-h2 text-ink">Six modules. One memory.</h2>
        </header>

        <ul className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
          {MODULES.map((m) => (
            <li key={m.name}>
              <Card className="h-full" interactive>
                <Logo variant="mark" href={null} height={20} />
                <h3 className="text-h3 text-ink">{m.name}</h3>
                <p className="text-body-sm text-graphite">{m.body}</p>
                <Link
                  href={m.href}
                  className="mt-auto text-body-sm font-medium text-ink transition-colors hover:text-signal"
                >
                  See how →
                </Link>
              </Card>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
