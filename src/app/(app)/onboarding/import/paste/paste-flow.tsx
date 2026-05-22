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
 * PasteFlow — Plan 02-02 / KNW-02b Task 8 (extended in Plan 02-03 / Task 12).
 *
 * Client-side state machine that drives `/onboarding/import/paste`. Four base
 * states walked top-to-bottom plus one sibling error slot:
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
 *   5. `injection-rejected` (Plan 02-03 / Task 12) — sibling error slot for
 *                     the AI_INJECTION_REJECTED agent error. Re-entry to
 *                     `paste` preserves the textarea value (paste state lives
 *                     outside the discriminator).
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
 *   - The rejection heading uses `aria-live="assertive"` so screen readers
 *     interrupt and announce the rejection immediately.
 *
 * Failure paths surface inline (under the textarea or above the confirmation
 * form). Errors are NEVER thrown to a global toast — onboarding is single-
 * surface and errors belong next to the input that caused them.
 *
 * ## Week-3 additions (Plan 02-03 / Task 12)
 *
 *   - **Injection-rejected state slot.** `{ kind: 'injection-rejected' }` is
 *     a sibling of the four base states. The `onError` path detects the
 *     agent's AI_INJECTION_REJECTED AppError via `isInjectionRejected(err)` —
 *     three-arm fallback chain (data.cause.code, top-level cause.code,
 *     message-string substring). The third arm (message-string) is the
 *     active production path until plan-Task 11 lands the explicit
 *     `rethrowAgentError` switch case that maps the AppError to a
 *     `TRPCError({ code: 'BAD_REQUEST', cause: AppError })`. The two
 *     structured arms light up automatically when T11 ships; no change
 *     here is needed.
 *
 *   - **Redactions-applied banner.** Above `<ConfirmationForm>` in the
 *     `confirming` state when `response.pii.redactionsApplied > 0`. Detail
 *     copy resolves from `byType` — singular noun when exactly one PII type
 *     fired, "PII items" when multiple. Dismissable via local
 *     `bannerDismissed` state; the dismiss flag resets on every fresh
 *     successful extract so a second paste re-shows the banner if redactions
 *     fired again. The `pii` field is read defensively (the existing 02-02
 *     router does not surface it yet — when plan-T11 extends the router's
 *     return shape, this banner lights up with no change here).
 *
 *   - **Explicitly NOT implemented (deferred to Plan 02-10):** drafting-state
 *     cancellation (AbortController plumbing), drafting-state progress
 *     affordance (skeleton cards / token-budget bar), server-side `getDraft`
 *     pre-fetch on mount. Per 02-02 SUMMARY § "UI Items Deferred" + the
 *     02-03 plan's context block.
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
  // ── Plan 02-03 / Task 12: injection-rejected + redactions banner ──
  injectionRejectedHeading: 'Paste rejected',
  injectionRejectedBody:
    'Trochia flagged high-severity prompt-injection markers in this paste. Edit your text and try again, or paste different content.',
  injectionRejectedCta: 'Edit and retry',
  bannerDismiss: 'Dismiss',
  bannerDismissAria: 'Dismiss redactions notice',
} as const;

const MIN_CHARS = 500;
const MAX_CHARS = 40_000;

/**
 * Redactions metadata surfaced by the extract agent (Plan 02-03 / KNW-02d).
 * The router does NOT yet pass this through to the client (plan-T11 owns the
 * router-output schema extension). Until T11 lands, this type is consumed via
 * a defensive `unknown` cast inside the mutation's onSuccess handler — same
 * pattern the existing `injectionFlagged` read uses.
 */
interface PiiRedactionSummary {
  redactionsApplied: number;
  byType: Record<string, number>;
}

type FlowState =
  | { kind: 'paste' }
  | { kind: 'drafting' }
  | {
      kind: 'confirming';
      draft: BusinessMemoryDraft;
      injectionFlagged: boolean;
      pii: PiiRedactionSummary | null;
    }
  | { kind: 'done' }
  | { kind: 'injection-rejected' };

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

/**
 * Detect an AI_INJECTION_REJECTED rejection from the extract agent. The
 * router's `rethrowAgentError` (see `src/server/routers/memory.ts`) does NOT
 * yet have an explicit switch case for AI_INJECTION_REJECTED — plan-Task 11
 * owns that change. Until T11 lands, the AppError surfaces via the default
 * `INTERNAL_SERVER_ERROR` branch with the original AppError attached as
 * `cause`. Three arms checked, in priority order:
 *
 *   1. `error.data.cause.code` — what tRPC's standard error formatter
 *      produces when T11 maps the AppError to BAD_REQUEST with `cause`.
 *   2. `error.cause.code`      — what a default `INTERNAL_SERVER_ERROR`
 *      passes through today (the AppError is on `.cause`, not `.data.cause`).
 *   3. message-string substring — fallback that always works because the
 *      agent's AppError message contains "Paste rejected:" prefix and the
 *      router copies `err.message` verbatim into the TRPCError. This is the
 *      ACTIVE production path until T11 ships the structured cause-code
 *      mapping; the other two arms become primary as soon as T11 lands.
 *
 * Matched substrings from the sanitizer NEVER reach the UI — this helper
 * returns a boolean only.
 */
function isInjectionRejected(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const e = err as {
    message?: unknown;
    data?: { cause?: { code?: unknown } } | null;
    cause?: { code?: unknown } | null;
  };
  if (e.data?.cause?.code === 'AI_INJECTION_REJECTED') return true;
  if (e.cause?.code === 'AI_INJECTION_REJECTED') return true;
  if (typeof e.message === 'string' && e.message.includes('AI_INJECTION_REJECTED')) {
    return true;
  }
  // The agent's AppError message also carries the human-readable "Paste
  // rejected: N high-severity injection markers across …" prefix that the
  // router copies verbatim — match the stable prefix as a defensive fallback.
  if (typeof e.message === 'string' && e.message.startsWith('Paste rejected:')) {
    return true;
  }
  return false;
}

/**
 * Render the redactions-applied banner detail line. When exactly one PII
 * type fired, surface the singular noun; otherwise generalize to "PII items".
 * Pluralization uses the naive `${noun}s` form which reads correctly for
 * "email" / "phone number" / "wallet address" / "SSN-shaped token" — all four
 * pluralize regularly.
 */
function redactionsDetailCopy(n: number, byType: Record<string, number>): string {
  const presentTypes = Object.entries(byType)
    .filter(([, count]) => count > 0)
    .map(([t]) => t);
  if (presentTypes.length === 1) {
    const t = presentTypes[0];
    const noun =
      t === 'email'
        ? 'email'
        : t === 'phone'
          ? 'phone number'
          : t === 'wallet'
            ? 'wallet address'
            : t === 'ssn'
              ? 'SSN-shaped token'
              : 'PII item';
    return n === 1
      ? `1 unrelated-party ${noun} redacted from the draft.`
      : `${n} unrelated-party ${noun}s redacted from the draft.`;
  }
  return n === 1
    ? `1 unrelated-party PII item redacted from the draft.`
    : `${n} unrelated-party PII items redacted from the draft.`;
}

export function PasteFlow() {
  const router = useRouter();
  const trpc = useTRPC();

  const [paste, setPaste] = React.useState('');
  const [state, setState] = React.useState<FlowState>({ kind: 'paste' });
  const [extractError, setExtractError] = React.useState<string | null>(null);
  const [confirmError, setConfirmError] = React.useState<string | null>(null);
  // Plan 02-03 / Task 12 — redactions-applied banner dismiss flag. Resets to
  // false on every fresh successful extract so a second paste in the same
  // session re-shows the banner if redactions fired again.
  const [bannerDismissed, setBannerDismissed] = React.useState(false);

  const textareaRef = React.useRef<HTMLTextAreaElement | null>(null);
  const draftingHeadingRef = React.useRef<HTMLHeadingElement | null>(null);
  const confirmingRegionRef = React.useRef<HTMLDivElement | null>(null);
  const doneHeadingRef = React.useRef<HTMLHeadingElement | null>(null);
  const injectionRejectedHeadingRef = React.useRef<HTMLHeadingElement | null>(null);

  const extractMutation = useMutation(
    trpc.memory.extractFromPaste.mutationOptions({
      onSuccess: (data) => {
        // The router currently returns { draft, existingConfirmed }; an
        // `injectionFlagged` field is reserved for Week-3 (KNW-02d). Read
        // defensively so the UI lights up the moment the field appears.
        const injectionFlagged = Boolean(
          (data as unknown as { injectionFlagged?: boolean }).injectionFlagged,
        );
        // Plan 02-03 / Task 12: read `pii` defensively. Plan-T11 owns the
        // router-output extension that surfaces this field; until then the
        // value is undefined at runtime and the banner stays hidden.
        const piiCandidate = (data as unknown as { pii?: PiiRedactionSummary }).pii;
        const pii: PiiRedactionSummary | null =
          piiCandidate &&
          typeof piiCandidate === 'object' &&
          typeof piiCandidate.redactionsApplied === 'number' &&
          piiCandidate.byType &&
          typeof piiCandidate.byType === 'object'
            ? piiCandidate
            : null;
        setExtractError(null);
        setBannerDismissed(false);
        setState({ kind: 'confirming', draft: data.draft, injectionFlagged, pii });
      },
      onError: (err) => {
        // Plan 02-03 / Task 12: branch BEFORE the generic mapper. The
        // injection-rejected slot is a sibling state; the textarea retains
        // its `paste` value because that lives outside the state machine.
        if (isInjectionRejected(err)) {
          // Shape-restricted console call — NEVER log the err object (it
          // carries the AppError.context.matches from the sanitizer, which
          // is paste content). Code only. The `no-console` lint is disabled
          // here because the SENSITIVE_FIELDS redactor in `logger.ts` would
          // pass the AppError-shape `code` field through unchanged anyway,
          // and we deliberately want this single trace breadcrumb visible
          // in the browser devtools during the Week-3 sanitizer rollout.
          // eslint-disable-next-line no-console
          console.error('paste-flow: injection rejected', {
            code: 'AI_INJECTION_REJECTED',
          });
          setExtractError(null);
          setState({ kind: 'injection-rejected' });
          return;
        }
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
    else if (state.kind === 'injection-rejected')
      injectionRejectedHeadingRef.current?.focus();
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

        {/*
         * Plan 02-03 / Task 12 — redactions-applied banner. Renders above the
         * confirmation cards when the agent redacted any unrelated-party PII
         * from the draft. Dismissable via `bannerDismissed`; the flag is
         * reset on every fresh extract success so a second paste re-shows it.
         */}
        {state.pii !== null && state.pii.redactionsApplied > 0 && !bannerDismissed && (
          <div
            className="mb-4 flex items-center justify-between rounded-lg border border-warning/30 bg-warning/10 px-4 py-3 text-body-sm text-warning"
            data-testid="paste-flow-redactions-banner"
            role="status"
            aria-live="polite"
          >
            <span>{redactionsDetailCopy(state.pii.redactionsApplied, state.pii.byType)}</span>
            <Button
              variant="ghost"
              size="compact"
              onClick={() => setBannerDismissed(true)}
              aria-label={COPY.bannerDismissAria}
              data-testid="paste-flow-redactions-banner-dismiss"
            >
              {COPY.bannerDismiss}
            </Button>
          </div>
        )}

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

  // ── State 5: injection-rejected (Plan 02-03 / Task 12) ────────────────
  // Sibling slot for AI_INJECTION_REJECTED. The textarea's `paste` value
  // survives the round-trip because it lives outside the state machine —
  // clicking "Edit and retry" returns to `'paste'` with the original text
  // intact. The heading uses aria-live="assertive" so screen readers
  // interrupt and announce the rejection immediately.
  if (state.kind === 'injection-rejected') {
    return (
      <section
        aria-labelledby="paste-flow-injection-rejected-heading"
        className="flex w-full flex-col gap-4 rounded-xl border border-danger bg-paper p-8"
        data-testid="paste-flow-injection-rejected"
      >
        <h2
          ref={injectionRejectedHeadingRef}
          id="paste-flow-injection-rejected-heading"
          tabIndex={-1}
          aria-live="assertive"
          className="text-h3 text-ink"
          data-testid="paste-flow-injection-rejected-heading"
        >
          {COPY.injectionRejectedHeading}
        </h2>
        <p className="text-body text-graphite">{COPY.injectionRejectedBody}</p>
        <div className="flex">
          <Button
            variant="primary"
            onClick={() => setState({ kind: 'paste' })}
            data-testid="paste-flow-injection-rejected-cta"
          >
            {COPY.injectionRejectedCta}
          </Button>
        </div>
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
