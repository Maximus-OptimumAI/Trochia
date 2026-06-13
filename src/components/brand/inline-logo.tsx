import Link from 'next/link';
import { cn } from '@/lib/utils';

/**
 * Logo — the Trochia mark + wordmark as INLINE SVG (founder spec, Phase A).
 * Replaces the flat-<img> lockup on marketing surfaces; the mark (<g>) and the
 * wordmark (<text>) are separable via `variant`.
 *
 * Brand rules (docs/BRAND.md):
 *   - Colors via tokens only: arc/stem/wordmark = ink, node = signal
 *     (the source hex #0A0E1A / #F25C2A maps to var(--color-ink) /
 *     var(--color-signal) — no hardcoded hex).
 *   - Wordmark at Geist 700 — the sanctioned wordmark weight (BRAND v1.1 bans
 *     600+ on display/headings; 700 is wordmark-only).
 *   - No stretch / recolor / rotation / effects.
 *
 * Entrance (`animate` prop): a single one-time settle of the Signal node onto
 * its arc (τροχιά = trajectory/orbit) — 700ms ease-out via the
 * `animate-node-settle` utility, then fully static. NO perpetual loop
 * (decorative motion is canon-banned, and a forever-moving node would compete
 * with the CTA's Signal moment). `prefers-reduced-motion` collapses it to
 * instant via the globals.css kill-switch. CSS-only: runs once per full page
 * load; client-side navigation keeps the layout mounted so it never replays.
 */
type LogoVariant = 'lockup' | 'mark';

/* Source geometry (founder-provided): mark viewBox region 0..120 after the
 * translate(8,8) scale(0.469) transform; full lockup viewBox 460x140. */
const VIEWBOX: Record<LogoVariant, string> = {
  lockup: '0 0 460 140',
  mark: '0 0 120 140',
};

const RATIO: Record<LogoVariant, number> = {
  lockup: 460 / 140,
  mark: 120 / 140,
};

export function Logo({
  variant = 'lockup',
  href = '/',
  height = 36,
  animate = false,
  className,
}: {
  variant?: LogoVariant;
  /** Pass `null` to render without a link (e.g. inside the footer mark line). */
  href?: string | null;
  height?: number;
  /** One-time node-settle entrance on first load (marketing nav only). */
  animate?: boolean;
  className?: string;
}) {
  const svg = (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox={VIEWBOX[variant]}
      role="img"
      aria-label="Trochia logo"
      height={height}
      width={Math.round(height * RATIO[variant])}
      className={cn('block select-none', className)}
    >
      <title>Trochia</title>
      <g transform="translate(8, 8) scale(0.469)">
        <path
          d="M 50 88 A 78 42 0 0 0 206 88"
          stroke="var(--color-ink)"
          strokeWidth="24"
          strokeLinecap="round"
          fill="none"
        />
        <line
          x1="128"
          y1="88"
          x2="128"
          y2="200"
          stroke="var(--color-ink)"
          strokeWidth="24"
          strokeLinecap="round"
        />
        <circle
          cx="128"
          cy="46"
          r="18"
          fill="var(--color-signal)"
          className={animate ? 'animate-node-settle' : undefined}
        />
      </g>
      {variant === 'lockup' && (
        <text
          x="148"
          y="92"
          fontFamily="var(--font-geist), Inter, system-ui, sans-serif"
          fontSize="64"
          fontWeight="700"
          letterSpacing="-1.6"
          fill="var(--color-ink)"
        >
          Trochia
        </text>
      )}
    </svg>
  );

  if (href === null) return svg;
  return (
    <Link href={href} aria-label="Trochia home" className="inline-flex items-center">
      {svg}
    </Link>
  );
}
