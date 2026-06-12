import Link from 'next/link';
import type { Metadata } from 'next';
import { Button } from '@/components/ui/button';
import { HeroMockup } from '@/components/marketing/hero-mockup';
import { HowItWorks } from '@/components/marketing/how-it-works';
import { ModulesGrid } from '@/components/marketing/modules-grid';
import { ProofCarousel } from '@/components/marketing/proof-carousel';
import { Reveal } from '@/components/marketing/reveal';
import { PricingCards } from '@/components/marketing/pricing-cards';

/**
 * Homepage `/` — the docs/design/DESIGN.md §5 page flow (Phase A):
 *
 *   1. Hero center-stack (eyebrow → display H1 → subhead → CTA row → honest
 *      trust line) over the static Signal halo (M1), followed by the
 *      browser-frame product mockup (M2 — real Trochia surface, zero video)
 *   2. How it works (4 numbered steps)            — restyled in step A6
 *   3. Modules grid (2×3)                          — restyled in step A6
 *   4. Founder voices → proof-of-work carousel     — replaced in step A7
 *   5. Pricing teaser (4 cards from `PRICING_TIERS`) — restyled in step A8
 *   6. Final CTA
 *   7. Footer (rendered by the marketing layout)
 *
 * CTA discipline: the hero's "Start your raise" Signal pill is the page's ONE
 * Signal moment (§2; nav CTA is secondary per PDR-01). Lighthouse > 90 on `/`
 * stays an exit gate.
 */
export const metadata: Metadata = {
  title: 'Trochia — the agentic operator for your raise',
  description:
    'Trochia holds your business memory, finds the right investors, drafts your outreach, and closes the round. From F&F to Series A.',
};

export default function Home() {
  return (
    <>
      {/* 1 · Hero — center-stack over the Signal halo (M1), mockup below (M2) */}
      <section className="relative overflow-hidden pt-16 pb-20 md:pt-24 md:pb-28">
        {/* M1 — the static Signal halo: one radial, ≤6% opacity, ambient (not the
            Signal moment — the CTA is). Pure CSS, no canvas, no animation. */}
        <div
          aria-hidden
          className="pointer-events-none absolute -top-48 left-1/2 h-[640px] w-[1000px] max-w-none -translate-x-1/2 rounded-full bg-radial from-signal/5 via-signal/[0.02] to-transparent to-70%"
        />

        <div className="relative mx-auto flex max-w-content flex-col items-center gap-6 px-6 text-center md:px-12">
          <p className="text-label text-graphite">THE AGENTIC OPERATOR FOR YOUR RAISE</p>
          <h1 className="max-w-4xl text-display text-ink">
            Run your raise from one operator.
          </h1>
          <p className="max-w-xl text-body text-graphite">
            Trochia holds your business memory, finds the right investors, drafts your
            outreach, and closes the round. From F&amp;F to Series A.
          </p>
          <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
            <Button variant="signal" render={<Link href="/sign-up" />}>
              Start your raise
            </Button>
            <Button variant="ghost" render={<Link href="#how-it-works" />}>
              See how it works →
            </Button>
          </div>
          {/* honest trust line (D2-B) — accelerator names TEXT-ONLY, never logos (§11) */}
          <p className="max-w-xl text-body-sm text-graphite">
            Built for founders raising at YC, Techstars, Antler and beyond.
          </p>

          <div className="mt-10 w-full max-w-3xl">
            <HeroMockup />
          </div>
        </div>
      </section>

      {/* 2 · How it works ─────────────────────────────────────────────────── */}
      <HowItWorks />

      {/* 3 · Modules grid ─────────────────────────────────────────────────── */}
      <ModulesGrid />

      {/* 4 · Proof-of-work carousel (A7 — the one sanctioned carousel, §7) ── */}
      <ProofCarousel />

      {/* 5 · Pricing teaser — paper band; ink CTAs. The featured ring spends
          this viewport's Signal moment; the deep bottom padding (with the final
          CTA's top padding) keeps the ring and the Signal final CTA out of any
          shared viewport at 1440x900 AND 1920x1080 (D1-B check). */}
      <section className="pt-20 pb-32 md:pt-32 md:pb-64">
        <Reveal className="mx-auto max-w-content px-6 md:px-12">
          <header className="mb-12 flex flex-col gap-3 md:mb-16">
            <p className="text-label text-graphite">PRICING</p>
            <h2 className="max-w-2xl text-h2 text-ink">
              Four tiers, one operator across the whole raise.
            </h2>
          </header>

          <PricingCards variant="teaser" />

          <div className="mt-12 flex justify-center">
            <Button variant="link" render={<Link href="/pricing" />}>
              See full pricing →
            </Button>
          </div>
        </Reveal>
      </section>

      {/* 6 · Final CTA — bg-card band; signal pill (D1-B: its own viewport — the
          second conversion anchor, never co-visible with the hero's) */}
      <section className="bg-card py-32 md:pt-48">
        <Reveal className="mx-auto flex max-w-3xl flex-col items-center gap-6 px-6 text-center md:px-12">
          <h2 className="text-heading-lg text-ink">Stop juggling. Start raising.</h2>
          <p className="max-w-xl text-body text-graphite">
            One operator across business memory, pitch, pipeline, live raise, and close. You
            approve every external send.
          </p>
          <div className="flex flex-wrap items-center justify-center gap-4">
            <Button variant="signal" render={<Link href="/sign-up" />}>
              Start your raise
            </Button>
          </div>
        </Reveal>
      </section>
    </>
  );
}
