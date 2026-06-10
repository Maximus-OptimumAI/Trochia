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
 *  text on the agent's debug surface (which is contractually counts/scores/keys only).
 *  Strips the curated alias clause "(…)" (qa-robustness T2) so the eval top-hit sweep
 *  shows the clean facet label, not the embedded synonym phrasings — the alias text
 *  stays in chunk_text; only this DISPLAY label is cleaned. */
export function labelOf(chunkTextValue: string): string {
  const colon = chunkTextValue.indexOf(':');
  const head = colon === -1 ? chunkTextValue : chunkTextValue.slice(0, colon);
  const paren = head.indexOf('(');
  return (paren === -1 ? head : head.slice(0, paren)).trim();
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

  // NOTE: `team` (founders / advisors) is INTENTIONALLY not chunked yet — so
  // "Who are the founders?" is not answerable from labeled chunks. Deferred as
  // FOLLOWUP-MEMORY-TEAM-CHUNKS-01 (render labeled chunks for founder/advisor
  // name/role/background/equity). `team` stays on ChunkableMemoryRow for the
  // structural row match; collectFields deliberately does not read it.

  // "What the company does" — oneLiner, falling back to the solution beat so the
  // most common facet ("what do you do?") always has a short, dense target chunk.
  const whatItDoes = str(row.oneLiner) ?? str(narrative?.solution);

  // Each label carries a curated ALIAS CLAUSE (qa-robustness T2): 2–3 short generic
  // question-phrasings / synonyms, embedded BEFORE the colon so they lift both the
  // vector cosine (a short colloquial query like "what do we do" aligns to a chunk
  // that literally contains "what we do") AND the FTS lexemes. RAIL: aliases are
  // generic phrasings ONLY — never company-specific text, never content not already
  // implied by the field. The VALUE after the colon is unchanged + verbatim.
  // `labelOf` strips the "(…)" so the eval display label stays clean.
  const candidates: Field[] = [
    { label: 'Company name (business name, what we are called, company)', value: str(row.companyName) ?? '' },
    { label: 'What we do (what this company does, our product, our offering)', value: whatItDoes ?? '' },
    { label: 'Sector (industry, market, vertical)', value: str(row.sector) ?? '' },
    { label: 'Stage (funding stage, fundraising stage, what round we are raising)', value: str(row.stage) ?? '' },
    { label: 'Geography (location, where we are based)', value: str(row.geography) ?? '' },
    { label: 'Incorporation status (legal entity, how we are incorporated)', value: str(row.incorporationStatus) ?? '' },
    { label: 'Founded (founding date, when we started)', value: foundingDateValue(row.foundingDate) ?? '' },
    { label: 'Problem (what problem we solve, the pain point)', value: str(narrative?.problem) ?? '' },
    { label: 'Solution (how we solve it, our approach)', value: str(narrative?.solution) ?? '' },
    { label: 'Why now (timing, why this moment)', value: str(narrative?.why_now) ?? '' },
    { label: 'Why us (our edge, why our team)', value: str(narrative?.why_us) ?? '' },
    { label: 'Growth (traction, growth rate, momentum)', value: str(traction?.growth) ?? '' },
    { label: 'Runway (how long our cash lasts, months of runway)', value: str(traction?.runway) ?? '' },
    { label: 'MRR (monthly recurring revenue, monthly revenue)', value: metricValue(traction?.mrr) ?? '' },
    { label: 'ARR (annual recurring revenue, yearly revenue)', value: metricValue(traction?.arr) ?? '' },
    { label: 'Customers (how many customers we have, customer count, users)', value: metricValue(traction?.customers) ?? '' },
    { label: 'Currency (reporting currency, what currency we use)', value: metricValue(traction?.currency) ?? '' },
    { label: 'Valuation (company valuation, what we are valued at)', value: metricValue(traction?.valuation) ?? '' },
    { label: 'Burn (burn rate, monthly spend, cash burn)', value: metricValue(traction?.burn) ?? '' },
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
