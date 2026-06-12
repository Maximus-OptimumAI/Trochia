'use client';

import { useEffect, useRef } from 'react';
import Link from 'next/link';
import { Reveal } from '@/components/marketing/reveal';

/**
 * ProofCarousel — the ONE sanctioned carousel (docs/design/DESIGN.md §7,
 * C9/C14): social-proof section only, built from what Trochia ACTUALLY has —
 * real product-surface cards, the manifesto pull-quote (verbatim from
 * /manifesto), and an honest status line. No fabricated testimonials, logos,
 * or metrics; real founder quotes swap in post-design-partner.
 *
 * Mechanics per §7: native scroll-snap `ul` (scroll + drag + keyboard), ~3
 * cards visible with partial peek at desktop. Optional auto-drift ≥60s for a
 * full traversal, rAF-driven, pausing on hover / focus-within / touch, and
 * DISABLED under `prefers-reduced-motion` (manual scroll remains — the list
 * is fully usable without JS). White band → cards invert to bg-paper +
 * stone border (two-tone inversion, same rule as HowItWorks panels).
 */
const DRIFT_FULL_TRAVERSAL_MS = 60_000;

function DriftScroller({ children }: { children: React.ReactNode }) {
  const ref = useRef<HTMLUListElement>(null);
  const paused = useRef(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    let raf = 0;
    let last = performance.now();
    const step = (now: number) => {
      const dt = now - last;
      last = now;
      const max = el.scrollWidth - el.clientWidth;
      if (!paused.current && max > 0 && el.scrollLeft < max) {
        el.scrollLeft += (max / DRIFT_FULL_TRAVERSAL_MS) * dt;
      }
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);

    const pause = () => (paused.current = true);
    const resume = () => (paused.current = false);
    el.addEventListener('pointerenter', pause);
    el.addEventListener('pointerleave', resume);
    el.addEventListener('pointerdown', pause);
    el.addEventListener('focusin', pause);
    el.addEventListener('focusout', resume);
    return () => {
      cancelAnimationFrame(raf);
      el.removeEventListener('pointerenter', pause);
      el.removeEventListener('pointerleave', resume);
      el.removeEventListener('pointerdown', pause);
      el.removeEventListener('focusin', pause);
      el.removeEventListener('focusout', resume);
    };
  }, []);

  return (
    <ul
      ref={ref}
      tabIndex={0}
      aria-label="Proof of work — Trochia product surfaces"
      className="-mx-6 flex snap-x snap-mandatory gap-6 overflow-x-auto px-6 pb-4 outline-none focus-visible:ring-2 focus-visible:ring-ink/40 md:-mx-12 md:px-12"
    >
      {children}
    </ul>
  );
}

function ProofCard({ children }: { children: React.ReactNode }) {
  return (
    <li className="flex w-[85%] shrink-0 snap-start flex-col gap-4 rounded-3xl border border-stone bg-paper p-6 sm:w-[46%] lg:w-[31%]">
      {children}
    </li>
  );
}

export function ProofCarousel() {
  return (
    <section className="bg-card py-20 md:py-32">
      <div className="mx-auto max-w-content px-6 md:px-12">
        <Reveal>
          <header className="mb-12 flex flex-col items-center gap-3 text-center">
            <p className="rounded-full border border-stone bg-paper px-3 py-1 text-label text-graphite">
              PROOF OF WORK
            </p>
            <h2 className="max-w-2xl text-heading-lg text-ink">
              What the operator produces.
            </h2>
          </header>

          <DriftScroller>
            {/* 1 — real surface: memory Q&A (live in the product today) */}
            <ProofCard>
              <p className="text-mono-sm text-graphite uppercase">Business Memory — ask</p>
              <p className="text-body font-medium text-ink">
                &ldquo;What did we tell investors about churn?&rdquo;
              </p>
              <p className="text-body-sm text-graphite">
                Logo churn is 2 customers in 6 months, both pre-onboarding-revamp. Gross
                revenue churn is 1.8% monthly — cited from your confirmed memory, with
                sources attached.
              </p>
              <div className="mt-auto flex flex-wrap gap-2">
                {['Memory — churn', 'Update — 28 May'].map((chip) => (
                  <span
                    key={chip}
                    className="rounded-full border border-stone bg-card px-3 py-1 text-mono-sm text-graphite"
                  >
                    {chip}
                  </span>
                ))}
              </div>
            </ProofCard>

            {/* 2 — real surface: deck review finding (Pitch Lab output shape) */}
            <ProofCard>
              <p className="text-mono-sm text-graphite uppercase">Pitch Lab — slide 7</p>
              <p className="text-body font-medium text-ink">
                &ldquo;Huge market&rdquo; is doing no work on this slide.
              </p>
              <p className="text-body-sm text-graphite">
                Flagged: vague sizing language, no bottom-up number. Suggested rewrite
                anchors the TAM to your 212 weekly actives and the per-seat price you
                already charge. Accept or reject — slide by slide.
              </p>
              <p className="text-mono-sm mt-auto text-graphite">finding 3 of 11 · deck v4</p>
            </ProofCard>

            {/* 3 — manifesto pull-quote (verbatim from /manifesto) */}
            <ProofCard>
              <p className="text-mono-sm text-graphite uppercase">From the manifesto</p>
              <blockquote className="border-l-2 border-ink pl-4 text-h4 font-geist text-ink">
                Trochia drafts. Matches. Briefs. Scores. Tracks. It does not pitch. It does
                not speak in calls. It does not send autonomously.
              </blockquote>
              <Link
                href="/manifesto"
                className="mt-auto w-fit text-body-sm font-medium text-ink transition-colors hover:text-signal"
              >
                Read the manifesto →
              </Link>
            </ProofCard>

            {/* 4 — honest status line (literally true; founder copy sign-off) */}
            <ProofCard>
              <p className="text-mono-sm text-graphite uppercase">Where the build stands</p>
              <p className="text-body font-medium text-ink">Built in public, in order.</p>
              <p className="text-body-sm text-graphite">
                Business Memory and its Q&amp;A layer are live today. Pitch Lab is in
                build. 25 design-partner seats open at the Live Raise milestone — founder
                quotes will appear here when they are real, not before.
              </p>
              <p className="text-mono-sm mt-auto text-graphite">updated June 2026</p>
            </ProofCard>
          </DriftScroller>
        </Reveal>
      </div>
    </section>
  );
}
