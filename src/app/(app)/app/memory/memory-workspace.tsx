'use client';

import * as React from 'react';
import { useQuery } from '@tanstack/react-query';

import { PasteFlow } from '@/app/(app)/onboarding/import/paste/paste-flow';
import type { BusinessMemoryDraft } from '@/ai/schemas/business-memory.zod';
import { SkeletonBlock } from '@/components/primitives/skeleton-block';
import { Button } from '@/components/ui/button';
import { useTRPC } from '@/lib/trpc-client';

/**
 * `<MemoryWorkspace/>` — the client island behind `/app/memory` (MEMORY-NAV-
 * WIRING-01). Replaces the Plan-01-09 "coming in Phase 2" stub: `/app/memory`
 * now serves the REAL Business Memory experience for both first-time and
 * returning founders, reusing the Plan-02-02 paste→confirm→save flow.
 *
 * Branches off `memory.getDraft` (one row per tenant):
 *   - no row                     → `<PasteFlow mode="app" />` (start at paste)
 *   - row, `confirmedAt === null` → `<PasteFlow mode="app" initialDraft={…} />`
 *                                   (resume confirming the existing draft here)
 *   - row, confirmed             → read-only confirmed view + "Update Business
 *                                   Memory" (re-import) affordance
 *
 * Minimal by design (first post-launch patch): the confirmed view is read-only;
 * full inline field editing of a confirmed memory is a future plan. Extracting a
 * shared paste→confirm→save core out of `PasteFlow` is FOLLOWUP-MEMORY-SHARED-
 * CORE-01 — for now app mode reuses `PasteFlow` via the `mode` prop.
 *
 * Voice (BRAND.md): Trochia drafts / cites / tracks. Brand tokens only.
 */

/** The subset of the `business_memory` row this surface reads. */
interface MemoryRow {
  companyName: string | null;
  oneLiner: string | null;
  sector: string | null;
  stage: string | null;
  geography: string | null;
  incorporationStatus: string | null;
  foundingDate: string | Date | null;
  team: unknown;
  traction: unknown;
  narrative: unknown;
  provenance: unknown;
  confirmedAt: string | Date | null;
}

/** Map a persisted row → the `BusinessMemoryDraft` shape `PasteFlow` confirms. */
function rowToDraft(row: MemoryRow): BusinessMemoryDraft {
  return {
    companyName: row.companyName ?? undefined,
    oneLiner: row.oneLiner ?? undefined,
    sector: row.sector ?? undefined,
    stage: row.stage ?? undefined,
    geography: row.geography ?? undefined,
    incorporationStatus: row.incorporationStatus ?? undefined,
    // jsonb provenance stores ISO strings; the column is a timestamp → normalize
    // to an ISO string (the schema's `foundingDate` is `z.iso.datetime()`).
    foundingDate: row.foundingDate ? new Date(row.foundingDate).toISOString() : undefined,
    team: (row.team as BusinessMemoryDraft['team']) ?? undefined,
    traction: (row.traction as BusinessMemoryDraft['traction']) ?? undefined,
    narrative: (row.narrative as BusinessMemoryDraft['narrative']) ?? undefined,
    provenance: (row.provenance as BusinessMemoryDraft['provenance']) ?? {},
  };
}

const CONFIRMED_FIELDS: Array<{ key: keyof MemoryRow; label: string }> = [
  { key: 'companyName', label: 'Company name' },
  { key: 'oneLiner', label: 'One-liner' },
  { key: 'sector', label: 'Sector' },
  { key: 'stage', label: 'Stage' },
  { key: 'geography', label: 'Geography' },
  { key: 'incorporationStatus', label: 'Incorporation status' },
];

function ConfirmedView({ row, onReimport }: { row: MemoryRow; onReimport: () => void }) {
  const populated = CONFIRMED_FIELDS.filter(
    (f) => typeof row[f.key] === 'string' && (row[f.key] as string).length > 0,
  );
  return (
    <section className="flex w-full flex-col gap-6" data-testid="memory-confirmed-view">
      <header className="flex flex-col gap-2">
        <h2 className="text-h3 text-ink">Business Memory confirmed</h2>
        <p className="text-body text-graphite">
          Trochia reads this confirmed record across every module. Re-import to refresh it from a
          new paste.
        </p>
      </header>

      <dl className="flex flex-col divide-y divide-stone rounded-xl border border-stone bg-paper">
        {populated.map((f) => (
          <div key={String(f.key)} className="flex flex-col gap-1 px-4 py-3 sm:flex-row sm:gap-6">
            <dt className="text-label uppercase tracking-wider text-graphite sm:w-48">{f.label}</dt>
            <dd className="text-body text-ink">{row[f.key] as string}</dd>
          </div>
        ))}
      </dl>

      <div className="flex">
        <Button variant="secondary" onClick={onReimport} data-testid="memory-reimport">
          Update Business Memory
        </Button>
      </div>
    </section>
  );
}

export function MemoryWorkspace() {
  const trpc = useTRPC();
  const draftQuery = useQuery(trpc.memory.getDraft.queryOptions());
  const [reimport, setReimport] = React.useState(false);

  if (draftQuery.isLoading) {
    return (
      <div className="flex w-full flex-col gap-4" data-testid="memory-loading">
        <SkeletonBlock className="h-8 w-64" />
        <SkeletonBlock className="h-40 w-full" />
        <SkeletonBlock className="h-40 w-full" />
      </div>
    );
  }

  if (draftQuery.isError) {
    return (
      <section className="flex w-full flex-col gap-4" data-testid="memory-error">
        <h2 className="text-h3 text-ink">Trochia couldn&apos;t load your Business Memory</h2>
        <p className="text-body text-graphite">Try again, or contact support if this persists.</p>
        <div className="flex">
          <Button variant="primary" onClick={() => draftQuery.refetch()}>
            Try again
          </Button>
        </div>
      </section>
    );
  }

  const row = (draftQuery.data as MemoryRow | null) ?? null;

  // Re-import requested, or no row yet → start the paste flow in app mode.
  if (reimport || !row) return <PasteFlow mode="app" />;

  // Unconfirmed draft exists → resume confirming it here (no re-paste needed).
  if (row.confirmedAt == null) return <PasteFlow mode="app" initialDraft={rowToDraft(row)} />;

  // Confirmed → read-only summary + re-import affordance.
  return <ConfirmedView row={row} onReimport={() => setReimport(true)} />;
}
