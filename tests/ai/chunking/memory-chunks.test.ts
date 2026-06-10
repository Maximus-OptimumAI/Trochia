/**
 * Tests for src/ai/chunking/memory-chunks.ts (memory-answerable / T1).
 *
 * Pure function — no MSW / no DB / no env. Asserts: labeled per-field chunks,
 * scalar facets are embedded (the root-cause fix), empty-field skip, long-field
 * sub-chunk relabel, idx contiguity, determinism, all-empty → [].
 */
import { describe, it, expect } from 'vitest';

import { buildMemoryChunks, labelOf, type ChunkableMemoryRow } from '@/ai/chunking/memory-chunks';

/** A ClockPay-shaped confirmed row with every facet populated. */
function fullRow(): ChunkableMemoryRow {
  return {
    companyName: 'ClockPay',
    oneLiner: 'Crypto and stablecoin payments that fit normal business operations.',
    sector: 'Fintech / crypto payments',
    stage: 'Pre-seed',
    geography: 'United States',
    incorporationStatus: 'Delaware C-Corp',
    foundingDate: new Date('2024-03-01T00:00:00.000Z'),
    team: null,
    traction: { growth: '3x QoQ', runway: '18 months', customers: 150, currency: 'USD', mrr: 50000 },
    narrative: {
      problem: 'Most businesses cannot easily accept crypto or stablecoin payments.',
      solution: 'A processor that reconciles crypto into normal accounting.',
      why_now: 'Stablecoin settlement volume is inflecting.',
      why_us: 'The team shipped payments infra before.',
    },
  };
}

const labels = (row: ChunkableMemoryRow) => buildMemoryChunks(row).map((c) => labelOf(c.text));

describe('buildMemoryChunks', () => {
  it('emits one labeled chunk per populated field, with an aliased "Label (aliases): value" prefix', () => {
    const chunks = buildMemoryChunks(fullRow());
    const byLabel = new Map(chunks.map((c) => [labelOf(c.text), c.text]));
    // qa-robustness T2: the label carries a curated alias clause; the value is verbatim.
    expect(byLabel.get('Company name')).toBe('Company name (business name, what we are called, company): ClockPay');
    expect(byLabel.get('Stage')).toBe('Stage (funding stage, fundraising stage, what round we are raising): Pre-seed');
    expect(byLabel.get('Sector')).toBe('Sector (industry, market, vertical): Fintech / crypto payments');
    // every chunk is "Label: value" shaped
    for (const c of chunks) expect(c.text).toContain(': ');
  });

  it('EMBEDS THE SCALAR FACETS that the old single-blob pipeline excluded (root-cause fix)', () => {
    const got = labels(fullRow());
    // sector + stage + company name + "what does it do" — the measured failures.
    // The what-it-does facet leads with the bare colloquial phrasing ("What we do")
    // so terse queries align (qa-robustness T2 strengthen); labelOf strips the alias.
    expect(got).toEqual(
      expect.arrayContaining(['Sector', 'Stage', 'Company name', 'What we do']),
    );
  });

  it('the what-it-does facet ("What we do") uses oneLiner, falling back to narrative.solution', () => {
    const withOneLiner = buildMemoryChunks(fullRow()).find((c) => labelOf(c.text) === 'What we do');
    expect(withOneLiner?.text).toContain('normal business operations');
    // Leading token is the bare colloquial phrasing (the lever for terse queries).
    expect(withOneLiner?.text.startsWith('What we do (')).toBe(true);

    const noOneLiner = { ...fullRow(), oneLiner: null };
    const fellBack = buildMemoryChunks(noOneLiner).find((c) => labelOf(c.text) === 'What we do');
    expect(fellBack?.text).toContain('reconciles crypto'); // == narrative.solution
  });

  it('renders foundingDate as YYYY-MM-DD and numeric metrics as their value', () => {
    const byLabel = new Map(buildMemoryChunks(fullRow()).map((c) => [labelOf(c.text), c.text]));
    expect(byLabel.get('Founded')).toBe('Founded (founding date, when we started): 2024-03-01');
    expect(byLabel.get('MRR')).toBe('MRR (monthly recurring revenue, monthly revenue): 50000');
    expect(byLabel.get('Customers')).toBe('Customers (how many customers we have, customer count, users): 150');
    expect(byLabel.get('Currency')).toBe('Currency (reporting currency, what currency we use): USD');
  });

  it('T2: labelOf strips the alias clause; the alias stays in chunk_text; the value is verbatim', () => {
    const chunks = buildMemoryChunks(fullRow());
    const mrr = chunks.find((c) => labelOf(c.text) === 'MRR');
    expect(mrr).toBeDefined();
    // labelOf returns the CLEAN facet label (no parenthetical) for the eval sweep…
    expect(labelOf(mrr!.text)).toBe('MRR');
    // …while the embedded chunk_text keeps the generic alias phrasings…
    expect(mrr!.text).toContain('(monthly recurring revenue, monthly revenue)');
    // …and the field value is preserved verbatim after the colon (RAIL: aliases
    // never contaminate the value).
    expect(mrr!.text.endsWith(': 50000')).toBe(true);
    // RAIL: every aliased label is a generic phrasing — no company name leaks into
    // any label (the value carries content, the label carries only synonyms).
    for (const c of chunks) {
      const head = c.text.slice(0, c.text.indexOf(':'));
      expect(head).not.toContain('ClockPay');
    }
  });

  it('skips empty / whitespace-only / null fields', () => {
    const sparse: ChunkableMemoryRow = {
      companyName: 'OnlyName',
      oneLiner: '   ',
      sector: null,
      stage: '',
      geography: null,
      incorporationStatus: null,
      foundingDate: null,
      team: null,
      traction: null,
      narrative: null,
    };
    expect(labels(sparse)).toEqual(['Company name']);
  });

  it('returns [] when every field is empty', () => {
    const empty: ChunkableMemoryRow = {
      companyName: null, oneLiner: null, sector: null, stage: null, geography: null,
      incorporationStatus: null, foundingDate: null, team: null, traction: null, narrative: null,
    };
    expect(buildMemoryChunks(empty)).toEqual([]);
  });

  it('assigns 0-based contiguous idx across all chunks', () => {
    const chunks = buildMemoryChunks(fullRow());
    expect(chunks.map((c) => c.idx)).toEqual(chunks.map((_, i) => i));
  });

  it('sub-chunks a long prose field and re-prefixes each piece with its label', () => {
    const longSolution = 'A processor that reconciles crypto into normal accounting. '.repeat(120); // ≈ 7 KB
    const row: ChunkableMemoryRow = {
      companyName: null, oneLiner: 'short', sector: null, stage: null, geography: null,
      incorporationStatus: null, foundingDate: null, team: null, traction: null,
      narrative: { problem: null, solution: longSolution, why_now: null, why_us: null } as unknown,
    };
    const solutionChunks = buildMemoryChunks(row).filter((c) => labelOf(c.text) === 'Solution');
    expect(solutionChunks.length).toBeGreaterThan(1);
    // first piece keeps the full aliased label; continuations are relabeled "(cont.)"
    expect(solutionChunks[0].text).toMatch(/^Solution \(how we solve it, our approach\): A processor/);
    expect(solutionChunks.slice(1).every((c) => c.text.includes('(cont.): '))).toBe(true);
  });

  it('is deterministic — same row yields byte-identical chunks across calls', () => {
    const row = fullRow();
    const a = JSON.stringify(buildMemoryChunks(row));
    for (let i = 0; i < 50; i++) expect(JSON.stringify(buildMemoryChunks(row))).toBe(a);
  });
});
