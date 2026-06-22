'use client';

import * as React from 'react';
import {
  useForm,
  Controller,
  type Control,
  type FieldErrors,
} from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';

import {
  businessMemoryConfirmedSchema,
  chooseProvenance,
  FOUNDER_OVERRIDE_SNIPPET,
  isProvenanceArray,
  type BusinessMemoryConfirmed,
  type BusinessMemoryDraft,
  type Provenance,
  type ProvenanceEntry,
  type ProvenanceField,
} from '@/ai/schemas/business-memory.zod';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

import {
  ConfirmationCard,
  type ConfirmationStatus,
  type ConfirmationValue,
} from './confirmation-card';
import { humanizeFieldError } from './humanize-error';

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
 *
 * ## Week-3 additions (Plan 02-03)
 *
 * Four surgical extensions land here in T10, all additive — every Plan 02-02
 * field-rendering path stays byte-equivalent on the no-conflict / no-error
 * branch:
 *
 *   1. **CARRY-2 — per-field error propagation.** The form walks
 *      `form.formState.errors` via a dot/bracket-aware `pickError` helper and
 *      forwards a per-card `errorMessage` prop to every ConfirmationCard.
 *      The previously-static `errorBanner` ("Some fields are invalid…") is
 *      replaced by an operator-voice dynamic-count banner — "1 field needs
 *      attention" / "N fields need attention" — that only renders post-submit
 *      to avoid pre-validation noise.
 *
 *   2. **Conflict-resolver gating.** Multi-candidate provenance entries
 *      (`isProvenanceArray(provenance[fieldKey])`) flow into the card as
 *      `multiValueCandidates` + `onResolveConflict`. The form tracks
 *      resolution in a `resolvedMap` and the submit gate is EXTENDED — the
 *      existing every-field-terminal predicate stays; ANDed with "every
 *      conflict resolved." The summary line gains a "N conflicts unresolved"
 *      tail while any remain. On resolve, `chooseProvenance` collapses the
 *      array → single canonical entry + archives losers under
 *      `rejected_alternatives`; the founder-override path receives a
 *      synthesized entry directly from ConflictResolver (sentinel
 *      `FOUNDER_OVERRIDE_SNIPPET` is recognized and stored verbatim, no
 *      `chooseProvenance` collapse since there are no losers to archive).
 *
 *   3. **CARRY-1 — Undo from terminal states.** Confirmed and rejected cards
 *      now receive `canUndo` + `onUndo`. The Undo handler transitions the
 *      field's status back to `pending` and, for the rejected arm, restores
 *      the original draft value from the form's `defaultValues` snapshot
 *      (`pickByPath` mirrors `pickError`'s path-walking). Re-validation fires
 *      via `form.trigger`.
 *
 *   4. **fallbackInputType wiring.** Numeric traction fields (`traction.mrr`,
 *      `traction.arr`, `traction.valuation`, `traction.burn`) pass
 *      `fallbackInputType="number"` down to the resolver so the custom-override
 *      input renders as a number arm with NaN guard. `traction.customers` is
 *      free-text (T4a) and stays on the text arm.
 *
 * Audit boundary: this component imports ONLY from `@/ai/schemas/**`. NEVER
 * from `@/ai/agents/**`, `@/ai/client`, `@/server/*`, or `@anthropic-ai/sdk`.
 * Grep-verifiable; Plan 02-03's check:imports enforces.
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
  // CARRY-2 — dynamic-count banner. Singular form renders the "1 field" arm;
  // plural form takes the N≥2 arm. Operator voice; no "we found", no "Sorry",
  // no apology. Renders only post-submit (form.formState.isSubmitted).
  errorBannerOne: '1 field needs attention',
  errorBannerMany: (n: number) => `${n} fields need attention`,
  // BLOCKER-1 — form-level error surface for a blocked submit (e.g. a schema
  // failure on a non-card path). Operator voice; no field content echoed.
  formError:
    "Trochia couldn't save this Business Memory. Re-confirm each field and try again, or contact support if this persists.",
  // Conflict-resolver gate — appended to the existing summary line when any
  // multi-candidate field has not been resolved. "1 conflict unresolved" /
  // "N conflicts unresolved" reads cleanly across N≥1.
  conflictsRemaining: (n: number) =>
    `${n} conflict${n === 1 ? '' : 's'} unresolved`,
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
          label: `Founder ${idx + 1}: name`,
          value: founder.name,
        });
      }
      if (founder?.role) {
        out.push({
          key: `team.founders.${idx}.role`,
          label: `Founder ${idx + 1}: role`,
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

/**
 * Walk a dot/bracket-pathed key into a possibly-nested object, returning the
 * leaf value if reachable or `undefined` otherwise. Used by:
 *
 *   - `pickError` — walks `form.formState.errors` and returns the `.message`
 *     string at the leaf if rhf wrote a FieldError there.
 *   - CARRY-1 Undo restore — walks `form.formState.defaultValues` to recover
 *     the original draft value for a rejected field.
 *
 * Path examples: `companyName` → ['companyName']; `traction.mrr` →
 * ['traction', 'mrr']; `team.founders[0].name` → ['team', 'founders', '0',
 * 'name']. Bracket indices and dotted indices both normalize via the same
 * split regex (mirrors `setByPath`'s segment handling).
 */
function splitPath(path: string): string[] {
  return path.split(/[.[\]]+/).filter(Boolean);
}

function pickByPath(source: unknown, path: string): unknown {
  const segments = splitPath(path);
  let cursor: unknown = source;
  for (const seg of segments) {
    if (cursor == null || typeof cursor !== 'object') return undefined;
    // Array index → numeric key works because JS arrays are records; the
    // rhf errors tree also nests arrays as numeric-keyed objects.
    cursor = (cursor as Record<string, unknown>)[seg];
  }
  return cursor;
}

/**
 * Walk `form.formState.errors` at `path` and return the leaf `.message` if
 * present. rhf places a `FieldError` at the leaf for primitive fields and
 * nests deeper for arrays/objects; the walk handles both shapes. Pure
 * function; the rhf `FieldErrors` type is the only react-hook-form internal
 * crossing the boundary.
 */
function pickError(errors: FieldErrors, path: string): string | undefined {
  const leaf = pickByPath(errors, path);
  if (
    leaf &&
    typeof leaf === 'object' &&
    'message' in leaf &&
    typeof (leaf as { message?: unknown }).message === 'string'
  ) {
    return (leaf as { message: string }).message;
  }
  return undefined;
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
  // Conflict-resolution map (KNW-02c / T10). Tracks which multi-candidate
  // fields the founder has resolved this session. Mirrors the `stateMap`
  // pattern: separate from the rhf payload because the payload only carries
  // the post-collapse provenance, not the pre-resolve gate state. Empty by
  // default; entries are set true by `handleResolveConflict` and dropped
  // back to false by `transitionFieldBackToPending` for resolved-then-undone
  // fields.
  const [resolvedMap, setResolvedMap] = React.useState<Map<string, boolean>>(
    () => new Map(),
  );
  // Companion map: the COLLAPSED single-object provenance entry chosen by the
  // founder for each resolved field. Read by `buildPayload` so the assembled
  // BusinessMemoryConfirmed carries the post-resolve canonical entry (with
  // `rejected_alternatives` audit trail) instead of the original pre-resolve
  // ProvenanceField[] arm. Empty by default; entries are written by
  // `handleResolveConflict` and dropped by `transitionFieldBackToPending`.
  const [resolvedProvenance, setResolvedProvenance] = React.useState<
    Map<string, ProvenanceField>
  >(() => new Map());
  // Reset when the draft changes (e.g. a re-extract feeds a new initialDraft in).
  // React 19 "adjust state on prop change" pattern: track the last-seen draft
  // identity and resync during render — avoids the cascading-render useEffect
  // anti-pattern that the new react-hooks/set-state-in-effect rule catches.
  const [lastSeenDraft, setLastSeenDraft] = React.useState(initialDraft);
  if (lastSeenDraft !== initialDraft) {
    setLastSeenDraft(initialDraft);
    setStateMap(initialStateMap);
    // Re-extract starts the conflict-resolution slate fresh — any prior
    // resolution belongs to the previous draft and should not persist.
    setResolvedMap(new Map());
    setResolvedProvenance(new Map());
  }

  const form = useForm<FormShape>({
    // BLOCKER-1 fix (prod smoke test). The form VALUE is wrapped — `{ payload:
    // BusinessMemoryConfirmed }` (see `defaultValues` + every `setValue('payload',
    // …)`). The resolver must therefore validate that WRAPPED shape. The prior
    // `zodResolver(businessMemoryConfirmedSchema.transform((v) => ({ payload: v })))`
    // was backwards: `.transform` rewrites the parsed OUTPUT, not the shape the
    // parser EXPECTS — so it validated `{ payload }` against the UNWRAPPED schema
    // and ALWAYS failed on the two required top-level keys (`provenance`,
    // `confirmedAt`). `form.handleSubmit` (no `onInvalid`) then silently swallowed
    // every submit → `onSubmit`/`confirmDraft` never fired → no `memory.confirmed`
    // → no embed. The `as never` casts hid the shape mismatch from tsc.
    resolver: zodResolver(z.object({ payload: businessMemoryConfirmedSchema })),
    defaultValues: {
      payload: {
        ...initialDraft,
        confirmedAt: nowIso(),
      },
    },
    mode: 'onSubmit',
  });

  // BLOCKER-1: a blocked submit must never be silent again. Surfaced below the
  // form; cleared on a successful submit (the `onValid` arm of `handleSubmit`).
  const [formError, setFormError] = React.useState<string | null>(null);

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

  // Multi-candidate provenance map drawn from the initialDraft. Lives off the
  // rhf payload because the payload's provenance arm is the post-resolve
  // single-object shape; the pre-resolve array is the conflict-detection
  // source. Frozen against re-extract by the lastSeenDraft sync above —
  // every conflict-related count below derives from this constant per draft.
  const provenanceArrayMap = React.useMemo(() => {
    const out = new Map<string, ProvenanceField[]>();
    const provenance = initialDraft.provenance ?? {};
    for (const f of fields) {
      const entry = provenance[f.key] as ProvenanceEntry | undefined;
      if (entry !== undefined && isProvenanceArray(entry)) {
        out.set(f.key, entry);
      }
    }
    return out;
  }, [initialDraft, fields]);

  // CARRY-2 — per-card error count derived from rhf's errors tree. The
  // payload sits under `payload.<fieldKey>` because of the resolver wrap
  // above; pickError walks the dot/bracket path and returns the leaf
  // .message. Only fields with a non-empty error contribute to the count.
  const errorCount = React.useMemo(() => {
    let n = 0;
    for (const f of fields) {
      if (pickError(form.formState.errors, `payload.${f.key}`) !== undefined) {
        n++;
      }
    }
    return n;
  }, [fields, form.formState.errors]);

  // Conflict-gate count — every multi-candidate field that the founder has
  // not yet resolved this session contributes one. Resolved fields are those
  // where `resolvedMap.get(fieldKey) === true`; absence and `false` both
  // count as unresolved (the latter occurs after Undo re-arms a resolved
  // multi-candidate field). Drives both the summary-line tail and the
  // submit-gate AND clause below.
  const conflictsRemaining = React.useMemo(() => {
    let n = 0;
    for (const [fieldKey] of provenanceArrayMap) {
      if (resolvedMap.get(fieldKey) !== true) n++;
    }
    return n;
  }, [provenanceArrayMap, resolvedMap]);

  // Submit-gate predicate — EXTENDS the pre-T10 contract additively. The
  // existing "all fields in terminal state + form non-empty + not currently
  // submitting" predicate stays; conflictsRemaining === 0 is ANDed on. The
  // original conditions remain the only thing that gates a no-conflict
  // form, so Plan 02-02's behavior is preserved byte-equivalent on drafts
  // with no multi-candidate provenance entries.
  const canSubmit =
    counts.pending === 0 &&
    fields.length > 0 &&
    !isSubmitting &&
    conflictsRemaining === 0;

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

  /**
   * Resolve a multi-candidate provenance entry. The ConflictResolver delivers
   * one of two shapes via its `onResolve(chosen, value)` callback:
   *
   *   - **Radio-pick:** `chosen` is a reference-equal element of the original
   *     `candidates[]` array. We locate the index by `===` reference identity
   *     (the resolver passes the same object it received from its props) and
   *     run `chooseProvenance(candidates, index)` to collapse the array →
   *     single entry + archive losers under `rejected_alternatives`.
   *
   *   - **Custom override:** `chosen.source_snippet === FOUNDER_OVERRIDE_SNIPPET`.
   *     The synthesized field is stored verbatim — there are no rejected
   *     alternatives from the founder's perspective (the founder rejected ALL
   *     candidates by typing a new value), and the schema's `chooseProvenance`
   *     contract requires a winner from the candidates array. The audit
   *     layer recognizes the FOUNDER_OVERRIDE_SNIPPET sentinel as the
   *     non-extractor origin marker.
   *
   * Two-channel contract (post-Wave-4-B contract-gap fix): the resolver also
   * surfaces the founder-selected scalar value alongside the chosen provenance
   * entry. The value flows through `form.setValue(`payload.${fieldKey}`)` so
   * the form's primary scalar field reflects the chosen candidate (radio-pick)
   * or the founder-typed override (custom-override). Without this, the form's
   * primary scalar stayed at the extractor's initial draft value while
   * provenance collapsed to the chosen candidate — surfacing as a mismatched
   * payload at confirmDraft time.
   */
  const handleResolveConflict = React.useCallback(
    (fieldKey: string, candidates: ProvenanceField[]) =>
      (chosen: ProvenanceField, value: unknown) => {
        let collapsed: ProvenanceField;
        if (chosen.source_snippet === FOUNDER_OVERRIDE_SNIPPET) {
          // Custom-override path — no losers to archive; store verbatim.
          collapsed = chosen;
        } else {
          // Radio-pick path — locate index by reference identity. Resolver
          // hands back the same candidate object it received from props.
          const chosenIndex = candidates.findIndex((c) => c === chosen);
          if (chosenIndex < 0) {
            // Defensive — the resolver's contract guarantees reference
            // identity. If a future refactor breaks that, fall back to
            // storing the chosen entry as-is rather than throwing inside
            // a callback (which would surface as an unhandled React error).
            collapsed = chosen;
          } else {
            collapsed = chooseProvenance(candidates, chosenIndex);
          }
        }
        // Updates the form's primary scalar value for this field. The
        // `as never` cast mirrors the existing rhf workaround in
        // `transitionFieldBackToPending` — react-hook-form's setValue is
        // over-constrained for runtime-dynamic FieldPath, but the call is
        // sound because fieldPath is built from the same schema the form
        // was instantiated with.
        form.setValue(`payload.${fieldKey}` as never, value as never, {
          shouldValidate: true,
          shouldDirty: true,
        });
        // Mirror the resolved scalar into the local stateMap so the pending
        // field carries the chosen value forward into Confirm / Reject / Edit
        // downstream. buildPayload reads from stateMap for terminal fields
        // but pending fields surface the value via the card's draftValue
        // prop, which sources from stateMap; without this mirror, the card
        // would still render the extractor's first-guess scalar (the
        // initialDraft pre-resolve value) until the founder clicked Confirm.
        // The useEffect below re-syncs the rhf payload from buildPayload on
        // every stateMap change, so the form.setValue call above is the
        // belt-and-braces write while this mirror is the source of truth.
        setStateMap((prev) => {
          const existing = prev[fieldKey];
          return {
            ...prev,
            [fieldKey]: {
              value: value as ConfirmationValue,
              status: existing?.status ?? 'pending',
            },
          };
        });
        setResolvedProvenance((prev) => {
          const next = new Map(prev);
          next.set(fieldKey, collapsed);
          return next;
        });
        setResolvedMap((prev) => {
          const next = new Map(prev);
          next.set(fieldKey, true);
          return next;
        });
      },
    [form],
  );

  /**
   * CARRY-1 — drop a confirmed/rejected/edited card back to pending.
   *
   *   - Status returns to `'pending'` in the local stateMap.
   *   - For rejected fields: the original draft value (captured at mount via
   *     `defaultValues`) is restored into the form via `form.setValue`. The
   *     defaultValues snapshot lives under `payload.<fieldKey>` due to the
   *     resolver-wrap; pickByPath walks the dot/bracket path identically to
   *     pickError.
   *   - For resolved multi-candidate fields: the resolution map entry is
   *     also dropped — the card re-renders the conflict UI and the submit
   *     gate re-arms.
   *   - rhf's per-field validation re-runs via `form.trigger`. The form's
   *     server-side row stays untouched until the founder re-submits (this
   *     is form-state-only state restoration).
   */
  const transitionFieldBackToPending = React.useCallback(
    (key: string) => {
      const prevStatus = stateMap[key]?.status;
      const originalValue = pickByPath(
        form.formState.defaultValues as unknown,
        `payload.${key}`,
      );
      setStateMap((prev) => {
        const f = fields.find((field) => field.key === key);
        // Snap the local value back to the original draft so a subsequent
        // re-edit starts from the same baseline the extractor surfaced.
        const restoredValue =
          prevStatus === 'rejected' && originalValue !== undefined
            ? (originalValue as ConfirmationValue)
            : (f?.value ?? prev[key]?.value ?? null);
        return {
          ...prev,
          [key]: { value: restoredValue, status: 'pending' },
        };
      });
      // For previously-rejected fields, write the restored value back into
      // the rhf payload so the controlled card re-renders with the original
      // draft — not the null the rejection wrote.
      if (prevStatus === 'rejected' && originalValue !== undefined) {
        form.setValue(`payload.${key}` as never, originalValue as never, {
          shouldValidate: false,
          shouldDirty: false,
        });
      }
      // Drop the conflict-resolution gate so the card re-arms the resolver
      // if this field was a multi-candidate one. The payload's provenance
      // entry gets re-pointed at the original ProvenanceField[] arm on the
      // next buildPayload sync (resolvedProvenance no longer carries it).
      if (provenanceArrayMap.has(key)) {
        setResolvedProvenance((prev) => {
          if (!prev.has(key)) return prev;
          const next = new Map(prev);
          next.delete(key);
          return next;
        });
        setResolvedMap((prev) => {
          if (!prev.has(key)) return prev;
          const next = new Map(prev);
          next.delete(key);
          return next;
        });
      }
      // Re-run validation to clear any stale error rhf may have attached.
      form.trigger(`payload.${key}` as never);
    },
    [stateMap, fields, form, provenanceArrayMap],
  );

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
    // T10 — fold resolved multi-candidate provenance back into the payload
    // FIRST. The downstream rejected/edited bumps below operate on the
    // already-collapsed single-object entry. Without this fold, the payload's
    // provenance arm would still carry the original ProvenanceField[] for
    // resolved fields, which fails the post-confirm schema (the persisted
    // shape is single-object only).
    for (const [fieldKey, entry] of resolvedProvenance) {
      provenance[fieldKey] = entry;
    }
    for (const f of fields) {
      const s = stateMap[f.key];
      if (!s) continue;
      if (s.status === 'rejected') {
        // Null out the value at its path.
        setByPath(out as unknown as Record<string, unknown>, f.key, null);
        const entry = provenance[f.key];
        if (entry && !isProvenanceArray(entry)) {
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
        if (entry && !isProvenanceArray(entry)) {
          provenance[f.key] = { ...entry, last_updated: now };
        }
      } else if (s.status === 'confirmed') {
        // Confirmed → keep value as-is, no provenance bump.
        setByPath(out as unknown as Record<string, unknown>, f.key, s.value);
      }
    }
    out.provenance = provenance;
    return out;
  }, [initialDraft, fields, stateMap, resolvedProvenance]);

  const handleSubmit = form.handleSubmit(
    async () => {
      setFormError(null);
      const payload = buildPayload();
      await onSubmit(payload);
    },
    () => {
      // BLOCKER-1 — never-silent gate. `errorCount` (below) only covers the
      // rendered cards; a validation failure on a NON-card path (provenance.* /
      // confirmedAt / a team|traction|narrative leaf) would otherwise show
      // nothing while the submit no-ops. Surface a content-blind form-level
      // message so the founder always gets feedback.
      setFormError(COPY.formError);
    },
  );

  // Mirror the assembled payload into the rhf state on every status change so
  // zodResolver validates the right shape on submit. Depends on
  // `resolvedProvenance` so a conflict-resolution write re-syncs the payload's
  // collapsed provenance entry — without it, the rhf state would still carry
  // the original ProvenanceField[] arm at submit time.
  React.useEffect(() => {
    const next = buildPayload();
    form.setValue('payload', next, { shouldValidate: false, shouldDirty: true });
  }, [stateMap, resolvedProvenance, buildPayload, form]);

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
          // T10 — per-card wiring. Pull the multi-candidate arm (if any),
          // the per-field error from rhf's tree, and the CARRY-1 Undo
          // affordance gate. Every prop below is OPTIONAL on the card —
          // a draft with no conflicts + no errors + no submitted state
          // renders byte-equivalent to the Plan 02-02 baseline.
          const candidates = provenanceArrayMap.get(f.key);
          // T4b: map the raw Zod/resolver message to friendly operator-voice copy
          // — the card never renders an engineer-speak string ("Expected number,
          // received string") again. humanizeFieldError returns undefined when
          // the field is valid.
          const errorMessage = humanizeFieldError(
            f.label,
            pickError(form.formState.errors, `payload.${f.key}`),
          );
          // CARRY-1 gate: terminal-state cards expose Undo. Edited fields
          // also get Undo (the founder can step back to pending and re-edit
          // from the original draft snapshot).
          const canUndo =
            state.status === 'confirmed' ||
            state.status === 'rejected' ||
            state.status === 'edited';
          // Numeric arm for the resolver's custom-override input. The number
          // metrics (mrr/arr/valuation/burn) use the number input + NaN guard;
          // `customers` is now free-text (T4a — "150 Businesses", ranges), and
          // every other field stays on text.
          const fallbackInputType: 'text' | 'number' =
            /^traction\.(mrr|arr|valuation|burn)$/.test(f.key)
              ? 'number'
              : 'text';
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
                  multiValueCandidates={candidates}
                  onResolveConflict={
                    candidates
                      ? handleResolveConflict(f.key, candidates)
                      : undefined
                  }
                  isConflictResolved={resolvedMap.get(f.key) === true}
                  fallbackInputType={fallbackInputType}
                  errorMessage={errorMessage}
                  canUndo={canUndo}
                  onUndo={() => transitionFieldBackToPending(f.key)}
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
          {/* T10 — conflict-gate tail. Renders only when any multi-candidate
              field remains unresolved; collapses cleanly when the gate
              clears so a draft with no conflicts shows the Plan 02-02
              summary line unchanged. */}
          {conflictsRemaining > 0 && (
            <>
              <span aria-hidden> · </span>
              <span
                className="font-mono text-sm text-ink"
                data-testid="confirmation-form-summary-conflicts"
              >
                {COPY.conflictsRemaining(conflictsRemaining)}
              </span>
            </>
          )}
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

      {/* CARRY-2 — dynamic-count error banner. Only renders post-submit
          (form.formState.isSubmitted) to avoid pre-validation noise; the
          singular form takes the N=1 arm, plural takes N≥2. The testid is
          preserved verbatim from Plan 02-02 so the Playwright spec's
          selector continues to resolve. */}
      {form.formState.isSubmitted && errorCount > 0 && (
        <p
          className="text-body-sm text-danger"
          role="alert"
          data-testid="confirmation-form-error"
        >
          {errorCount === 1
            ? COPY.errorBannerOne
            : COPY.errorBannerMany(errorCount)}
        </p>
      )}

      {/* BLOCKER-1 — form-level error. Fires from `handleSubmit`'s `onInvalid`
          arm so a blocked submit (incl. failures on non-card paths the per-card
          banner above cannot see) is never a silent no-op. */}
      {formError && (
        <p
          className="text-body-sm text-danger"
          role="alert"
          data-testid="confirmation-form-form-error"
        >
          {formError}
        </p>
      )}
    </form>
  );
}
