'use client';

import * as React from 'react';

import {
  FOUNDER_OVERRIDE_SNIPPET,
  type ProvenanceField,
} from '@/ai/schemas/business-memory.zod';
import { Button } from '@/components/ui/button';
import {
  Collapsible,
  CollapsiblePanel,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { Input } from '@/components/ui/input';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { cn } from '@/lib/utils';

/**
 * ConflictResolver — Plan 02-03 / KNW-02c deliverable.
 *
 * Surfaces multi-candidate extraction: when `provenance[fieldKey]` is an array
 * (Sonnet emitted ≥2 candidate values for the same Business Memory field — the
 * helix-saas $40,250 vs $24,750 MRR case), the founder picks one canonical
 * value before the per-field Confirm action unlocks. The resolver renders
 * inline within ConfirmationCard; it is NOT a standalone surface.
 *
 * Three resolve paths:
 *
 *   1. Pick a candidate radio → onResolve(candidates[N]) fires with the chosen
 *      ProvenanceField as-is. The schema's `chooseProvenance` helper
 *      (memoryRouter, server-side) collapses the array → single object +
 *      archives losers under `rejected_alternatives` on confirmDraft.
 *
 *   2. Type a custom value + Apply (or Enter) → onResolve fires with a
 *      synthesized ProvenanceField:
 *        - source_snippet: FOUNDER_OVERRIDE_SNIPPET sentinel (the audit layer
 *          recognizes the literal '[founder override]' marker)
 *        - confidence: 1.0 (the founder is the source of truth for their data)
 *        - extracted_at: preserved from candidates[0] (earliest audit signal —
 *          per Plan 02-03 §interfaces, the override does not erase the
 *          extractor's original capture timestamp)
 *        - last_updated: now()
 *        - snooze_until: null
 *
 *   3. NaN guard on the number-typed input: if `fallbackInputType === 'number'`
 *      and the buffer parses to NaN, Apply is a no-op and an inline
 *      `text-danger` helper text renders. onResolve does NOT fire.
 *
 * Voice (docs/BRAND.md): operator register only. Trochia surfaces / flags /
 * drafts — never apologetic, never chatty, never "helps." UI strings are
 * pinned in COPY below; they are the only visible strings this component
 * renders.
 *
 * Token discipline: brand tokens only. No raw hex, no new font, no
 * traffic-light coloring. The selected option is communicated by the radio's
 * filled indicator + the option container's `border-ink/30` ring — not by a
 * green/red coloring of the value itself.
 *
 * Audit boundary (Plan 02-03 §"Trochia-specific bans for this plan" §4): this
 * component imports ONLY from `@/ai/schemas/**` on the AI side. Never from
 * the agent layer or the AI SDK chokepoint. Grep-verifiable.
 */

// ─── Operator-voice copy (the ONLY visible strings this resolver renders) ──
const COPY = {
  heading: 'Choose the canonical value',
  help: 'Trochia surfaced multiple candidates. Confirm one to continue.',
  sourceShow: 'Source',
  confidenceSuffix: 'confidence',
  customLabel: 'Use a different value',
  customApply: 'Apply',
  customPlaceholder: 'Type a value not listed above',
  customInvalid: 'Enter a valid number.',
} as const;

// Field-name patterns that imply currency formatting on the number arm.
// Matches `traction.mrr`, `traction.arr`, `traction.valuation`, etc.
const CURRENCY_FIELD_PATTERN = /(?:^|\.)(mrr|arr|valuation|burn)(?:$|\.)/i;

export interface ConflictResolverProps {
  /** Dot-pathed field key (e.g. `traction.mrr`) — used as radio name + a11y. */
  fieldKey: string;
  /** Human-readable label for the radiogroup's aria-label. */
  fieldLabel: string;
  /** Pre-resolve candidates; ≥2 entries by construction (parent guarantees). */
  candidates: ProvenanceField[];
  /** Fires with the resolved ProvenanceField (candidate or synthesized override). */
  onResolve: (chosen: ProvenanceField) => void;
  /** Input type for the custom-override row. Default `text`. */
  fallbackInputType?: 'text' | 'number';
  /** Pre-fill for the custom input. */
  defaultCustomValue?: string;
}

/**
 * Format a candidate's value for display. Pulls the value out of the
 * `source_snippet` is NOT done here — Sonnet's source_snippet is the verbatim
 * paste quote, not the extracted value. The value lives on the parent draft
 * (e.g. `draft.traction.mrr`), and the parent owns the array → value mapping.
 *
 * For the resolver's own option labels we render the candidate index + the
 * first ~120 chars of source_snippet (the founder's anchor to the paste). The
 * actual numeric value is surfaced by the parent ConfirmationCard above the
 * resolver — the resolver's job is the picker, not the value display.
 *
 * Exception: when the parent passes us a candidate whose `source_snippet`
 * contains a clean numeric token AND `fallbackInputType === 'number'`, we
 * surface that token as the option's primary label so the radio is
 * self-describing without forcing the founder to read the snippet.
 */
function extractDisplayValue(
  candidate: ProvenanceField,
  fallbackInputType: 'text' | 'number',
  fieldKey: string,
): string {
  if (fallbackInputType !== 'number') {
    // Text arm: the first sentence of the snippet (capped at 120 chars). The
    // founder anchors to the paste via the Collapsible below.
    const head = candidate.source_snippet.split(/[\n\r]/)[0]?.trim() ?? '';
    return head.length > 120 ? `${head.slice(0, 117).trimEnd()}…` : head;
  }
  // Number arm: pluck the first numeric token (with optional $/£/€ prefix and
  // thousands separators) from the snippet. If none is present, fall back to
  // the truncated snippet — the parent supplied a number-typed field but the
  // snippet didn't carry a clean numeric anchor, which is the operator's signal
  // that the candidate is shape-ambiguous (a manual read of the snippet is
  // the only honest option).
  const match = candidate.source_snippet.match(
    /[$£€]?\s*-?\d{1,3}(?:[,\s]\d{3})+(?:\.\d+)?|[$£€]?\s*-?\d+(?:\.\d+)?/,
  );
  if (!match) {
    const head = candidate.source_snippet.trim();
    return head.length > 80 ? `${head.slice(0, 77).trimEnd()}…` : head;
  }
  const raw = match[0]!.replace(/[\s,]/g, '');
  const isCurrency = /[$£€]/.test(raw) || CURRENCY_FIELD_PATTERN.test(fieldKey);
  const num = Number(raw.replace(/[$£€]/g, ''));
  if (Number.isNaN(num)) return match[0]!.trim();
  if (isCurrency) {
    return new Intl.NumberFormat(undefined, {
      style: 'currency',
      // Helix-saas fixture is USD; the schema doesn't carry a per-candidate
      // currency, so USD is the safe default for the MVP. Multi-currency
      // disambiguation moves into Phase 8 (Raise Ops / Cap Table).
      currency: 'USD',
      maximumFractionDigits: 0,
    }).format(num);
  }
  return new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 }).format(
    num,
  );
}

function formatConfidence(c: number): string {
  // Two-decimal display matches ConfirmationCard. No traffic-light coloring.
  return `${c.toFixed(2)} ${COPY.confidenceSuffix}`;
}

export function ConflictResolver({
  fieldKey,
  fieldLabel,
  candidates,
  onResolve,
  fallbackInputType = 'text',
  defaultCustomValue,
}: ConflictResolverProps) {
  const groupId = React.useId();
  // `selected` is the controlled RadioGroup value. A custom override
  // de-selects the radios (sets to null) so the visual state matches the
  // semantic resolve path.
  const [selected, setSelected] = React.useState<string | null>(null);
  const [customBuffer, setCustomBuffer] = React.useState<string>(
    defaultCustomValue ?? '',
  );
  const [customInvalid, setCustomInvalid] = React.useState(false);

  // Defensive: if the parent mis-passes a 1-element array, render gracefully
  // (single radio, no resolver semantics). The schema's `.min(2)` guard
  // prevents this in practice, but defending here keeps the component honest.
  const safeCandidates = React.useMemo(
    () => (candidates.length === 0 ? [] : candidates),
    [candidates],
  );

  const handleRadioChange = React.useCallback(
    (value: unknown) => {
      const stringValue = typeof value === 'string' ? value : String(value);
      setSelected(stringValue);
      setCustomInvalid(false);
      // Clearing the custom buffer keeps the UI honest — the radio is the
      // active resolve path now.
      if (customBuffer !== (defaultCustomValue ?? '')) {
        setCustomBuffer(defaultCustomValue ?? '');
      }
      const index = Number(stringValue);
      const candidate = safeCandidates[index];
      if (!candidate) return;
      onResolve(candidate);
    },
    [customBuffer, defaultCustomValue, onResolve, safeCandidates],
  );

  const handleCustomApply = React.useCallback(() => {
    const trimmed = customBuffer.trim();
    if (trimmed === '') {
      setCustomInvalid(false);
      return;
    }
    if (fallbackInputType === 'number') {
      const parsed = Number(trimmed.replace(/[$£€,\s]/g, ''));
      if (Number.isNaN(parsed)) {
        setCustomInvalid(true);
        return;
      }
    }
    setCustomInvalid(false);
    setSelected(null);
    // Synthesize the founder-override ProvenanceField. The schema's
    // FOUNDER_OVERRIDE_SNIPPET sentinel is the single source of truth for
    // the audit-recognizable marker; we re-use the constant rather than
    // hard-coding the literal here.
    const first = safeCandidates[0];
    const now = new Date().toISOString();
    const synthesized: ProvenanceField = {
      source_snippet: FOUNDER_OVERRIDE_SNIPPET,
      confidence: 1.0,
      // Preserve the earliest extractor capture as the audit anchor; the
      // override is a re-decision, not a new extraction.
      extracted_at: first?.extracted_at ?? now,
      last_updated: now,
      snooze_until: null,
    };
    onResolve(synthesized);
  }, [customBuffer, fallbackInputType, onResolve, safeCandidates]);

  const handleCustomKeyDown = (
    event: React.KeyboardEvent<HTMLInputElement>,
  ) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      handleCustomApply();
    }
  };

  const handleCustomChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setCustomBuffer(event.target.value);
    if (customInvalid) setCustomInvalid(false);
  };

  // SSR-stable id pattern: groupId + per-candidate suffix. base-ui's
  // RadioGroup already mints an internal hidden <input>; this id is for our
  // aria-describedby → snippet-block linkage, not for the input itself.
  const snippetId = (index: number) => `${groupId}-snippet-${index}`;
  const optionId = (index: number) => `${groupId}-option-${index}`;

  // Screen-reader announcement for the current selection.
  const announcement = React.useMemo(() => {
    if (selected === null) return '';
    const idx = Number(selected);
    const candidate = safeCandidates[idx];
    if (!candidate) return '';
    return `Selected: ${extractDisplayValue(candidate, fallbackInputType, fieldKey)}`;
  }, [selected, safeCandidates, fallbackInputType, fieldKey]);

  return (
    <fieldset
      role="radiogroup"
      aria-label={`Candidate values for ${fieldLabel}`}
      data-testid="conflict-resolver"
      data-field={fieldKey}
      className="flex flex-col gap-4"
    >
      <legend className="sr-only">{fieldLabel}</legend>

      {/* Heading + help text */}
      <div className="flex flex-col gap-1">
        <p className="text-body-sm text-ink">{COPY.heading}</p>
        <p className="text-body-sm text-graphite">{COPY.help}</p>
      </div>

      {/* Candidate options */}
      <RadioGroup
        name={fieldKey}
        value={selected ?? ''}
        onValueChange={handleRadioChange}
      >
        {safeCandidates.map((candidate, index) => {
          const indexStr = String(index);
          const isSelected = selected === indexStr;
          const value = extractDisplayValue(
            candidate,
            fallbackInputType,
            fieldKey,
          );
          return (
            <label
              key={`${fieldKey}-${index}`}
              htmlFor={optionId(index)}
              data-testid="conflict-resolver-option"
              data-selected={isSelected ? 'true' : 'false'}
              className={cn(
                'flex cursor-pointer flex-col gap-2 rounded-lg border border-stone bg-paper p-4 transition-colors',
                'hover:border-ink/30',
                isSelected && 'border-ink/30 ring-1 ring-ink/10',
              )}
            >
              <div className="flex items-start gap-3">
                <RadioGroupItem
                  id={optionId(index)}
                  value={indexStr}
                  aria-describedby={snippetId(index)}
                  className="mt-1"
                />
                <div className="flex flex-1 flex-wrap items-baseline justify-between gap-3">
                  <span
                    className="text-body text-ink"
                    data-testid="conflict-resolver-option-value"
                  >
                    {value}
                  </span>
                  <span
                    className="font-mono text-sm text-graphite"
                    aria-label={`Extractor confidence ${formatConfidence(candidate.confidence)}`}
                  >
                    {formatConfidence(candidate.confidence)}
                  </span>
                </div>
              </div>

              {/* Source snippet (collapsible — re-use of 02-02 primitive) */}
              <div id={snippetId(index)} className="pl-7">
                <Collapsible>
                  <CollapsibleTrigger
                    aria-label={`${COPY.sourceShow} for candidate ${index + 1}`}
                    data-testid="conflict-resolver-source-trigger"
                  >
                    <span>{COPY.sourceShow}</span>
                  </CollapsibleTrigger>
                  <CollapsiblePanel>
                    <blockquote
                      className="mt-2 border-l-2 border-stone bg-stone/40 px-4 py-3 font-mono text-sm text-graphite"
                      data-testid="conflict-resolver-source-snippet"
                    >
                      {candidate.source_snippet}
                    </blockquote>
                  </CollapsiblePanel>
                </Collapsible>
              </div>
            </label>
          );
        })}
      </RadioGroup>

      {/* Custom override row */}
      <div className="flex flex-col gap-2 border-t border-stone pt-4">
        <label
          htmlFor={`${groupId}-custom`}
          className="text-label uppercase text-graphite"
        >
          {COPY.customLabel}
        </label>
        <div className="flex flex-wrap items-center gap-3">
          <Input
            id={`${groupId}-custom`}
            type={fallbackInputType}
            value={customBuffer}
            onChange={handleCustomChange}
            onKeyDown={handleCustomKeyDown}
            placeholder={COPY.customPlaceholder}
            aria-label={`Custom value for ${fieldLabel}`}
            aria-invalid={customInvalid || undefined}
            data-testid="conflict-resolver-custom-input"
            className="max-w-sm"
          />
          <Button
            type="button"
            variant="secondary"
            size="compact"
            onClick={handleCustomApply}
            disabled={customBuffer.trim() === ''}
            aria-label={`${COPY.customApply} custom value for ${fieldLabel}`}
            data-testid="conflict-resolver-custom-apply"
          >
            {COPY.customApply}
          </Button>
        </div>
        {customInvalid && (
          <p
            className="text-body-sm text-danger"
            role="alert"
            data-testid="conflict-resolver-custom-error"
          >
            {COPY.customInvalid}
          </p>
        )}
      </div>

      {/* aria-live announcement for assistive tech (visually hidden) */}
      <span aria-live="polite" className="sr-only">
        {announcement}
      </span>
    </fieldset>
  );
}
