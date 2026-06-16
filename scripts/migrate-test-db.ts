/**
 * Apply the Drizzle migration files to the TEST Postgres (EVAL-SEED-DBCLIENT-01).
 *
 * The nightly LIVE eval (.github/workflows/eval.yml) SEEDS + WRITES a corpus to the
 * throwaway TEST DB and meters it through cap.ts → `ai_usage_daily`. That DB is NOT
 * migrated by the eval itself; the prior assumption that "the CI RLS suite already
 * migrated it" is decoupled from the nightly schedule, so `ai_usage_daily` (migration
 * 0007) can be ABSENT. The seed's first metered reserve then throws postgres
 * "relation does not exist", masked as the opaque "cost meter unavailable" (see
 * src/ai/cost/cap.ts + COST-METER-DIAG-01).
 *
 * This thin wrapper REUSES the existing `migrateTestDb()` helper (tests/db/test-db.ts):
 * migration-file-based (src/db/migrations), idempotent, schema-only, run against the
 * POOLED `TEST_DATABASE_URL` — no `DIRECT_URL` needed (test-db.ts:44 connects on the
 * pooled URL). Invoked by `npm run db:migrate:test` BEFORE `eval:run` in the LIVE step.
 *
 * NOT env-gated: if `TEST_DATABASE_URL` is unset the helper throws and the gate REDS
 * (fail-loud) rather than silently skipping — skipping would reproduce the very masking
 * bug this fixes. Run with `--conditions=react-server` so `server-only` maps to its no-op
 * export and the `@/db/client` import chain loads under tsx (same as eval:seed/eval:run).
 */
import { closeTestDb, migrateTestDb } from '../tests/db/test-db';

/** The PROD Supabase project ref — this migrator must NEVER apply DDL to it (cso-MEDIUM). */
const PROD_DB_PROJECT_REF = 'xnzyhjwalphcykjwoxdw';

async function main(): Promise<void> {
  // cso-MEDIUM prod guard, mirrored from scripts/seed-eval-corpus.ts (codex BLOCK on the
  // first cut). migrateTestDb() runs schema DDL against TEST_DATABASE_URL, and this step
  // runs BEFORE the seed — so the seed's own prod refusal would fire too late. HARD-refuse
  // (exit 1) here, BEFORE any migration runs, if the target looks like prod: a misconfigured
  // TEST_DATABASE_URL secret must not let DDL hit production (EVAL-SEED-DBCLIENT-01).
  const targetUrl = process.env.TEST_DATABASE_URL ?? '';
  if (
    targetUrl.includes(PROD_DB_PROJECT_REF) ||
    (process.env.DATABASE_URL ?? '').includes(PROD_DB_PROJECT_REF) ||
    process.env.VERCEL_ENV === 'production' ||
    process.env.NODE_ENV === 'production'
  ) {
    console.error(
      '[migrate-test-db] REFUSED — target looks like PRODUCTION (TEST_DATABASE_URL/DATABASE_URL ' +
        'prod project / VERCEL_ENV / NODE_ENV=production). This applies schema DDL and must NEVER touch prod.',
    );
    process.exit(1);
  }

  await migrateTestDb();
  console.log('[migrate-test-db] migrations applied to TEST_DATABASE_URL');
}

main()
  .catch((err) => {
    console.error('[migrate-test-db] migration failed', err);
    process.exitCode = 1;
  })
  .finally(() => closeTestDb());
