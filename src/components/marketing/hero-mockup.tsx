'use client';

/**
 * HeroMockup — the hero's product simulation (docs/design/DESIGN.md motion M2,
 * replacing Dialog's autoplay MP4 with zero video bytes).
 *
 * A browser-frame card (`bg-card rounded-3xl shadow-fade`, stone dots — never
 * traffic-light colors) showing a REAL Trochia surface: the Live Raise
 * pre-call brief, drafting itself in 3 steps at 800ms/step with a 2s pause at
 * loop end (§9 timing table). Illustrative product data only — this is the
 * product's own output shape, not social proof; no real funds, no fabricated
 * testimonials or metrics.
 *
 * Progressive enhancement (§9 rails): the full brief is server-rendered
 * VISIBLE — JS starts the draft cycle only after mount, and
 * `prefers-reduced-motion` (via useReducedMotion) pins the static composed
 * end-state. With JS off or motion off, the page is complete.
 */
import { useEffect, useState } from 'react';
import { motion, useReducedMotion } from 'motion/react';

const STEP_MS = 800;
const PAUSE_MS = 2000;

const SECTIONS = [
  {
    label: 'Why this investor',
    lines: [
      'Leads pre-seed and seed in B2B workflow tools; 4 of her last 6 checks were solo-founder companies.',
      'Wrote publicly that she wants founders who own distribution before hiring sales.',
    ],
  },
  {
    label: 'Talking points',
    lines: [
      'Open with the activation metric: it matches the thesis in her latest fund letter.',
      'Your CAC math answers her standard objection on paid acquisition.',
      'Ask about her March note on vertical AI operators. It overlaps directly with your roadmap.',
    ],
  },
  {
    label: 'From your memory',
    chips: ['Deck v4 · traction slide', 'Call notes · 2 Jun', 'Pricing memo'],
  },
] as const;

export function HeroMockup() {
  const reduced = useReducedMotion();
  // Server-rendered complete (step = all sections visible); the cycle starts client-side.
  const [step, setStep] = useState<number>(SECTIONS.length);
  const animating = !reduced;

  useEffect(() => {
    if (reduced) return;
    let i: number = SECTIONS.length + 1; // first tick wraps to 0 (fade out, then redraft)
    let t: ReturnType<typeof setTimeout>;
    const tick = () => {
      i = i > SECTIONS.length ? 0 : i + 1;
      setStep(Math.min(i, SECTIONS.length));
      // hold the finished brief for PAUSE_MS, then restart the draft
      t = setTimeout(tick, i >= SECTIONS.length ? PAUSE_MS : i === 0 ? 600 : STEP_MS);
    };
    t = setTimeout(tick, 400);
    return () => clearTimeout(t);
  }, [reduced]);

  const drafting = animating && step < SECTIONS.length;

  return (
    <div
      className="overflow-hidden rounded-3xl bg-card text-left shadow-fade"
      aria-label="Product preview: a Trochia pre-call brief"
    >
      {/* browser chrome — stone dots, never traffic-light colors (§7) */}
      <div className="flex items-center gap-1.5 border-b border-stone px-5 py-3.5" aria-hidden>
        <span className="size-2.5 rounded-full bg-stone" />
        <span className="size-2.5 rounded-full bg-stone" />
        <span className="size-2.5 rounded-full bg-stone" />
        <span className="ml-3 hidden rounded-full bg-paper px-3 py-0.5 text-mono-sm text-graphite sm:block">
          Live Raise · pre-call brief
        </span>
      </div>

      <div className="flex flex-col gap-5 p-6 sm:p-8">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <p className="text-label tracking-[0.04em] text-graphite uppercase">Pre-call brief</p>
          <p className="text-mono-sm text-graphite" aria-hidden>
            {drafting ? 'drafting…' : 'brief ready'}
          </p>
        </div>

        <div className="flex flex-col gap-1">
          <p className="text-h4 font-geist text-ink">Dana Okafor, Crestline Ventures</p>
          <p className="text-body-sm text-graphite">
            Partner · pre-seed/seed B2B · Thursday 14:00 call
          </p>
        </div>

        {SECTIONS.map((section, n) => (
          <motion.div
            key={section.label}
            initial={false}
            animate={
              animating
                ? { opacity: step > n ? 1 : 0, y: step > n ? 0 : 8 }
                : { opacity: 1, y: 0 }
            }
            transition={{ duration: STEP_MS / 1000, ease: 'easeInOut' }}
            className="flex flex-col gap-2 border-t border-stone pt-4"
          >
            <p className="text-mono-sm text-graphite uppercase">{section.label}</p>
            {'lines' in section ? (
              <ul className="flex flex-col gap-1.5">
                {section.lines.map((line) => (
                  <li key={line} className="text-body-sm text-ink">
                    {line}
                  </li>
                ))}
              </ul>
            ) : (
              <div className="flex flex-wrap gap-2">
                {section.chips.map((chip) => (
                  <span
                    key={chip}
                    className="rounded-full border border-stone bg-paper px-3 py-1 text-mono-sm text-graphite"
                  >
                    {chip}
                  </span>
                ))}
              </div>
            )}
          </motion.div>
        ))}
      </div>
    </div>
  );
}
