import Link from 'next/link';

import { Logo } from '@/components/brand/logo';
import { Button } from '@/components/ui/button';

/**
 * MemorySummaryCard (fix/ui-bundle / C3).
 *
 * Shown on `/app` once the founder has a CONFIRMED `business_memory` row
 * (`confirmed_at` stamped) — it replaces the EmptyDashboard "Start Business
 * Memory" onboarding CTA, which otherwise kept showing even after confirmation.
 *
 * Mirrors EmptyDashboard's centered layout deliberately (same container, mark,
 * primary button). The design-adoption cycle owns the richer summary; this is
 * the minimal confirmed state: the mark, a confirmed line, and a link into the
 * memory workspace. Voice is operator-grade (docs/BRAND.md) — Trochia tracks and
 * reads memory; it does not help/want/feel.
 */
export function MemorySummaryCard({ companyName }: { companyName?: string | null }) {
  return (
    <div className="mx-auto flex max-w-md flex-col items-center gap-4 py-16 text-center">
      <Logo variant="mark" href={null} height={64} />
      <h2 className="text-h3 font-geist text-ink">
        {companyName ? `${companyName}: Business Memory` : 'Business Memory'}
      </h2>
      <p className="text-body text-graphite">
        Your Business Memory is confirmed. Every module reads from it.
      </p>
      <Button variant="primary" className="mt-2" render={<Link href="/app/memory" />}>
        View workspace
      </Button>
    </div>
  );
}
