import Link from 'next/link';
import { Reveal } from '@/components/marketing/reveal';

/**
 * ModulesGrid — "What Trochia operates", restyled to the §5 canonical 2-col
 * band (docs/design/DESIGN.md v1.1, Phase A step A6): Paper band; text stack
 * one side | app-shell product panel the other (real surface: the actual
 * module sidebar + a dashboard pane with real-shaped data). The 6 module
 * descriptions (copy unchanged) follow as a compact text grid under a stone
 * hairline — dividers are punctuation within the band (§5).
 *
 * Phase 1 per-module marketing pages don't exist yet — links point at
 * `/pricing` until the deep-link marketing pages ship.
 */
const MODULES: { name: string; body: string; href: string }[] = [
  {
    name: 'Business Memory',
    body: 'The shared spine. Trochia ingests your existing AI context (paste or upload) and builds a normalized memory every other module reads from.',
    href: '/pricing',
  },
  {
    name: 'Pitch Lab',
    body: 'Drop your deck. Trochia returns slide-level issues (factual gaps, vague language, missing context) with suggested rewrites you can accept or reject.',
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
    body: 'Vertical-aware checklists, Drive-orchestrated folders, per-investor share links, and access analytics. Trochia stores metadata, never your files.',
    href: '/pricing',
  },
  {
    name: 'Raise Ops',
    body: 'SAFE generation from YC-standard templates, deterministic cap-table math, and a F&F round tracker. Math is unit-tested, never inferred by a model.',
    href: '/pricing',
  },
];

/** App-shell product panel — mirrors the real app sidebar + dashboard shape. */
function AppShellPanel() {
  const active = 'Business Memory';
  return (
    <div className="overflow-hidden rounded-3xl bg-card shadow-card">
      <div className="flex items-center gap-1.5 border-b border-stone px-5 py-3" aria-hidden>
        <span className="size-2.5 rounded-full bg-stone" />
        <span className="size-2.5 rounded-full bg-stone" />
        <span className="size-2.5 rounded-full bg-stone" />
      </div>
      <div className="flex">
        <div className="hidden w-44 shrink-0 flex-col gap-1 border-r border-stone p-3 sm:flex">
          {MODULES.map((m) => (
            <span
              key={m.name}
              className={
                m.name === active
                  ? 'rounded-xl bg-stone px-3 py-1.5 text-body-sm font-medium text-ink'
                  : 'px-3 py-1.5 text-body-sm text-graphite'
              }
            >
              {m.name}
            </span>
          ))}
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-3 p-5">
          <p className="text-mono-sm text-graphite uppercase">Memory · 28 confirmed facts</p>
          {[
            ['Positioning', 'Agentic operator for the raise'],
            ['Round', '$750K pre-seed, $6M cap'],
            ['Traction', '212 weekly actives, 9% w/w'],
            ['Team', 'Solo technical founder'],
          ].map(([k, v]) => (
            <div
              key={k}
              className="flex items-baseline justify-between gap-3 border-b border-stone pb-2"
            >
              <span className="text-mono-sm shrink-0 text-graphite">{k}</span>
              <span className="truncate text-body-sm text-ink">{v}</span>
            </div>
          ))}
          <p className="text-body-sm text-graphite">Every module reads from this spine.</p>
        </div>
      </div>
    </div>
  );
}

export function ModulesGrid() {
  return (
    <section id="modules" className="py-20 md:py-32">
      <div className="mx-auto max-w-content px-6 md:px-12">
        <Reveal className="grid grid-cols-1 items-center gap-8 lg:grid-cols-2 lg:gap-16">
          <div className="flex flex-col gap-4">
            <p className="w-fit rounded-full border border-stone bg-card px-3 py-1 text-label text-graphite">
              WHAT TROCHIA OPERATES
            </p>
            <h2 className="text-heading-lg text-ink">Six modules. One memory.</h2>
            <p className="max-w-prose text-body text-graphite">
              Everything reads from the same Business Memory: the deck reviewer, the
              investor matcher, the call briefs, the cap table. Confirm a fact once and
              every module knows it.
            </p>
          </div>
          <AppShellPanel />
        </Reveal>

        <Reveal>
          <ul className="mt-16 grid grid-cols-1 gap-x-12 gap-y-10 border-t border-stone pt-12 md:grid-cols-2 lg:grid-cols-3">
            {MODULES.map((m) => (
              <li key={m.name} className="flex flex-col gap-2">
                <h3 className="text-h4 font-geist text-ink">{m.name}</h3>
                <p className="text-body-sm text-graphite">{m.body}</p>
                <Link
                  href={m.href}
                  className="mt-auto w-fit text-body-sm font-medium text-ink transition-colors hover:text-signal"
                >
                  See how →
                </Link>
              </li>
            ))}
          </ul>
        </Reveal>
      </div>
    </section>
  );
}
