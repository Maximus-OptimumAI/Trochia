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
 *   Per M1 (T15-FIX-1), the encoded-attack category fires ONLY when both
 *   a substitution AND a registry-pattern match are present in the normalized
 *   text — Unicode lookalikes adjacent to an instruction verb without an
 *   actual injection pattern no longer escalate to critical.
 *
 * ## Unicode normalization (T15-FIX-1 H2 + M1)
 *
 *   Before regex matching, the sanitizer rewrites the text to neutralize the
 *   common bypass vectors:
 *
 *   - NFKC normalization → collapses full-width Latin (U+FF21-FF3A,
 *     U+FF41-FF5A), math alphanumerics (U+1D400 range — bold/italic/sans-serif
 *     stylings), small-form variants, ligatures (ﬁ → fi), and most lookalike
 *     classes Unicode itself recognizes as compatibility-equivalent. This is
 *     the broad sweep.
 *   - Bidi controls stripped: U+202A LRE, U+202B RLE, U+202C PDF, U+202D LRO,
 *     U+202E RLO, U+2066 LRI, U+2067 RLI, U+2068 FSI, U+2069 PDI. An attacker
 *     can use these to visually reverse a payload while the underlying byte
 *     sequence still carries the verb (the bidi-wrapped payload class).
 *   - Combining marks stripped (\p{M}) — combining diacritical marks pasted
 *     between letters bypass naive regex; the underlying base letters survive.
 *   - Zero-width chars stripped: U+200B/C/D, U+FEFF (BOM), U+2060 (WJ).
 *   - Hand-picked lookalikes (U+2170 → 'i', U+0456 → 'i', Cyrillic а/е/р/с/о)
 *     stay in the map — NFKC does NOT cover these (they are not compatibility-
 *     equivalent to ASCII; they are *visually* similar but linguistically
 *     distinct codepoints).
 *
 *   Whenever the normalization rewrites or removes ANY character, a
 *   substitution event is recorded.
 *
 *   Encoded-attack emission rule (M1 — T15-FIX-1):
 *   The sanitizer emits an encoded-attack match against a substitution site
 *   ONLY when the normalized text ALSO produces a full registry pattern match.
 *   Unicode lookalikes appearing in narrative prose that contains a benign
 *   English instruction verb (e.g. Cyrillic prose containing "ignore churn
 *   noise") no longer false-positive to critical — the substitutions exist,
 *   but no surrounding pattern matched, so the obfuscation signal stands
 *   down. The detection-only normalized text is used for matching; the
 *   `matches[].snippet` field carries the ORIGINAL (pre-normalization)
 *   substring so security IR sees what the attacker actually pasted.
 *
 *   The `sanitizedPaste` returned by this function uses the NORMALIZED text as
 *   its base — Sonnet sees ASCII even when the founder pasted unicode tricks.
 *
 * ## Split-token verb detection (T15-FIX-1 H3)
 *
 *   Beyond the literal-verb regex set, the sanitizer carries a small
 *   obfuscated-verb registry that tolerates arbitrary whitespace / punctuation
 *   / underscore separators between letters of a small set of instruction
 *   verbs (ignore, disregard, forget, override, reveal, print, repeat,
 *   pretend, act, jailbreak). Payloads like "ig nore previous instructions",
 *   "ig\tnore", and "i-g-n-o-r-e" match. Verb category mirrors the literal
 *   regex set's category for that verb.
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
// Obfuscated-verb registry (T15-FIX-1 H3)
// ────────────────────────────────────────────────────────────────────────────

/**
 * Verbs that split-token attacks commonly target. The pattern below allows
 * arbitrary whitespace / punctuation / underscore between every adjacent
 * pair of letters of the verb, catching forms like "ig nore", "ig\tnore",
 * and "i-g-n-o-r-e". The category mirrors what the literal-verb regex set
 * would emit for the same verb in plain form.
 *
 * Pattern shape per verb: `i[\s\W_]*g[\s\W_]*n[\s\W_]*o[\s\W_]*r[\s\W_]*e`.
 * The character class `[\s\W_]*` (whitespace OR non-word-char OR underscore)
 * tolerates separators ranging from a single space to a chain of dashes —
 * but the `*` means the literal verb still matches when no separators are
 * present (the literal-verb regex registry handles that case more
 * specifically; the dedupe pass collapses overlaps).
 *
 * `\b` boundaries anchor at the verb start + end to prevent matching mid-word
 * (e.g. "configure" should not match "for-g-e-t"-shaped overlap).
 */
interface ObfuscatedVerb {
  verb: string;
  category: InjectionCategory;
  baseSeverity: Exclude<InjectionSeverity, 'none'>;
}

const OBFUSCATED_VERBS: ReadonlyArray<ObfuscatedVerb> = [
  { verb: 'ignore', category: 'direct-override', baseSeverity: 'medium' },
  { verb: 'disregard', category: 'direct-override', baseSeverity: 'medium' },
  { verb: 'forget', category: 'direct-override', baseSeverity: 'medium' },
  { verb: 'override', category: 'direct-override', baseSeverity: 'medium' },
  { verb: 'reveal', category: 'system-prompt-extraction', baseSeverity: 'high' },
  { verb: 'print', category: 'system-prompt-extraction', baseSeverity: 'high' },
  { verb: 'repeat', category: 'system-prompt-extraction', baseSeverity: 'medium' },
  { verb: 'pretend', category: 'role-injection', baseSeverity: 'high' },
  { verb: 'jailbreak', category: 'jailbreak', baseSeverity: 'high' },
];

/**
 * Build a global, case-insensitive regex for one verb. Letters of the verb
 * are separated by `[\s\W_]*` (zero-or-more separators). A post-filter (in
 * the match loop) skips the literal-verb form when no separators are
 * present — the literal regex registry above owns that case more precisely.
 *
 * The `*` quantifier (rather than `+`) is required so a partially-obfuscated
 * form like "ig nore" (one separator between i↔g, none between the rest)
 * still matches. The post-filter discards only the truly-unobfuscated form
 * (every letter pair contiguous).
 *
 * Word boundaries anchor at the verb start + end to prevent spurious mid-
 * word matches.
 */
function buildObfuscatedVerbRegex(verb: string): RegExp {
  const sep = '[\\s\\W_]*';
  const letters = [...verb].join(sep);
  return new RegExp(`\\b${letters}\\b`, 'gi');
}

/** True iff the matched span is the literal verb with no separators. */
function isLiteralVerb(matched: string, verb: string): boolean {
  return matched.toLowerCase().replace(/\s+/g, '') === verb && matched.length === verb.length;
}

interface ObfuscatedVerbDescriptor {
  pattern: RegExp;
  category: InjectionCategory;
  baseSeverity: Exclude<InjectionSeverity, 'none'>;
  verb: string;
}

const OBFUSCATED_VERB_PATTERNS: ReadonlyArray<ObfuscatedVerbDescriptor> = OBFUSCATED_VERBS.map(
  (v) => ({
    pattern: buildObfuscatedVerbRegex(v.verb),
    category: v.category,
    baseSeverity: v.baseSeverity,
    verb: v.verb,
  }),
);

// ────────────────────────────────────────────────────────────────────────────
// Unicode normalization (H2 + M1 from T15-FIX-1)
// ────────────────────────────────────────────────────────────────────────────

/**
 * Hand-picked lookalike codepoints that NFKC does NOT collapse to ASCII
 * (these are linguistically distinct codepoints that merely *look* like ASCII
 * letters; NFKC preserves them). Mapped to their ASCII analog.
 */
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
  '⁠', // WORD JOINER
]);

/**
 * Bidirectional formatting controls. An attacker can use these to visually
 * reverse a payload (RLO/PDF wrap) while the underlying byte sequence still
 * carries the verb. Stripped from the detection-only copy.
 */
const BIDI_CONTROL_CODEPOINTS: ReadonlySet<string> = new Set([
  '‪', // LEFT-TO-RIGHT EMBEDDING
  '‫', // RIGHT-TO-LEFT EMBEDDING
  '‬', // POP DIRECTIONAL FORMATTING
  '‭', // LEFT-TO-RIGHT OVERRIDE
  '‮', // RIGHT-TO-LEFT OVERRIDE
  '⁦', // LEFT-TO-RIGHT ISOLATE
  '⁧', // RIGHT-TO-LEFT ISOLATE
  '⁨', // FIRST STRONG ISOLATE
  '⁩', // POP DIRECTIONAL ISOLATE
]);

/**
 * Combining-mark matcher — \p{M} catches every Unicode combining diacritic /
 * spacing-mark / enclosing-mark. Pasted between letters of a verb, these
 * preserve the visual shape while breaking naive regex. Stripped from the
 * detection-only copy.
 */
const COMBINING_MARK_REGEX = /\p{M}/u;

/** Instruction verbs that, when found near a normalization site, signal intent. */
const INSTRUCTION_VERBS = ['ignore', 'disregard', 'forget', 'override', 'reveal', 'repeat'];

interface NormalizationResult {
  /** Text with NFKC + bidi/combining/zero-width strip + hand-picked lookalike map. */
  text: string;
  /**
   * One entry per character the normalizer rewrote or removed. `normalizedOffset`
   * is the position in the post-rewrite text where the substitution landed (for
   * a strip, that is the index of the character that now sits where the
   * stripped one used to). `originalOffset` is the position in the INPUT
   * string of the original codepoint — used to surface the original (pre-
   * normalization) snippet for audit purposes.
   */
  substitutions: Array<{
    kind: 'lookalike' | 'zero-width' | 'bidi' | 'combining' | 'nfkc';
    normalizedOffset: number;
    originalOffset: number;
    original: string;
  }>;
}

/**
 * Build the detection-only normalized text in a single character-aligned pass.
 *
 * The walker iterates the INPUT string codepoint-by-codepoint (via `for…of`,
 * which yields whole codepoints — surrogate pairs included). For each
 * codepoint:
 *
 *   1. Stripped if zero-width / bidi-control / combining-mark.
 *   2. Substituted via the hand-picked lookalike map if applicable.
 *   3. Otherwise NFKC-normalized. NFKC may collapse a single codepoint to
 *      multiple ASCII chars (e.g. ﬁ → fi, or a full-width Latin char → one
 *      ASCII char of the same width). When the post-NFKC form differs from
 *      the input codepoint, a `kind: 'nfkc'` substitution is recorded.
 *
 * The substitution log drives the encoded-attack signal (M1): the sanitizer
 * emits encoded-attack matches against substitution sites ONLY when the
 * normalized text also produces a full registry pattern match.
 */
function normalizeUnicodeBypasses(input: string): NormalizationResult {
  const out: string[] = [];
  const substitutions: NormalizationResult['substitutions'] = [];
  let outOffset = 0;
  let inOffset = 0;
  for (const ch of input) {
    // 1. Stripped classes — zero-width, bidi, combining.
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
    if (BIDI_CONTROL_CODEPOINTS.has(ch)) {
      substitutions.push({
        kind: 'bidi',
        normalizedOffset: outOffset,
        originalOffset: inOffset,
        original: ch,
      });
      inOffset += ch.length;
      continue;
    }
    if (COMBINING_MARK_REGEX.test(ch)) {
      substitutions.push({
        kind: 'combining',
        normalizedOffset: outOffset,
        originalOffset: inOffset,
        original: ch,
      });
      inOffset += ch.length;
      continue;
    }

    // 2. Hand-picked lookalike — codepoints NFKC does not cover.
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

    // 3. NFKC — broad compatibility decomposition. Collapses full-width
    //    Latin, math alphanumerics, ligatures, etc. into ASCII or
    //    closely-equivalent forms.
    const nfkc = ch.normalize('NFKC');
    if (nfkc !== ch) {
      out.push(nfkc);
      substitutions.push({
        kind: 'nfkc',
        normalizedOffset: outOffset,
        originalOffset: inOffset,
        original: ch,
      });
      outOffset += nfkc.length;
      inOffset += ch.length;
      continue;
    }

    // 4. Pass-through.
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
  // 1. Normalize the input. NFKC + bidi/combining/zero-width strip + lookalike
  //    map produce a detection-only copy. The `substitutions` log records
  //    every codepoint the normalizer rewrote or removed — used downstream to
  //    decide whether to emit encoded-attack matches (M1 gating).
  const { text: normalized, substitutions } = normalizeUnicodeBypasses(text);

  const rawMatches: RawMatch[] = [];

  // 2. Literal regex registry against the normalized text. Full-width Latin,
  //    math alphanumerics, and bidi-wrapped variants reach this loop in
  //    ASCII form thanks to NFKC + the strip steps.
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

  // 3. Obfuscated-verb registry against the normalized text. Catches
  //    split-token attacks like "ig nore" / "i-g-n-o-r-e" that the literal
  //    regex set's word-bounded patterns cannot match. The literal-verb form
  //    (no separators) is skipped — the literal regex registry owns it.
  for (const { pattern, category, baseSeverity, verb } of OBFUSCATED_VERB_PATTERNS) {
    pattern.lastIndex = 0;
    for (const m of normalized.matchAll(pattern)) {
      if (m.index === undefined) continue;
      const snippet = m[0];
      if (isLiteralVerb(snippet, verb)) continue;
      rawMatches.push({
        start: m.index,
        end: m.index + snippet.length,
        snippet,
        pattern: `obfuscated-verb:${verb}`,
        category,
        baseSeverity,
      });
    }
  }

  // 4. Encoded-attack emission (M1 gating).
  //    Emit encoded-attack matches against substitution sites ONLY when a
  //    literal-pattern or obfuscated-verb match also fired in the normalized
  //    text. Unicode lookalikes / combining marks / bidi controls / NFKC
  //    rewrites on their own no longer escalate — international founder
  //    narratives containing benign English instruction verbs near non-ASCII
  //    prose stand down at severity 'none' / 'low'.
  const nonEncodedMatchCount = rawMatches.length;
  if (nonEncodedMatchCount > 0) {
    const seenEncodedWordStarts = new Set<number>();
    for (const sub of substitutions) {
      if (!nearInstructionVerb(normalized, sub.normalizedOffset)) continue;

      // Walk the ORIGINAL input outward from this substitution's site to grab
      // the surrounding word — whitespace-bounded. The audit-trail snippet
      // surfaces the ORIGINAL (pre-normalization) token so security IR sees
      // what the founder actually pasted.
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

      // Tag the pattern by the substitution kind for audit clarity.
      const patternTag = (() => {
        switch (sub.kind) {
          case 'lookalike':
            return 'unicode-lookalike';
          case 'zero-width':
            return 'zero-width-space';
          case 'bidi':
            return 'bidi-control';
          case 'combining':
            return 'combining-mark';
          case 'nfkc':
            return 'nfkc-compatibility';
        }
      })();

      rawMatches.push({
        start: normWordStart,
        end: normWordEnd,
        snippet: text.slice(origWordStart, origWordEnd),
        pattern: patternTag,
        category: 'encoded-attack',
        baseSeverity: 'critical',
      });
    }
  }

  // 5. Dedupe overlapping spans (earliest-wins) so we don't double-count.
  const matches = dedupeOverlaps(rawMatches);

  // 6. Severity rollup.
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

  // 7. Build sanitizedPaste.
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
