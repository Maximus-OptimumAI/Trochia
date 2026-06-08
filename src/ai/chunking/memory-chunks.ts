/**
 * Field-aligned, LABELED business-memory chunker (Plan 2026-06-08 memory-answerable / T1).
 *
 * ## Why this exists
 *
 * The 02-04 pipeline embedded a confirmed business_memory by concatenating
 * `narrative.* + traction.{growth,runway}` into ONE string and chunking it at
 * the 800-token (~3200-char) `DEFAULT_CHUNK_OPTIONS` budget. For any real memory
 * that fit under ~3200 chars (i.e. all of them at Phase-2 scale) this produced a
 * SINGLE diluted chunk, and it embedded NO scalar facets at all (sector, stage,
 * companyName, geography were excluded by design — see the old embed-memory.ts
 * note). Measured consequence: facet queries scored 0.42–0.49 cosine against the
 * blob — under the 0.6 grounding floor — so Q&A returned "I don't have that" even
 * for "What does <company> do?" (0.42). And "What sector/stage?" could not be
 * answered by EITHER retrieval side, because those fields never landed in any
 * `chunk_text` (so FTS over chunk_text couldn't match them either).
 *
 * ## What this does
 *
 * `buildMemoryChunks(row)` emits ONE labeled chunk per populated field — each
 * chunk's text carries its field label ("Stage: Pre-seed", "What the company
 * does: …") so a short facet query aligns to a short single-fact chunk (high
 * cosine) AND the label becomes an FTS keyword. Long prose fields that exceed the
 * char budget are sub-chunked via the existing `chunkText` and EACH sub-chunk is
 * re-prefixed with its field label (`Problem (cont.): …`) so a mid-field sub-chunk
 * still aligns.
 *
 * Pure + deterministic (same discipline as chunk.ts): zero I/O, zero async, zero
 * randomness. Same row → same chunks, byte-for-byte. `idx` is 0-based contiguous
 * across all fields. The idempotency contract is unchanged — embed-memory.ts
 * delete-then-inserts by (account, source_type, source_id, model) across every
 * chunk_idx, so going 1→N (or N→M) needs no migration and orphans nothing.
 *
 * NO schema change: the label lives inside `chunk_text` (a text column); chunk_idx
 * already supports N rows.
 */
import { chunkText, DEFAULT_CHUNK_OPTIONS, type Chunk } from '@/ai/chunking/chunk';
import type { Narrative, Traction } from '@/ai/schemas/business-memory.zod';

/** Heuristic mirror of chunk.ts: 1 token ≈ 4 chars (English). tokenCount is an estimate. */
const TOKENS_PER_CHAR = 1 / 4;
function estimateTokens(text: string): number {
  return Math.ceil(text.length * TOKENS_PER_CHAR);
}

/** Char budget above which a single field's labeled text is sub-chunked + relabeled.
 *  Matches chunk.ts's window (800 tokens → 3200 chars) so behaviour is consistent. */
const FIELD_CHAR_BUDGET = Math.floor(DEFAULT_CHUNK_OPTIONS.size / TOKENS_PER_CHAR); // 3200

/** The row subset this chunker reads — structurally compatible with BusinessMemoryRow. */
export type ChunkableMemoryRow = {
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
};

/** A {label, value} pair to be rendered into one (or, if long, several) labeled chunks. */
type Field = { label: string; value: string };

/** Extract the field label (the text before the first ':') from a labeled chunk's text.
 *  Used by the eval to map a top-hit chunk_idx → a human label WITHOUT putting chunk
 *  text on the agent's debug surface (which is contractually counts/scores/keys only). */
export function labelOf(chunkTextValue: string): string {
  const i = chunkTextValue.indexOf(':');
  return (i === -1 ? chunkTextValue : chunkTextValue.slice(0, i)).trim();
}

/** Normalize a possibly-empty scalar to a trimmed non-empty string, else null. */
function str(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const t = v.trim();
  return t.length > 0 ? t : null;
}

/** Render foundingDate (timestamp or ISO string) to a YYYY-MM-DD facet value. */
function foundingDateValue(v: string | Date | null): string | null {
  if (v == null) return null;
  const d = v instanceof Date ? v : new Date(v);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10); // YYYY-MM-DD
}

/** Render a traction metric (number or already-free-text string) to a facet value. */
function metricValue(v: unknown): string | null {
  if (typeof v === 'number' && Number.isFinite(v)) return String(v);
  return str(v);
}

/**
 * Build the ordered {label, value} field list from a confirmed business_memory row.
 * Empty fields are skipped. Order is deterministic (facets first, then narrative
 * beats, then traction) so chunk_idx is stable across re-embeds of the same content.
 */
function collectFields(row: ChunkableMemoryRow): Field[] {
  const narrative = (row.narrative ?? null) as Narrative | null;
  const traction = (row.traction ?? null) as Traction | null;

  // "What the company does" — oneLiner, falling back to the solution beat so the
  // most common facet ("what do you do?") always has a short, dense target chunk.
  const whatItDoes = str(row.oneLiner) ?? str(narrative?.solution);

  const candidates: Field[] = [
    { label: 'Company name', value: str(row.companyName) ?? '' },
    { label: 'What the company does', value: whatItDoes ?? '' },
    { label: 'Sector', value: str(row.sector) ?? '' },
    { label: 'Stage', value: str(row.stage) ?? '' },
    { label: 'Geography', value: str(row.geography) ?? '' },
    { label: 'Incorporation status', value: str(row.incorporationStatus) ?? '' },
    { label: 'Founded', value: foundingDateValue(row.foundingDate) ?? '' },
    { label: 'Problem', value: str(narrative?.problem) ?? '' },
    { label: 'Solution', value: str(narrative?.solution) ?? '' },
    { label: 'Why now', value: str(narrative?.why_now) ?? '' },
    { label: 'Why us', value: str(narrative?.why_us) ?? '' },
    { label: 'Growth', value: str(traction?.growth) ?? '' },
    { label: 'Runway', value: str(traction?.runway) ?? '' },
    { label: 'MRR', value: metricValue(traction?.mrr) ?? '' },
    { label: 'ARR', value: metricValue(traction?.arr) ?? '' },
    { label: 'Customers', value: metricValue(traction?.customers) ?? '' },
    { label: 'Currency', value: metricValue(traction?.currency) ?? '' },
    { label: 'Valuation', value: metricValue(traction?.valuation) ?? '' },
    { label: 'Burn', value: metricValue(traction?.burn) ?? '' },
  ];

  return candidates.filter((f) => f.value.length > 0);
}

/**
 * Render one field into one labeled chunk, or — when the labeled text exceeds the
 * char budget — several labeled sub-chunks (each re-prefixed with the field label).
 * Returns raw {text} fragments; `buildMemoryChunks` assigns the contiguous idx.
 */
function renderField({ label, value }: Field): string[] {
  const full = `${label}: ${value}`;
  if (full.length <= FIELD_CHAR_BUDGET) return [full];
  // Long prose field: sub-chunk the VALUE, relabel each piece so a mid-field
  // sub-chunk still aligns to a facet query about this field.
  return chunkText(value, DEFAULT_CHUNK_OPTIONS).map((sub, i) =>
    i === 0 ? `${label}: ${sub.text}` : `${label} (cont.): ${sub.text}`,
  );
}

/**
 * Build the labeled, field-aligned chunk set for a confirmed business_memory row.
 * Returns `[]` when every field is empty (the caller treats that as
 * EMBED_NOTHING_TO_EMBED). `idx` is 0-based contiguous; `tokenCount` is estimated.
 */
export function buildMemoryChunks(row: ChunkableMemoryRow): Chunk[] {
  const texts = collectFields(row).flatMap(renderField);
  return texts.map((text, idx) => ({ text, idx, tokenCount: estimateTokens(text) }));
}
