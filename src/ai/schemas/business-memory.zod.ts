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
 * One provenance entry for a single Business Memory field. The snippet is the
 * verbatim text the extractor pulled from the paste; 800 chars is the upper
 * bound (one long paragraph), which the extractor system prompt also caps.
 */
export const provenanceFieldSchema = z.object({
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
export type ProvenanceField = z.infer<typeof provenanceFieldSchema>;

/**
 * Full provenance map: field-name (or dot-path for nested keys) → entry.
 *
 * Keys are open-ended on purpose — the extractor cites whichever fields the
 * paste actually supports, and downstream consumers (conflict resolver,
 * staleness nudges, Q&A citation chips) read by key without needing to know
 * every possible name ahead of time.
 */
export const provenanceSchema = z.record(z.string(), provenanceFieldSchema);
export type Provenance = z.infer<typeof provenanceSchema>;

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
 */
export function countSourceSnippets(draft: BusinessMemoryDraft): number {
  let count = 0;
  for (const entry of Object.values(draft.provenance)) {
    if (entry.source_snippet.trim().length > 0) count++;
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
