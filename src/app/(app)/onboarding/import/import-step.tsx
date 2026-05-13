'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Upload } from 'lucide-react';

import { OnboardingStepper } from '@/components/onboarding/stepper';
import { Button } from '@/components/ui/button';
import { useTRPC } from '@/lib/trpc-client';
import { useMutation } from '@tanstack/react-query';
import { track } from '@/lib/analytics';
import { logger } from '@/lib/logger';

/**
 * Knowledge Pack Import client step. Fires `knowledge_pack_step_viewed` on
 * mount. Continue → `onboarding.markStepComplete({ step: 'import' })` → `/onboarding/deck`.
 * Skip for now → `onboarding.skipStep({ step: 'import' })` → `/onboarding/deck`.
 * (Both advance `accounts.onboarding_step` to `'deck'`.)
 *
 * The paste textarea + file dropzone are UI shells only — actual extraction
 * lands Phase 2 (the Knowledge Layer plan). No content is uploaded or stored
 * in Phase 1; the hint copy makes that contract explicit.
 */
export function ImportStep() {
  const router = useRouter();
  const trpc = useTRPC();
  const [pasted, setPasted] = useState('');

  useEffect(() => {
    void track('knowledge_pack_step_viewed').catch(() => undefined);
  }, []);

  const markComplete = useMutation(
    trpc.onboarding.markStepComplete.mutationOptions({
      onSuccess: () => router.push('/onboarding/deck'),
      onError: (err) => {
        logger.warn('onboarding.import: markStepComplete failed', { err });
      },
    }),
  );
  const skip = useMutation(
    trpc.onboarding.skipStep.mutationOptions({
      onSuccess: () => router.push('/onboarding/deck'),
      onError: (err) => {
        logger.warn('onboarding.import: skipStep failed', { err });
      },
    }),
  );

  const onContinue = () => markComplete.mutate({ step: 'import' });
  const onSkip = () => skip.mutate({ step: 'import' });

  return (
    <OnboardingStepper currentStep="import">
      <header className="flex flex-col gap-3">
        <h1 className="text-h2 text-ink">Import your context</h1>
        <p className="text-body text-graphite">
          Drop in your existing AI context — ChatGPT instructions, Claude project notes, a Notion
          brief — or paste 500–5,000 words. Trochia builds your Business Memory from it.
        </p>
      </header>

      <div className="flex flex-col gap-6">
        <label htmlFor="context-paste" className="flex flex-col gap-2">
          <span className="text-label uppercase text-graphite">Paste your context</span>
          <textarea
            id="context-paste"
            value={pasted}
            onChange={(e) => setPasted(e.target.value)}
            placeholder="Paste 500–5,000 words from ChatGPT, Claude, Notion, or a doc."
            className="min-h-48 w-full rounded-lg border border-stone bg-paper px-4 py-3 text-body text-ink placeholder:text-graphite focus-visible:border-ink focus-visible:outline-none"
            aria-label="Paste your context"
          />
        </label>

        <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-stone bg-paper px-6 py-12 text-center">
          <Upload className="size-6 text-graphite" aria-hidden />
          <p className="text-body text-ink">Or drop a file</p>
          <p className="text-body-sm text-graphite">
            Markdown, text, or PDF. We&apos;ll process this when you finish onboarding.
          </p>
          <input
            type="file"
            aria-label="Upload your context file"
            accept=".md,.txt,.pdf"
            className="text-body-sm text-graphite file:mr-3 file:rounded-md file:border file:border-stone file:bg-paper file:px-3 file:py-1.5 file:text-body-sm file:text-ink hover:file:border-ink/30"
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
