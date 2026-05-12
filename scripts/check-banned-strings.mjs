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

// ── CLI entry ──
if (path.resolve(process.argv[1] ?? '') === __filename) {
  const violations = scanFiles();
  if (violations.length > 0) {
    for (const v of violations) {
      console.error(`${v.file}:${v.line}  banned term: "${v.term}"`);
    }
    console.error(`\n${violations.length} banned-string violation(s).`);
    process.exit(1);
  }
  console.log('Banned-string check passed — no violations.');
}
