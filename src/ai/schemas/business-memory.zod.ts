/**
 * Business Memory — Zod side of the schema-lock contract (Phase 2 / KNW-01).
 *
 * This file is the application-layer source of truth for the `business_memory`
 * row shape. It mirrors `src/db/schema/memory.ts` 1:1 on column set and owns
 * the `provenance` jsonb sub-shape outright — Plan 02-01 deliberately did NOT
 * enforce provenance keys in SQL so the structure can evolve across V2/V3
 * without a migration. The column set CANNOT.
 *
 * Two consumers depend on the exports below:
 *
 *  1. `src/ai/agents/extract-from-paste.agent.ts` passes `businessMemoryDraftSchema`
 *     to `runAgent<BusinessMemoryDraft>()` — the schema becomes a forced-tool-use
 *     tool, the model's structured output is re-parsed against it before return.
 *  2. `src/components/memory/confirmation-form.tsx` uses the same schema as the
 *     react-hook-form resolver — what the extractor drafts is exactly what the
 *     founder edits, and exactly what the `memoryRouter.confirmDraft` mutation
 *     persists.
 *
 * The draft shape omits the lifecycle columns (`extractedAt`, `confirmedAt`,
 * `lastUpdatedAt`, `createdAt`, `updatedAt`) — those are server-set on persist,
 * not extractor output. `businessMemoryConfirmedSchema` extends the draft with
 * `confirmedAt` for the founder-confirm submission.
 *
 * ## Provenance contract (jsonb shape, enforced HERE not in SQL)
 *
 * Keyed by Business Memory field name. Dot-paths for nested fields are allowed
 * — e.g. `traction.mrr`, `team.founders`. Each value:
 *
 *   {
 *     source_snippet: string,        // verbatim quote from the paste/import
 *     confidence: number,            // 0..1 from the extractor
 *     extracted_at: ISO datetime,    // set by extractor
 *     last_updated: ISO datetime,    // bumped on every founder edit
 *     snooze_until: ISO datetime | null,  // KNW-08 staleness snooze
 *   }
 *
 * ## Week-3 additions (Plan 02-03 / KNW-02c)
 *
 * The Week-3 conflict resolver surfaces extractor uncertainty: when the paste
 * contains contradictory values for the same field (the helix-saas fixture
 * cites $40,250 AND $24,750 for MRR in the same paragraph), Sonnet may emit
 * an ARRAY of provenance entries for that field instead of a single object.
 * The founder picks one canonical value; the losers are archived under the
 * chosen entry's optional `rejected_alternatives` field for audit (NEVER
 * surfaced in UI). The shape evolution is ADDITIVE:
 *
 *   - `provenanceFieldSchema` gains optional `rejected_alternatives` (the
 *     post-resolve audit trail). The pre-Week-3 single-entry shape is still
 *     valid — `rejected_alternatives` is `.optional()`.
 *   - `provenanceEntrySchema = union(provenanceFieldSchema | array(provenanceFieldSchema).min(2))`
 *     — the per-field value is either the canonical (post-resolve) single
 *     entry OR a pre-resolve array of two-or-more candidates. The `.min(2)`
 *     guard prevents one-element arrays (those collapse to the scalar arm).
 *   - `provenanceSchema = z.record(z.string(), provenanceEntrySchema)` — the
 *     keyed record now maps to the union. Every Plan 02-02 fixture that emits
 *     single-entry provenance still parses unchanged.
 *
 * Helpers landed here for use by ConflictResolver (UI) + memoryRouter (server):
 *
 *   - `isProvenanceArray(entry)` — type guard for the array arm.
 *   - `chooseProvenance(candidates, chosenIndex)` — collapse the array into
 *     the canonical single entry; the non-chosen candidates land in
 *     `rejected_alternatives`. Stamps `last_updated` on the chosen entry.
 *   - `synthesizeOverrideProvenance(value, fieldKey)` — for the "Use a
 *     different value" path on the conflict resolver. Produces a single
 *     ProvenanceField sourced from `[founder override]` — a sentinel string
 *     the UI + audit layer recognize. Founder PII is NEVER embedded.
 *
 * ## Schema-lock invariant (still in force)
 *
 * All changes here are app-layer Zod-only. The `provenance` jsonb column at
 * the SQL layer (src/db/schema/memory.ts) is unchanged from Plan 02-01. No
 * migrations are required for the union shape — Postgres jsonb accepts both
 * single objects and arrays under the same column.
 *
 * ## Banned-string discipline
 *
 * The extractor's defensive post-parse check (Task 3) substring-scans the
 * stringified draft against the project's compliance ban list
 * (`tasks/banned-strings.txt`). This schema does not enforce that — it is the
 * extractor's job — but the schema also does not introduce any banned phrase
 * in field names, defaults, comments, or example values.
 */
import { z } from 'zod';

// ────────────────────────────────────────────────────────────────────────────
// Provenance — keyed by Business Memory field name
// ────────────────────────────────────────────────────────────────────────────

/**
 * Internal — the five canonical provenance keys WITHOUT the Week-3
 * `rejected_alternatives` audit field. Used as the element type of the
 * `rejected_alternatives` array (which is one level deep — losers do NOT
 * themselves carry losers) and as the element type of the pre-resolve
 * multi-candidate array arm of `provenanceEntrySchema`.
 */
const provenanceFieldBaseSchema = z.object({
  /** Verbatim quote from the paste — never the model's paraphrase. */
  source_snippet: z.string().min(1).max(800),
  /** Extractor confidence in the value, in [0, 1]. */
  confidence: z.number().min(0).max(1),
  /** ISO 8601 timestamp set by the extractor on first emission. */
  extracted_at: z.iso.datetime(),
  /** ISO 8601 — bumped on every founder edit in the confirmation UI. */
  last_updated: z.iso.datetime(),
  /** ISO 8601 — set by KNW-08 staleness nudge snooze; null when not snoozed. */
  snooze_until: z.iso.datetime().nullable(),
});

/**
 * One provenance entry for a single Business Memory field. The snippet is the
 * verbatim text the extractor pulled from the paste; 800 chars is the upper
 * bound (one long paragraph), which the extractor system prompt also caps.
 *
 * Week-3 addition (Plan 02-03): an optional `rejected_alternatives` array
 * archives the losing candidates after the founder picks the canonical value
 * via the ConflictResolver. The field is OPTIONAL — every Plan 02-02 fixture
 * (which emits single-entry provenance with no rejected_alternatives key) still
 * parses unchanged. The audit trail is one level deep — rejected entries do
 * NOT themselves carry rejected_alternatives.
 */
export const provenanceFieldSchema = provenanceFieldBaseSchema.extend({
  /**
   * Audit trail of conflict-resolution losers. Set by `chooseProvenance` when
   * collapsing a multi-candidate array into a single canonical entry; absent
   * on fields that were never in conflict. NEVER surfaced in UI — read by the
   * audit layer only.
   */
  rejected_alternatives: z.array(provenanceFieldBaseSchema).optional(),
});
export type ProvenanceField = z.infer<typeof provenanceFieldSchema>;

/**
 * The pre-resolve multi-candidate shape. Sonnet emits an array under a field
 * key when the paste contains contradictory values for the same field (the
 * helix-saas $40,250 vs $24,750 MRR case). `.min(2)` because a single-element
 * array is not a conflict — collapse to the scalar arm to remove ambiguity.
 * The conflict resolver consumes this; `chooseProvenance` collapses it back
 * to a single `ProvenanceField` before persistence.
 *
 * Element type is `provenanceFieldBaseSchema` (NOT `provenanceFieldSchema`):
 * a candidate that has not yet been chosen cannot itself carry the
 * `rejected_alternatives` audit field. Only the post-resolve winner does.
 */
export const provenanceFieldsArraySchema = z.array(provenanceFieldBaseSchema).min(2);
export type ProvenanceFieldsArray = z.infer<typeof provenanceFieldsArraySchema>;

/**
 * Per-field provenance value — the union of the two shapes a Business Memory
 * field's provenance entry can take:
 *
 *   - Single object (`provenanceFieldSchema`): the canonical value, optionally
 *     carrying a `rejected_alternatives` audit trail. This is the default and
 *     the only shape that ever persists past founder confirmation.
 *   - Array of ≥2 base entries (`provenanceFieldsArraySchema`): a pre-resolve
 *     multi-candidate shape. The conflict resolver renders one chooser per
 *     such field; the form-level Confirm action is gated until every array
 *     has been collapsed via `chooseProvenance`.
 *
 * The union is additive — every Plan 02-02 fixture (single-entry only) still
 * parses against the single-object arm without modification.
 */
export const provenanceEntrySchema = z.union([
  provenanceFieldSchema,
  provenanceFieldsArraySchema,
]);
export type ProvenanceEntry = z.infer<typeof provenanceEntrySchema>;

/**
 * Full provenance map: field-name (or dot-path for nested keys) → entry.
 *
 * Keys are open-ended on purpose — the extractor cites whichever fields the
 * paste actually supports, and downstream consumers (conflict resolver,
 * staleness nudges, Q&A citation chips) read by key without needing to know
 * every possible name ahead of time.
 *
 * Week-3 upgrade (Plan 02-03): values are now the `provenanceEntrySchema`
 * union (single object | multi-candidate array). Backward-compatible —
 * Plan 02-02 single-entry payloads still parse unchanged.
 */
export const provenanceSchema = z.record(z.string(), provenanceEntrySchema);
export type Provenance = z.infer<typeof provenanceSchema>;

// ────────────────────────────────────────────────────────────────────────────
// Provenance helpers — consumed by ConflictResolver + memoryRouter
// ────────────────────────────────────────────────────────────────────────────

/**
 * Sentinel `source_snippet` value used by `synthesizeOverrideProvenance` for
 * founder-typed override values. The UI + audit layer use this literal to
 * distinguish operator-entered values from extractor-cited ones. Founder PII
 * (name, email) is deliberately NOT embedded — the audit row in `interaction`
 * carries the founder's identity via `accountId`/`userId` already.
 */
export const FOUNDER_OVERRIDE_SNIPPET = '[founder override]' as const;

/**
 * Type guard: is this provenance entry the pre-resolve multi-candidate array?
 *
 * Used by ConfirmationCard to decide whether to mount the inline
 * ConflictResolver, and by memoryRouter's confirmDraft to detect unresolved
 * entries (the server's backstop against form bypass).
 */
export function isProvenanceArray(
  entry: ProvenanceEntry,
): entry is ProvenanceField[] {
  return Array.isArray(entry);
}

/**
 * Collapse a multi-candidate provenance array into the canonical single entry.
 *
 * Picks `candidates[chosenIndex]` as the winner, archives the other entries
 * under the winner's `rejected_alternatives` field, and bumps `last_updated`
 * on the winner to the current wall-clock time (the founder's resolve action
 * IS a write event — staleness nudges should reset from here).
 *
 * Throws on a degenerate input — the caller (memoryRouter) should never reach
 * this helper with a single-element or empty array (those collapse to the
 * scalar arm at the schema layer), and should never pass an out-of-range
 * index. Both error cases are bugs in the caller, not user-facing states.
 */
export function chooseProvenance(
  candidates: ProvenanceField[],
  chosenIndex: number,
): ProvenanceField {
  if (candidates.length < 2) {
    throw new Error(
      `chooseProvenance: expected ≥2 candidates, got ${candidates.length}`,
    );
  }
  if (chosenIndex < 0 || chosenIndex >= candidates.length) {
    throw new Error(
      `chooseProvenance: chosenIndex ${chosenIndex} out of range [0, ${candidates.length - 1}]`,
    );
  }
  const winner = candidates[chosenIndex]!;
  const losers = candidates.filter((_, i) => i !== chosenIndex);
  return {
    ...winner,
    last_updated: new Date().toISOString(),
    rejected_alternatives: losers,
  };
}

/**
 * Synthesize a single ProvenanceField for the "Use a different value" path on
 * the ConflictResolver — the founder types a value not present in the paste.
 *
 * The synthesized snippet uses the `FOUNDER_OVERRIDE_SNIPPET` sentinel so the
 * UI + audit layer can recognize founder-entered values without inspecting the
 * source paste. Confidence is set to 1.0 (the founder is the source of truth
 * for their own data); `extracted_at` and `last_updated` are stamped to the
 * current wall-clock time. Founder identity is NEVER embedded in the snippet
 * — that linkage lives in the `interaction` audit row.
 *
 * `fieldKey` is currently unused in the returned object but kept in the
 * signature so future audit work (Phase 7+) can attach a per-field origin
 * marker without re-threading callers.
 */
export function synthesizeOverrideProvenance(
  _value: string,
  _fieldKey: string,
): ProvenanceField {
  // Params reserved for Phase 7+ audit; intentionally not embedded in the
  // returned snippet (founder identity stays in interaction audit rows).
  void _value;
  void _fieldKey;
  const now = new Date().toISOString();
  return {
    source_snippet: FOUNDER_OVERRIDE_SNIPPET,
    confidence: 1.0,
    extracted_at: now,
    last_updated: now,
    snooze_until: null,
  };
}

// ────────────────────────────────────────────────────────────────────────────
// Structured-group sub-schemas (jsonb columns at the SQL layer)
// ────────────────────────────────────────────────────────────────────────────

/**
 * One founder entry inside `team.founders`. Equity is a percentage (0..100,
 * not 0..1) because that is how founders write it; the cap-table engine
 * (Phase 8) normalizes if needed.
 */
export const founderSchema = z
  .object({
    name: z.string().min(1),
    role: z.string().optional(),
    background: z.string().optional(),
    equity_pct: z.number().min(0).max(100).optional(),
  })
  .catchall(z.unknown());
export type Founder = z.infer<typeof founderSchema>;

/** One advisor entry inside `team.advisors`. */
export const advisorSchema = z
  .object({
    name: z.string().min(1),
    background: z.string().optional(),
  })
  .catchall(z.unknown());
export type Advisor = z.infer<typeof advisorSchema>;

/**
 * `team` jsonb shape. Permissive on extra keys (`.catchall(z.unknown())`) per
 * the CONTEXT decision: jsonb shape can evolve at the app layer without
 * migrations. The two named groups (`founders`, `advisors`) are the ones
 * Phase 2 reads + writes.
 */
export const teamSchema = z
  .object({
    founders: z.array(founderSchema).optional(),
    advisors: z.array(advisorSchema).optional(),
  })
  .catchall(z.unknown());
export type Team = z.infer<typeof teamSchema>;

/**
 * `traction` jsonb shape. All numeric metrics are optional; currency is a
 * sibling ISO 4217 code so mixed-currency MRR/ARR is representable (the
 * fintech fixture deliberately ships both $ and £ figures — Week 3 conflict
 * resolver picks the canonical one). Growth + runway are free-form strings
 * because founders write them as ranges or qualitative phrases ("3x YoY",
 * "~18 months at current burn").
 */
export const tractionSchema = z
  .object({
    mrr: z.number().optional(),
    arr: z.number().optional(),
    currency: z.string().length(3).optional(),
    customers: z.number().optional(),
    growth: z.string().optional(),
    runway: z.string().optional(),
    valuation: z.number().optional(),
    burn: z.number().optional(),
  })
  .catchall(z.unknown());
export type Traction = z.infer<typeof tractionSchema>;

/**
 * `narrative` jsonb shape — the four pitch story beats. Each field is a free-
 * form string; the Pitch Lab (Phase 3) re-renders these into deck sections.
 */
export const narrativeSchema = z
  .object({
    problem: z.string().optional(),
    solution: z.string().optional(),
    why_now: z.string().optional(),
    why_us: z.string().optional(),
  })
  .catchall(z.unknown());
export type Narrative = z.infer<typeof narrativeSchema>;

// ────────────────────────────────────────────────────────────────────────────
// Top-level draft + confirmed shapes
// ────────────────────────────────────────────────────────────────────────────

/**
 * `businessMemoryDraftSchema` — the shape the extractor agent returns from
 * `runAgent<BusinessMemoryDraft>()`. Top-level scalar fields mirror the
 * `business_memory` table columns (companyName, oneLiner, sector, stage,
 * geography, incorporationStatus, foundingDate). Structured groups (team,
 * traction, narrative) are jsonb at SQL, Zod-shaped here. Provenance is
 * REQUIRED — the extractor system prompt forbids emitting a populated scalar
 * without a matching provenance entry.
 *
 * Server-set lifecycle timestamps are deliberately absent — `extractedAt`,
 * `confirmedAt`, `lastUpdatedAt`, `createdAt`, `updatedAt` live on the row
 * but are not part of the extractor's output contract.
 */
export const businessMemoryDraftSchema = z.object({
  companyName: z.string().min(1).optional(),
  /** Marketing-shaped one-line description; capped to keep card UI tidy. */
  oneLiner: z.string().min(1).max(140).optional(),
  sector: z.string().min(1).optional(),
  stage: z.string().min(1).optional(),
  geography: z.string().min(1).optional(),
  incorporationStatus: z.string().min(1).optional(),
  foundingDate: z.iso.datetime().optional(),
  team: teamSchema.optional(),
  traction: tractionSchema.optional(),
  narrative: narrativeSchema.optional(),
  /** REQUIRED: every populated scalar must carry a matching provenance entry. */
  provenance: provenanceSchema,
});
export type BusinessMemoryDraft = z.infer<typeof businessMemoryDraftSchema>;

/**
 * `businessMemoryConfirmedSchema` — what the founder submits from the
 * confirmation UI. Adds `confirmedAt` (the server stamps this in the
 * `memoryRouter.confirmDraft` mutation; the form sends an ISO string).
 *
 * Implementation note: we extend `.shape` rather than `.extend({...})` so the
 * Zod v4 unwrapped fields stay as a flat property bag (catchall behavior
 * carried by sub-schemas, not by the top-level object).
 */
export const businessMemoryConfirmedSchema = z.object({
  ...businessMemoryDraftSchema.shape,
  confirmedAt: z.iso.datetime(),
});
export type BusinessMemoryConfirmed = z.infer<typeof businessMemoryConfirmedSchema>;

// ────────────────────────────────────────────────────────────────────────────
// Invariant guard — used by the extractor unit test (Task 4)
// ────────────────────────────────────────────────────────────────────────────

/**
 * Count of populated top-level Business Memory scalar fields. A field counts
 * when it is present AND non-empty. The Phase 2 quality bar is ≥8 fields
 * across the 7 top-level scalars + the three structured groups (team /
 * traction / narrative — each counts if it has at least one populated
 * sub-key). The extractor unit test reads this number to enforce the bar
 * per fixture.
 */
export function countPopulatedFields(draft: BusinessMemoryDraft): number {
  let count = 0;
  if (draft.companyName) count++;
  if (draft.oneLiner) count++;
  if (draft.sector) count++;
  if (draft.stage) count++;
  if (draft.geography) count++;
  if (draft.incorporationStatus) count++;
  if (draft.foundingDate) count++;
  if (draft.team && Object.keys(draft.team).length > 0) count++;
  if (draft.traction && Object.keys(draft.traction).length > 0) count++;
  if (draft.narrative && Object.keys(draft.narrative).length > 0) count++;
  return count;
}

/**
 * Count of provenance keys whose `source_snippet` is non-empty. The Phase 2
 * bar is ≥3 fields carrying a source snippet per fixture (master plan
 * §Week 2 verification step 1).
 *
 * Week-3 (Plan 02-03): the per-field value is now a union of single object |
 * multi-candidate array. For an array, the key counts as "has source snippet"
 * if ANY candidate carries a non-empty snippet — a multi-candidate field that
 * the founder has not yet resolved still represents extractor coverage of
 * that field for the invariant's purpose.
 */
export function countSourceSnippets(draft: BusinessMemoryDraft): number {
  let count = 0;
  for (const entry of Object.values(draft.provenance)) {
    if (Array.isArray(entry)) {
      if (entry.some((c) => c.source_snippet.trim().length > 0)) count++;
    } else if (entry.source_snippet.trim().length > 0) {
      count++;
    }
  }
  return count;
}

/**
 * Cross-check that every populated top-level scalar has a matching
 * provenance entry. Returns the names of populated scalars that are MISSING
 * a provenance key (empty array means full coverage). The extractor unit
 * test uses this to fail loudly when the model omits citations.
 *
 * Scope: top-level scalars only. Dot-path provenance keys for nested fields
 * (e.g. `traction.mrr`, `team.founders[0].name`) are checked separately by
 * the conflict resolver (Week 3), not here.
 */
export function assertProvenanceCoversFields(draft: BusinessMemoryDraft): {
  populatedScalars: number;
  provenanceEntries: number;
  scalarsMissingProvenance: string[];
} {
  const topLevelScalars: Array<keyof BusinessMemoryDraft> = [
    'companyName',
    'oneLiner',
    'sector',
    'stage',
    'geography',
    'incorporationStatus',
    'foundingDate',
  ];
  const missing: string[] = [];
  let populated = 0;
  for (const key of topLevelScalars) {
    const value = draft[key];
    if (value !== undefined && value !== null && value !== '') {
      populated++;
      if (!(key in draft.provenance)) missing.push(String(key));
    }
  }
  return {
    populatedScalars: populated,
    provenanceEntries: Object.keys(draft.provenance).length,
    scalarsMissingProvenance: missing,
  };
}
