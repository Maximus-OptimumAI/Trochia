/**
 * Prompt-injection sanitizer — OWASP LLM Top 10 coverage (Phase 2 / KNW-02d).
 *
 * Plan 02-03 hardens the Phase-1 `screenForInjection` lightweight regex set
 * (still in `src/ai/untrusted.ts` for other callers) into a richer module that
 * the extractor agent uses as its pre-LLM gate. Two contract differences vs the
 * Phase-1 primitive:
 *
 *   1. The output classifies every match by `category` + `baseSeverity`, and
 *      the function rolls those up into a per-paste `severity` band. The agent
 *      rejects the paste when `severity` lands at `'high'` or `'critical'`.
 *   2. The output carries `sanitizedPaste` — the input with every matched span
 *      replaced by `[REDACTED-INJECTION:<category>]`. The agent forwards the
 *      sanitized text to Sonnet so any LOW/MEDIUM markers that survive the
 *      gate are still neutralized inside the model's view of the paste.
 *
 * ## Contract
 *
 *   PURE TRANSFORMER. Sync. Zero I/O. No imports from `@anthropic-ai/sdk`,
 *   `@/ai/client`, `@/lib/logger`, or any DB module. The only allowed imports
 *   are TypeScript type declarations — the runtime has zero dependencies.
 *
 *   The sanitizer NEVER throws. The agent's reject path throws AppError
 *   (`AI_INJECTION_REJECTED`) when severity warrants it; this module's job is
 *   to classify, not to decide policy.
 *
 *   PII is OUT OF SCOPE here. `src/ai/sanitizers/pii-redact.ts` handles email /
 *   phone / wallet / SSN scrubbing on the post-LLM draft. The two sanitizers
 *   run at different stages and have non-overlapping responsibilities.
 *
 * ## Pattern registry
 *
 * Seven OWASP-aligned categories, each carrying a `baseSeverity` floor:
 *
 *   - direct-override          (medium): "ignore previous instructions",
 *                                        "disregard the above", "supersedes",
 *                                        "skip the rules"
 *   - role-injection           (high)  : "you are now ...", "pretend you are",
 *                                        "act as if", "DAN" persona, "developer
 *                                        mode", "uncensored mode"
 *   - system-prompt-extraction (high)  : "reveal your system prompt", "what are
 *                                        your instructions", "repeat the text
 *                                        above", "starting with 'You are'"
 *   - output-format-hijack     (low)   : "regardless of the schema", "ignore
 *                                        the schema" — caught here for the
 *                                        signal, but downstream Zod parse is
 *                                        the real defense
 *   - encoded-attack           (critical): base64 markers, "decode the
 *                                        following", unicode lookalikes
 *                                        (U+2170 ROMAN NUMERAL ONE, U+0456
 *                                        CYRILLIC I), zero-width spaces
 *                                        (U+200B/C/D) inserted as separators
 *   - exfiltration             (high)  : "send (this/the/that) to https://...",
 *                                        "make a request to <domain>", "POST
 *                                        to <url>", explicit attacker domains
 *   - jailbreak                (high)  : "DAN mode", "jailbreak", "unrestricted
 *                                        mode", "override all safety filters",
 *                                        "<system>" / "<assistant>" tag spoofs
 *
 * ## Severity escalation
 *
 *   Start at `'none'`. Each match bumps `severity = max(severity, baseSeverity)`
 *   on a strict ordering [none < low < medium < high < critical].
 *
 *   Multi-marker bump: when ≥2 matches land — whether across distinct
 *   categories or stacked within one category — bump one tier (low→medium,
 *   medium→high, high→critical, critical stays). The intuition: stacked
 *   markers signal real attacker intent, not the accidental "ignore the
 *   system" string a founder might type when describing their own UX copy.
 *
 *   Encoded-attack floor: any encoded-attack match pins minimum severity to
 *   `'critical'` regardless of count. Obfuscation effort (unicode swap, ZWSP
 *   splice, base64 decode-and-follow) is high-signal for adversarial intent.
 *
 * ## Unicode normalization
 *
 *   Before regex matching, the sanitizer rewrites the text to neutralize the
 *   two most common bypass vectors:
 *
 *   - U+2170 (ⅰ ROMAN NUMERAL SMALL ONE) → ASCII 'i'
 *   - U+0456 (і CYRILLIC SMALL LETTER BYELORUSSIAN-UKRAINIAN I) → ASCII 'i'
 *   - U+200B, U+200C, U+200D (zero-width space, ZWNJ, ZWJ) → stripped outright
 *
 *   Each substitution is RECORDED — if it lands within 50 chars of an
 *   instruction verb ("ignore", "disregard", "forget", "override"), the
 *   sanitizer emits an encoded-attack match against the ORIGINAL span (so the
 *   caller can see the obfuscation effort, not just the normalized form).
 *
 *   The `sanitizedPaste` returned by this function uses the NORMALIZED text as
 *   its base — Sonnet sees ASCII even when the founder pasted unicode tricks.
 *
 * ## Sanitization
 *
 *   For each match, the matched substring is replaced by the marker
 *   `[REDACTED-INJECTION:<category>]`. Replacements are applied in REVERSE
 *   order of offset so earlier replacements don't shift later offsets.
 *
 *   `sanitizedPaste` is guaranteed to exclude the case-insensitive form of any
 *   `expectedMatchSubstrings` entry in the fixture set — see
 *   `tests/ai/sanitizers/prompt-injection.test.ts` (Task 7) for the per-payload
 *   assertion that pins this contract.
 *
 * ## Reject contract
 *
 *   The agent's wiring (`extract-from-paste.agent.ts` Step 2 in Task 6):
 *
 *     const result = promptInjectionSanitizer(input.paste);
 *     if (result.severity === 'high' || result.severity === 'critical') {
 *       throw new AppError({ code: 'AI_INJECTION_REJECTED', status: 400, ... });
 *     }
 *     // else: continue with result.sanitizedPaste replacing input.paste
 *
 *   `matches[].snippet` carries the original matched text — useful for audit
 *   logging by the caller, but the founder UI MUST NOT render these strings
 *   verbatim (they are paste content; they may also contain PII the agent
 *   would normally scrub via `pii-redact.ts`).
 *
 * ## Banned-string discipline
 *
 *   The compliance phrases listed in `tasks/banned-strings.txt` do NOT appear
 *   anywhere in this file. The regex registry operates on instruction-injection
 *   markers; those compliance phrases are not injection markers and have no
 *   business in this module. See `scripts/check-banned-strings.mjs` for the
 *   CI gate that pins this.
 */

// ────────────────────────────────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────────────────────────────────

export type InjectionSeverity = 'none' | 'low' | 'medium' | 'high' | 'critical';

export type InjectionCategory =
  | 'direct-override'
  | 'role-injection'
  | 'system-prompt-extraction'
  | 'output-format-hijack'
  | 'encoded-attack'
  | 'exfiltration'
  | 'jailbreak';

export interface InjectionMatch {
  /** Regex source (or symbolic name for non-regex matches like unicode/ZWSP). */
  pattern: string;
  /** The literal matched substring from the NORMALIZED text. */
  snippet: string;
  /** Match start offset within the NORMALIZED text. */
  offset: number;
  /** OWASP-aligned category. */
  category: InjectionCategory;
}

export interface InjectionSanitizerResult {
  /** True when at least one pattern matched. */
  flagged: boolean;
  /** Roll-up severity band — drives the agent's accept/reject decision. */
  severity: InjectionSeverity;
  /** Per-match audit trail. Callers MUST NOT surface snippet contents to UI. */
  matches: InjectionMatch[];
  /** Input with matched spans replaced by `[REDACTED-INJECTION:<category>]`. */
  sanitizedPaste: string;
}

// ────────────────────────────────────────────────────────────────────────────
// Severity helpers
// ────────────────────────────────────────────────────────────────────────────

const SEVERITY_RANK: Record<InjectionSeverity, number> = {
  none: 0,
  low: 1,
  medium: 2,
  high: 3,
  critical: 4,
};

const SEVERITY_BY_RANK: InjectionSeverity[] = [
  'none',
  'low',
  'medium',
  'high',
  'critical',
];

function maxSeverity(a: InjectionSeverity, b: InjectionSeverity): InjectionSeverity {
  return SEVERITY_RANK[a] >= SEVERITY_RANK[b] ? a : b;
}

function bumpSeverity(s: InjectionSeverity): InjectionSeverity {
  const next = Math.min(SEVERITY_RANK[s] + 1, SEVERITY_RANK.critical);
  return SEVERITY_BY_RANK[next]!;
}

// ────────────────────────────────────────────────────────────────────────────
// Pattern registry
// ────────────────────────────────────────────────────────────────────────────

interface PatternDescriptor {
  pattern: RegExp;
  category: InjectionCategory;
  baseSeverity: Exclude<InjectionSeverity, 'none'>;
}

/**
 * Every regex is `/.../gi` — global so we can iterate all matches via
 * `matchAll`, case-insensitive so attacker variants ("IGNORE", "Ignore",
 * "iGnOrE") all flag. The Unicode flag is intentionally OMITTED — the
 * normalization pass converts lookalike characters BEFORE these patterns run.
 */
const PATTERN_REGISTRY: ReadonlyArray<PatternDescriptor> = [
  // ── direct-override ──────────────────────────────────────────────────────
  {
    pattern: /ignore\s+(?:all\s+)?(?:the\s+)?(?:previous|prior|above|earlier)\s+instructions?/gi,
    category: 'direct-override',
    baseSeverity: 'medium',
  },
  {
    pattern: /disregard\s+(?:the\s+)?(?:above|previous|prior|earlier)/gi,
    category: 'direct-override',
    baseSeverity: 'medium',
  },
  {
    pattern: /forget\s+(?:all\s+)?(?:previous|prior|earlier)\s+instructions?/gi,
    category: 'direct-override',
    baseSeverity: 'medium',
  },
  {
    pattern: /override\s+(?:your|the)\s+(?:previous\s+)?instructions?/gi,
    category: 'direct-override',
    baseSeverity: 'medium',
  },
  {
    pattern: /supersedes?\b/gi,
    category: 'direct-override',
    baseSeverity: 'low',
  },
  {
    pattern: /skip\s+the\s+rules?/gi,
    category: 'direct-override',
    baseSeverity: 'medium',
  },

  // ── role-injection ───────────────────────────────────────────────────────
  {
    pattern: /you\s+are\s+now\b/gi,
    category: 'role-injection',
    baseSeverity: 'high',
  },
  {
    pattern: /you\s+are\s+a\s+different\s+(?:assistant|ai|model)/gi,
    category: 'role-injection',
    baseSeverity: 'high',
  },
  {
    pattern: /pretend\s+(?:to\s+be|you\s+are)\b/gi,
    category: 'role-injection',
    baseSeverity: 'high',
  },
  {
    pattern: /act\s+as\s+(?:if|though)\b/gi,
    category: 'role-injection',
    baseSeverity: 'high',
  },
  {
    pattern: /\bnew\s+system\s+message\b/gi,
    category: 'role-injection',
    baseSeverity: 'high',
  },
  {
    pattern: /\boverrides?\s+(?:the\s+)?(?:prior|previous|earlier)\s+(?:context|instructions?)/gi,
    category: 'role-injection',
    baseSeverity: 'high',
  },

  // ── system-prompt-extraction ─────────────────────────────────────────────
  {
    pattern: /reveal\s+(?:your|the)\s+(?:system\s+)?prompt/gi,
    category: 'system-prompt-extraction',
    baseSeverity: 'high',
  },
  {
    pattern: /what\s+are\s+your\s+instructions?/gi,
    category: 'system-prompt-extraction',
    baseSeverity: 'high',
  },
  {
    pattern: /\bverbatim\b/gi,
    category: 'system-prompt-extraction',
    baseSeverity: 'medium',
  },
  {
    pattern: /repeat\s+the\s+(?:text|prompt|message)\s+above/gi,
    category: 'system-prompt-extraction',
    baseSeverity: 'high',
  },
  {
    pattern: /starting\s+with\s+['"]you\s+are['"]?/gi,
    category: 'system-prompt-extraction',
    baseSeverity: 'high',
  },
  {
    pattern: /print\s+(?:your|the)\s+(?:system\s+)?(?:prompt|instructions?)/gi,
    category: 'system-prompt-extraction',
    baseSeverity: 'high',
  },
  {
    pattern: /tell\s+me\s+everything\s+in\s+the\s+system\s+prompt/gi,
    category: 'system-prompt-extraction',
    baseSeverity: 'high',
  },

  // ── output-format-hijack ─────────────────────────────────────────────────
  {
    pattern: /regardless\s+of\s+the\s+schema/gi,
    category: 'output-format-hijack',
    baseSeverity: 'low',
  },
  {
    pattern: /ignore\s+the\s+schema/gi,
    category: 'output-format-hijack',
    baseSeverity: 'low',
  },
  {
    pattern: /respond\s+(?:only\s+)?in\s+(?:json|plain\s+text)\s+only/gi,
    category: 'output-format-hijack',
    baseSeverity: 'low',
  },

  // ── encoded-attack ───────────────────────────────────────────────────────
  // Note: unicode + zero-width-space attacks are detected by the dedicated
  // normalization scan below; these regexes handle the base64 / "decode the
  // following" variant.
  {
    pattern: /\bdecode\s+(?:the\s+)?following\b/gi,
    category: 'encoded-attack',
    baseSeverity: 'critical',
  },
  {
    pattern: /(?:\bbase64\b|\bb64\b)\s*[:=]/gi,
    category: 'encoded-attack',
    baseSeverity: 'critical',
  },
  // Long base64-shaped blob (≥40 chars of base64 alphabet ending in optional
  // '=' padding). Catches inline payloads even without a "base64:" prefix.
  {
    pattern: /\b[A-Za-z0-9+/]{40,}={0,2}\b/g,
    category: 'encoded-attack',
    baseSeverity: 'critical',
  },

  // ── exfiltration ─────────────────────────────────────────────────────────
  {
    pattern: /send\s+(?:this|the|that)\s+(?:to|via)\s+https?:\/\/\S+/gi,
    category: 'exfiltration',
    baseSeverity: 'high',
  },
  {
    pattern: /send\s+the\s+founder'?s?\s+\w+/gi,
    category: 'exfiltration',
    baseSeverity: 'high',
  },
  {
    pattern: /make\s+a\s+(?:request|call|POST|GET)\s+to\s+\S+\.(?:com|net|io|org|test|example|invalid|app)/gi,
    category: 'exfiltration',
    baseSeverity: 'high',
  },
  {
    pattern: /\bPOST\s+(?:the\s+)?(?:founder'?s?\s+)?\S+\s+to\s+https?:\/\/\S+/gi,
    category: 'exfiltration',
    baseSeverity: 'high',
  },
  {
    pattern: /\b(?:evil|attacker|exfil|leak)\.[a-z][a-z0-9-]*(?:\.[a-z]{2,})*/gi,
    category: 'exfiltration',
    baseSeverity: 'high',
  },

  // ── jailbreak ────────────────────────────────────────────────────────────
  {
    pattern: /\bDAN\s+mode\b/gi,
    category: 'jailbreak',
    baseSeverity: 'high',
  },
  {
    pattern: /\bDAN\b(?:\s*[,.]|\s+(?:going|forward|mode|persona))/gi,
    category: 'jailbreak',
    baseSeverity: 'high',
  },
  {
    pattern: /\bdeveloper\s+mode\b/gi,
    category: 'jailbreak',
    baseSeverity: 'medium',
  },
  {
    pattern: /\buncensored\s+(?:mode|responses?)/gi,
    category: 'jailbreak',
    baseSeverity: 'high',
  },
  {
    pattern: /\bunrestricted\s+mode\b/gi,
    category: 'jailbreak',
    baseSeverity: 'medium',
  },
  {
    pattern: /\bjailbreak/gi,
    category: 'jailbreak',
    baseSeverity: 'high',
  },
  {
    pattern: /override\s+all\s+safety\s+filters?/gi,
    category: 'jailbreak',
    baseSeverity: 'high',
  },
  {
    pattern: /activate\s+DAN\s+mode/gi,
    category: 'jailbreak',
    baseSeverity: 'high',
  },
  {
    pattern: /\bnew\s+instructions?\s*:/gi,
    category: 'jailbreak',
    baseSeverity: 'medium',
  },
  {
    pattern: /\bsystem\s*:/gi,
    category: 'jailbreak',
    baseSeverity: 'low',
  },
  {
    pattern: /\bassistant\s*:/gi,
    category: 'jailbreak',
    baseSeverity: 'low',
  },
  {
    pattern: /<\s*\/?\s*(?:system|assistant)\s*>/gi,
    category: 'jailbreak',
    baseSeverity: 'high',
  },
];

// ────────────────────────────────────────────────────────────────────────────
// Unicode normalization
// ────────────────────────────────────────────────────────────────────────────

/** Codepoints that bypass naive ASCII regex. Mapped to their ASCII analog. */
const LOOKALIKE_TO_ASCII: ReadonlyMap<string, string> = new Map([
  ['ⅰ', 'i'], // ROMAN NUMERAL SMALL ONE
  ['і', 'i'], // CYRILLIC SMALL LETTER BYELORUSSIAN-UKRAINIAN I
  ['ο', 'o'], // GREEK SMALL LETTER OMICRON
  ['а', 'a'], // CYRILLIC SMALL LETTER A
  ['е', 'e'], // CYRILLIC SMALL LETTER IE
  ['р', 'p'], // CYRILLIC SMALL LETTER ER
  ['с', 'c'], // CYRILLIC SMALL LETTER ES
]);

/** Zero-width characters stripped entirely (they only exist to bypass regex). */
const ZERO_WIDTH_CODEPOINTS: ReadonlySet<string> = new Set([
  '​', // ZERO WIDTH SPACE
  '‌', // ZERO WIDTH NON-JOINER
  '‍', // ZERO WIDTH JOINER
  '﻿', // ZERO WIDTH NO-BREAK SPACE (BOM-like)
]);

/** Instruction verbs that, when found near a normalization site, signal intent. */
const INSTRUCTION_VERBS = ['ignore', 'disregard', 'forget', 'override', 'reveal', 'repeat'];

interface NormalizationResult {
  /** Text with lookalikes → ASCII and zero-width chars stripped. */
  text: string;
  /**
   * One entry per character the normalizer rewrote or removed. `normalizedOffset`
   * is the position in the post-rewrite text where the substitution landed (for
   * a ZWSP strip, that is the index of the character that now sits where the
   * ZWSP used to). `originalOffset` is the position in the INPUT string of the
   * original codepoint — used to surface the original (pre-normalization)
   * snippet for audit purposes.
   */
  substitutions: Array<{
    kind: 'lookalike' | 'zero-width';
    normalizedOffset: number;
    originalOffset: number;
    original: string;
  }>;
}

function normalizeUnicodeBypasses(input: string): NormalizationResult {
  const out: string[] = [];
  const substitutions: NormalizationResult['substitutions'] = [];
  let outOffset = 0;
  let inOffset = 0;
  for (const ch of input) {
    if (ZERO_WIDTH_CODEPOINTS.has(ch)) {
      substitutions.push({
        kind: 'zero-width',
        normalizedOffset: outOffset,
        originalOffset: inOffset,
        original: ch,
      });
      inOffset += ch.length;
      continue;
    }
    const ascii = LOOKALIKE_TO_ASCII.get(ch);
    if (ascii !== undefined) {
      out.push(ascii);
      substitutions.push({
        kind: 'lookalike',
        normalizedOffset: outOffset,
        originalOffset: inOffset,
        original: ch,
      });
      outOffset += ascii.length;
      inOffset += ch.length;
      continue;
    }
    out.push(ch);
    outOffset += ch.length;
    inOffset += ch.length;
  }
  return { text: out.join(''), substitutions };
}

/**
 * Was the normalized site within `radius` chars of an instruction verb? The
 * presence of a normalization adjacent to "ignore" / "disregard" / etc. is the
 * tell-tale sign of an intentional bypass attempt — innocent unicode in a
 * narrative passage (e.g. a Cyrillic founder name) shouldn't trigger.
 */
function nearInstructionVerb(text: string, offset: number, radius = 50): boolean {
  const start = Math.max(0, offset - radius);
  const end = Math.min(text.length, offset + radius);
  const window = text.slice(start, end).toLowerCase();
  return INSTRUCTION_VERBS.some((verb) => window.includes(verb));
}

// ────────────────────────────────────────────────────────────────────────────
// Sanitization
// ────────────────────────────────────────────────────────────────────────────

interface RawMatch {
  start: number;
  end: number;
  snippet: string;
  pattern: string;
  category: InjectionCategory;
  baseSeverity: Exclude<InjectionSeverity, 'none'>;
}

/**
 * Deduplicate overlapping spans. Encoded-attack matches ALWAYS survive (they
 * are the high-signal class for adversarial intent — a co-located regex match
 * masking them would lose the obfuscation telemetry). Among same-priority
 * matches, the EARLIER start wins.
 */
function dedupeOverlaps(raw: RawMatch[]): RawMatch[] {
  const encoded = raw.filter((m) => m.category === 'encoded-attack');
  const others = raw.filter((m) => m.category !== 'encoded-attack');
  const sortedOthers = [...others].sort((a, b) => a.start - b.start || b.end - a.end);
  const keptOthers: RawMatch[] = [];
  let highWater = -1;
  for (const m of sortedOthers) {
    if (m.start >= highWater) {
      keptOthers.push(m);
      highWater = m.end;
    }
  }
  // Dedupe encoded-attack spans against each other (same logic).
  const sortedEncoded = [...encoded].sort((a, b) => a.start - b.start || b.end - a.end);
  const keptEncoded: RawMatch[] = [];
  let encHigh = -1;
  for (const m of sortedEncoded) {
    if (m.start >= encHigh) {
      keptEncoded.push(m);
      encHigh = m.end;
    }
  }
  // Merge — sort the final list by offset for stable downstream replacement.
  return [...keptOthers, ...keptEncoded].sort((a, b) => a.start - b.start);
}

function buildSanitizedText(normalized: string, matches: RawMatch[]): string {
  // Replace in reverse order so earlier replacements don't shift later offsets.
  const ordered = [...matches].sort((a, b) => b.start - a.start);
  let out = normalized;
  for (const m of ordered) {
    out = out.slice(0, m.start) + `[REDACTED-INJECTION:${m.category}]` + out.slice(m.end);
  }
  return out;
}

// ────────────────────────────────────────────────────────────────────────────
// Public API
// ────────────────────────────────────────────────────────────────────────────

/**
 * Screen `text` for prompt-injection markers; classify; produce a sanitized
 * version safe to forward to Sonnet.
 *
 * Returns `{ flagged: false, severity: 'none', matches: [], sanitizedPaste }`
 * for benign input where `sanitizedPaste === text` byte-for-byte (no normalization
 * needed). The caller can short-circuit on `!flagged` without further checks.
 *
 * Severity bands the caller acts on:
 *
 *   - 'none' | 'low' | 'medium' → continue with `sanitizedPaste` as the input
 *     to downstream stages (delimit + runAgent).
 *   - 'high' | 'critical'        → reject the paste; throw AppError with code
 *     `AI_INJECTION_REJECTED`.
 *
 * The match list is for audit/logging only. Caller MUST NOT surface raw
 * snippets to the founder UI — they are paste content and may carry the
 * attacker's own embedded PII or banned strings.
 */
export function promptInjectionSanitizer(text: string): InjectionSanitizerResult {
  // 1. Normalize lookalike + zero-width characters so the regex set sees ASCII.
  const { text: normalized, substitutions } = normalizeUnicodeBypasses(text);

  const rawMatches: RawMatch[] = [];
  const seenEncodedWordStarts = new Set<number>();

  // 2. Encoded-attack matches from unicode/ZWSP substitutions near verbs. The
  //    snippet surfaces the ORIGINAL (pre-normalization) token so the audit
  //    trail reflects what the founder pasted, not the cleaned text.
  for (const sub of substitutions) {
    if (!nearInstructionVerb(normalized, sub.normalizedOffset)) continue;

    // Walk the ORIGINAL input outward from this substitution's site to grab
    // the surrounding word — whitespace-bounded. The same logic works for
    // both lookalike replacements (which sit at `originalOffset` in `text`)
    // and zero-width strips (where the char USED to sit, between two visible
    // glyphs of the same logical word).
    const origWordStart = (() => {
      let i = sub.originalOffset;
      while (i > 0 && !/\s/.test(text[i - 1]!)) i--;
      return i;
    })();
    const origWordEnd = (() => {
      let i = sub.originalOffset + sub.original.length;
      while (i < text.length && !/\s/.test(text[i]!)) i++;
      return i;
    })();
    if (seenEncodedWordStarts.has(origWordStart)) continue;
    seenEncodedWordStarts.add(origWordStart);

    // For sanitization (replacement-in-normalized-text), recompute the word
    // span in the NORMALIZED text since that's the string we splice.
    const normWordStart = (() => {
      let i = sub.normalizedOffset;
      while (i > 0 && !/\s/.test(normalized[i - 1]!)) i--;
      return i;
    })();
    const normWordEnd = (() => {
      let i = sub.normalizedOffset;
      while (i < normalized.length && !/\s/.test(normalized[i]!)) i++;
      return i;
    })();

    rawMatches.push({
      start: normWordStart,
      end: normWordEnd,
      snippet: text.slice(origWordStart, origWordEnd),
      pattern: sub.kind === 'lookalike' ? 'unicode-lookalike' : 'zero-width-space',
      category: 'encoded-attack',
      baseSeverity: 'critical',
    });
  }

  // 3. Regex registry against the normalized text.
  for (const { pattern, category, baseSeverity } of PATTERN_REGISTRY) {
    // Reset lastIndex defensively — registry regexes are /g flagged.
    pattern.lastIndex = 0;
    for (const m of normalized.matchAll(pattern)) {
      if (m.index === undefined) continue;
      const snippet = m[0];
      rawMatches.push({
        start: m.index,
        end: m.index + snippet.length,
        snippet,
        pattern: pattern.source,
        category,
        baseSeverity,
      });
    }
  }

  // 4. Dedupe overlapping spans (earliest-wins) so we don't double-count.
  const matches = dedupeOverlaps(rawMatches);

  // 5. Severity rollup.
  let severity: InjectionSeverity = 'none';
  let encodedAttackSeen = false;
  for (const m of matches) {
    severity = maxSeverity(severity, m.baseSeverity);
    if (m.category === 'encoded-attack') encodedAttackSeen = true;
  }
  // Multi-marker bump: 2+ matches signal stacked attacker intent (whether
  // across categories or repeated within one). Single accidental marker stays
  // at its base severity.
  if (matches.length >= 2) {
    severity = bumpSeverity(severity);
  }
  if (encodedAttackSeen) {
    severity = maxSeverity(severity, 'critical');
  }

  // 6. Build sanitizedPaste.
  const sanitizedPaste =
    matches.length === 0 && substitutions.length === 0
      ? text // byte-identical short-circuit
      : buildSanitizedText(normalized, matches);

  return {
    flagged: matches.length > 0,
    severity,
    matches: matches.map((m) => ({
      pattern: m.pattern,
      snippet: m.snippet,
      offset: m.start,
      category: m.category,
    })),
    sanitizedPaste,
  };
}
