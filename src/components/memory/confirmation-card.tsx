'use client';

import * as React from 'react';
import { Check, ChevronDown, Pencil, X } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Collapsible,
  CollapsiblePanel,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

/**
 * Per-field Confirmation Card — Plan 02-02 / KNW-02b.
 *
 * Renders one Business Memory field drafted by `extractFromPaste`. The founder
 * confirms, edits, or rejects the drafted value; the card is presentational
 * plus per-field action callbacks. The form (`confirmation-form.tsx`) owns
 * the controlled state — every status change rides up via the three handlers.
 *
 * Layout (DESIGN-REFERENCE § Cards + § Buttons, brand tokens only):
 *   - Container: bg-paper, 1px border-stone, rounded-xl, p-8, no shadow.
 *     Hover bumps the border to `ink/20`; ring on focus-within (a11y).
 *   - Top row: `text-label` uppercase field name + status badge (one of four).
 *   - Value row: `text-h3 text-ink` in read mode; inline `<Input>` in edit mode.
 *   - Source affordance: a Collapsible "source" trigger that reveals the
 *     verbatim `source_snippet` (≤ 800 chars enforced upstream by Zod).
 *   - Confidence pill: graphite-only mono — DESIGN-REFERENCE bans traffic-light
 *     coloring on this kind of metadata.
 *   - Action row: Reject (ghost) · Edit (secondary) · Confirm (primary). In
 *     edit mode the Edit button is replaced with Save / Cancel.
 *
 * Operator voice (BRAND.md): Trochia drafts / cites — never feels / wants /
 * helps. UI copy strings are pinned as constants below; they are the only
 * strings this component renders.
 *
 * a11y:
 *   - Card is `role="region"` with `aria-label={fieldLabel}`.
 *   - Status badge is announced via `aria-label` (not just by color).
 *   - Input has a label via `aria-label` linked to the field name.
 *   - Action buttons carry verbose `aria-label`s ("Confirm {field}") so a
 *     screen reader user with multiple cards on screen can tell them apart.
 */

// ─── Operator-voice copy (the ONLY visible strings this card renders) ──────
const COPY = {
  emptySnippet: 'No source snippet captured.',
  showSnippet: 'Source',
  editAffordance: 'Edit value',
  rejectAffordance: 'Reject this field',
  confirmAffordance: 'Confirm',
  saveAffordance: 'Save',
  cancelAffordance: 'Cancel edit',
  statusPending: 'Drafted from your paste',
  statusConfirmed: 'Confirmed',
  statusRejected: 'Rejected',
  statusEdited: 'Edited',
  emptyValue: 'Not drafted',
  confidenceSuffix: 'confidence',
} as const;

export type ConfirmationStatus = 'pending' | 'confirmed' | 'rejected' | 'edited';
export type ConfirmationValue = string | number | null | undefined;

export interface ConfirmationCardProps {
  /** Dot-pathed field key on the draft (e.g. `companyName`, `traction.mrr`). */
  fieldName: string;
  /** Human-readable field label rendered in the eyebrow row. */
  fieldLabel: string;
  /** Current value rendered in the card (form-controlled). */
  draftValue: ConfirmationValue;
  /** Verbatim quote captured by the extractor. May be undefined. */
  sourceSnippet?: string;
  /** Extractor confidence in [0, 1]. Rendered as e.g. `0.84 confidence`. */
  confidence?: number;
  /** Current status — drives the badge + which actions are enabled. */
  status: ConfirmationStatus;
  /** Confirm action fires with the current draft value. */
  onConfirm: (next: { value: ConfirmationValue; status: 'confirmed' }) => void;
  /** Reject action fires; the form sets the field to null + rejection marker. */
  onReject: () => void;
  /** Edit action fires when the founder commits an inline edit. */
  onEdit: (next: { value: ConfirmationValue; status: 'edited' }) => void;
}

function StatusBadge({ status }: { status: ConfirmationStatus }) {
  if (status === 'pending') return null;
  if (status === 'confirmed') {
    return (
      <Badge
        className="bg-success/10 text-success border-transparent"
        aria-label={COPY.statusConfirmed}
      >
        {COPY.statusConfirmed}
      </Badge>
    );
  }
  if (status === 'rejected') {
    return (
      <Badge
        className="bg-stone text-graphite border-transparent"
        aria-label={COPY.statusRejected}
      >
        {COPY.statusRejected}
      </Badge>
    );
  }
  return (
    <Badge
      className="bg-signal/10 text-signal border-transparent"
      aria-label={COPY.statusEdited}
    >
      {COPY.statusEdited}
    </Badge>
  );
}

function formatConfidence(c: number | undefined): string | null {
  if (typeof c !== 'number' || Number.isNaN(c)) return null;
  // Two-decimal display; no traffic-light coloring (operator-grade restraint).
  return `${c.toFixed(2)} ${COPY.confidenceSuffix}`;
}

function renderReadValue(value: ConfirmationValue): string {
  if (value === null || value === undefined || value === '') return COPY.emptyValue;
  return String(value);
}

export function ConfirmationCard({
  fieldName,
  fieldLabel,
  draftValue,
  sourceSnippet,
  confidence,
  status,
  onConfirm,
  onReject,
  onEdit,
}: ConfirmationCardProps) {
  const [editing, setEditing] = React.useState(false);
  // Local edit buffer; the form's controlled value remains the source of truth
  // until the founder commits a Save. Cancel discards the buffer.
  const [buffer, setBuffer] = React.useState<string>(() =>
    draftValue === null || draftValue === undefined ? '' : String(draftValue),
  );
  // Track the last draftValue we synced the buffer against so we can adjust
  // state during render when the parent pushes a new value (React 19
  // "adjust state on prop change" pattern — avoids useEffect cascades).
  const [lastSeenDraft, setLastSeenDraft] = React.useState(draftValue);
  if (!editing && lastSeenDraft !== draftValue) {
    setLastSeenDraft(draftValue);
    setBuffer(draftValue === null || draftValue === undefined ? '' : String(draftValue));
  }
  const inputRef = React.useRef<HTMLInputElement>(null);
  const isRejected = status === 'rejected';
  const confidenceLabel = formatConfidence(confidence);

  const startEdit = React.useCallback(() => {
    setEditing(true);
    // Defer focus to the next paint so the input is mounted.
    requestAnimationFrame(() => inputRef.current?.focus());
  }, []);

  const cancelEdit = React.useCallback(() => {
    setEditing(false);
    setBuffer(draftValue === null || draftValue === undefined ? '' : String(draftValue));
  }, [draftValue]);

  const commitEdit = React.useCallback(() => {
    const next = buffer.trim();
    setEditing(false);
    onEdit({ value: next === '' ? null : next, status: 'edited' });
  }, [buffer, onEdit]);

  const onInputKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      commitEdit();
    } else if (event.key === 'Escape') {
      event.preventDefault();
      cancelEdit();
    }
  };

  const showSnippet = typeof sourceSnippet === 'string' && sourceSnippet.length > 0;

  return (
    <section
      role="region"
      aria-label={fieldLabel}
      data-testid="confirmation-card"
      data-field={fieldName}
      data-status={status}
      className={cn(
        'relative flex flex-col gap-4 rounded-xl border border-stone bg-paper p-8 transition-colors duration-150',
        'hover:border-ink/20 focus-within:border-ink/30',
        isRejected && 'opacity-70',
      )}
    >
      {/* Eyebrow + status row */}
      <header className="flex items-start justify-between gap-4">
        <div className="flex flex-col gap-1">
          <span className="text-label uppercase text-graphite">{fieldLabel}</span>
          {status === 'pending' && (
            <span className="text-body-sm text-graphite">{COPY.statusPending}</span>
          )}
        </div>
        <StatusBadge status={status} />
      </header>

      {/* Value row */}
      <div className="flex flex-col gap-2">
        {editing ? (
          <Input
            ref={inputRef}
            value={buffer}
            onChange={(e) => setBuffer(e.target.value)}
            onKeyDown={onInputKeyDown}
            aria-label={fieldLabel}
            data-testid="confirmation-card-input"
          />
        ) : (
          <p
            className={cn(
              'text-h3 text-ink',
              isRejected && 'line-through decoration-graphite decoration-1',
              (draftValue === null || draftValue === undefined || draftValue === '') &&
                'text-graphite italic',
            )}
            data-testid="confirmation-card-value"
          >
            {renderReadValue(draftValue)}
          </p>
        )}

        {/* Metadata row: source snippet + confidence */}
        {(showSnippet || confidenceLabel) && (
          <div className="flex flex-wrap items-center gap-4 pt-1">
            {showSnippet ? (
              <Collapsible>
                <CollapsibleTrigger
                  aria-label={`${COPY.showSnippet} for ${fieldLabel}`}
                  data-testid="confirmation-card-source-trigger"
                >
                  <span>{COPY.showSnippet}</span>
                  <ChevronDown
                    className="size-3 transition-transform data-[panel-open]:rotate-180"
                    aria-hidden
                  />
                </CollapsibleTrigger>
                <CollapsiblePanel>
                  <blockquote
                    className="mt-2 border-l-2 border-stone bg-stone/40 px-4 py-3 font-mono text-sm text-graphite"
                    data-testid="confirmation-card-source-snippet"
                  >
                    {sourceSnippet}
                  </blockquote>
                </CollapsiblePanel>
              </Collapsible>
            ) : (
              <span className="font-mono text-sm text-graphite">{COPY.emptySnippet}</span>
            )}
            {confidenceLabel && (
              <span
                className="font-mono text-sm text-graphite"
                aria-label={`Extractor confidence ${confidenceLabel}`}
              >
                {confidenceLabel}
              </span>
            )}
          </div>
        )}
      </div>

      {/* Action row */}
      <div className="flex flex-wrap items-center justify-end gap-3 pt-2">
        {editing ? (
          <>
            <Button
              type="button"
              variant="ghost"
              size="compact"
              onClick={cancelEdit}
              aria-label={`${COPY.cancelAffordance} ${fieldLabel}`}
            >
              <X aria-hidden />
              {COPY.cancelAffordance}
            </Button>
            <Button
              type="button"
              variant="primary"
              size="compact"
              onClick={commitEdit}
              aria-label={`${COPY.saveAffordance} ${fieldLabel}`}
            >
              <Check aria-hidden />
              {COPY.saveAffordance}
            </Button>
          </>
        ) : (
          <>
            <Button
              type="button"
              variant="ghost"
              size="compact"
              onClick={onReject}
              disabled={status === 'rejected'}
              aria-label={`${COPY.rejectAffordance} (${fieldLabel})`}
            >
              <X aria-hidden />
              {COPY.statusRejected}
            </Button>
            <Button
              type="button"
              variant="secondary"
              size="compact"
              onClick={startEdit}
              disabled={status === 'rejected'}
              aria-label={`${COPY.editAffordance} (${fieldLabel})`}
            >
              <Pencil aria-hidden />
              {COPY.editAffordance}
            </Button>
            <Button
              type="button"
              variant="primary"
              size="compact"
              onClick={() => onConfirm({ value: draftValue, status: 'confirmed' })}
              disabled={status === 'confirmed' || draftValue === null || draftValue === undefined}
              aria-label={`${COPY.confirmAffordance} ${fieldLabel}`}
            >
              <Check aria-hidden />
              {COPY.confirmAffordance}
            </Button>
          </>
        )}
      </div>
    </section>
  );
}
