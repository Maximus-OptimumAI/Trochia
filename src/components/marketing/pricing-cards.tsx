import Link from 'next/link';
import { Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

/**
 * PRICING_TIERS — the self-contained MARKETING-COPY tier constant.
 *
 * This is NOT a runtime call to Plan 07's `billingRouter.tiers` / `TIERS`. The
 * marketing site renders these public tier names, prices, and feature bullets;
 * Plan 07's `src/modules/billing/tiers.ts` carries the OPERATIVE
 * tier→features gate (Stripe price ids, `entitlements()` checks). The two are
 * kept in sync by Code Review — a one-line cross-reference comment lives in
 * both files. (Plan 08 ships in wave 4; Plan 07 has not run yet, so the
 * marketing site must not hard-depend on the billing module.)
 *
 * Cross-reference: when Plan 07 ships `src/modules/billing/tiers.ts`, its
 * `TIERS` constant must mirror the `id` + `priceMonthly` + `priceAnnual` here.
 * Any drift is a Code Review reject.
 */
export type PricingTierId = 'pre-raise' | 'active-raise' | 'close-mode' | 'alumni';

export interface PricingTier {
  id: PricingTierId;
  name: string;
  positioning: string;
  priceMonthly: number;
  /** When `null` the tier has no annual price (the close-stack tiers). */
  priceAnnual: number | null;
  /** A short one-line subtitle for the small teaser variant. */
  teaser: string;
  features: string[];
  featured?: boolean;
  /** When true the card does NOT show a purchase CTA — Phase 1 close-stack tiers. */
  activatesAtLaunch?: boolean;
}

export const PRICING_TIERS: PricingTier[] = [
  {
    id: 'pre-raise',
    name: 'Pre-Raise',
    positioning: 'Set up the business memory and pick the round you want to run.',
    priceMonthly: 49,
    priceAnnual: 39,
    teaser: 'Get raise-ready.',
    features: [
      'Business Memory — paste and upload your context',
      'Knowledge Pack Import (paste, ZIP, .md/.txt)',
      'Ambient Q&A grounded in your memory',
      'Investor research and matching',
      'Accelerator application tracker',
      'Pitch Lab — deck review (3 decks per month)',
      'Email and Calendar integration',
      'Founder approves every external send',
    ],
  },
  {
    id: 'active-raise',
    name: 'Active Raise',
    positioning: 'Run the full raise from one operator.',
    priceMonthly: 199,
    priceAnnual: 159,
    teaser: 'Run the full raise.',
    features: [
      'Everything in Pre-Raise',
      'Pre-call briefs from partner posts and portfolio',
      'Transcript ingestion and post-call follow-ups',
      'Pipeline kanban with auto-stage updates',
      'Pitch Lab — unlimited deck reviews',
      'Warm-intro mapper from your LinkedIn export',
      'Outreach drafter tuned to your voice',
      'Priority support during your raise',
    ],
    featured: true,
  },
  {
    id: 'close-mode',
    name: 'Close Mode',
    positioning: 'Close the round and orchestrate the data room.',
    priceMonthly: 399,
    priceAnnual: null,
    teaser: 'Close the round.',
    features: [
      'Everything in Active Raise',
      'Data Room orchestration (Google Drive)',
      'DDQ filler grounded in your memory',
      'Access analytics per investor',
      'Legal Stack vendor recommender',
      'SAFE generator from YC templates',
      'Deterministic cap-table math',
      'F&F round tracker and e-sign integration',
    ],
    activatesAtLaunch: true,
  },
  {
    id: 'alumni',
    name: 'Alumni',
    positioning: 'Keep the memory warm between rounds.',
    priceMonthly: 19,
    priceAnnual: null,
    teaser: 'Stay raise-ready.',
    features: [
      'Business Memory stays live',
      'Investor Update Generator (monthly)',
      'Ambient Q&A on your memory',
      'Pipeline archive (read-only)',
      'Light-touch market and partner watch',
      'One-click reactivation to Active Raise',
      'Quarterly raise-readiness check',
      'Founder community access',
    ],
    activatesAtLaunch: true,
  },
];

interface PricingCardsProps {
  variant: 'teaser' | 'full';
  period?: 'monthly' | 'annual';
}

export function PricingCards({ variant, period = 'monthly' }: PricingCardsProps) {
  return (
    <div
      className={cn(
        'grid grid-cols-1 gap-6',
        'md:grid-cols-2',
        'lg:grid-cols-4'
      )}
    >
      {PRICING_TIERS.map((tier) => (
        <PricingCard
          key={tier.id}
          tier={tier}
          variant={variant}
          period={period}
        />
      ))}
    </div>
  );
}

function PricingCard({
  tier,
  variant,
  period,
}: {
  tier: PricingTier;
  variant: 'teaser' | 'full';
  period: 'monthly' | 'annual';
}) {
  const price =
    tier.priceAnnual != null && period === 'annual' ? tier.priceAnnual : tier.priceMonthly;

  return (
    <Card featured={tier.featured} className={cn('h-full gap-6', tier.featured && 'lg:scale-[1.02]')}>
      {tier.featured && (
        <Badge variant="signal" className="absolute -top-3 right-6">
          Most chosen
        </Badge>
      )}

      <div className="flex flex-col gap-2">
        <h3 className="text-h3 text-ink">{tier.name}</h3>
        {tier.activatesAtLaunch && (
          <span className="text-mono-sm text-graphite">Available with the close stack</span>
        )}
        <p className="text-body-sm text-graphite">{tier.positioning}</p>
      </div>

      <div className="flex items-baseline gap-1">
        <span className="font-mono text-4xl text-ink">${price}</span>
        <span className="text-body-sm text-graphite">/month</span>
      </div>

      {variant === 'teaser' ? (
        <p className="text-body-sm text-ink">{tier.teaser}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {tier.features.map((f) => (
            <li key={f} className="flex items-start gap-2 text-body-sm text-ink">
              <Check className="mt-0.5 size-4 shrink-0 text-success" aria-hidden />
              <span>{f}</span>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-auto">
        {tier.activatesAtLaunch ? (
          <span className="block text-body-sm text-graphite">Activates at launch.</span>
        ) : (
          <Button
            // pricing CTAs are ink pills — the featured ring spends the page's
            // Signal moment (docs/design/DESIGN.md §7 Cards)
            variant="primary"
            className="w-full"
            render={<Link href="/sign-up" />}
          >
            Start your raise
          </Button>
        )}
      </div>
    </Card>
  );
}
