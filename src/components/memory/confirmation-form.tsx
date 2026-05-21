'use client';

import * as React from 'react';
import { useForm, Controller, type Control } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';

import {
  businessMemoryConfirmedSchema,
  type BusinessMemoryConfirmed,
  type BusinessMemoryDraft,
  type Provenance,
  type ProvenanceField,
} from '@/ai/schemas/business-memory.zod';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

import {
  ConfirmationCard,
  type ConfirmationStatus,
  type ConfirmationValue,
} from './confirmation-card';

/**
 * Confirmation Form — Plan 02-02 / KNW-02b.
 *
 * Owns the form state for the founder-facing per-field confirmation flow.
 * Wraps `react-hook-form` with `zodResolver(businessMemoryConfirmedSchema)`,
 * renders one `<ConfirmationCard>` per populated field of the draft, and
 * commits the final `BusinessMemoryConfirmed` shape via `props.onSubmit`.
 *
 * The form is intentionally NOT wired to a server action here — Task 8 mounts
 * this component inside the paste-flow client and passes a `tRPC.confirmDraft`
 * mutation handler. Keeping the boundary clean lets this component be
 * exercised in isolation (Task 10 Playwright spec + future unit tests).
 *
 * Field rendering:
 *   - The 7 top-level scalars (companyName, oneLiner, sector, stage, geography,
 *     incorporationStatus, foundingDate) each render one card.
 *   - Nested leaves under `team.founders[*]`, `traction.*`, `narrative.*` each
 *     render one card. Field keys use dot-paths (`traction.mrr`) and
 *     `founders[0].name`-style paths for arrays.
 *   - Only POPULATED fields render — a field absent from `initialDraft` does
 *     not get a card. The extractor decides what to surface; founders edit /
 *     confirm / reject what is surfaced.
 *
 * Submit gating:
 *   - `Save and continue` is disabled until every populated field is in a
 *     terminal state (`confirmed`, `edited`, or `rejected`) — pending fields
 *     block the submit so a founder cannot accidentally ship a half-reviewed
 *     Business Memory. The summary line above the button shows the running
 *     count, satisfying the plan's "8 confirmed · 1 edited · …" pattern.
 *
 * Brand-token discipline:
 *   - Tokens-only Tailwind. No raw hex, no new fonts. Voice held: Trochia
 *     drafts / cites / tracks. No "we", "I", "happy", "love", "feel", "want",
 *     "help", "hope", or emoji in any visible string.
 */

// ─── Operator-voice copy (the ONLY visible strings this form renders) ─────
const COPY = {
  heading: 'Confirm your Business Memory',
  subhead:
    'Trochia drafted these fields from your paste. Edit, confirm, or reject each. Confirmed values are the source of truth for every later module.',
  summaryConfirmed: 'confirmed',
  summaryEdited: 'edited',
  summaryRejected: 'rejected',
  summaryPending: 'pending',
  submit: 'Save and continue',
  submitting: 'Saving…',
  submitDisabledHint: 'Confirm, edit, or reject every drafted field before saving.',
  errorBanner: 'Some fields are invalid. Review the cards flagged below.',
} as const;

// ─── Field rendering metadata ─────────────────────────────────────────────

interface FieldDescriptor {
  /** Dot-pathed key (used as form name + provenance lookup). */
  key: string;
  /** Human-readable label. */
  label: string;
  /** Current draft value at this path. */
  value: ConfirmationValue;
}

/** Top-level scalar columns on `business_memory` — the LOCKED column set. */
const TOP_LEVEL_SCALAR_FIELDS: Array<{
  key: keyof BusinessMemoryDraft;
  label: string;
}> = [
  { key: 'companyName', label: 'Company name' },
  { key: 'oneLiner', label: 'One-liner' },
  { key: 'sector', label: 'Sector' },
  { key: 'stage', label: 'Stage' },
  { key: 'geography', label: 'Geography' },
  { key: 'incorporationStatus', label: 'Incorporation status' },
  { key: 'foundingDate', label: 'Founding date' },
];

const TRACTION_LABELS: Record<string, string> = {
  mrr: 'MRR',
  arr: 'ARR',
  currency: 'Currency',
  customers: 'Customers',
  growth: 'Growth',
  runway: 'Runway',
  valuation: 'Valuation',
  burn: 'Burn',
};

const NARRATIVE_LABELS: Record<string, string> = {
  problem: 'Problem',
  solution: 'Solution',
  why_now: 'Why now',
  why_us: 'Why us',
};

function isPrimitive(v: unknown): v is string | number | null | undefined {
  return v === null || v === undefined || typeof v === 'string' || typeof v === 'number';
}

/**
 * Collect the populated fields from the draft into a flat list of
 * dot-pathed descriptors. Returns deterministic order: top-level scalars
 * first, then founders, then traction leaves, then narrative leaves.
 */
function collectFields(draft: BusinessMemoryDraft): FieldDescriptor[] {
  const out: FieldDescriptor[] = [];
  for (const { key, label } of TOP_LEVEL_SCALAR_FIELDS) {
    const value = draft[key];
    if (typeof value === 'string' && value.length > 0) {
      out.push({ key: String(key), label, value });
    }
  }
  if (draft.team?.founders && Array.isArray(draft.team.founders)) {
    draft.team.founders.forEach((founder, idx) => {
      if (founder?.name) {
        out.push({
          key: `team.founders.${idx}.name`,
          label: `Founder ${idx + 1} — name`,
          value: founder.name,
        });
      }
      if (founder?.role) {
        out.push({
          key: `team.founders.${idx}.role`,
          label: `Founder ${idx + 1} — role`,
          value: founder.role,
        });
      }
    });
  }
  if (draft.traction) {
    for (const [tractKey, tractValue] of Object.entries(draft.traction)) {
      if (isPrimitive(tractValue) && tractValue !== null && tractValue !== undefined) {
        out.push({
          key: `traction.${tractKey}`,
          label: TRACTION_LABELS[tractKey] ?? `Traction · ${tractKey}`,
          value: tractValue,
        });
      }
    }
  }
  if (draft.narrative) {
    for (const [narKey, narValue] of Object.entries(draft.narrative)) {
      if (typeof narValue === 'string' && narValue.length > 0) {
        out.push({
          key: `narrative.${narKey}`,
          label: NARRATIVE_LABELS[narKey] ?? `Narrative · ${narKey}`,
          value: narValue,
        });
      }
    }
  }
  return out;
}

function lookupProvenance(
  provenance: Provenance,
  key: string,
): ProvenanceField | undefined {
  // Provenance is now a discriminated union (Plan 02-03 / KNW-02c): a single
  // ProvenanceField OR a ProvenanceField[] for unresolved multi-value entries.
  // This Week-2 surface only renders single-entry shapes; Week-3's T9 routes
  // array entries to the ConflictResolver via a separate code path. So array
  // entries surface as `undefined` here — the card shows the field as
  // "no source snippet captured" until the resolver lands.
  const entry = provenance[key];
  if (entry === undefined || Array.isArray(entry)) return undefined;
  return entry;
}

function nowIso(): string {
  return new Date().toISOString();
}

// ─── Form state shape ─────────────────────────────────────────────────────

interface FieldState {
  value: ConfirmationValue;
  status: ConfirmationStatus;
}

type FieldStateMap = Record<string, FieldState>;

interface FormShape {
  // The submitted Business Memory shape — validated by zodResolver.
  payload: BusinessMemoryConfirmed;
}

export interface ConfirmationFormProps {
  initialDraft: BusinessMemoryDraft;
  onSubmit: (confirmed: BusinessMemoryConfirmed) => void | Promise<void>;
  isSubmitting?: boolean;
}

// ─── Helpers to write dot-pathed values back into a Business Memory shape ─

function setByPath<T extends Record<string, unknown>>(
  target: T,
  path: string,
  value: unknown,
): void {
  const segments = path.split('.');
  let cursor: Record<string, unknown> = target;
  for (let i = 0; i < segments.length - 1; i++) {
    const seg = segments[i];
    const isArrayIndex = /^\d+$/.test(seg);
    const nextSeg = segments[i + 1];
    const nextIsArrayIndex = /^\d+$/.test(nextSeg);
    if (isArrayIndex) {
      const idx = Number(seg);
      if (!Array.isArray(cursor)) {
        // unreachable in practice — parent shape is always object/array
        return;
      }
      if (cursor[idx] === undefined || cursor[idx] === null) {
        (cursor as unknown as unknown[])[idx] = nextIsArrayIndex ? [] : {};
      }
      cursor = cursor[idx] as Record<string, unknown>;
    } else {
      if (cursor[seg] === undefined || cursor[seg] === null) {
        cursor[seg] = nextIsArrayIndex ? [] : {};
      }
      cursor = cursor[seg] as Record<string, unknown>;
    }
  }
  const last = segments[segments.length - 1];
  if (/^\d+$/.test(last)) {
    (cursor as unknown as unknown[])[Number(last)] = value;
  } else {
    cursor[last] = value;
  }
}

function deepClone<T>(input: T): T {
  // structuredClone is available in Node 18+ and all evergreen browsers.
  return structuredClone(input);
}

export function ConfirmationForm({
  initialDraft,
  onSubmit,
  isSubmitting = false,
}: ConfirmationFormProps) {
  const fields = React.useMemo(() => collectFields(initialDraft), [initialDraft]);

  // Per-card state map — separate from the rhf form value because cards have
  // a 4-state lifecycle (pending / confirmed / rejected / edited) that the
  // Business Memory schema does not encode. rhf still owns the submitted
  // payload via Controller below; the status map drives the gating + payload
  // assembly on submit.
  const initialStateMap = React.useMemo<FieldStateMap>(() => {
    const out: FieldStateMap = {};
    for (const f of fields) out[f.key] = { value: f.value, status: 'pending' };
    return out;
  }, [fields]);
  const [stateMap, setStateMap] = React.useState<FieldStateMap>(initialStateMap);
  // Reset when the draft changes (e.g. a re-extract feeds a new initialDraft in).
  // React 19 "adjust state on prop change" pattern: track the last-seen draft
  // identity and resync during render — avoids the cascading-render useEffect
  // anti-pattern that the new react-hooks/set-state-in-effect rule catches.
  const [lastSeenDraft, setLastSeenDraft] = React.useState(initialDraft);
  if (lastSeenDraft !== initialDraft) {
    setLastSeenDraft(initialDraft);
    setStateMap(initialStateMap);
  }

  const form = useForm<FormShape>({
    resolver: zodResolver(
      // Wrap the payload schema so rhf operates on { payload: ... }.
      businessMemoryConfirmedSchema.transform((v) => ({ payload: v })) as never,
    ) as never,
    defaultValues: {
      payload: {
        ...initialDraft,
        confirmedAt: nowIso(),
      },
    },
    mode: 'onSubmit',
  });

  // Counts for the summary line + the submit-gate predicate.
  const counts = React.useMemo(() => {
    let confirmed = 0;
    let edited = 0;
    let rejected = 0;
    let pending = 0;
    for (const f of fields) {
      const s = stateMap[f.key]?.status ?? 'pending';
      if (s === 'confirmed') confirmed++;
      else if (s === 'edited') edited++;
      else if (s === 'rejected') rejected++;
      else pending++;
    }
    return { confirmed, edited, rejected, pending };
  }, [fields, stateMap]);

  const canSubmit = counts.pending === 0 && fields.length > 0 && !isSubmitting;

  const handleCardConfirm = (key: string, next: { value: ConfirmationValue }) => {
    setStateMap((prev) => ({
      ...prev,
      [key]: { value: next.value, status: 'confirmed' },
    }));
  };
  const handleCardReject = (key: string) => {
    setStateMap((prev) => ({
      ...prev,
      [key]: { value: null, status: 'rejected' },
    }));
  };
  const handleCardEdit = (key: string, next: { value: ConfirmationValue }) => {
    setStateMap((prev) => ({
      ...prev,
      [key]: { value: next.value, status: 'edited' },
    }));
  };

  const buildPayload = React.useCallback((): BusinessMemoryConfirmed => {
    // Start from the original draft; apply each card's terminal state into
    // the right path; bump provenance.last_updated for edited fields;
    // strip rejected fields (and mark them in provenance).
    const out: BusinessMemoryConfirmed = deepClone({
      ...initialDraft,
      confirmedAt: nowIso(),
    });
    const provenance: Provenance = { ...(out.provenance ?? {}) };
    const now = nowIso();
    for (const f of fields) {
      const s = stateMap[f.key];
      if (!s) continue;
      if (s.status === 'rejected') {
        // Null out the value at its path.
        setByPath(out as unknown as Record<string, unknown>, f.key, null);
        const entry = provenance[f.key];
        if (entry) {
          provenance[f.key] = {
            ...entry,
            last_updated: now,
            // Record a rejection marker in the existing jsonb shape — keys
            // are flex (catchall) on the provenance jsonb sub-shape.
            ...{ rejected_at: now },
          } as ProvenanceField;
        }
      } else if (s.status === 'edited') {
        setByPath(out as unknown as Record<string, unknown>, f.key, s.value);
        const entry = provenance[f.key];
        if (entry) {
          provenance[f.key] = { ...entry, last_updated: now };
        }
      } else if (s.status === 'confirmed') {
        // Confirmed → keep value as-is, no provenance bump.
        setByPath(out as unknown as Record<string, unknown>, f.key, s.value);
      }
    }
    out.provenance = provenance;
    return out;
  }, [initialDraft, fields, stateMap]);

  const handleSubmit = form.handleSubmit(async () => {
    const payload = buildPayload();
    await onSubmit(payload);
  });

  // Mirror the assembled payload into the rhf state on every status change so
  // zodResolver validates the right shape on submit.
  React.useEffect(() => {
    const next = buildPayload();
    form.setValue('payload', next, { shouldValidate: false, shouldDirty: true });
  }, [stateMap, buildPayload, form]);

  return (
    <form
      onSubmit={handleSubmit}
      noValidate
      data-testid="confirmation-form"
      className="flex w-full flex-col gap-8"
    >
      <header className="flex flex-col gap-3">
        <h2 className="text-h2 text-ink">{COPY.heading}</h2>
        <p className="text-body text-graphite">{COPY.subhead}</p>
      </header>

      <div className="flex flex-col gap-4">
        {fields.map((f) => {
          const provenanceEntry = lookupProvenance(initialDraft.provenance ?? {}, f.key);
          const state = stateMap[f.key] ?? { value: f.value, status: 'pending' as const };
          return (
            <Controller
              key={f.key}
              control={form.control as unknown as Control}
              name={`payload.${f.key}` as never}
              render={() => (
                <ConfirmationCard
                  fieldName={f.key}
                  fieldLabel={f.label}
                  draftValue={state.value}
                  sourceSnippet={provenanceEntry?.source_snippet}
                  confidence={provenanceEntry?.confidence}
                  status={state.status}
                  onConfirm={(next) => handleCardConfirm(f.key, next)}
                  onReject={() => handleCardReject(f.key)}
                  onEdit={(next) => handleCardEdit(f.key, next)}
                />
              )}
            />
          );
        })}
      </div>

      {/* Sticky action bar */}
      <div className="sticky bottom-0 z-10 flex flex-col gap-3 border-t border-stone bg-paper/95 py-4 backdrop-blur-sm sm:flex-row sm:items-center sm:justify-between">
        <p
          className="text-body-sm text-graphite"
          data-testid="confirmation-form-summary"
          aria-live="polite"
        >
          <span className="font-mono text-sm">{counts.confirmed}</span> {COPY.summaryConfirmed}
          <span aria-hidden> · </span>
          <span className="font-mono text-sm">{counts.edited}</span> {COPY.summaryEdited}
          <span aria-hidden> · </span>
          <span className="font-mono text-sm">{counts.rejected}</span> {COPY.summaryRejected}
          <span aria-hidden> · </span>
          <span className={cn('font-mono text-sm', counts.pending > 0 && 'text-ink')}>
            {counts.pending}
          </span>{' '}
          {COPY.summaryPending}
        </p>
        <div className="flex flex-col items-stretch gap-2 sm:flex-row sm:items-center sm:gap-3">
          {!canSubmit && counts.pending > 0 && (
            <p className="text-body-sm text-graphite" data-testid="confirmation-form-hint">
              {COPY.submitDisabledHint}
            </p>
          )}
          <Button
            type="submit"
            variant="primary"
            disabled={!canSubmit}
            data-testid="confirmation-form-submit"
          >
            {isSubmitting ? COPY.submitting : COPY.submit}
          </Button>
        </div>
      </div>

      {form.formState.errors.payload && (
        <p
          className="text-body-sm text-danger"
          role="alert"
          data-testid="confirmation-form-error"
        >
          {COPY.errorBanner}
        </p>
      )}
    </form>
  );
}
