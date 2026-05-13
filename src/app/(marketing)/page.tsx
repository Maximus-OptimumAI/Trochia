import Link from 'next/link';
import type { Metadata } from 'next';
import { Button } from '@/components/ui/button';
import { HeroTimeline } from '@/components/marketing/hero-timeline';
import { HowItWorks } from '@/components/marketing/how-it-works';
import { ModulesGrid } from '@/components/marketing/modules-grid';
import { FounderVoices } from '@/components/marketing/founder-voices';
import { PricingCards } from '@/components/marketing/pricing-cards';

/**
 * Homepage `/` — the 8-section marketing layout from UI-SPEC §"Route / Screen
 * Contract" (FND-01):
 *
 *   1. Hero (left-aligned — centered hero text is a banned anti-pattern) +
 *      the animated raise timeline (the SOLE live element; reduced-motion-aware)
 *   2. Trust strip (honest placeholder copy — "Trusted by" + fake logos is banned)
 *   3. How it works (4 numbered steps)
 *   4. Modules grid (2×3)
 *   5. Founder voices (placeholder until design partners exist)
 *   6. Pricing teaser (4 cards from `PRICING_TIERS`)
 *   7. Final CTA
 *   8. Footer (rendered by the marketing layout)
 *
 * Lighthouse > 90 (perf / a11y / best-practices / SEO) on `/` is a Phase-1
 * exit gate; Plan 08 flips the `lhci` CI step from soft-fail to required.
 */
export const metadata: Metadata = {
  title: 'Trochia — the agentic operator for your raise',
  description:
    'Trochia holds your business memory, finds the right investors, drafts your outreach, and closes the round. From F&F to Series A.',
};

export default function Home() {
  return (
    <>
      {/* 1 · Hero ─────────────────────────────────────────────────────────── */}
      <section className="py-20 md:py-32">
        <div className="mx-auto max-w-content px-6 md:px-12">
          <div className="grid grid-cols-1 items-center gap-12 lg:grid-cols-[1.2fr_1fr]">
            <div className="flex flex-col gap-6">
              <p className="text-label text-signal">THE AGENTIC OPERATOR FOR YOUR RAISE</p>
              <h1 className="max-w-3xl text-display tracking-tight text-ink">
                Run your raise from one operator.
              </h1>
              <p className="max-w-xl text-body text-graphite">
                Trochia holds your business memory, finds the right investors, drafts your
                outreach, and closes the round. From F&amp;F to Series A.
              </p>
              <div className="flex flex-wrap items-center gap-4 pt-2">
                <Button variant="primary" render={<Link href="/sign-up" />}>
                  Start your raise
                </Button>
                <Button variant="link" render={<Link href="#how-it-works" />}>
                  See how it works →
                </Button>
              </div>
            </div>
            <div className="flex flex-col gap-3">
              <p className="text-mono-sm text-graphite">YOUR RAISE, END TO END</p>
              <HeroTimeline />
            </div>
          </div>
        </div>
      </section>

      {/* 2 · Trust strip (honest placeholder — no "Trusted by" + fake logos) */}
      <section className="border-t border-stone py-10">
        <div className="mx-auto max-w-content px-6 md:px-12">
          <p className="text-center text-body-sm text-graphite">
            Built for founders raising at YC, Techstars, Antler and the rest — accelerator
            partnerships in progress.
          </p>
        </div>
      </section>

      {/* 3 · How it works ─────────────────────────────────────────────────── */}
      <HowItWorks />

      {/* 4 · Modules grid ─────────────────────────────────────────────────── */}
      <ModulesGrid />

      {/* 5 · Founder voices (placeholder) ─────────────────────────────────── */}
      <FounderVoices />

      {/* 6 · Pricing teaser ───────────────────────────────────────────────── */}
      <section className="border-t border-stone py-20 md:py-32">
        <div className="mx-auto max-w-content px-6 md:px-12">
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
        </div>
      </section>

      {/* 7 · Final CTA ────────────────────────────────────────────────────── */}
      <section className="border-t border-stone py-32">
        <div className="mx-auto flex max-w-3xl flex-col items-center gap-6 px-6 text-center md:px-12">
          <h2 className="text-h2 text-ink">Stop juggling. Start raising.</h2>
          <p className="max-w-xl text-body text-graphite">
            One operator across business memory, pitch, pipeline, live raise, and close. You
            approve every external send.
          </p>
          <div className="flex flex-wrap items-center justify-center gap-4">
            <Button variant="primary" render={<Link href="/sign-up" />}>
              Start your raise
            </Button>
          </div>
        </div>
      </section>
    </>
  );
}
