/**
 * Tests for the data-subject-rights plumbing (XC-04):
 *   - `buildAccountDataExport` SELECTs every tenant-scoped table for the account and
 *     never includes a `*_secret` / `*_key` / token / password column.
 *   - `exportAccountData` uploads the JSON with an expiring signed URL and emails it.
 *   - `softDeleteAccount` sets `accounts.deleted_at` and revokes the owner's sessions.
 *   - `restoreAccount` clears `deleted_at` inside the 30-day window and refuses after.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { SENSITIVE_FIELDS } from '@/lib/logger';

// ── Mocks ────────────────────────────────────────────────────────────────────

const fakeDb = vi.hoisted(() => {
  const state = {
    accountRow: {
      id: 'acct-1',
      ownerUserId: 'user-1',
      email: 'founder@example.com',
      stripeCustomerId: 'cus_123',
      // a column that MUST be stripped from the export:
      someApiSecret: 'sssh',
      deletedAt: null as Date | null,
    } as Record<string, unknown>,
    selectCalls: [] as string[],
    updateCalls: [] as Record<string, unknown>[],
    deletedAtToSet: undefined as Date | null | undefined,
  };
  return state;
});

vi.mock('@/db/client', () => {
  const tableName = (t: unknown) => {
    const s = Symbol.for('drizzle:Name');
    return (t as Record<symbol, string>)?.[s] ?? 'unknown';
  };
  const makeSelect = () => ({
    from: (t: unknown) => {
      fakeDb.selectCalls.push(tableName(t));
      return {
        where: () => ({
          limit: async () => [fakeDb.accountRow],
        }),
        // when `.where()` is the terminal call (no `.limit`)
        then: undefined,
      };
    },
  });
  // `db.select().from(t).where(eq(...))` resolves to an array directly for the
  // non-accounts tables → make `where` thenable.
  const makeSelectArrayForm = () => ({
    from: (t: unknown) => {
      const name = tableName(t);
      fakeDb.selectCalls.push(name);
      if (name === 'accounts') {
        return { where: () => ({ limit: async () => [fakeDb.accountRow] }) };
      }
      return { where: () => Promise.resolve([]) };
    },
  });
  const db = {
    select: () => makeSelectArrayForm(),
    update: () => ({
      set: (v: Record<string, unknown>) => {
        fakeDb.updateCalls.push(v);
        if ('deletedAt' in v) fakeDb.deletedAtToSet = v.deletedAt as Date | null;
        return {
          where: () => ({
            returning: async () => [{ id: 'acct-1', ownerUserId: 'user-1' }],
          }),
        };
      },
    }),
    query: {
      accounts: {
        findFirst: async () => fakeDb.accountRow,
      },
    },
  };
  void makeSelect;
  return {
    getServiceClient: () => db,
    closeServicePool: async () => {},
  };
});

const supabaseMock = vi.hoisted(() => ({
  uploadCalls: [] as { path: string }[],
  signCalls: [] as { path: string; ttl: number }[],
  signedOut: [] as string[],
}));

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    storage: {
      from: () => ({
        upload: async (p: string) => {
          supabaseMock.uploadCalls.push({ path: p });
          return { error: null };
        },
        createSignedUrl: async (p: string, ttl: number) => {
          supabaseMock.signCalls.push({ path: p, ttl });
          return { data: { signedUrl: `https://storage.example/${p}?sig=abc` }, error: null };
        },
      }),
    },
    auth: {
      admin: {
        signOut: async (uid: string) => {
          supabaseMock.signedOut.push(uid);
          return { error: null };
        },
      },
    },
  }),
}));

const emailMock = vi.hoisted(() => ({ sent: [] as { to: string; downloadUrl: string }[] }));
vi.mock('@/lib/email/data-export-ready', () => ({
  sendDataExportReadyEmail: async (input: { to: string; downloadUrl: string; expiresAt: Date }) => {
    emailMock.sent.push({ to: input.to, downloadUrl: input.downloadUrl });
  },
}));

const inngestMock = vi.hoisted(() => ({ sent: [] as { name: string }[] }));
vi.mock('@/inngest/client', () => ({
  inngest: {
    send: async (e: { name: string }) => {
      inngestMock.sent.push(e);
    },
  },
}));

vi.mock('@/lib/env', () => ({
  env: {
    SUPABASE_URL: 'https://x.supabase.co',
    SUPABASE_SECRET_KEY: 'service-role-key',
  },
}));

// ── Imports under test (after the mocks) ─────────────────────────────────────
import {
  buildAccountDataExport,
  exportAccountData,
  EXPORT_URL_TTL_SECONDS,
  EXPORTS_BUCKET,
} from '@/modules/data-rights/export';
import {
  restoreAccount,
  softDeleteAccount,
  SOFT_DELETE_WINDOW_DAYS,
} from '@/modules/data-rights/delete-account';

// The data export's FORBIDDEN list is intentionally separate from the
// logger's SENSITIVE_FIELDS (per PR-5 / /codex 01-07): the export carries
// the founder's own PII (email, etc.) BACK to them as a GDPR data-portability
// dump; the logger strips PII before logs/Sentry ship to vendors. Tests for
// the export check the export-shaped list only.
const SENSITIVE_FIELDS_EXCLUDING_EXPORT_INTENT = new Set(
  Array.from(SENSITIVE_FIELDS).filter((k) => k !== 'email'),
);
function isForbiddenKey(k: string): boolean {
  if (/_secret$/i.test(k) || /_key$/i.test(k) || /secret/i.test(k) || /password/i.test(k) || /token/i.test(k)) {
    return true;
  }
  return SENSITIVE_FIELDS_EXCLUDING_EXPORT_INTENT.has(k);
}

function collectKeys(obj: unknown, acc: string[] = []): string[] {
  if (Array.isArray(obj)) {
    for (const v of obj) collectKeys(v, acc);
  } else if (obj && typeof obj === 'object') {
    for (const [k, v] of Object.entries(obj)) {
      acc.push(k);
      collectKeys(v, acc);
    }
  }
  return acc;
}

beforeEach(() => {
  fakeDb.selectCalls.length = 0;
  fakeDb.updateCalls.length = 0;
  fakeDb.deletedAtToSet = undefined;
  fakeDb.accountRow.deletedAt = null;
  supabaseMock.uploadCalls.length = 0;
  supabaseMock.signCalls.length = 0;
  supabaseMock.signedOut.length = 0;
  emailMock.sent.length = 0;
  inngestMock.sent.length = 0;
});

describe('buildAccountDataExport', () => {
  it('SELECTs every tenant-scoped table for the account', async () => {
    await buildAccountDataExport('acct-1');
    expect(fakeDb.selectCalls).toEqual(
      expect.arrayContaining(['accounts', 'subscriptions', 'legal_acceptances', 'jobs', 'sessions']),
    );
  });

  it('strips forbidden columns from the dump (no *_secret / *_key / token / password / SENSITIVE_FIELDS key)', async () => {
    const data = await buildAccountDataExport('acct-1');
    const keys = collectKeys(data);
    const bad = keys.filter(isForbiddenKey);
    expect(bad).toEqual([]);
    // sanity: the account email survives (it's a legitimate part of the founder's own data)
    expect(data.account).toMatchObject({ email: 'founder@example.com' });
    // the stripped column is gone:
    expect((data.account as Record<string, unknown>).someApiSecret).toBeUndefined();
  });
});

describe('exportAccountData', () => {
  it('uploads to a tenant-isolated path, mints an expiring signed URL, and emails the founder', async () => {
    const { downloadUrl, expiresAt } = await exportAccountData('acct-1');
    expect(supabaseMock.uploadCalls).toHaveLength(1);
    expect(supabaseMock.uploadCalls[0].path.startsWith('acct-1/')).toBe(true);
    expect(supabaseMock.signCalls[0].ttl).toBe(EXPORT_URL_TTL_SECONDS);
    expect(downloadUrl).toMatch(/sig=abc/);
    expect(expiresAt.getTime()).toBeGreaterThan(Date.now());
    expect(emailMock.sent).toEqual([{ to: 'founder@example.com', downloadUrl }]);
    expect(EXPORTS_BUCKET).toBe('exports');
  });
});

describe('softDeleteAccount / restoreAccount', () => {
  it('softDeleteAccount sets accounts.deleted_at, revokes owner sessions, and emits the Inngest event', async () => {
    await softDeleteAccount('acct-1');
    expect(fakeDb.deletedAtToSet).toBeInstanceOf(Date);
    expect(supabaseMock.signedOut).toEqual(['user-1']);
    expect(inngestMock.sent).toEqual([{ name: 'account/soft-deleted', data: { accountId: 'acct-1' } }]);
  });

  it('restoreAccount clears deleted_at when inside the 30-day window', async () => {
    fakeDb.accountRow.deletedAt = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000); // 2 days ago
    await restoreAccount('acct-1');
    expect(fakeDb.deletedAtToSet).toBeNull();
  });

  it('restoreAccount refuses when the 30-day window has passed', async () => {
    fakeDb.accountRow.deletedAt = new Date(Date.now() - (SOFT_DELETE_WINDOW_DAYS + 5) * 24 * 60 * 60 * 1000);
    await expect(restoreAccount('acct-1')).rejects.toThrow(/window has passed|permanent/i);
  });

  it('restoreAccount refuses when the account is not soft-deleted', async () => {
    fakeDb.accountRow.deletedAt = null;
    await expect(restoreAccount('acct-1')).rejects.toThrow(/not deleted/i);
  });
});
