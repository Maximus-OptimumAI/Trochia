/**
 * RLS schema-scan CI gate (FND-03, threat T-1-12).
 *
 * Connects to the migrated test DB and fails if ANY `public` base table outside the
 * `NON_TENANT_TABLES` allowlist (imported from `@/db/rls`) has RLS disabled or zero
 * policies. A new table in a migration without `ENABLE ROW LEVEL SECURITY` + a policy
 * ⇒ red build. Skips cleanly when `TEST_DATABASE_URL` is unset (CI sets the secret).
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { NON_TENANT_TABLES } from '@/db/rls';
import {
  HAS_TEST_DB,
  closeTestDb,
  migrateTestDb,
  rlsScan,
} from '../db/test-db';

const d = HAS_TEST_DB ? describe : describe.skip;

d('RLS schema-scan', () => {
  beforeAll(async () => {
    await migrateTestDb();
  });
  afterAll(async () => {
    await closeTestDb();
  });

  it('every tenant-scoped public table has RLS enabled and at least one policy', async () => {
    const allowlist = new Set<string>(NON_TENANT_TABLES);
    const rows = await rlsScan();
    const offenders = rows.filter(
      (r) => !allowlist.has(r.table_name) && (!r.rls_enabled || r.policy_count < 1),
    );
    expect(
      offenders,
      `tables missing RLS+policy (add the table's pgPolicy + ENABLE RLS, or add it to NON_TENANT_TABLES): ${offenders
        .map((o) => `${o.table_name}(rls=${o.rls_enabled},policies=${o.policy_count})`)
        .join(', ')}`,
    ).toEqual([]);
  });

  it('the Phase-1 tenant tables are present and protected', async () => {
    const rows = await rlsScan();
    const byName = new Map(rows.map((r) => [r.table_name, r]));
    for (const t of ['accounts', 'sessions', 'subscriptions', 'jobs', 'legal_acceptances', 'users']) {
      const row = byName.get(t);
      expect(row, `table ${t} missing`).toBeDefined();
      expect(row!.rls_enabled, `RLS not enabled on ${t}`).toBe(true);
      expect(row!.policy_count, `no policy on ${t}`).toBeGreaterThanOrEqual(1);
    }
  });
});
