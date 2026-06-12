'use client';

import { useState } from 'react';
import { Check, Minus } from 'lucide-react';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { PricingCards, PRICING_TIERS } from '@/components/marketing/pricing-cards';
import { FaqAccordion } from '@/components/marketing/faq-accordion';

/**
 * `/pricing` — all 4 tiers, the monthly/annual Tabs, the full feature-matrix
 * table, and the 8-question FAQ (UI-SPEC §"Route / Screen Contract").
 *
 * Tier data comes from `PRICING_TIERS` in `src/components/marketing/pricing-
 * cards.tsx` — a self-contained marketing-copy constant kept in sync with Plan
 * 07's operative `TIERS` by Code Review (NOT a runtime call to
 * billingRouter.tiers; Plan 07 ships in a later wave).
 *
 * Per UI-SPEC §"Open Questions — RESOLVED" Q4: all 4 tiers render; Close Mode
 * + Alumni carry the "Available with the close stack" badge and NO purchase
 * CTA (no live Stripe-checkout button — billing activates at Phase 11).
 */

// Page-level metadata can't live in a 'use client' file — keep this short and
// rely on the marketing layout's defaults; a sibling head.ts / generateMetadata
// can override later if needed.
const FEATURE_MATRIX: { feature: string; tiers: Record<string, true | false | string> }[] = [
  {
    feature: 'Business Memory + Knowledge Pack Import',
    tiers: { 'pre-raise': true, 'active-raise': true, 'close-mode': true, alumni: true },
  },
  {
    feature: 'Ambient Q&A grounded in your memory',
    tiers: { 'pre-raise': true, 'active-raise': true, 'close-mode': true, alumni: true },
  },
  {
    feature: 'Investor + accelerator matching',
    tiers: { 'pre-raise': true, 'active-raise': true, 'close-mode': true, alumni: false },
  },
  {
    feature: 'Pitch Lab — deck reviews',
    tiers: {
      'pre-raise': '3 / month',
      'active-raise': 'Unlimited',
      'close-mode': 'Unlimited',
      alumni: false,
    },
  },
  {
    feature: 'Pre-call briefs + post-call follow-ups',
    tiers: { 'pre-raise': false, 'active-raise': true, 'close-mode': true, alumni: false },
  },
  {
    feature: 'Pipeline kanban with auto-stage updates',
    tiers: { 'pre-raise': false, 'active-raise': true, 'close-mode': true, alumni: 'Read-only' },
  },
  {
    feature: 'Warm-intro mapper',
    tiers: { 'pre-raise': false, 'active-raise': true, 'close-mode': true, alumni: false },
  },
  {
    feature: 'Data Room orchestration (Drive)',
    tiers: { 'pre-raise': false, 'active-raise': false, 'close-mode': true, alumni: false },
  },
  {
    feature: 'SAFE generator + cap-table math',
    tiers: { 'pre-raise': false, 'active-raise': false, 'close-mode': true, alumni: false },
  },
  {
    feature: 'F&F round tracker + e-sign',
    tiers: { 'pre-raise': false, 'active-raise': false, 'close-mode': true, alumni: false },
  },
  {
    feature: 'Investor Update Generator',
    tiers: { 'pre-raise': false, 'active-raise': false, 'close-mode': false, alumni: true },
  },
  {
    feature: 'Founder approves every external send',
    tiers: { 'pre-raise': true, 'active-raise': true, 'close-mode': true, alumni: true },
  },
];

export default function PricingPage() {
  const [period, setPeriod] = useState<'monthly' | 'annual'>('monthly');

  return (
    <>
      {/* Hero ─────────────────────────────────────────────────────────────── */}
      <section className="py-20 md:py-28">
        <div className="mx-auto max-w-content px-6 md:px-12">
          <div className="flex max-w-3xl flex-col gap-4">
            {/* graphite — Signal is never a text color (DESIGN.md §4) */}
            <p className="text-label text-graphite">PRICING</p>
            <h1 className="text-h2 tracking-tight text-ink md:text-display">
              Pay for the raise you are running.
            </h1>
            <p className="max-w-xl text-body text-graphite">
              Trochia is a tool founders pay for during the raise — not a permanent
              subscription. Start at $49 to set up the memory; step up to $199 when the
              round is active.
            </p>
          </div>
        </div>
      </section>

      {/* Monthly / Annual Tabs + the 4 cards ──────────────────────────────── */}
      <section className="pb-20 md:pb-28">
        <div className="mx-auto max-w-content px-6 md:px-12">
          <Tabs
            value={period}
            onValueChange={(v: string) => setPeriod(v as 'monthly' | 'annual')}
            className="mb-10 flex flex-col items-center gap-6"
          >
            <TabsList className="bg-stone/60">
              <TabsTrigger value="monthly">Monthly</TabsTrigger>
              <TabsTrigger value="annual">Annual</TabsTrigger>
            </TabsList>
            <TabsContent value="monthly" className="w-full">
              <PricingCards variant="full" period="monthly" />
            </TabsContent>
            <TabsContent value="annual" className="w-full">
              <PricingCards variant="full" period="annual" />
            </TabsContent>
          </Tabs>
          <p className="text-center text-body-sm text-graphite">
            Close Mode and Alumni switch on at launch, alongside the close stack.
          </p>
        </div>
      </section>

      {/* Feature-matrix comparison table ──────────────────────────────────── */}
      <section className="border-t border-stone py-20 md:py-28">
        <div className="mx-auto max-w-content px-6 md:px-12">
          <header className="mb-10 flex flex-col gap-3">
            <p className="text-label text-graphite">FEATURE COMPARISON</p>
            <h2 className="text-h2 text-ink">All 4 tiers, side by side.</h2>
          </header>

          <div className="overflow-x-auto rounded-xl border border-stone">
            <table className="w-full min-w-[720px] border-collapse text-left">
              <thead>
                <tr className="border-b border-stone bg-paper">
                  <th className="px-4 py-4 text-label text-graphite" scope="col">
                    Feature
                  </th>
                  {PRICING_TIERS.map((t) => (
                    <th
                      key={t.id}
                      scope="col"
                      className="px-4 py-4 text-h4 text-ink"
                    >
                      {t.name}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {FEATURE_MATRIX.map((row, i) => (
                  <tr key={i} className="border-b border-stone last:border-0">
                    <th
                      scope="row"
                      className="px-4 py-4 text-body-sm font-medium text-ink"
                    >
                      {row.feature}
                    </th>
                    {PRICING_TIERS.map((t) => {
                      const v = row.tiers[t.id];
                      return (
                        <td key={t.id} className="px-4 py-4 text-body-sm text-ink">
                          {v === true && (
                            <Check className="size-4 text-success" aria-label="Included" />
                          )}
                          {v === false && (
                            <Minus
                              className="size-4 text-graphite"
                              aria-label="Not included"
                            />
                          )}
                          {typeof v === 'string' && (
                            <span className="font-mono text-mono-sm">{v}</span>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* FAQ ──────────────────────────────────────────────────────────────── */}
      <section className="border-t border-stone py-20 md:py-28">
        <div className="mx-auto max-w-content px-6 md:px-12">
          <header className="mb-8 flex flex-col gap-3">
            <p className="text-label text-graphite">FAQ</p>
            <h2 className="text-h2 text-ink">Questions founders ask.</h2>
          </header>

          <FaqAccordion />
        </div>
      </section>
    </>
  );
}
