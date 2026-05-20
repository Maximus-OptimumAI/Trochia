'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { useMutation } from '@tanstack/react-query';

import type {
  BusinessMemoryConfirmed,
  BusinessMemoryDraft,
} from '@/ai/schemas/business-memory.zod';
import { ConfirmationForm } from '@/components/memory/confirmation-form';
import { Button } from '@/components/ui/button';
import { logger } from '@/lib/logger';
import { useTRPC } from '@/lib/trpc-client';
import { cn } from '@/lib/utils';

/**
 * PasteFlow — Plan 02-02 / KNW-02b Task 8.
 *
 * Client-side state machine that drives `/onboarding/import/paste`. Four
 * states walked top-to-bottom:
 *
 *   1. `paste`      — textarea + character counter + submit. Submit is gated
 *                     to [500, 40_000] chars (server agent enforces the same
 *                     bounds; gating client-side avoids a wasted round-trip).
 *   2. `drafting`   — `memory.extractFromPaste` mutation in flight. Operator-
 *                     voice progress copy + `aria-live="polite"` so screen
 *                     readers announce the transition.
 *   3. `confirming` — `<ConfirmationForm>` rendered with the agent's draft.
 *                     Founder edits/confirms/rejects each card, then submits
 *                     → `memory.confirmDraft`.
 *   4. `done`       — Success state with a link to `/onboarding/deck`.
 *
 * The Phase-2 baseline screens pasted text for prompt-injection markers
 * (Plan 02-02 / KNW-02a Task 3); when the router surfaces an
 * `injectionFlagged` boolean (Week-3 / KNW-02d), this component renders a
 * small operator-voice warning above the confirmation cards. The field is
 * read defensively so it lights up automatically once the router adds it.
 *
 * Voice (BRAND.md): Trochia drafts / cites / tracks. No "we", "feel", "love",
 * "want", "help", "hope" — operator register only. No emoji. No exclamation
 * points. All colors come from the brand-token set; no raw hex.
 *
 * a11y:
 *   - Status transitions are announced via an `aria-live="polite"` region.
 *   - Form labels are associated with inputs via `htmlFor` + `id`.
 *   - On state transition, focus moves to the new primary element.
 *
 * Failure paths surface inline (under the textarea or above the confirmation
 * form). Errors are NEVER thrown to a global toast — onboarding is single-
 * surface and errors belong next to the input that caused them.
 */

// ─── Operator-voice copy (the ONLY visible strings this flow renders) ─────
const COPY = {
  pasteLabel: 'Paste your AI context',
  pasteHelper:
    'Drop in 500–40,000 characters from ChatGPT, Claude, Notion, or a doc. Trochia drafts a Business Memory from it.',
  pastePlaceholder:
    'Paste your existing context — ChatGPT custom instructions, Claude project notes, a Notion brief.',
  characterCountSuffix: 'characters',
  submitIdle: 'Draft Business Memory',
  submitBelowMin: 'Add at least 500 characters',
  submitAboveMax: 'Trim to 40,000 characters or fewer',
  draftingTitle: 'Trochia is reading your paste.',
  draftingBody:
    'Drafting your Business Memory. This takes about 30 seconds on a typical paste.',
  injectionWarning:
    'Trochia flagged a possible prompt injection pattern in your paste. The draft below was extracted anyway — review carefully and reject anything that looks off.',
  doneTitle: 'Business Memory saved.',
  doneBody:
    'Your confirmed Business Memory is the source of truth for every later module. Continue when ready.',
  doneCta: 'Continue to deck upload',
  errorTooShort:
    'That paste is too short. Trochia needs at least 500 characters to draft a useful Business Memory.',
  errorTooLong:
    'That paste is too long. Trochia caps imports at 40,000 characters — try splitting into multiple pastes.',
  errorGeneric:
    "Trochia couldn't draft from that paste. Try again, or contact support if this persists.",
} as const;

const MIN_CHARS = 500;
const MAX_CHARS = 40_000;

type FlowState =
  | { kind: 'paste' }
  | { kind: 'drafting' }
  | { kind: 'confirming'; draft: BusinessMemoryDraft; injectionFlagged: boolean }
  | { kind: 'done' };

/**
 * Map a tRPC mutation error into an operator-voice message string. The
 * extractor agent throws `PASTE_TOO_SHORT` / `PASTE_TOO_LONG` AppErrors with
 * "too short" / "too long" verbatim in the message; the router re-throws as
 * `BAD_REQUEST`. We match on message substring rather than on a deeply-nested
 * cause chain so the discriminator survives serialization.
 */
function mapExtractError(err: unknown): string {
  if (err && typeof err === 'object' && 'message' in err) {
    const msg = String((err as { message: unknown }).message).toLowerCase();
    if (msg.includes('too short')) return COPY.errorTooShort;
    if (msg.includes('too long')) return COPY.errorTooLong;
  }
  return COPY.errorGeneric;
}

export function PasteFlow() {
  const router = useRouter();
  const trpc = useTRPC();

  const [paste, setPaste] = React.useState('');
  const [state, setState] = React.useState<FlowState>({ kind: 'paste' });
  const [extractError, setExtractError] = React.useState<string | null>(null);
  const [confirmError, setConfirmError] = React.useState<string | null>(null);

  const textareaRef = React.useRef<HTMLTextAreaElement | null>(null);
  const draftingHeadingRef = React.useRef<HTMLHeadingElement | null>(null);
  const confirmingRegionRef = React.useRef<HTMLDivElement | null>(null);
  const doneHeadingRef = React.useRef<HTMLHeadingElement | null>(null);

  const extractMutation = useMutation(
    trpc.memory.extractFromPaste.mutationOptions({
      onSuccess: (data) => {
        // The router currently returns { draft, existingConfirmed }; an
        // `injectionFlagged` field is reserved for Week-3 (KNW-02d). Read
        // defensively so the UI lights up the moment the field appears.
        const injectionFlagged = Boolean(
          (data as unknown as { injectionFlagged?: boolean }).injectionFlagged,
        );
        setExtractError(null);
        setState({ kind: 'confirming', draft: data.draft, injectionFlagged });
      },
      onError: (err) => {
        logger.warn('onboarding.paste: extractFromPaste failed', { err });
        setExtractError(mapExtractError(err));
        setState({ kind: 'paste' });
      },
    }),
  );

  const confirmMutation = useMutation(
    trpc.memory.confirmDraft.mutationOptions({
      onSuccess: () => {
        setConfirmError(null);
        setState({ kind: 'done' });
      },
      onError: (err) => {
        logger.warn('onboarding.paste: confirmDraft failed', { err });
        setConfirmError(COPY.errorGeneric);
      },
    }),
  );

  // Focus management on state transitions — moves focus to the new primary
  // element so keyboard + screen-reader users are anchored to the right spot.
  React.useEffect(() => {
    if (state.kind === 'paste') textareaRef.current?.focus();
    else if (state.kind === 'drafting') draftingHeadingRef.current?.focus();
    else if (state.kind === 'confirming') confirmingRegionRef.current?.focus();
    else if (state.kind === 'done') doneHeadingRef.current?.focus();
  }, [state.kind]);

  const charCount = paste.length;
  const belowMin = charCount < MIN_CHARS;
  const aboveMax = charCount > MAX_CHARS;
  const inBand = !belowMin && !aboveMax;

  const onSubmitPaste = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!inBand || extractMutation.isPending) return;
    setExtractError(null);
    setState({ kind: 'drafting' });
    extractMutation.mutate({ paste });
  };

  const onConfirm = async (confirmed: BusinessMemoryConfirmed) => {
    setConfirmError(null);
    await confirmMutation.mutateAsync({ confirmed });
  };

  const onContinue = () => {
    router.push('/onboarding/deck');
  };

  // ── State 1: paste ────────────────────────────────────────────────────
  if (state.kind === 'paste') {
    return (
      <section
        aria-labelledby="paste-flow-heading"
        className="flex w-full flex-col gap-6"
        data-testid="paste-flow-step-paste"
      >
        <div className="sr-only" role="status" aria-live="polite">
          Ready to paste.
        </div>
        <form onSubmit={onSubmitPaste} className="flex flex-col gap-4" noValidate>
          <label htmlFor="paste-flow-textarea" className="flex flex-col gap-2">
            <span className="text-label uppercase text-graphite tracking-wider">
              {COPY.pasteLabel}
            </span>
            <span className="text-body-sm text-graphite">{COPY.pasteHelper}</span>
            <textarea
              ref={textareaRef}
              id="paste-flow-textarea"
              value={paste}
              onChange={(event) => setPaste(event.target.value)}
              placeholder={COPY.pastePlaceholder}
              className="min-h-64 w-full rounded-lg border border-stone bg-paper px-4 py-3 text-body text-ink placeholder:text-graphite focus-visible:border-ink focus-visible:outline-none"
              aria-describedby={
                extractError ? 'paste-flow-counter paste-flow-error' : 'paste-flow-counter'
              }
              aria-invalid={belowMin || aboveMax ? true : undefined}
              data-testid="paste-flow-textarea"
            />
          </label>

          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <p
              id="paste-flow-counter"
              className={cn(
                'font-mono text-mono-sm text-graphite',
                aboveMax && 'text-danger',
              )}
              aria-live="polite"
              data-testid="paste-flow-counter"
            >
              <span>{charCount.toLocaleString()}</span> / {MAX_CHARS.toLocaleString()}{' '}
              {COPY.characterCountSuffix}
            </p>
            <Button
              type="submit"
              variant="primary"
              disabled={!inBand || extractMutation.isPending}
              data-testid="paste-flow-submit"
            >
              {extractMutation.isPending
                ? COPY.draftingTitle
                : belowMin
                  ? COPY.submitBelowMin
                  : aboveMax
                    ? COPY.submitAboveMax
                    : COPY.submitIdle}
            </Button>
          </div>

          {extractError && (
            <p
              id="paste-flow-error"
              className="text-body-sm text-danger"
              role="alert"
              data-testid="paste-flow-error"
            >
              {extractError}
            </p>
          )}
        </form>
      </section>
    );
  }

  // ── State 2: drafting ─────────────────────────────────────────────────
  if (state.kind === 'drafting') {
    return (
      <section
        aria-labelledby="paste-flow-drafting-heading"
        className="flex w-full flex-col gap-4 rounded-xl border border-stone bg-paper p-8"
        data-testid="paste-flow-step-drafting"
      >
        <div className="sr-only" role="status" aria-live="polite">
          Drafting Business Memory.
        </div>
        <h2
          ref={draftingHeadingRef}
          id="paste-flow-drafting-heading"
          tabIndex={-1}
          className="text-h3 text-ink"
        >
          {COPY.draftingTitle}
        </h2>
        <p className="text-body text-graphite">{COPY.draftingBody}</p>
        <p className="font-mono text-mono-sm text-graphite" aria-hidden>
          Drafting…
        </p>
      </section>
    );
  }

  // ── State 3: confirming ───────────────────────────────────────────────
  if (state.kind === 'confirming') {
    return (
      <section
        aria-labelledby="paste-flow-confirming-heading"
        className="flex w-full flex-col gap-6"
        data-testid="paste-flow-step-confirming"
      >
        <div className="sr-only" role="status" aria-live="polite">
          Draft ready. Review each field.
        </div>
        <div
          ref={confirmingRegionRef}
          id="paste-flow-confirming-heading"
          tabIndex={-1}
          aria-label="Confirm your Business Memory"
        >
          {state.injectionFlagged && (
            <p
              className="mb-6 rounded-lg border border-warning bg-warning/10 p-4 text-body-sm text-ink"
              role="alert"
              data-testid="paste-flow-injection-warning"
            >
              {COPY.injectionWarning}
            </p>
          )}
        </div>

        <ConfirmationForm
          initialDraft={state.draft}
          onSubmit={onConfirm}
          isSubmitting={confirmMutation.isPending}
        />

        {confirmError && (
          <p
            className="text-body-sm text-danger"
            role="alert"
            data-testid="paste-flow-confirm-error"
          >
            {confirmError}
          </p>
        )}
      </section>
    );
  }

  // ── State 4: done ─────────────────────────────────────────────────────
  return (
    <section
      aria-labelledby="paste-flow-done-heading"
      className="flex w-full flex-col gap-4 rounded-xl border border-stone bg-paper p-8"
      data-testid="paste-flow-step-done"
    >
      <div className="sr-only" role="status" aria-live="polite">
        Business Memory saved.
      </div>
      <h2
        ref={doneHeadingRef}
        id="paste-flow-done-heading"
        tabIndex={-1}
        className="text-h3 text-ink"
      >
        {COPY.doneTitle}
      </h2>
      <p className="text-body text-graphite">{COPY.doneBody}</p>
      <div className="flex">
        <Button variant="primary" onClick={onContinue} data-testid="paste-flow-continue">
          {COPY.doneCta}
        </Button>
      </div>
    </section>
  );
}
