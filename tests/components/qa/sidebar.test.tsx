// @vitest-environment jsdom
/**
 * `<QaSidebar/>` component tests (Plan 02-07 / T04 — KNW-05c).
 *
 * The FOUR visually-distinct states, plus the privacy + voice + no-hardcoded-URL
 * invariants Code Reviewer would otherwise catch by eye:
 *
 *   1. loading            — the pending affordance while `qa.ask` is in flight.
 *   2. grounded-with-chips — the synthesized answer + `<CitationChip/>`s.
 *   3. "I don't know"      — the deterministic refusal (answer.grounded === false).
 *   4. "daily limit reached" — the OD-8 HARD-block state on TOO_MANY_REQUESTS,
 *                              rendering the EXACT copy 'Daily AI limit reached —
 *                              resets at midnight UTC' as a non-fabricated,
 *                              non-error state.
 *
 * tRPC is MOCKED (guardrail #6 — no real Opus/Voyage call). `useMutation` is
 * stubbed via a module-level controller so each test drives onSuccess / onError /
 * isPending deterministically; `useTRPC` is stubbed to a no-op options proxy.
 *
 * ## Playwright e2e skip-gate (consistent with prior plans)
 *
 * A `/qa` real-browser pass (authed) is locally-skipped pending the test-user-
 * mint helper (same posture as tests/e2e/onboarding-paste.spec.ts). The merge-
 * gate UI check is captured in 02-07-SUMMARY.md § "Merge-gate UI check"; these
 * component tests are the gate this pass.
 */
import '@testing-library/jest-dom/vitest';
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent, act } from '@testing-library/react';

import type { QaAnswer } from '@/ai/schemas/qa-answer.zod';

// ─── tRPC + react-query mock harness ─────────────────────────────────────────
//
// A module-level controller the tests drive. `useMutation` (mocked below)
// returns `{ mutate, isPending }` wired to this controller; calling `mutate`
// stashes the input + lets the test invoke the captured onSuccess / onError.

type MutationOpts = {
  onSuccess?: (data: unknown) => void;
  onError?: (err: unknown) => void;
};

const controller = {
  opts: null as MutationOpts | null,
  isPending: false,
  lastInput: null as unknown,
};

vi.mock('@/lib/trpc-client', () => ({
  // The options proxy: `trpc.qa.ask.mutationOptions(o)` just returns `o` so the
  // mocked `useMutation` receives the real onSuccess/onError closures.
  useTRPC: () => ({
    qa: {
      ask: {
        mutationOptions: (o: MutationOpts) => o,
      },
    },
  }),
}));

vi.mock('@tanstack/react-query', () => ({
  useMutation: (opts: MutationOpts) => {
    controller.opts = opts;
    return {
      mutate: (input: unknown) => {
        controller.lastInput = input;
      },
      isPending: controller.isPending,
    };
  },
}));

// Imported AFTER the mocks are registered.
import { QaSidebar } from '@/components/qa/sidebar';

const EXACT_CAP_COPY = 'Daily AI limit reached — resets at midnight UTC';

function groundedAnswer(): QaAnswer {
  return {
    answer: 'Last quarter you reported $42k MRR, up 18% from the prior quarter.',
    citations: [
      { sourceType: 'memory', sourceId: 'mem-1', chunkIdx: 0 },
      { sourceType: 'corpus', sourceId: 'doc-7', chunkIdx: 2 },
    ],
    grounded: true,
  };
}

function iDontKnowAnswer(): QaAnswer {
  return {
    answer:
      "I don't have that in your knowledge base yet. Confirm more of your business memory, pipeline, or narrative — then ask again, and I will answer from your own data with citations.",
    citations: [],
    grounded: false,
  };
}

/** Type a question and submit so the captured onSuccess/onError can fire. */
function ask(question = 'What did we report for traction?') {
  fireEvent.change(screen.getByTestId('qa-sidebar-input'), {
    target: { value: question },
  });
  fireEvent.click(screen.getByTestId('qa-sidebar-submit'));
}

/** Drive the captured onSuccess inside act() so the state update flushes. */
function settleSuccess(answer: QaAnswer) {
  act(() => {
    controller.opts?.onSuccess?.(answer);
  });
}

/** Drive the captured onError inside act() so the state update flushes. */
function settleError(err: unknown) {
  act(() => {
    controller.opts?.onError?.(err);
  });
}

beforeEach(() => {
  controller.opts = null;
  controller.isPending = false;
  controller.lastInput = null;
});
afterEach(cleanup);

describe('QaSidebar', () => {
  it('renders the loading affordance while the mutation is pending', () => {
    controller.isPending = true;
    render(<QaSidebar />);
    expect(screen.getByTestId('qa-sidebar-loading')).toBeInTheDocument();
    // The submit button shows the operator-voice pending copy + is disabled.
    const submit = screen.getByTestId('qa-sidebar-submit');
    expect(submit).toBeDisabled();
    expect(submit).toHaveTextContent('Trochia is answering…');
  });

  it('renders the grounded answer with citation chips (each tracing a source)', () => {
    render(<QaSidebar />);
    ask();
    // Drive the captured onSuccess with a grounded answer.
    settleSuccess(groundedAnswer());
    const grounded = screen.getByTestId('qa-sidebar-grounded');
    expect(grounded).toBeInTheDocument();
    expect(grounded).toHaveTextContent('$42k MRR');
    const chips = screen.getAllByTestId('qa-citation-chip');
    expect(chips).toHaveLength(2);
    // codex#6: memory chips link to a RELATIVE in-app route (/app/memory); corpus
    // chips render UNLINKED (no href, no <a>) because /app/corpus does not exist
    // yet — no 404. Each chip carries its source-type for this assertion.
    const memoryChip = chips.find((c) => c.getAttribute('data-source-type') === 'memory')!;
    const corpusChip = chips.find((c) => c.getAttribute('data-source-type') === 'corpus')!;
    // Memory chip: a real link to a relative /app/ route (no hardcoded URL).
    const memHref = memoryChip.getAttribute('href') ?? '';
    expect(memoryChip.tagName).toBe('A');
    expect(memHref.startsWith('/app/memory')).toBe(true);
    expect(memHref).not.toMatch(/https?:\/\//);
    // Corpus chip: NOT a link — a <span> with no href, until /app/corpus ships.
    expect(corpusChip.tagName).toBe('SPAN');
    expect(corpusChip.getAttribute('href')).toBeNull();
    // The IDK / limit / error states are NOT shown.
    expect(screen.queryByTestId('qa-sidebar-idk')).toBeNull();
    expect(screen.queryByTestId('qa-sidebar-limit-reached')).toBeNull();
  });

  it('renders the "I don\'t know" refusal with no citation chips (grounded:false)', () => {
    render(<QaSidebar />);
    ask();
    settleSuccess(iDontKnowAnswer());
    const idk = screen.getByTestId('qa-sidebar-idk');
    expect(idk).toBeInTheDocument();
    expect(idk).toHaveTextContent("I don't have that in your knowledge base yet");
    // No chips on a refusal — never a body backed by a fabricated citation.
    expect(screen.queryAllByTestId('qa-citation-chip')).toHaveLength(0);
    expect(screen.queryByTestId('qa-sidebar-citations')).toBeNull();
  });

  it('renders the daily-limit state with the EXACT OD-8 copy on TOO_MANY_REQUESTS (non-fabricated)', () => {
    render(<QaSidebar />);
    ask();
    // The router maps AI_DAILY_CAP_EXCEEDED → TRPCError TOO_MANY_REQUESTS; the
    // tRPC client surfaces `{ data: { code, httpStatus } }`.
    settleError({
      data: { code: 'TOO_MANY_REQUESTS', httpStatus: 429 },
      message: 'Daily AI limit reached — resets at midnight UTC.',
    });
    const limit = screen.getByTestId('qa-sidebar-limit-reached');
    expect(limit).toBeInTheDocument();
    // EXACT copy present.
    expect(limit).toHaveTextContent(EXACT_CAP_COPY);
    // It is NOT a fabricated answer + NOT the generic error slot.
    expect(screen.queryByTestId('qa-sidebar-grounded')).toBeNull();
    expect(screen.queryByTestId('qa-sidebar-idk')).toBeNull();
    expect(screen.queryByTestId('qa-sidebar-error')).toBeNull();
  });

  it('renders a GENERIC error (never the raw error/query) on a non-cap failure', () => {
    render(<QaSidebar />);
    ask();
    settleError({
      data: { code: 'INTERNAL_SERVER_ERROR', httpStatus: 500 },
      message: 'Q&A synthesis failed.',
    });
    const err = screen.getByTestId('qa-sidebar-error');
    expect(err).toBeInTheDocument();
    expect(err).toHaveTextContent("Trochia couldn't answer that just now");
    // The limit-reached state must NOT fire on a non-cap error.
    expect(screen.queryByTestId('qa-sidebar-limit-reached')).toBeNull();
  });

  it('uses operator voice — no banned "help/want/feel/love" verbs, no hardcoded site URLs', () => {
    const { container } = render(<QaSidebar />);
    ask();
    settleSuccess(groundedAnswer());
    const text = container.textContent ?? '';
    // Operator-voice ban (docs/BRAND.md): Trochia does not help/want/feel/love.
    expect(text).not.toMatch(/\bhelps?\b/i);
    expect(text).not.toMatch(/\bwants?\b/i);
    expect(text).not.toMatch(/\bfeels?\b/i);
    expect(text).not.toMatch(/\bloves?\b/i);
    // No hardcoded site URL anywhere in the rendered markup.
    expect(container.innerHTML).not.toMatch(/https?:\/\/(trochia|localhost)/i);
  });

  it('forwards only { query } to the mutation (the trimmed question)', () => {
    render(<QaSidebar />);
    ask('  spaced question  ');
    expect(controller.lastInput).toEqual({ query: 'spaced question' });
  });
});
