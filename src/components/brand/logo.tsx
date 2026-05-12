import Link from 'next/link';
import { cn } from '@/lib/utils';

/**
 * Logo — the Trochia mark / lockup, rendered from the static SVG assets in
 * public/brand/ (never re-drawn, never recolored — the signal node stays
 * #F25C2A; no shadow / glow / gradient / bevel / rotation; never reset inside a
 * circle — use social-square.svg for that case).
 *
 * Clear-space rule: the surrounding margin equals the height of the mark's
 * signal node (~the mark's stroke width). We bake a small padding box around
 * the asset so callers don't have to.
 *
 * Variants:
 *   - "lockup" (default) → horizontal mark + wordmark, links to `/`
 *   - "mark"             → the T-Orbit mark only (square), links to `/`
 */
type LogoVariant = 'lockup' | 'mark';

const ASSETS: Record<LogoVariant, { src: string; ratio: string; defaultHeight: number }> = {
  lockup: { src: '/brand/lockup-horizontal.svg', ratio: '460 / 140', defaultHeight: 28 },
  mark: { src: '/brand/mark-color.svg', ratio: '1 / 1', defaultHeight: 32 },
};

export function Logo({
  variant = 'lockup',
  href = '/',
  height,
  className,
  priority,
}: {
  variant?: LogoVariant;
  /** Pass `null` to render without a link (e.g. inside the footer mark line). */
  href?: string | null;
  height?: number;
  className?: string;
  priority?: boolean;
}) {
  const asset = ASSETS[variant];
  const h = height ?? asset.defaultHeight;

  const img = (
    // eslint-disable-next-line @next/next/no-img-element -- static brand SVG, intrinsic ratio, no Image optimization needed
    <img
      src={asset.src}
      alt="Trochia"
      height={h}
      style={{ height: h, aspectRatio: asset.ratio, width: 'auto' }}
      className="block select-none"
      {...(priority ? { fetchPriority: 'high' as const } : {})}
    />
  );

  const wrapped = <span className={cn('inline-flex items-center p-1', className)}>{img}</span>;

  if (href === null) return wrapped;
  return (
    <Link href={href} aria-label="Trochia — home" className="inline-flex items-center">
      {wrapped}
    </Link>
  );
}
