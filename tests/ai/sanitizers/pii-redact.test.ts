/**
 * PII redactor — unit tests (Plan 02-03 / Task 7 / KNW-02d).
 *
 * The redactor (`src/ai/sanitizers/pii-redact.ts`) walks a Business Memory
 * draft and replaces unrelated-party email / phone / wallet / SSN matches
 * with typed markers, EXCEPT matches that belong to the founder (founder-
 * self exemption from `draft.team.founders[*].{email, phone}`).
 *
 * This file pins three layers of contract:
 *
 *   1. Per-fixture: every entry in `tests/ai/fixtures/pii-fixtures.json`
 *      (15 fixtures) flows through the redactor and asserts:
 *        - `redactionsApplied === fixture.expectedRedactionsTotal`
 *        - byType counts match `fixture.expectedRedactionsByType` exactly
 *        - every `expectedPreserved` literal survives in the redacted draft
 *        - every `expectedReplaced` literal is absent from the redacted draft
 *        - returned draft is a NEW object reference (immutability)
 *        - input draft is not mutated (deep-clone-equal comparison)
 *
 *   2. Founder-self exemption explicit test: a hand-constructed draft where
 *      `founders[0].email = "sam@x.com"` and narrative carries BOTH the
 *      founder's email AND an unrelated investor's. Only the investor's is
 *      redacted; the founder's survives byte-identical.
 *
 *   3. No-op + walk-boundary tests: empty draft → 0 redactions; PII embedded
 *      in `companyName` (a path the redactor explicitly does not walk) → 0
 *      redactions.
 *
 * The redactor is a pure transformer — no I/O, no SDK imports. This test
 * file is correspondingly hermetic: only `fs.readFileSync` for fixture
 * loading, only `vitest` for the harness, no mocks.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  redactUnrelatedPartyPII,
  type PIIType,
} from '@/ai/sanitizers/pii-redact';
import type { BusinessMemoryDraft } from '@/ai/schemas/business-memory.zod';

// ────────────────────────────────────────────────────────────────────────────
// Fixture loading
// ────────────────────────────────────────────────────────────────────────────

const FIXTURES_DIR = path.resolve(__dirname, '..', 'fixtures');

interface PIIFixture {
  id: string;
  category?: string;
  scenario: string;
  narrativeBlob?: string;
  narrativeBlobRef?: string;
  founderSelfPII?: { emails: string[]; phones: string[] };
  draftInput: unknown;
  founders: Array<{ name?: string; email?: string; phone?: string }>;
  expectedRedactionsByType: Record<PIIType, number>;
  expectedRedactionsTotal: number;
  expectedPreserved: string[];
  expectedReplaced: string[];
  description?: string;
  rationale?: string;
}

const fixtures: PIIFixture[] = JSON.parse(
  readFileSync(path.join(FIXTURES_DIR, 'pii-fixtures.json'), 'utf8'),
);

// ────────────────────────────────────────────────────────────────────────────
// Cross-reference fixture handling (PII-15 only)
//
// PII-15 carries `narrativeBlobRef: "tests/ai/fixtures/paste-mosaic-
// marketplace.txt"` instead of an inline `narrativeBlob`. Per the fixture's
// own description, the test loads the referenced file and uses its full text
// as `narrative.why_us` of the draft. The 3 third-party emails + 3 phones
// embedded in the Slack thread (lines 69 / 72 / 78) flow through the
// redactor as the expectedRedactions assert.
// ────────────────────────────────────────────────────────────────────────────

function resolveDraftInput(fixture: PIIFixture): BusinessMemoryDraft {
  if (fixture.narrativeBlobRef) {
    // PII-15: hydrate the cross-reference into an in-memory draft. The
    // referenced paste lives at the path stored in the fixture.
    const repoRoot = path.resolve(__dirname, '..', '..', '..');
    const blob = readFileSync(path.resolve(repoRoot, fixture.narrativeBlobRef), 'utf8');
    return { narrative: { why_us: blob }, provenance: {} } as unknown as BusinessMemoryDraft;
  }
  return fixture.draftInput as BusinessMemoryDraft;
}

/** Deep-clone a draft for the input-immutability assertion. */
function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

// ────────────────────────────────────────────────────────────────────────────
// Sanity: fixture file integrity
// ────────────────────────────────────────────────────────────────────────────

describe('redactUnrelatedPartyPII — fixture integrity', () => {
  it('loads exactly 17 PII fixtures from pii-fixtures.json', () => {
    // 15 original (T3) + 2 added by T15-FIX-1: PII-16 (oneLiner walk),
    // PII-17 (team.* walk with founder-self exemption preservation).
    expect(fixtures).toHaveLength(17);
    for (const f of fixtures) {
      expect(f.id).toMatch(/^PII-\d{2}$/);
      expect(typeof f.expectedRedactionsTotal).toBe('number');
      expect(f.expectedRedactionsByType).toBeDefined();
    }
  });
});

// ────────────────────────────────────────────────────────────────────────────
// Per-fixture assertions (15 it() blocks)
// ────────────────────────────────────────────────────────────────────────────

describe('redactUnrelatedPartyPII — per-fixture assertions', () => {
  for (const fixture of fixtures) {
    it(`${fixture.id} — ${fixture.scenario}`, () => {
      const draftInput = resolveDraftInput(fixture);
      const snapshot = clone(draftInput);

      const result = redactUnrelatedPartyPII(draftInput, fixture.founders);

      // 1. Total redactions match the fixture's seeded count.
      expect(result.redactionsApplied).toBe(fixture.expectedRedactionsTotal);

      // 2. Per-type counts match the fixture exactly. All four keys are
      //    always present in the result (zero when none) — assert all four
      //    independently so a miscount on any type surfaces with a clear name.
      const types: PIIType[] = ['email', 'phone', 'wallet', 'ssn'];
      for (const t of types) {
        expect(
          result.byType[t],
          `${fixture.id}: byType.${t} mismatch`,
        ).toBe(fixture.expectedRedactionsByType[t] ?? 0);
      }

      // 3. Every expected-preserved literal survives in the redacted draft.
      const stringified = JSON.stringify(result.draft);
      for (const preserved of fixture.expectedPreserved) {
        expect(
          stringified.includes(preserved),
          `${fixture.id}: expectedPreserved "${preserved}" missing from redacted draft`,
        ).toBe(true);
      }

      // 4. Every expected-replaced literal is absent from the redacted draft.
      for (const replaced of fixture.expectedReplaced) {
        expect(
          stringified.includes(replaced),
          `${fixture.id}: expectedReplaced "${replaced}" still present in redacted draft`,
        ).toBe(false);
      }

      // 5. Immutability — returned draft is a NEW object reference (the
      //    redactor deep-clones via structuredClone before walking).
      expect(result.draft).not.toBe(draftInput);

      // 6. Input draft was not mutated — deep-clone-equal against the
      //    pre-call snapshot.
      expect(draftInput).toEqual(snapshot);
    });
  }
});

// ────────────────────────────────────────────────────────────────────────────
// Founder-self exemption — explicit programmatic test
// ────────────────────────────────────────────────────────────────────────────

describe('redactUnrelatedPartyPII — founder-self exemption (explicit)', () => {
  it('preserves the founder email in narrative.problem while redacting an unrelated investor email', () => {
    const draft: BusinessMemoryDraft = {
      narrative: {
        problem: 'Email sam@x.com or jane@example.com to coordinate the next call.',
      },
      provenance: {},
    } as unknown as BusinessMemoryDraft;
    const founders = [{ name: 'Sam Holt', email: 'sam@x.com' }];

    const result = redactUnrelatedPartyPII(draft, founders);

    // Exactly one redaction; emails byType.email === 1.
    expect(result.redactionsApplied).toBe(1);
    expect(result.byType.email).toBe(1);
    expect(result.byType.phone).toBe(0);
    expect(result.byType.wallet).toBe(0);
    expect(result.byType.ssn).toBe(0);

    // sam preserved verbatim; jane replaced with the typed marker.
    const stringified = JSON.stringify(result.draft);
    expect(stringified).toContain('sam@x.com');
    expect(stringified).not.toContain('jane@example.com');
    expect(stringified).toContain('[REDACTED-EMAIL]');
  });
});

// ────────────────────────────────────────────────────────────────────────────
// No-op — empty draft → 0 redactions, output equals input
// ────────────────────────────────────────────────────────────────────────────

describe('redactUnrelatedPartyPII — no-op', () => {
  it('returns 0 redactions and a deep-equal draft when no PII is present', () => {
    const draft: BusinessMemoryDraft = {
      companyName: 'Trochia AI',
      narrative: {
        problem: 'Founders cannot keep raise context across investor calls.',
      },
      traction: { mrr: 24000, currency: 'USD' },
      provenance: {},
    } as unknown as BusinessMemoryDraft;

    const result = redactUnrelatedPartyPII(draft, []);

    expect(result.redactionsApplied).toBe(0);
    expect(result.byType).toEqual({ email: 0, phone: 0, wallet: 0, ssn: 0 });
    // structuredClone returns a new reference, but the contents are deep-equal
    // to the original input.
    expect(result.draft).not.toBe(draft);
    expect(result.draft).toEqual(draft);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// Walk-boundary — PII embedded in companyName is NOT redacted
//
// The redactor walks narrative.* + traction.{growth,runway} + every
// provenance source_snippet. It explicitly does NOT walk top-level scalars
// (companyName, oneLiner, etc.) nor team.* — those are founder-self by
// design. This test pins the whitelist boundary.
// ────────────────────────────────────────────────────────────────────────────

describe('redactUnrelatedPartyPII — walk boundary', () => {
  it('does not redact PII embedded in companyName (path is outside the walked whitelist)', () => {
    const draft: BusinessMemoryDraft = {
      // Synthetic — no real company would carry an email inside its legal
      // name, but the boundary test must be unambiguous. The redactor MUST
      // leave this string untouched even though it carries an unrelated-party
      // email + phone pattern.
      companyName: 'Acme contact jane@vc.example phone 415-555-0199',
      provenance: {},
    } as unknown as BusinessMemoryDraft;

    const result = redactUnrelatedPartyPII(draft, []);

    expect(result.redactionsApplied).toBe(0);
    expect(result.byType).toEqual({ email: 0, phone: 0, wallet: 0, ssn: 0 });
    // The companyName survives verbatim — proves the walked-path whitelist
    // holds against PII embedded outside it.
    expect(result.draft.companyName).toBe('Acme contact jane@vc.example phone 415-555-0199');
  });
});
