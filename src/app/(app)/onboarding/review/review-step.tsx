'use client';

import { useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';

import { OnboardingStepper } from '@/components/onboarding/stepper';
import { SkeletonBlock } from '@/components/primitives/skeleton-block';
import { useTRPC } from '@/lib/trpc-client';
import { useMutation } from '@tanstack/react-query';
import { track } from '@/lib/analytics';
import { logger } from '@/lib/logger';

/**
 * Auto-review client step. Fires `review_step_viewed` on mount. After a short
 * beat (~1.2s — enough to register the skeleton as intentional state, not a
 * loading flicker), calls `onboarding.markStepComplete({ step: 'review' })`
 * which sets `accounts.onboarding_completed_at` and clears
 * `accounts.onboarding_step`, then routes to `/app`.
 *
 * Per UI-SPEC §Anti-Patterns: NO spinner. The progress affordance is
 * `SkeletonBlock`s laid out to match the future deck-review result page (so
 * the transition to the real Phase-3 result will feel continuous, not jarring).
 */
const AUTO_ADVANCE_MS = 1200;

export function ReviewStep() {
  const router = useRouter();
  const trpc = useTRPC();
  const started = useRef(false);

  const markComplete = useMutation(
    trpc.onboarding.markStepComplete.mutationOptions({
      onSuccess: () => {
        router.push('/app');
      },
      onError: (err) => {
        logger.warn('onboarding.review: markStepComplete failed', { err });
        // Fail-soft: still send them to /app — onboarding finishing is a UX
        // step, not a security gate; the reconcile path can fix the column.
        router.push('/app');
      },
    }),
  );

  useEffect(() => {
    void track('review_step_viewed').catch(() => undefined);
    if (started.current) return;
    started.current = true;
    const t = setTimeout(() => {
      markComplete.mutate({ step: 'review' });
    }, AUTO_ADVANCE_MS);
    return () => clearTimeout(t);
    // markComplete is stable across renders (useMutation tuple); no need to depend on it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <OnboardingStepper currentStep="review">
      <header className="flex flex-col gap-3">
        <h1 className="text-h2 text-ink">Reviewing your deck…</h1>
        <p className="text-body text-graphite">
          This takes about a minute. We&apos;ll take you to your dashboard when it&apos;s done.
        </p>
      </header>

      {/* Skeleton-block progress mock — matches the eventual Phase-3 review layout. */}
      <div
        data-testid="review-skeleton"
        aria-live="polite"
        aria-busy="true"
        className="flex flex-col gap-4 rounded-xl border border-stone bg-paper p-8"
      >
        <SkeletonBlock className="h-6 w-1/3" />
        <SkeletonBlock className="h-4 w-2/3" />
        <div className="h-px w-full bg-stone" aria-hidden />
        <SkeletonBlock className="h-5 w-1/4" />
        <SkeletonBlock className="h-4 w-full" />
        <SkeletonBlock className="h-4 w-5/6" />
        <SkeletonBlock className="h-4 w-4/6" />
        <div className="h-px w-full bg-stone" aria-hidden />
        <SkeletonBlock className="h-5 w-1/4" />
        <SkeletonBlock className="h-4 w-full" />
        <SkeletonBlock className="h-4 w-11/12" />
      </div>
    </OnboardingStepper>
  );
}
