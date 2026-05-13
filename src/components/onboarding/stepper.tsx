'use client';

import { Check } from 'lucide-react';
import type { ReactNode } from 'react';

import { cn } from '@/lib/utils';

/**
 * Onboarding Stepper (Plan 01-09, FND-12 / UI-SPEC §"Auth + onboarding shell").
 *
 * Renders the 3-step header above an onboarding step's content:
 *   01 Import context · 02 Upload deck · 03 Review
 *
 * The current step is highlighted (mono number in `text-signal`, label in `text-ink`),
 * previously-completed steps render the Check mark, future steps are graphite-muted.
 * Per the UI-SPEC, mono numbers use `text-mono` (Geist Mono) and `text-signal` is the
 * one-accent-per-surface — it is "the moment" on this surface so no other element on
 * the page should use `text-signal` (the step screens follow this).
 */
export type OnboardingStep = 'import' | 'deck' | 'review';

const STEPS: { id: OnboardingStep; index: string; label: string }[] = [
  { id: 'import', index: '01', label: 'Import context' },
  { id: 'deck', index: '02', label: 'Upload deck' },
  { id: 'review', index: '03', label: 'Review' },
];

export function OnboardingStepper({
  currentStep,
  children,
}: {
  currentStep: OnboardingStep;
  children: ReactNode;
}) {
  const currentIdx = STEPS.findIndex((s) => s.id === currentStep);

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-12 px-6 py-12 md:py-16">
      <nav aria-label="Onboarding progress" className="flex flex-col gap-4">
        <ol className="flex flex-wrap items-center gap-x-6 gap-y-2 text-body-sm">
          {STEPS.map((step, idx) => {
            const isCurrent = idx === currentIdx;
            const isComplete = idx < currentIdx;
            return (
              <li key={step.id} className="flex items-center gap-2">
                {isComplete ? (
                  <span
                    aria-label="Completed"
                    className="inline-flex size-5 items-center justify-center rounded-full bg-ink text-paper"
                  >
                    <Check className="size-3" aria-hidden />
                  </span>
                ) : (
                  <span
                    className={cn(
                      'font-mono text-mono-sm',
                      isCurrent ? 'text-signal' : 'text-graphite',
                    )}
                    aria-hidden
                  >
                    {step.index}
                  </span>
                )}
                <span
                  className={cn(
                    'font-medium',
                    isCurrent
                      ? 'text-ink'
                      : isComplete
                        ? 'text-ink/70'
                        : 'text-graphite',
                  )}
                >
                  {step.label}
                </span>
                {idx < STEPS.length - 1 && (
                  <span aria-hidden className="text-graphite/60">
                    ·
                  </span>
                )}
              </li>
            );
          })}
        </ol>
        <div className="h-px w-full bg-stone" aria-hidden />
      </nav>

      <section className="flex flex-col gap-8">{children}</section>
    </main>
  );
}
