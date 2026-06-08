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
  it('emits one labeled chunk per populated field, with the label as a "Label: value" prefix', () => {
    const chunks = buildMemoryChunks(fullRow());
    const byLabel = new Map(chunks.map((c) => [labelOf(c.text), c.text]));
    expect(byLabel.get('Company name')).toBe('Company name: ClockPay');
    expect(byLabel.get('Stage')).toBe('Stage: Pre-seed');
    expect(byLabel.get('Sector')).toBe('Sector: Fintech / crypto payments');
    // every chunk is "Label: value" shaped
    for (const c of chunks) expect(c.text).toContain(': ');
  });

  it('EMBEDS THE SCALAR FACETS that the old single-blob pipeline excluded (root-cause fix)', () => {
    const got = labels(fullRow());
    // sector + stage + company name + "what does it do" — the measured failures
    expect(got).toEqual(
      expect.arrayContaining(['Sector', 'Stage', 'Company name', 'What the company does']),
    );
  });

  it('"What the company does" uses oneLiner, falling back to narrative.solution', () => {
    const withOneLiner = buildMemoryChunks(fullRow()).find((c) => labelOf(c.text) === 'What the company does');
    expect(withOneLiner?.text).toContain('normal business operations');

    const noOneLiner = { ...fullRow(), oneLiner: null };
    const fellBack = buildMemoryChunks(noOneLiner).find((c) => labelOf(c.text) === 'What the company does');
    expect(fellBack?.text).toContain('reconciles crypto'); // == narrative.solution
  });

  it('renders foundingDate as YYYY-MM-DD and numeric metrics as their value', () => {
    const byLabel = new Map(buildMemoryChunks(fullRow()).map((c) => [labelOf(c.text), c.text]));
    expect(byLabel.get('Founded')).toBe('Founded: 2024-03-01');
    expect(byLabel.get('MRR')).toBe('MRR: 50000');
    expect(byLabel.get('Customers')).toBe('Customers: 150');
    expect(byLabel.get('Currency')).toBe('Currency: USD');
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
    const solutionChunks = buildMemoryChunks(row).filter((c) => labelOf(c.text).startsWith('Solution'));
    expect(solutionChunks.length).toBeGreaterThan(1);
    expect(solutionChunks[0].text.startsWith('Solution: ')).toBe(true);
    expect(solutionChunks.slice(1).every((c) => c.text.startsWith('Solution (cont.): '))).toBe(true);
  });

  it('is deterministic — same row yields byte-identical chunks across calls', () => {
    const row = fullRow();
    const a = JSON.stringify(buildMemoryChunks(row));
    for (let i = 0; i < 50; i++) expect(JSON.stringify(buildMemoryChunks(row))).toBe(a);
  });
});
