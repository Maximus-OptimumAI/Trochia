import { describe, expect, it } from 'vitest';
import { scanText, scanEmDash } from '../../scripts/check-banned-strings.mjs';

describe('banned-strings scanner', () => {
  it('flags a hard-banned term', () => {
    const v = scanText('Trochia is basically a rolling fund for founders.');
    expect(v.some((x: { term: string }) => x.term === 'rolling fund')).toBe(true);
  });

  it('allows "legal advice" when preceded by a negation (allowlist)', () => {
    const v = scanText('Trochia is not a law firm and does not provide legal advice.');
    expect(v).toHaveLength(0);
  });

  it('flags "legal advice" without a negation', () => {
    const v = scanText('Trochia provides legal advice to founders.');
    expect(v.some((x: { term: string }) => x.term === 'legal advice')).toBe(true);
  });

  it('flags "investment advice" without a negation but allows it with one', () => {
    expect(scanText('We give investment advice.').some((x: { term: string }) => x.term === 'investment advice')).toBe(
      true,
    );
    expect(scanText('This is not investment advice.')).toHaveLength(0);
  });

  it('flags "investment vehicle" and "adviser" unconditionally', () => {
    expect(scanText('It functions as an investment vehicle.').length).toBeGreaterThan(0);
    expect(scanText('Trochia is your adviser.').length).toBeGreaterThan(0);
  });

  it('does not flag the bare word "fund" / "funding"', () => {
    expect(scanText('Close your funding round faster.')).toHaveLength(0);
  });
});

describe('em-dash scanner — template-literal / ${...} interpolation awareness (CDX-1)', () => {
  // 1. An em-dash inside a /* */ comment INSIDE a ${...} interpolation must be
  //    blanked (it is a code comment, not rendered copy). Previously false-positived.
  it('does NOT flag an em-dash inside a comment within an interpolation', () => {
    expect(scanEmDash('const label = `x ${v /* — */}`;')).toHaveLength(0);
  });

  // 2. An em-dash in template TEXT (no interpolation) is rendered copy → still caught.
  it('flags an em-dash in template text', () => {
    expect(scanEmDash('const s = `a — b`;')).toHaveLength(1);
  });

  // 3. A `//` comment inside an interpolation blanks only to end-of-line within the
  //    expression; an em-dash in the template text AFTER the closing `}` still counts.
  it('scopes an interpolation line-comment, still catching the post-} template em-dash', () => {
    const hits = scanEmDash('const s = `${x // — \n} y — z`;');
    expect(hits).toHaveLength(1);
  });

  // 4. A nested template literal inside the interpolation must not desync the scanner;
  //    its rendered em-dash is caught exactly once.
  it('handles a nested template inside an interpolation without desync', () => {
    expect(scanEmDash("const s = `${c ? `a — b` : ''}`;")).toHaveLength(1);
  });

  // 5. Regression guard: a top-level block comment em-dash is still blanked.
  it('does NOT flag an em-dash in a top-level block comment', () => {
    expect(scanEmDash('const s = 1; /* range — note */')).toHaveLength(0);
  });
});
