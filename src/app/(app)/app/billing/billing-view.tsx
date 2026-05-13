'use client';

import { useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { DestructiveConfirmDialog } from '@/components/primitives/destructive-confirm-dialog';
import { useTRPC } from '@/lib/trpc-client';
import { useMutation } from '@tanstack/react-query';
import { logger } from '@/lib/logger';

/**
 * Billing client view (Plan 01-09 / FND-05).
 *
 * Renders two Cards:
 *   1. Current plan — tier display name + status + trial/period-end + the
 *      "Manage billing" Button → billing.openPortal → Stripe Customer Portal.
 *   2. Cancel subscription — Cancel button opens DestructiveConfirmDialog
 *      with dismissKeepNoun="Keep subscription" (NEVER a bare "Cancel"); on
 *      confirm, redirect to the Stripe Customer Portal (the Portal handles the
 *      actual cancellation — UI-SPEC D-02c: "the in-app trigger still shows
 *      the destructive Dialog before the redirect").
 *
 * If the founder has no Stripe customer yet (e.g. they signed up but never
 * hit Checkout — should be impossible past the proxy gate, but defensive),
 * fall back to "Pick a plan" → /onboarding.
 */
export function BillingView({
  tierName,
  status,
  periodEnd,
  hasCustomer,
}: {
  tierName: string | null;
  status: string;
  periodEnd: string | null;
  hasCustomer: boolean;
}) {
  const trpc = useTRPC();
  const [cancelOpen, setCancelOpen] = useState(false);

  const openPortal = useMutation(
    trpc.billing.openPortal.mutationOptions({
      onSuccess: ({ url }) => {
        // Hard-redirect: the portal is a Stripe-hosted page.
        window.location.assign(url);
      },
      onError: (err) => {
        logger.warn('billing: openPortal failed', { err });
        toast.error("Couldn't open the billing portal. Try again, or contact support.");
      },
    }),
  );

  const trialOrRenewLabel =
    status === 'trialing' && periodEnd
      ? `Trial ends ${periodEnd}`
      : status === 'active' && periodEnd
        ? `Renews ${periodEnd}`
        : status === 'past_due'
          ? 'Payment past due'
          : status === 'canceled'
            ? 'Cancelled'
            : 'No active subscription';

  return (
    <div className="flex max-w-2xl flex-col gap-8">
      <Card>
        <h2 className="text-h3 font-geist text-ink">Current plan</h2>
        <div className="flex flex-col gap-2">
          <p className="text-body text-ink">
            {tierName ?? 'No active plan'}
            <span className="ml-2 text-body-sm text-graphite">· {trialOrRenewLabel}</span>
          </p>
          {hasCustomer && status === 'trialing' && (
            <p className="text-body-sm text-graphite">Card on file</p>
          )}
        </div>
        <div className="flex flex-wrap gap-3">
          {hasCustomer ? (
            <Button
              variant="primary"
              onClick={() => openPortal.mutate()}
              disabled={openPortal.isPending}
            >
              {openPortal.isPending ? 'Opening…' : 'Manage billing'}
            </Button>
          ) : (
            <Button variant="primary" render={<Link href="/onboarding" />}>
              Pick a plan
            </Button>
          )}
        </div>
      </Card>

      {hasCustomer && status !== 'canceled' && (
        <Card>
          <h2 className="text-h3 font-geist text-ink">Cancel subscription</h2>
          <p className="text-body-sm text-graphite">
            You&apos;ll keep access until the end of your billing period.
          </p>
          <div className="flex">
            <Button variant="destructive" onClick={() => setCancelOpen(true)}>
              Cancel subscription
            </Button>
          </div>
        </Card>
      )}

      <DestructiveConfirmDialog
        open={cancelOpen}
        onOpenChange={setCancelOpen}
        title="Cancel your subscription?"
        body="You'll keep access until the end of your billing period."
        confirmVerbNoun="Cancel subscription"
        dismissKeepNoun="Keep subscription"
        onConfirm={() => {
          setCancelOpen(false);
          // Per UI-SPEC D-02c: redirect to the Stripe Customer Portal — the
          // Portal handles the actual cancellation. The in-app trigger still
          // gates on this destructive Dialog before the redirect.
          openPortal.mutate();
        }}
        onDismiss={() => setCancelOpen(false)}
      />
    </div>
  );
}
