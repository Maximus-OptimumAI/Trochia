/**
 * Tests for the clickwrap DPA: `recordDpaAcceptance` writes the history row + the
 * denormalised `accounts` fields and is idempotent at the current version; the DPA
 * content is the single source, contains the no-training commitment, references the
 * sub-processor inventory, and is banned-string clean; `public/legal/dpa.pdf` exists.
 */
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import type { RequestDb } from '@/db/client';
import { DPA_SECTIONS, DPA_VERSION, dpaPlainText } from '@/lib/compliance/dpa-sections';
import { DpaContent } from '@/lib/compliance/dpa-content';
import { recordDpaAcceptance } from '@/lib/compliance/dpa';
import { scanText } from '../../scripts/check-banned-strings.mjs';

const REPO_ROOT = path.resolve(__dirname, '..', '..');

/** A minimal fake `RequestDb` whose `rls(fn)` runs `fn` against a recording fake `tx`. */
function makeFakeDb(existingAcceptances: { document: string; version: string }[] = []) {
  const inserted: Record<string, unknown>[] = [];
  const updated: Record<string, unknown>[] = [];
  const tx = {
    select: () => ({
      from: () => ({
        where: () => ({
          limit: async () =>
            existingAcceptances
              .filter((a) => a.document === 'dpa' && a.version === DPA_VERSION)
              .map((_, i) => ({ id: `existing-${i}` })),
        }),
      }),
    }),
    insert: () => ({
      values: async (v: Record<string, unknown>) => {
        inserted.push(v);
      },
    }),
    update: () => ({
      set: (v: Record<string, unknown>) => ({
        where: async () => {
          updated.push(v);
        },
      }),
    }),
  };
  const db = { rls: <T>(fn: (t: typeof tx) => Promise<T>) => fn(tx) } as unknown as RequestDb;
  return { db, inserted, updated };
}

describe('DPA_VERSION + DPA content', () => {
  it('DPA_VERSION is a non-empty string', () => {
    expect(typeof DPA_VERSION).toBe('string');
    expect(DPA_VERSION.length).toBeGreaterThan(0);
  });

  it('the DPA content contains the no-training commitment and references the sub-processor inventory', () => {
    const text = dpaPlainText();
    expect(text.toLowerCase()).toMatch(/training/);
    expect(text).toMatch(/does not use the Customer's data/);
    expect(text).toMatch(/vendor data-flow inventory/);
    expect(text).toMatch(/docs\/vendor-data-flow\.md/);
  });

  it('the DPA covers the GDPR / UK-GDPR / DPDP / LGPD regimes and the deletion + transfer terms', () => {
    const text = dpaPlainText();
    expect(text).toMatch(/GDPR/);
    expect(text).toMatch(/UK GDPR/);
    expect(text).toMatch(/DPDP/);
    expect(text).toMatch(/LGPD/);
    expect(text.toLowerCase()).toMatch(/30.{0,5}day/);
    expect(text).toMatch(/Standard Contractual Clauses/);
  });

  it('the rendered DPA text passes the banned-string check', () => {
    const violations = scanText(dpaPlainText());
    expect(violations).toEqual([]);
  });

  it('DpaContent renders one section per DPA_SECTIONS entry', () => {
    const el = DpaContent();
    // The article's children are <section> elements, one per DPA section.
    const children = (el.props as { children: unknown[] }).children;
    expect(Array.isArray(children)).toBe(true);
    expect((children as unknown[]).length).toBe(DPA_SECTIONS.length);
  });

  it('public/legal/dpa.pdf exists and is a non-trivial file', () => {
    const pdfPath = path.join(REPO_ROOT, 'public', 'legal', 'dpa.pdf');
    expect(fs.existsSync(pdfPath)).toBe(true);
    expect(fs.statSync(pdfPath).size).toBeGreaterThan(1000);
  });
});

describe('recordDpaAcceptance', () => {
  it('inserts a legal_acceptances dpa row and sets accounts.dpa_accepted_at / dpa_version', async () => {
    const { db, inserted, updated } = makeFakeDb([]);
    await recordDpaAcceptance('acct-1', db, 'user-1');
    expect(inserted).toHaveLength(1);
    expect(inserted[0]).toMatchObject({ accountId: 'acct-1', document: 'dpa', version: DPA_VERSION, acceptedByUserId: 'user-1' });
    expect(updated).toHaveLength(1);
    expect(updated[0]).toMatchObject({ dpaVersion: DPA_VERSION });
    expect(updated[0].dpaAcceptedAt).toBeInstanceOf(Date);
  });

  it('is idempotent — re-accepting at the same version writes nothing', async () => {
    const { db, inserted, updated } = makeFakeDb([{ document: 'dpa', version: DPA_VERSION }]);
    await recordDpaAcceptance('acct-1', db);
    expect(inserted).toHaveLength(0);
    expect(updated).toHaveLength(0);
  });
});
