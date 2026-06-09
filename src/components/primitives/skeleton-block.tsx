import { cn } from '@/lib/utils';

/**
 * SkeletonBlock — neutral loading placeholder (`bg-stone/60 animate-pulse`).
 * Size it via className to match the content it stands in for. No spinner —
 * spinners are not the primary loading affordance for full-page loads.
 *
 * CSS-only pulse on the `stone` brand token; `motion-reduce:animate-none`
 * honors `prefers-reduced-motion` (the pulse stops, the static fill stays).
 */
export function SkeletonBlock({ className }: { className?: string }) {
  return (
    <div
      aria-hidden
      className={cn(
        'animate-pulse rounded-lg bg-stone/60 motion-reduce:animate-none',
        className ?? 'h-4 w-full',
      )}
    />
  );
}
