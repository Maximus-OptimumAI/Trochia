'use client';

import * as React from 'react';
import { useMutation } from '@tanstack/react-query';

import type { QaAnswer } from '@/ai/schemas/qa-answer.zod';
import { CitationChip } from '@/components/qa/citation-chip';
import { Button } from '@/components/ui/button';
import { useTRPC } from '@/lib/trpc-client';
import { cn } from '@/lib/utils';

/**
 * `<QaSidebar/>` — the ambient persistent Q&A sidebar (Phase 2 / KNW-05c).
 *
 * A textarea + ask action that calls `trpc.qa.ask`. Trochia ANSWERS from the
 * founder's own confirmed knowledge, with inline citations the founder can
 * verify — the read-side moat ChatGPT cannot reproduce.
 *
 * ## Four visually-distinct states (never a fabricated answer)
 *
 *   1. `loading`        — a non-streaming loading affordance while the mutation
 *                         is pending. OD-6 / F-4: a fast structured render on
 *                         completion (NOT token-streaming — that bypasses the
 *                         structured-citation guarantee + the single chokepoint;
 *                         true streaming is FOLLOWUP-QA-STREAMING-01).
 *   2. `grounded`       — the synthesized answer + inline `<CitationChip/>`s,
 *                         each tracing to a retrieved source/chunk. Only shown
 *                         when `answer.grounded === true` (≥1 valid citation,
 *                         zero dropped — enforced in the agent, P2-E).
 *   3. `i-dont-know`    — the deterministic refusal (`answer.grounded === false`
 *                         on weak retrieval / a dropped citation). The agent
 *                         supplies the operator-voice body; the sidebar renders
 *                         it as its own distinct state — never an invented fact.
 *   4. `limit-reached`  — the HARD-block state on TOO_MANY_REQUESTS (OD-8). It
 *                         renders the EXACT copy "Daily AI limit reached —
 *                         resets at midnight UTC" as its OWN non-fabricated,
 *                         non-error state (not a toast, not an invented answer).
 *
 * Plus a sibling `error` slot for any non-cap failure — a GENERIC operator-voice
 * line, NEVER the raw error, NEVER the query or answer.
 *
 * ## Privacy (P2-D + guardrail #3)
 *
 * The sidebar only ever receives a `QaAnswer` — the router strips the `debug`
 * surface before the boundary (droppedCitationCount / maxVectorScore /
 * retrievedKeys never reach the client). No query/answer is logged client-side,
 * pushed to a toast, or sent to analytics.
 *
 * Voice (docs/BRAND.md): operator register. Trochia "answers", "cites",
 * "grounds". No "helps", "wants", "feels". No emoji, no exclamation points.
 * Tokens only (ink / paper / signal / graphite / stone); no new colors/fonts.
 * Reduced-motion aware (`motion-reduce:` variants).
 */

// ─── Operator-voice copy (the ONLY visible strings this sidebar renders) ─────
const COPY = {
  heading: 'Ask your knowledge',
  helper:
    'Trochia answers from your confirmed memory, corpus, and pipeline — with citations. It does not invent.',
  inputLabel: 'Your question',
  placeholder: 'What did we report for last-quarter traction?',
  submitIdle: 'Ask',
  submitPending: 'Trochia is answering…',
  loadingBody: 'Trochia is reading your knowledge and grounding an answer.',
  citationsLabel: 'Cited from',
  // The EXACT OD-8 user-facing copy (mirrors src/server/routers/qa.ts
  // CAP_REACHED_MESSAGE). Rendered as a non-fabricated, non-error state.
  limitReachedTitle: 'Daily AI limit reached — resets at midnight UTC',
  limitReachedBody:
    'Your account hit the daily AI spend limit. The limit resets at midnight UTC. Your knowledge is unchanged.',
  errorGeneric:
    "Trochia couldn't answer that just now. Try again, or contact support if this persists.",
} as const;

/** The discriminated answer-result state once the mutation settles. */
type ResultState =
  | { kind: 'idle' }
  | { kind: 'answer'; answer: QaAnswer }
  | { kind: 'limit-reached' }
  | { kind: 'error' };

/**
 * Detect the daily-cap HARD-block (OD-8). The router maps AI_DAILY_CAP_EXCEEDED
 * → `TRPCError { code: 'TOO_MANY_REQUESTS' }`. We match on the tRPC error's
 * `data.code` (the standard error-formatter shape) with a defensive fallback to
 * the HTTP status (429) — never on the message text. This returns a boolean
 * ONLY; no error content reaches state.
 */
function isCapExceeded(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const e = err as { data?: { code?: unknown; httpStatus?: unknown } | null };
  if (e.data?.code === 'TOO_MANY_REQUESTS') return true;
  if (e.data?.httpStatus === 429) return true;
  return false;
}

export function QaSidebar() {
  const trpc = useTRPC();

  const [query, setQuery] = React.useState('');
  const [result, setResult] = React.useState<ResultState>({ kind: 'idle' });

  const liveRegionRef = React.useRef<HTMLDivElement | null>(null);

  const askMutation = useMutation(
    trpc.qa.ask.mutationOptions({
      onSuccess: (answer) => {
        // `answer` is a QaAnswer — the router already stripped `debug` (P2-D).
        setResult({ kind: 'answer', answer });
      },
      onError: (err) => {
        // Branch the cap state BEFORE the generic error slot. NEVER log the
        // query/answer; NEVER surface the raw error. The cap path is a
        // distinct non-error state; everything else is the generic line.
        if (isCapExceeded(err)) {
          setResult({ kind: 'limit-reached' });
          return;
        }
        setResult({ kind: 'error' });
      },
    }),
  );

  const trimmed = query.trim();
  const canSubmit = trimmed.length >= 1 && trimmed.length <= 2000 && !askMutation.isPending;

  const onSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canSubmit) return;
    setResult({ kind: 'idle' });
    askMutation.mutate({ query: trimmed });
  };

  const isPending = askMutation.isPending;

  return (
    <aside
      aria-labelledby="qa-sidebar-heading"
      className="flex w-full flex-col gap-4 rounded-xl border border-stone bg-paper p-6"
      data-testid="qa-sidebar"
    >
      <div className="flex flex-col gap-1">
        <h2 id="qa-sidebar-heading" className="text-h4 text-ink">
          {COPY.heading}
        </h2>
        <p className="text-body-sm text-graphite">{COPY.helper}</p>
      </div>

      <form onSubmit={onSubmit} className="flex flex-col gap-3" noValidate>
        <label htmlFor="qa-sidebar-input" className="flex flex-col gap-2">
          <span className="sr-only">{COPY.inputLabel}</span>
          <textarea
            id="qa-sidebar-input"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={COPY.placeholder}
            maxLength={2000}
            className="min-h-24 w-full rounded-lg border border-stone bg-paper px-3 py-2 text-body-sm text-ink placeholder:text-graphite focus-visible:border-ink focus-visible:outline-none"
            data-testid="qa-sidebar-input"
          />
        </label>
        <div className="flex justify-end">
          <Button
            type="submit"
            variant="primary"
            size="compact"
            disabled={!canSubmit}
            data-testid="qa-sidebar-submit"
          >
            {isPending ? COPY.submitPending : COPY.submitIdle}
          </Button>
        </div>
      </form>

      {/* Live region — announces state transitions to screen readers. */}
      <div ref={liveRegionRef} className="sr-only" role="status" aria-live="polite">
        {isPending
          ? COPY.loadingBody
          : result.kind === 'answer'
            ? 'Answer ready.'
            : result.kind === 'limit-reached'
              ? COPY.limitReachedTitle
              : result.kind === 'error'
                ? COPY.errorGeneric
                : ''}
      </div>

      {/* ── State 1: loading ───────────────────────────────────────────── */}
      {isPending && (
        <div
          className="flex flex-col gap-2 rounded-lg border border-stone bg-paper p-4"
          data-testid="qa-sidebar-loading"
        >
          <p className="text-body-sm text-graphite">{COPY.loadingBody}</p>
          <p className="font-mono text-mono-sm text-graphite" aria-hidden>
            Grounding…
          </p>
        </div>
      )}

      {/* ── State 2 + 3: answer (grounded | i-dont-know) ───────────────── */}
      {!isPending && result.kind === 'answer' && (
        <div
          className={cn(
            'flex flex-col gap-3 rounded-lg border bg-paper p-4',
            result.answer.grounded ? 'border-stone' : 'border-stone bg-stone/20',
          )}
          data-testid={result.answer.grounded ? 'qa-sidebar-grounded' : 'qa-sidebar-idk'}
        >
          <p className="text-body-sm text-ink whitespace-pre-wrap">{result.answer.answer}</p>

          {result.answer.grounded && result.answer.citations.length > 0 && (
            <div className="flex flex-col gap-2">
              <span className="text-label uppercase tracking-wider text-graphite">
                {COPY.citationsLabel}
              </span>
              <div className="flex flex-wrap gap-2" data-testid="qa-sidebar-citations">
                {result.answer.citations.map((citation, i) => (
                  <CitationChip
                    key={`${citation.sourceId}-${citation.chunkIdx}-${i}`}
                    citation={citation}
                    index={i + 1}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── State 4: daily limit reached (OD-8 HARD-block) ─────────────── */}
      {!isPending && result.kind === 'limit-reached' && (
        <div
          className="flex flex-col gap-2 rounded-lg border border-warning bg-warning/10 p-4"
          role="status"
          data-testid="qa-sidebar-limit-reached"
        >
          <p className="text-body-sm font-medium text-ink">{COPY.limitReachedTitle}</p>
          <p className="text-body-sm text-graphite">{COPY.limitReachedBody}</p>
        </div>
      )}

      {/* ── Sibling error slot (non-cap failure) — generic, no raw error ── */}
      {!isPending && result.kind === 'error' && (
        <p
          className="text-body-sm text-danger"
          role="alert"
          data-testid="qa-sidebar-error"
        >
          {COPY.errorGeneric}
        </p>
      )}
    </aside>
  );
}
