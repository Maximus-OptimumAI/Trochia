/**
 * Content-aware PII redactor — unrelated-party email / phone / wallet / SSN
 * scrubbing on the post-LLM Business Memory draft (Phase 2 / KNW-02d).
 *
 * ## Contract
 *
 *   PURE TRANSFORMER. Sync. Zero I/O. The only allowed import is the
 *   `BusinessMemoryDraft` type from `@/ai/schemas/business-memory.zod` —
 *   nothing from `@anthropic-ai/sdk`, nothing from `@/lib/logger`, no DB
 *   modules, no client modules.
 *
 *   The redactor returns a NEW draft (deep-cloned via `structuredClone`) and
 *   leaves the input draft byte-identical for the caller's audit-log path.
 *   The interaction row in `memoryRouter.confirmDraft` captures the
 *   PRE-redaction draft for legitimate audit purposes; the persisted
 *   `business_memory` row carries the POST-redaction draft. Two distinct
 *   audit surfaces, one input.
 *
 *   The redactor NEVER throws. Malformed input (missing narrative, no
 *   provenance, founders undefined) flows through as `{ redactionsApplied: 0,
 *   byType: { ... all zero } }` with the deep-cloned input returned unchanged.
 *
 * ## Why this runs AFTER `runAgent`, BEFORE the agent returns
 *
 *   The pre-LLM defense (`promptInjectionSanitizer`) screens for INSTRUCTIONS,
 *   not for PII — an attacker-controlled paste may legitimately contain a
 *   third-party email the founder is asking us to track ("Investor John Doe
 *   from john@vc.example replied with..."). We can't scrub PII before the LLM
 *   sees it because the LLM may need that context to extract a meaningful
 *   draft. The redactor runs on the EXTRACTOR'S OUTPUT — Sonnet's draft of the
 *   `business_memory` row — and scrubs unrelated-party PII before persistence.
 *
 *   This is pre-SAVE, not pre-LLM, per `tasks/constraints.md`.
 *
 * ## Founder-self exemption
 *
 *   The redactor preserves PII that belongs to the founders the agent already
 *   knows about (`draft.team.founders[*]`). The exemption set is built from
 *   the `founders` argument the caller passes (typically
 *   `draft.team?.founders ?? []`):
 *
 *     - founders[*].email   → lowercase + trim → added to the email exemption
 *     - founders[*].phone   → lowercase + trim → added to the phone exemption
 *     - founders[*].name    → NOT exempted. Name detection is heuristic and
 *                             out-of-scope for Week 3; we don't redact names
 *                             at all (third-party names survive the redactor).
 *
 *   Wallets and SSNs are NEVER founder-self-exempted (we don't ask founders
 *   for these in onboarding, and the cost of false-positive redaction on the
 *   founder's own wallet is negligible vs the risk of leaking an investor's).
 *
 *   The exemption is content-aware (matches the literal text of the founder's
 *   contact) — NOT key-aware. The logger's `SENSITIVE_FIELDS` (Phase 1) is the
 *   complementary key-aware layer; the two run at different stages and
 *   protect against different leak vectors.
 *
 * ## Walked paths
 *
 *   These are the paths the redactor touches:
 *
 *     - draft.narrative.problem
 *     - draft.narrative.solution
 *     - draft.narrative.why_now
 *     - draft.narrative.why_us
 *     - draft.traction.growth
 *     - draft.traction.runway
 *     - draft.oneLiner (top-level marketing string — LLM-emitted; T15-FIX-1 H1)
 *     - draft.team.* string leaves via bounded recursive traversal — every
 *       string in founders[*], advisors[*], and any catchall key under team —
 *       EXCEPT `email` and `phone` keys (those are the founder-self exemption
 *       channel and stay preserved verbatim). T15-FIX-1 H1.
 *     - draft.provenance[fieldKey].source_snippet (single-object arm)
 *     - draft.provenance[fieldKey][i].source_snippet (array arm — every entry)
 *     - draft.provenance[fieldKey].rejected_alternatives[i].source_snippet
 *       (post-resolve audit data is still subject to scrubbing)
 *
 *   Paths the redactor EXPLICITLY DOES NOT touch:
 *
 *     - draft.companyName, sector, stage, geography, incorporationStatus,
 *       foundingDate (top-level scalars — founder-stated, founder-self by
 *       definition; companyName carries trademark intent, the others are
 *       short enums or ISO dates)
 *     - draft.team.founders[*].email and draft.team.founders[*].phone
 *       (founder-self exemption channels — used to BUILD the exemption set,
 *       so redacting them would defeat the exemption itself)
 *     - draft.traction.{mrr, arr, currency, customers, valuation, burn}
 *       (numeric / 3-char currency code — not free-form text)
 *
 * ## Replacement markers (CAPS on what's tracked)
 *
 *     email   → [REDACTED-EMAIL]
 *     phone   → [REDACTED-PHONE]
 *     wallet  → [REDACTED-WALLET]
 *     ssn     → [REDACTED-SSN]
 *
 *   The byType counter tracks ONLY these four keys. Missing types stay at 0;
 *   any future type would need an additive extension here AND a coordinated
 *   bump in the agent's logging contract (which reads `byType` for the
 *   founder-facing redactions-applied banner).
 *
 * ## Banned-string discipline
 *
 *   The compliance phrases listed in `tasks/banned-strings.txt` do NOT appear
 *   anywhere in this file. The redactor operates on PII patterns; the banned
 *   compliance terms are not PII and have no business in this module.
 */

import type { BusinessMemoryDraft, ProvenanceEntry } from '@/ai/schemas/business-memory.zod';

// ────────────────────────────────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────────────────────────────────

export type PIIType = 'email' | 'phone' | 'wallet' | 'ssn';

export interface PIIRedactionResult {
  /** Deep-cloned draft with unrelated-party PII replaced by typed markers. */
  draft: BusinessMemoryDraft;
  /** Total non-skipped matches across every walked path. */
  redactionsApplied: number;
  /** Per-type breakdown. All four keys are always present (zero when none). */
  byType: Record<PIIType, number>;
}

// ────────────────────────────────────────────────────────────────────────────
// Pattern set
// ────────────────────────────────────────────────────────────────────────────

/**
 * Patterns applied in this fixed ORDER (email → phone → ssn → btc → sol).
 * Order matters: a SOL base58 string can lexically overlap with a BTC legacy
 * address (both start with [13...]), so BTC wins when ambiguous. Same span
 * cannot be matched twice — the span-occupancy bitmap below enforces this.
 *
 * All patterns are `/g` flagged so `matchAll` returns every occurrence.
 */
interface PatternEntry {
  type: PIIType;
  regex: RegExp;
}

const PATTERNS: ReadonlyArray<PatternEntry> = [
  {
    type: 'email',
    // Anchor on a TLD of ≥2 chars. The trailing class allows `.example`,
    // `.test`, `.invalid` (RFC-2606 reserved) so synthetic fixtures match.
    regex: /\b[\w.+-]+@[\w-]+\.[\w-]{2,}\b/g,
  },
  {
    type: 'phone',
    // US shape: (NNN) NNN-NNNN, NNN-NNN-NNNN, NNN.NNN.NNNN, NNN NNN NNNN.
    // The optional leading +1/+ international prefix is captured so the SLA
    // `+1 415 555 0199` form (in the mosaic paste) matches.
    regex: /(?:\+?\d{1,2}[-.\s]?)?\(?\d{3}\)?[-.\s]\d{3}[-.\s]\d{4}\b/g,
  },
  {
    type: 'ssn',
    // Strict 3-2-4 digit shape.
    regex: /\b\d{3}-\d{2}-\d{4}\b/g,
  },
  {
    type: 'wallet',
    // BTC legacy ([1] P2PKH, [3] P2SH) uses Base58 (25-39 char body); modern
    // bech32 / bech32m (bc1) uses the lowercase bech32 alphabet and ranges
    // 25 chars (P2WPKH) up to ~62 chars (P2WSH / Taproot). Two prefixes,
    // two body classes to handle both correctly.
    regex: /\b(?:bc1[ac-hj-np-z02-9]{25,62}|[13][a-zA-HJ-NP-Z0-9]{25,39})\b/g,
  },
  {
    type: 'wallet',
    // SOL base58: 32–44 chars from the Base58 alphabet. Boundary-strict
    // (\b) to avoid sub-string false positives inside longer tokens.
    regex: /\b[1-9A-HJ-NP-Za-km-z]{32,44}\b/g,
  },
];

// ────────────────────────────────────────────────────────────────────────────
// Replacement markers (kept colocated with the type list for grep-ability)
// ────────────────────────────────────────────────────────────────────────────

const REPLACEMENT: Record<PIIType, string> = {
  email: '[REDACTED-EMAIL]',
  phone: '[REDACTED-PHONE]',
  wallet: '[REDACTED-WALLET]',
  ssn: '[REDACTED-SSN]',
};

// ────────────────────────────────────────────────────────────────────────────
// Founder-self exemption
// ────────────────────────────────────────────────────────────────────────────

interface FounderForExemption {
  name?: string;
  email?: string;
  phone?: string;
}

interface ExemptionSet {
  emails: Set<string>;
  phones: Set<string>;
}

function buildExemptionSet(founders: ReadonlyArray<FounderForExemption>): ExemptionSet {
  const emails = new Set<string>();
  const phones = new Set<string>();
  for (const f of founders) {
    if (typeof f.email === 'string' && f.email.trim().length > 0) {
      emails.add(f.email.toLowerCase().trim());
    }
    if (typeof f.phone === 'string' && f.phone.trim().length > 0) {
      // Phone exemption matches on the literal text (post-trim) — we do NOT
      // normalize digits-only because the fixtures pin format-preserving
      // preservation (e.g. founder phone "415-555-0200" must survive byte-
      // identical, with hyphens intact).
      phones.add(f.phone.toLowerCase().trim());
    }
  }
  return { emails, phones };
}

function isExempt(type: PIIType, matched: string, exempt: ExemptionSet): boolean {
  const normalized = matched.toLowerCase().trim();
  if (type === 'email') return exempt.emails.has(normalized);
  if (type === 'phone') return exempt.phones.has(normalized);
  // wallet + ssn are NEVER exempted (see header doc).
  return false;
}

// ────────────────────────────────────────────────────────────────────────────
// String-level redaction
// ────────────────────────────────────────────────────────────────────────────

interface RedactionSpan {
  start: number;
  end: number;
  type: PIIType;
}

/**
 * Apply every pattern to `input` and return the redacted string plus the
 * per-type count of non-skipped matches.
 *
 * Pattern application order (email → phone → ssn → btc → sol) is fixed at the
 * `PATTERNS` constant. A span occupied by an earlier pattern is skipped by
 * later patterns via the bitmap.
 */
function redactString(
  input: string,
  exempt: ExemptionSet,
): { text: string; byType: Record<PIIType, number> } {
  const byType: Record<PIIType, number> = { email: 0, phone: 0, wallet: 0, ssn: 0 };
  if (input.length === 0) return { text: input, byType };

  const occupied = new Uint8Array(input.length);
  const spans: RedactionSpan[] = [];

  for (const { type, regex } of PATTERNS) {
    regex.lastIndex = 0;
    for (const m of input.matchAll(regex)) {
      if (m.index === undefined) continue;
      const matchedText = m[0];
      const start = m.index;
      const end = start + matchedText.length;
      // Skip if the span overlaps a previously-claimed span.
      let overlaps = false;
      for (let i = start; i < end; i++) {
        if (occupied[i] === 1) {
          overlaps = true;
          break;
        }
      }
      if (overlaps) continue;
      if (isExempt(type, matchedText, exempt)) continue;
      for (let i = start; i < end; i++) occupied[i] = 1;
      spans.push({ start, end, type });
      byType[type] += 1;
    }
  }

  if (spans.length === 0) return { text: input, byType };

  // Splice spans right-to-left so earlier replacements don't shift later offsets.
  spans.sort((a, b) => b.start - a.start);
  let text = input;
  for (const s of spans) {
    text = text.slice(0, s.start) + REPLACEMENT[s.type] + text.slice(s.end);
  }
  return { text, byType };
}

// ────────────────────────────────────────────────────────────────────────────
// Draft walker
// ────────────────────────────────────────────────────────────────────────────

function accumulate(totals: Record<PIIType, number>, delta: Record<PIIType, number>): void {
  totals.email += delta.email;
  totals.phone += delta.phone;
  totals.wallet += delta.wallet;
  totals.ssn += delta.ssn;
}

/**
 * Walk the four narrative fields and the two free-form traction fields,
 * redact in place on the cloned draft.
 */
function walkNarrativeAndTraction(
  draft: BusinessMemoryDraft,
  exempt: ExemptionSet,
  totals: Record<PIIType, number>,
): void {
  const narrativeKeys: Array<'problem' | 'solution' | 'why_now' | 'why_us'> = [
    'problem',
    'solution',
    'why_now',
    'why_us',
  ];
  if (draft.narrative) {
    for (const key of narrativeKeys) {
      const v = draft.narrative[key];
      if (typeof v !== 'string' || v.length === 0) continue;
      const { text, byType } = redactString(v, exempt);
      draft.narrative[key] = text;
      accumulate(totals, byType);
    }
  }
  const tractionKeys: Array<'growth' | 'runway'> = ['growth', 'runway'];
  if (draft.traction) {
    for (const key of tractionKeys) {
      const v = draft.traction[key];
      if (typeof v !== 'string' || v.length === 0) continue;
      const { text, byType } = redactString(v, exempt);
      draft.traction[key] = text;
      accumulate(totals, byType);
    }
  }
}

/**
 * Walk every provenance entry — the single-object arm AND the array arm AND
 * any nested rejected_alternatives entries — and redact every source_snippet
 * in place on the cloned draft.
 */
function walkProvenance(
  draft: BusinessMemoryDraft,
  exempt: ExemptionSet,
  totals: Record<PIIType, number>,
): void {
  const provenance = draft.provenance as Record<string, ProvenanceEntry> | undefined;
  if (!provenance) return;
  for (const key of Object.keys(provenance)) {
    const entry = provenance[key];
    if (Array.isArray(entry)) {
      for (const candidate of entry) {
        if (typeof candidate.source_snippet === 'string' && candidate.source_snippet.length > 0) {
          const { text, byType } = redactString(candidate.source_snippet, exempt);
          candidate.source_snippet = text;
          accumulate(totals, byType);
        }
      }
      continue;
    }
    if (entry && typeof entry === 'object') {
      if (typeof entry.source_snippet === 'string' && entry.source_snippet.length > 0) {
        const { text, byType } = redactString(entry.source_snippet, exempt);
        entry.source_snippet = text;
        accumulate(totals, byType);
      }
      // Post-resolve audit trail: walk rejected_alternatives too.
      if (Array.isArray(entry.rejected_alternatives)) {
        for (const loser of entry.rejected_alternatives) {
          if (typeof loser.source_snippet === 'string' && loser.source_snippet.length > 0) {
            const { text, byType } = redactString(loser.source_snippet, exempt);
            loser.source_snippet = text;
            accumulate(totals, byType);
          }
        }
      }
    }
  }
}

/**
 * Walk every string leaf inside `draft.team` (founders, advisors, catchall
 * keys) and redact in place on the cloned draft. Founder-self exemption
 * channels (`email` and `phone` keys at any nesting depth inside team) are
 * preserved verbatim — those drive the exemption set itself and form the
 * positive identity of the founder, so redacting them would corrupt the
 * audit trail and is unnecessary (the exemption already prevents matched
 * founder values from being rewritten elsewhere).
 *
 * Recursion is depth-bounded at 5 levels. The team schema is shallow in
 * practice (team → founders[] → object → string fields, depth 4), so 5 is
 * a generous ceiling that still rejects adversarial deeply-nested payloads
 * before they can stack overflow.
 *
 * T15-FIX-1 H1: addresses Codex finding that LLM-emitted PII in
 * team.founders[*].linkedinUrl / team.founders[*].background / team.advisors[*]
 * and any catchall key escaped the previous narrow walker.
 */
function walkTeamStringLeaves(
  draft: BusinessMemoryDraft,
  exempt: ExemptionSet,
  totals: Record<PIIType, number>,
): void {
  if (!draft.team) return;

  const MAX_DEPTH = 5;

  function recurse(node: unknown, depth: number): unknown {
    if (depth > MAX_DEPTH) return node;
    if (typeof node === 'string') {
      if (node.length === 0) return node;
      const { text, byType } = redactString(node, exempt);
      accumulate(totals, byType);
      return text;
    }
    if (Array.isArray(node)) {
      for (let i = 0; i < node.length; i++) {
        node[i] = recurse(node[i], depth + 1);
      }
      return node;
    }
    if (node && typeof node === 'object') {
      const obj = node as Record<string, unknown>;
      for (const key of Object.keys(obj)) {
        // Founder-self exemption channels — preserve verbatim. The exemption
        // set built from these values prevents the same literal from being
        // redacted elsewhere; leaving them untouched here is consistent.
        if (key === 'email' || key === 'phone') continue;
        obj[key] = recurse(obj[key], depth + 1);
      }
      return node;
    }
    return node;
  }

  recurse(draft.team, 1);
}

/**
 * Redact `draft.oneLiner` — top-level marketing string emitted by the LLM.
 *
 * T15-FIX-1 H1: addresses Codex finding that the previous walker excluded
 * top-level scalars, allowing the extractor to emit PII straight into
 * oneLiner unscrubbed.
 */
function walkOneLiner(
  draft: BusinessMemoryDraft,
  exempt: ExemptionSet,
  totals: Record<PIIType, number>,
): void {
  if (typeof draft.oneLiner !== 'string' || draft.oneLiner.length === 0) return;
  const { text, byType } = redactString(draft.oneLiner, exempt);
  draft.oneLiner = text;
  accumulate(totals, byType);
}

// ────────────────────────────────────────────────────────────────────────────
// Public API
// ────────────────────────────────────────────────────────────────────────────

/**
 * Redact unrelated-party PII from a Business Memory draft.
 *
 * Walks `narrative.{problem,solution,why_now,why_us}`,
 * `traction.{growth,runway}`, and every `provenance[*].source_snippet`
 * (single-object arm + array arm + post-resolve `rejected_alternatives`),
 * replacing every email / phone / wallet / SSN match with a typed marker —
 * EXCEPT matches whose lowercase-normalized form is in the founder-self
 * exemption set (built from `founders[*].email` + `founders[*].phone`).
 *
 * Returns a NEW deep-cloned draft. The input draft is never mutated.
 *
 * @param draft     Extractor output. Read-only from this function's perspective.
 * @param founders  Founder-self exemption source. Typically `draft.team?.founders`.
 *                  Pass `undefined` or `[]` when no exemptions apply.
 */
export function redactUnrelatedPartyPII(
  draft: BusinessMemoryDraft,
  founders?: ReadonlyArray<FounderForExemption>,
): PIIRedactionResult {
  const cloned = structuredClone(draft);
  const exempt = buildExemptionSet(founders ?? []);
  const totals: Record<PIIType, number> = { email: 0, phone: 0, wallet: 0, ssn: 0 };

  walkNarrativeAndTraction(cloned, exempt, totals);
  walkProvenance(cloned, exempt, totals);
  walkOneLiner(cloned, exempt, totals);
  walkTeamStringLeaves(cloned, exempt, totals);

  const redactionsApplied = totals.email + totals.phone + totals.wallet + totals.ssn;
  return { draft: cloned, redactionsApplied, byType: totals };
}
