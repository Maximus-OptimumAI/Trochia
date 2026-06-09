import { cn } from '@/lib/utils';

import { SkeletonBlock } from './skeleton-block';

/**
 * SkeletonCard — a card-shaped loading placeholder (memory-answerable / T4c):
 * an avatar circle + a short title line + N body lines, on a bordered paper
 * card. Composes `SkeletonBlock`, so the CSS-only pulse and the
 * `prefers-reduced-motion` opt-out come for free (no JS animation library).
 *
 * Brand tokens only: `stone` (#ECEAE3) fill via SkeletonBlock, `paper`
 * background, `stone` hairline border. Decorative → `aria-hidden`; pair it with
 * a visually-hidden `role="status"` live region on the surface that renders it.
 */
export function SkeletonCard({
  className,
  lines = 3,
}: {
  className?: string;
  /** Number of body lines under the title (default 3). */
  lines?: number;
}) {
  return (
    <div
      aria-hidden
      data-testid="skeleton-card"
      className={cn('flex w-full gap-4 rounded-xl border border-stone bg-paper p-4', className)}
    >
      <SkeletonBlock className="h-10 w-10 shrink-0 rounded-full" />
      <div className="flex flex-1 flex-col gap-2 pt-1">
        <SkeletonBlock className="h-4 w-1/3" />
        {Array.from({ length: Math.max(1, lines) }).map((_, i) => (
          <SkeletonBlock key={i} className={cn('h-3', i === lines - 1 ? 'w-2/3' : 'w-full')} />
        ))}
      </div>
    </div>
  );
}
