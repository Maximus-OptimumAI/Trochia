'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Upload } from 'lucide-react';

import { OnboardingStepper } from '@/components/onboarding/stepper';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useTRPC } from '@/lib/trpc-client';
import { useMutation } from '@tanstack/react-query';
import { track } from '@/lib/analytics';
import { logger } from '@/lib/logger';

/**
 * Deck upload client step. Fires `deck_upload_step_viewed` on mount. Continue
 * → `onboarding.markStepComplete({ step: 'deck' })` → `/onboarding/review`.
 * Skip for now → `onboarding.skipStep({ step: 'deck' })` → `/onboarding/review`.
 *
 * The dropzone + Slides URL input are UI shells only — actual deck parsing
 * and review land in Phase 3.
 */
export function DeckStep() {
  const router = useRouter();
  const trpc = useTRPC();
  const [slidesUrl, setSlidesUrl] = useState('');

  useEffect(() => {
    void track('deck_upload_step_viewed').catch(() => undefined);
  }, []);

  const markComplete = useMutation(
    trpc.onboarding.markStepComplete.mutationOptions({
      onSuccess: () => router.push('/onboarding/review'),
      onError: (err) => {
        logger.warn('onboarding.deck: markStepComplete failed', { err });
      },
    }),
  );
  const skip = useMutation(
    trpc.onboarding.skipStep.mutationOptions({
      onSuccess: () => router.push('/onboarding/review'),
      onError: (err) => {
        logger.warn('onboarding.deck: skipStep failed', { err });
      },
    }),
  );

  const onContinue = () => markComplete.mutate({ step: 'deck' });
  const onSkip = () => skip.mutate({ step: 'deck' });

  return (
    <OnboardingStepper currentStep="deck">
      <header className="flex flex-col gap-3">
        <h1 className="text-h2 text-ink">Upload your deck</h1>
        <p className="text-body text-graphite">
          PDF, PPTX, or a Google Slides link. Trochia reviews it next.
        </p>
      </header>

      <div className="flex flex-col gap-6">
        <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-stone bg-paper px-6 py-12 text-center">
          <Upload className="size-6 text-graphite" aria-hidden />
          <p className="text-body text-ink">Drop your deck</p>
          <p className="text-body-sm text-graphite">PDF or PPTX, up to 50 MB.</p>
          <input
            type="file"
            aria-label="Upload your deck"
            accept=".pdf,.pptx,application/pdf,application/vnd.openxmlformats-officedocument.presentationml.presentation"
            className="text-body-sm text-graphite file:mr-3 file:rounded-md file:border file:border-stone file:bg-paper file:px-3 file:py-1.5 file:text-body-sm file:text-ink hover:file:border-ink/30"
          />
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="slides-url">Or paste a Google Slides link</Label>
          <Input
            id="slides-url"
            type="url"
            value={slidesUrl}
            onChange={(e) => setSlidesUrl(e.target.value)}
            placeholder="https://docs.google.com/presentation/d/…"
          />
        </div>
      </div>

      <div className="flex flex-col-reverse items-stretch gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Button
          variant="link"
          onClick={onSkip}
          disabled={skip.isPending || markComplete.isPending}
        >
          Skip for now
        </Button>
        <Button
          variant="primary"
          onClick={onContinue}
          disabled={markComplete.isPending || skip.isPending}
        >
          {markComplete.isPending ? 'Saving…' : 'Continue'}
        </Button>
      </div>
    </OnboardingStepper>
  );
}
