'use client';

import * as React from 'react';
import Link from 'next/link';

import type { QaCitation } from '@/ai/schemas/qa-answer.zod';
import { cn } from '@/lib/utils';

/**
 * `<CitationChip/>` — a single inline citation under a grounded Q&A answer
 * (Phase 2 / KNW-05c). Trochia CITES the founder's own confirmed knowledge;
 * each chip traces a claim back to its source surface so the founder can verify.
 *
 * ## Routing (no hardcoded URLs)
 *
 * A citation's `sourceType` maps to an in-app route. These are RELATIVE app
 * paths (`/app/memory`, `/app/pipeline`) — inherently env-agnostic, so no
 * `process.env.NEXT_PUBLIC_*` site-URL literal is interpolated and no absolute
 * scheme-and-host literal appears anywhere. The `sourceId` rides as a `?ref=`
 * query param so the destination surface can scroll/highlight the cited record
 * (the destination wires that in its own plan; the chip only ever produces a
 * relative href).
 *
 * Voice (docs/BRAND.md): operator register. The chip labels the SOURCE, never
 * editorializes — "Memory", "Corpus". No "helps", "wants", "feels".
 *
 * a11y + motion: the chip is a real `<Link>` (keyboard-focusable, descriptive
 * aria-label). The hover/focus transition is `motion-reduce:transition-none`
 * so `prefers-reduced-motion: reduce` users get no animation
 * (docs/DESIGN-REFERENCE.md § Reduced motion).
 */

/** Human-readable, operator-voice label per source type. */
const SOURCE_LABEL: Record<QaCitation['sourceType'], string> = {
  memory: 'Memory',
  corpus: 'Corpus',
};

/**
 * Map a citation's source type to its in-app destination route, or `null` when
 * no route exists yet. RELATIVE paths ONLY — never a hardcoded site URL. The
 * `sourceId` rides as a `ref` query param so the destination can locate the
 * cited record.
 *
 * codex#6: `/app/corpus` does not exist (only /app/memory, /app/pipeline) —
 * corpus citations returned `null` and render UNLINKED until that route exists,
 * so we never produce a 404 chip.
 */
function citationHref(citation: QaCitation): string | null {
  if (citation.sourceType !== 'memory') return null;
  const params = new URLSearchParams({ ref: citation.sourceId });
  return `/app/memory?${params.toString()}`;
}

export interface CitationChipProps {
  citation: QaCitation;
  /** 1-based display index for the chip label (e.g. "Memory · 1"). */
  index: number;
  className?: string;
}

export function CitationChip({ citation, index, className }: CitationChipProps) {
  const label = SOURCE_LABEL[citation.sourceType];
  const href = citationHref(citation);

  const inner = (
    <>
      <span aria-hidden>{label}</span>
      <span aria-hidden className="text-graphite/60">
        ·
      </span>
      <span aria-hidden>{index}</span>
    </>
  );

  // codex#6: when no route exists (corpus, until /app/corpus ships) render a
  // non-interactive <span> with the same visual classes — no hover/focus link
  // affordances, no <Link>, no 404. Memory keeps the real <Link>.
  if (href === null) {
    return (
      <span
        className={cn(
          'inline-flex items-center gap-1 rounded-md border border-stone bg-paper px-2 py-0.5',
          'font-mono text-mono-sm text-graphite',
          className,
        )}
        aria-label={`Source: ${label}, citation ${index}`}
        data-testid="qa-citation-chip"
        data-source-type={citation.sourceType}
      >
        {inner}
      </span>
    );
  }

  return (
    <Link
      href={href}
      className={cn(
        'inline-flex items-center gap-1 rounded-md border border-stone bg-paper px-2 py-0.5',
        'font-mono text-mono-sm text-graphite',
        'transition-colors duration-150 motion-reduce:transition-none',
        'hover:border-ink/30 hover:text-ink focus-visible:border-ink focus-visible:text-ink focus-visible:outline-none',
        className,
      )}
      aria-label={`Source: ${label}, citation ${index}`}
      data-testid="qa-citation-chip"
      data-source-type={citation.sourceType}
    >
      {inner}
    </Link>
  );
}
