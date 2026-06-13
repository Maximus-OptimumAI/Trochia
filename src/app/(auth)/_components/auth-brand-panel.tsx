import { Logo } from '@/components/brand/logo';
import { cn } from '@/lib/utils';

/**
 * Auth split-screen brand panel (AUTH-RESTYLE-01). The left column on md+; the
 * layout drops it below md (the form then renders as the centered card).
 *
 * Signal discipline (DESIGN.md §C7 / D1-B): this panel carries the ambient M1
 * halo only (one static radial, Signal <=6% over Paper). The halo is ambient,
 * NOT the Signal moment — the single moment on the page is the "Continue with
 * Google" pill on the form. No Signal text and no Signal button live here.
 * The halo is pure CSS with no animation, so it needs no reduced-motion path.
 */
export function AuthBrandPanel({ className }: { className?: string }) {
  return (
    <aside
      className={cn(
        'relative flex-col overflow-hidden bg-paper p-12 lg:p-16',
        className,
      )}
    >
      {/* M1 ambient Signal halo — one static radial, <=6% opacity over Paper. */}
      <div
        aria-hidden
        className="pointer-events-none absolute -top-32 -left-24 h-[640px] w-[820px] max-w-none rounded-full bg-radial from-signal/5 via-signal/[0.02] to-transparent to-70%"
      />

      <div className="relative">
        <Logo variant="lockup" height={40} href="/" />
      </div>

      <div className="relative flex flex-1 flex-col justify-center gap-4">
        <p className="max-w-md text-heading-lg text-ink">Your raise has an operator now.</p>
        <p className="max-w-md text-body text-graphite">
          Trochia drafts your outreach, matches investors, and tracks the round.
          Friends-and-family to Series A.
        </p>
      </div>
    </aside>
  );
}
