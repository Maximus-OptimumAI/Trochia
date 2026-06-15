import Link from 'next/link';
import { Network, PhoneCall, Send, ArrowRight, type LucideIcon } from 'lucide-react';

import { Badge } from '@/components/ui/badge';

/**
 * Dashboard CTA cards (Plan 01-09 / FND-12, UI-SPEC §"/app (dashboard)").
 *
 * The three founder-facing action cards always visible on `/app`:
 *   - "Generate VC fit list"          → /app/pipeline   (Coming Phase 4)
 *   - "Prepare for an upcoming call"  → /app/live-raise (Coming Phase 5)
 *   - "Draft outreach"                → /app/pipeline   (Coming Phase 4)
 *
 * Per the UI-SPEC: each card is a `secondary`-variant Card (1px stone border,
 * no shadow) that links to its (Phase-2/4/5) destination with a `text-mono-sm`
 * "Coming Phase N" Badge where the destination isn't built yet. NEVER disabled
 * with no affordance — every card always leads somewhere, even if the
 * destination is itself a "coming in Phase N" placeholder.
 *
 * No `signal` accent on this surface (the empty-dashboard CTA "Start Business
 * Memory" or the page's primary action holds the one-accent-per-surface slot;
 * these cards are secondary affordances).
 */
type CtaCard = {
  title: string;
  description: string;
  href: string;
  phase: string;
  icon: LucideIcon;
};

const CARDS: CtaCard[] = [
  {
    title: 'Generate VC fit list',
    description:
      'Trochia matches VCs from your Business Memory and ranks them by fit and warm-intro path.',
    href: '/app/pipeline',
    phase: 'Coming Phase 4',
    icon: Network,
  },
  {
    title: 'Prepare for an upcoming call',
    description:
      'Trochia drafts a pre-call brief: the firm, the partner, the thesis fit, the open questions.',
    href: '/app/live-raise',
    phase: 'Coming Phase 5',
    icon: PhoneCall,
  },
  {
    title: 'Draft outreach',
    description:
      'Trochia drafts the outreach email for founder approval — your voice, the right detail, ready to send.',
    href: '/app/pipeline',
    phase: 'Coming Phase 4',
    icon: Send,
  },
];

export function CtaCards() {
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
      {CARDS.map((card) => {
        const Icon = card.icon;
        return (
          <Link
            key={card.title}
            href={card.href}
            className="group relative flex flex-col gap-4 rounded-xl border border-stone bg-paper p-8 text-body text-ink transition-colors duration-150 hover:border-ink/20"
          >
            <span className="absolute right-6 top-6">
              <Badge variant="phase">{card.phase}</Badge>
            </span>
            <Icon className="size-5 text-ink" aria-hidden strokeWidth={1.5} />
            <div className="flex flex-col gap-2">
              <h3 className="text-h4 font-geist text-ink">{card.title}</h3>
              <p className="text-body-sm text-graphite">{card.description}</p>
            </div>
            <span className="mt-auto inline-flex items-center gap-1 text-body-sm font-medium text-ink transition-colors group-hover:text-ink">
              Open
              <ArrowRight className="size-4" aria-hidden />
            </span>
          </Link>
        );
      })}
    </div>
  );
}
