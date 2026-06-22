'use client';

import { useState } from 'react';
import { Check } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { PRICING_TIERS, type PricingTier } from '@/components/marketing/pricing-cards';
import { cn } from '@/lib/utils';
import { logger } from '@/lib/logger';

/**
 * The onboarding tier picker (FND-05, FND-12, Plan 01-07).
 *
 * Re-uses Plan 08's `PRICING_TIERS` marketing constant for display copy (same
 * tiers, same prices). When the founder picks an active tier we POST to a
 * server action that calls `billing.createCheckout` → Stripe → redirect. The
 * close-stack tiers carry a "Available with the close stack" badge and no CTA.
 */
export function TierPicker() {
  const [period, setPeriod] = useState<'monthly' | 'annual'>('monthly');
  const [loadingTierId, setLoadingTierId] = useState<string | null>(null);

  async function pickTier(tier: PricingTier) {
    if (tier.activatesAtLaunch || tier.id === 'close-mode' || tier.id === 'alumni') return;
    const tierEnum = tier.id === 'pre-raise' ? 'pre_raise' : 'active_raise';
    setLoadingTierId(tier.id);
    try {
      const res = await fetch('/api/billing/checkout', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ tier: tierEnum, period }),
      });
      const json = (await res.json()) as { url?: string; error?: string };
      if (json.url) {
        window.location.assign(json.url);
        return;
      }
      logger.warn('tier-picker: checkout failed', { err: json.error });
    } catch (err) {
      logger.warn('tier-picker: checkout threw', { err });
    } finally {
      setLoadingTierId(null);
    }
  }

  return (
    <main className="mx-auto flex max-w-content flex-col items-center gap-10 px-6 py-16 md:py-24">
      <header className="flex max-w-2xl flex-col items-center gap-3 text-center">
        <h1 className="text-h2 text-ink">Pick the plan for your raise.</h1>
        <p className="text-body text-graphite">
          Start with a 7-day trial. Card on file, cancel anytime. No permanent free tier.
        </p>
      </header>

      <Tabs
        value={period}
        onValueChange={(v) => setPeriod(v as 'monthly' | 'annual')}
        className="w-fit"
      >
        <TabsList>
          <TabsTrigger value="monthly">Monthly</TabsTrigger>
          <TabsTrigger value="annual">Annual</TabsTrigger>
        </TabsList>
      </Tabs>

      <div className="grid w-full grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-4">
        {PRICING_TIERS.map((tier) => {
          const isActive = !tier.activatesAtLaunch;
          const price =
            tier.priceAnnual != null && period === 'annual' ? tier.priceAnnual : tier.priceMonthly;
          const isLoading = loadingTierId === tier.id;
          return (
            <Card
              key={tier.id}
              featured={tier.featured}
              className={cn('h-full gap-6', tier.featured && 'lg:scale-[1.02]')}
            >
              {tier.featured && (
                <Badge variant="signal" className="absolute -top-3 right-6">
                  Most chosen
                </Badge>
              )}
              <div className="flex flex-col gap-2">
                <h3 className="text-h3 text-ink">{tier.name}</h3>
                {tier.activatesAtLaunch && (
                  <span className="text-mono-sm text-graphite">
                    Available with the close stack
                  </span>
                )}
                <p className="text-body-sm text-graphite">{tier.positioning}</p>
              </div>
              <div className="flex items-baseline gap-1">
                <span className="font-mono text-4xl text-ink">${price}</span>
                <span className="text-body-sm text-graphite">/month</span>
              </div>
              <ul className="flex flex-col gap-2">
                {tier.features.slice(0, 4).map((f) => (
                  <li key={f} className="flex items-start gap-2 text-body-sm text-ink">
                    <Check className="mt-0.5 size-4 shrink-0 text-success" aria-hidden />
                    <span>{f}</span>
                  </li>
                ))}
              </ul>
              <div className="mt-auto">
                {isActive ? (
                  <Button
                    variant={tier.featured ? 'signal' : 'primary'}
                    className="w-full"
                    onClick={() => pickTier(tier)}
                    disabled={isLoading}
                  >
                    {isLoading ? 'Connecting…' : 'Start 7-day trial'}
                  </Button>
                ) : (
                  <span className="block text-body-sm text-graphite">
                    Activates at launch.
                  </span>
                )}
              </div>
            </Card>
          );
        })}
      </div>
    </main>
  );
}
