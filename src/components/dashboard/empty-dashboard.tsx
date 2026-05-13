import Link from 'next/link';

import { Logo } from '@/components/brand/logo';
import { Button } from '@/components/ui/button';

/**
 * EmptyDashboard (Plan 01-09 / FND-12, UI-SPEC §"/app (dashboard)").
 *
 * The empty-dashboard state shown above the FND-12 CTA cards when the founder
 * hasn't started Business Memory yet. Per the UI-SPEC:
 *   - 64px Mark icon
 *   - H3 "Welcome to Trochia"
 *   - body "Start by dropping your context into Business Memory. Everything
 *     else builds on it."
 *   - Primary `Button` "Start Business Memory" → `/app/memory`
 *   - centered, `max-w-md`
 *
 * Phase 1 always renders this state (`businesses` is not a Phase-1 table — D-03;
 * the real "no Business Memory yet" check arrives with Phase 2's Memory plan).
 * See the `// TODO(Phase 2):` marker in `src/app/(app)/app/page.tsx`.
 */
export function EmptyDashboard() {
  return (
    <div className="mx-auto flex max-w-md flex-col items-center gap-4 py-16 text-center">
      <Logo variant="mark" href={null} height={64} />
      <h2 className="text-h3 font-geist text-ink">Welcome to Trochia</h2>
      <p className="text-body text-graphite">
        Start by dropping your context into Business Memory. Everything else builds on it.
      </p>
      <Button variant="primary" className="mt-2" render={<Link href="/app/memory" />}>
        Start Business Memory
      </Button>
    </div>
  );
}
