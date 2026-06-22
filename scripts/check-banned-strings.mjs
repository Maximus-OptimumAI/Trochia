#!/usr/bin/env node
/**
 * Banned-string check (XC-05 / D-06a).
 *
 * Scans src/**\/*.{ts,tsx,md,mdx} + public/**\/*.md for the terms listed in
 * tasks/banned-strings.txt. The two compliance phrases "investment advice" and
 * "legal advice" are allowed ONLY when immediately preceded (within ~30 chars,
 * same logical line) by a negation ("not ", "this is not ", "is not ",
 * "does not provide ").
 *
 * Exports a reusable core (`scanText`, `scanFiles`) so Vitest tests and later
 * plans (the DPA-render check in Plan 06, the email-render check in Plan 05) can
 * call it on arbitrary strings. The CLI entry reads the list file and globs the
 * repo.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '..');

/** Phrases that are banned UNLESS immediately preceded by a negation. */
export const ALLOWLISTED_PHRASES = ['investment advice', 'legal advice'];

/** Negation prefixes that "rescue" an allowlisted phrase. */
const NEGATION_PREFIXES = ['not', 'this is not', 'is not', 'does not provide', "doesn't provide", "isn't"];

/**
 * Load and parse the banned-strings list file (skipping `#` comments + blanks).
 * @param {string} [listPath]
 * @returns {string[]}
 */
export function loadBannedList(listPath = path.join(REPO_ROOT, 'tasks', 'banned-strings.txt')) {
  const raw = fs.readFileSync(listPath, 'utf8');
  return raw
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && !l.startsWith('#'));
}

/**
 * Does the text immediately before `index` (within `window` chars, same line)
 * contain a negation that rescues an allowlisted phrase?
 * @param {string} text
 * @param {number} index  start index of the matched phrase
 * @param {number} [window]
 */
function precededByNegation(text, index, window = 30) {
  const lineStart = text.lastIndexOf('\n', index - 1) + 1;
  const from = Math.max(lineStart, index - window);
  const before = text.slice(from, index).toLowerCase();
  return NEGATION_PREFIXES.some((neg) => {
    // negation must appear close to the phrase: allow up to ~12 chars of
    // filler ("a law firm and ") between the negation and the phrase.
    const re = new RegExp(`\\b${neg.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b[\\s\\S]{0,15}$`, 'i');
    return re.test(before);
  });
}

/**
 * Scan a single string for banned terms.
 * @param {string} text
 * @param {{ banned?: string[], allowlist?: string[] }} [opts]
 * @returns {{ term: string, index: number, line: number }[]}
 */
export function scanText(text, opts = {}) {
  const banned = opts.banned ?? loadBannedList();
  const allowlist = opts.allowlist ?? ALLOWLISTED_PHRASES;
  const allowSet = new Set(allowlist.map((s) => s.toLowerCase()));
  const lower = text.toLowerCase();
  /** @type {{ term: string, index: number, line: number }[]} */
  const violations = [];

  for (const term of banned) {
    const needle = term.toLowerCase();
    let from = 0;
    for (;;) {
      const idx = lower.indexOf(needle, from);
      if (idx === -1) break;
      from = idx + needle.length;
      if (allowSet.has(needle) && precededByNegation(text, idx)) {
        continue; // rescued by a negation
      }
      const line = text.slice(0, idx).split(/\r?\n/).length;
      violations.push({ term, index: idx, line });
    }
  }
  return violations;
}

/** Recursively collect files under `dir` matching `exts`. */
function walk(dir, exts, acc = []) {
  if (!fs.existsSync(dir)) return acc;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === '.next' || entry.name.startsWith('.git')) {
      continue;
    }
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(full, exts, acc);
    } else if (exts.some((e) => entry.name.endsWith(e))) {
      acc.push(full);
    }
  }
  return acc;
}

/**
 * Scan the repo (or an explicit file list) for banned terms.
 * @param {string[]} [files]  explicit file list; defaults to the repo globs
 * @returns {{ file: string, term: string, line: number }[]}
 */
export function scanFiles(files) {
  const list =
    files ??
    [
      ...walk(path.join(REPO_ROOT, 'src'), ['.ts', '.tsx', '.md', '.mdx']),
      ...walk(path.join(REPO_ROOT, 'public'), ['.md']),
    ];
  const banned = loadBannedList();
  /** @type {{ file: string, term: string, line: number }[]} */
  const out = [];
  for (const file of list) {
    const text = fs.readFileSync(file, 'utf8');
    for (const v of scanText(text, { banned })) {
      out.push({ file: path.relative(REPO_ROOT, file), term: v.term, line: v.line });
    }
  }
  return out;
}

// ── Em-dash rule (LINT-EMDASH-01, Phase B 0b) ──────────────────────────────
//
// Bans the literal em-dash (U+2014) in *rendered* product strings on the
// user-facing surfaces scoped below. BRAND v1.3 purged em-dashes from copy;
// this rule keeps them out. It is deliberately COMMENT-AWARE: an em-dash in a
// code comment or docstring is not product copy and must not trip CI.
//
// Scope (Phase B 0b): marketing pages, legal pages, and the brand logo
// components only. App / onboarding / styleguide surfaces are deferred to
// Phase B step 2 and are NOT scanned here. .md / .mdx are never scanned.
//
// Why "rendered only" needs no full TSX parser: in valid TS/TSX a U+2014 can
// only legally appear inside a string literal, a template literal, a JSX
// attribute value, JSX text, or a comment — it is not a valid identifier or
// operator character anywhere else. So "flag every U+2014 that is NOT inside a
// comment" is exactly "flag every rendered U+2014". `stripComments` blanks
// comment regions (preserving newlines so line numbers stay accurate) while
// copying string/template/code regions verbatim; we then scan for U+2014.

/** The banned character: em-dash, U+2014. */
export const EMDASH = '—';

// stripComments blanks three comment forms, replacing their characters with
// spaces (newlines preserved so 1-based line numbers are unchanged):
//   - line comments      `slash slash` ... to end of line
//   - block comments     `slash star` ... `star slash`
//   - JSX comments        brace + block comment + brace (the inner block is
//                         blanked; the surrounding braces are harmless code)
// String, template, and code regions are copied verbatim, so an em-dash inside
// a "..." / '...' / `...` literal or in JSX text survives and stays scannable.
// A `slash slash` or `slash star` INSIDE a string/template literal is NOT
// treated as a comment start. Template `${...}` interpolations ARE parsed as
// code (CDX-1): a comment inside an interpolation is recognized and blanked, and
// nested strings/templates inside it recurse — so a `/* — */` in an interpolation
// no longer false-positives, and nested templates no longer desync the scanner.
//
// Known limitation (does not occur on the gated scope; documented for the
// reviewer): a regex literal containing U+2014 is treated as code and would be
// flagged — a false POSITIVE. There is no regex-literal carrying a U+2014 on the
// gated surfaces; add `/.../ ` handling to stripComments if one ever appears.
/**
 * @param {string} src
 * @returns {string} src with all comment regions blanked to spaces
 */
export function stripComments(src) {
  let out = '';
  const n = src.length;
  let i = 0;
  // Mode stack for template literals + their `${...}` interpolations (CDX-1).
  // Top-level (and the inside of an interpolation expression) is CODE mode, where
  // `//` and `/* */` ARE comments. A backtick opens a TEMPLATE frame (text copied
  // verbatim, em-dashes preserved); a `${` inside a template opens an INTERP frame
  // (CODE mode again, brace-depth tracked) so comments INSIDE an interpolation are
  // recognized and blanked — and nested strings/templates inside it recurse via the
  // same stack. The matching `}` (depth 0) pops back to the enclosing template text.
  /** @type {({ type: 'template' } | { type: 'interp', depth: number })[]} */
  const stack = [];
  const top = () => (stack.length > 0 ? stack[stack.length - 1] : null);

  while (i < n) {
    const c = src[i];
    const d = i + 1 < n ? src[i + 1] : '';
    const t = top();

    // ── TEMPLATE TEXT mode: verbatim copy until `${` (open interpolation) or the
    // closing backtick. Honor backslash escapes so `\`` doesn't close the template.
    if (t && t.type === 'template') {
      if (c === '\\' && i + 1 < n) {
        out += c + src[i + 1];
        i += 2;
        continue;
      }
      if (c === '`') {
        out += c;
        i++;
        stack.pop();
        continue;
      }
      if (c === '$' && d === '{') {
        out += '${';
        i += 2;
        stack.push({ type: 'interp', depth: 0 });
        continue;
      }
      out += c;
      i++;
      continue;
    }

    // ── CODE mode (top-level OR inside an interpolation expression). ──

    // Line comment: blank to (but not including) the newline.
    if (c === '/' && d === '/') {
      while (i < n && src[i] !== '\n') {
        out += ' ';
        i++;
      }
      continue;
    }

    // Block comment (also covers the inner block of a JSX brace-star comment).
    if (c === '/' && d === '*') {
      out += '  ';
      i += 2;
      while (i < n && !(src[i] === '*' && src[i + 1] === '/')) {
        out += src[i] === '\n' ? '\n' : ' ';
        i++;
      }
      if (i < n) {
        out += '  ';
        i += 2;
      }
      continue;
    }

    // Single-/double-quoted string: copy verbatim, honoring backslash escapes.
    if (c === '"' || c === "'") {
      const quote = c;
      out += c;
      i++;
      while (i < n) {
        const ch = src[i];
        out += ch;
        if (ch === '\\' && i + 1 < n) {
          out += src[i + 1];
          i += 2;
          continue;
        }
        i++;
        if (ch === quote) break;
      }
      continue;
    }

    // Template literal opens here: push a TEMPLATE frame (handles nesting via the stack).
    if (c === '`') {
      out += c;
      i++;
      stack.push({ type: 'template' });
      continue;
    }

    // Brace-depth tracking inside an interpolation, so the interpolation's CLOSING `}`
    // (depth 0) is distinguished from an inner object-literal `{...}`. Only meaningful
    // inside an INTERP frame; at top level braces are plain code and fall through.
    if (t && t.type === 'interp') {
      if (c === '{') {
        t.depth += 1;
        out += c;
        i++;
        continue;
      }
      if (c === '}') {
        if (t.depth === 0) {
          stack.pop(); // close interpolation → resume the enclosing template text
        } else {
          t.depth -= 1;
        }
        out += c;
        i++;
        continue;
      }
    }

    out += c;
    i++;
  }
  return out;
}

/**
 * Find every U+2014 in `text` that is not inside a comment.
 * @param {string} text
 * @returns {{ index: number, line: number }[]}
 */
export function scanEmDash(text) {
  const stripped = stripComments(text);
  /** @type {{ index: number, line: number }[]} */
  const hits = [];
  let from = 0;
  for (;;) {
    const idx = stripped.indexOf(EMDASH, from);
    if (idx === -1) break;
    from = idx + 1;
    const line = stripped.slice(0, idx).split(/\r?\n/).length;
    hits.push({ index: idx, line });
  }
  return hits;
}

/**
 * Collect the files in the em-dash rule's scope.
 *   - Phase B 0b: marketing + legal + brand.
 *   - Phase B step 1 (AUTH-RESTYLE-01): + the (auth) route group.
 *   - Phase B step 2 (Phase 2b gate-widen): + the whole authenticated app
 *     `(app)` route group AND all of `src/components/**` (the rendered app +
 *     component copy), now that the CDX-1 `${...}`-interpolation hardening in
 *     `stripComments` makes the comment-aware scan safe across the app surface.
 *     `src/components/brand` is subsumed by the `src/components` walk.
 *
 * The `(app)/styleguide` route is EXCLUDED: it is a dev-only glyph/type
 * reference that intentionally renders em-dashes (38 of them). The exclusion is
 * EM-DASH-SCOPED only — the banned-term scan (`scanFiles`) walks `src` broadly
 * and still covers the styleguide for compliance strings.
 */
function emDashScopedFiles() {
  const styleguideDir = path.join(REPO_ROOT, 'src', 'app', '(app)', 'styleguide');
  const files = [
    ...walk(path.join(REPO_ROOT, 'src', 'app', '(marketing)'), ['.ts', '.tsx']),
    ...walk(path.join(REPO_ROOT, 'src', 'app', '(auth)'), ['.ts', '.tsx']),
    ...walk(path.join(REPO_ROOT, 'src', 'app', '(app)'), ['.ts', '.tsx']),
    ...walk(path.join(REPO_ROOT, 'src', 'components'), ['.ts', '.tsx']),
  ];
  return files.filter((f) => f !== styleguideDir && !f.startsWith(styleguideDir + path.sep));
}

/**
 * Scan the em-dash-scoped surfaces for rendered U+2014.
 * @param {string[]} [files]  explicit file list; defaults to the scoped globs
 * @returns {{ file: string, line: number }[]}
 */
export function scanEmDashFiles(files) {
  const list = files ?? emDashScopedFiles();
  /** @type {{ file: string, line: number }[]} */
  const out = [];
  for (const file of list) {
    const text = fs.readFileSync(file, 'utf8');
    for (const h of scanEmDash(text)) {
      out.push({ file: path.relative(REPO_ROOT, file), line: h.line });
    }
  }
  return out;
}

// ── CLI entry ──
if (path.resolve(process.argv[1] ?? '') === __filename) {
  const violations = scanFiles();
  const emDashHits = scanEmDashFiles();
  let failed = false;

  if (violations.length > 0) {
    for (const v of violations) {
      console.error(`${v.file}:${v.line}  banned term: "${v.term}"`);
    }
    console.error(`\n${violations.length} banned-string violation(s).`);
    failed = true;
  }

  if (emDashHits.length > 0) {
    for (const h of emDashHits) {
      console.error(
        `${h.file}:${h.line}  em-dash (U+2014) in rendered copy: use a period or comma (BRAND v1.3)`,
      );
    }
    console.error(`\n${emDashHits.length} em-dash violation(s).`);
    failed = true;
  }

  if (failed) process.exit(1);
  console.log('Banned-string + em-dash checks passed: no violations.');
}
