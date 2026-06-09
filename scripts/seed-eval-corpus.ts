/**
 * Seed the deterministic qa-grounding eval corpus (memory-answerable / T2).
 *
 * Writes ONE synthetic confirmed memory's LABELED chunks into `embeddings` for
 * the eval tenant so the live qa-grounding eval has a corpus to retrieve over.
 * Synthetic only — never a prod pull (XC-01). Idempotent: ensures the
 * auth.users → public.users → accounts FK chain exists (forcing
 * accounts.id = EVAL_ACCOUNT_ID), then delete-then-inserts the chunks by
 * (account, source_type, source_id, model) — the exact contract embed-memory.ts
 * uses, so a re-seed replaces cleanly with no orphans.
 *
 * Env-gated: with no DATABASE_URL or VOYAGE_API_KEY it logs a skip and exits 0,
 * so `npm run eval:run` stays non-blocking + free on CI PRs and local no-key
 * runs (the runner then env-skips qa-grounding exactly as before). Writes via
 * getServiceClient() (RLS-bypassing) with an explicit tenant id — the documented
 * Inngest/seed-script pattern.
 *
 * Run by `npm run eval:run` (seed-then-run) or `npm run eval:seed`, both with
 * `--conditions=react-server` (maps `server-only` → its no-op export so
 * @/db/client imports under tsx) and `--env-file-if-exists=.env.local`.
 */
import { and, eq, sql } from 'drizzle-orm';

import { buildMemoryChunks } from '@/ai/chunking/memory-chunks';
import { EVAL_ACCOUNT_ID, EVAL_MEMORY, EVAL_SOURCE_ID } from '@/ai/eval/fixtures/eval-corpus';
import { voyage } from '@/ai/integrations/voyage.adapter';
import { getServiceClient } from '@/db/client';
import { accounts, embeddings, users } from '@/db/schema';

/** Stable synthetic owner user for the eval tenant (backs accounts.ownerUserId). */
const EVAL_OWNER_USER_ID = 'e7a1c0de-0000-4000-8000-0000000000b1';
const EVAL_OWNER_EMAIL = `${EVAL_OWNER_USER_ID}@eval.local`;

/** The PROD Supabase project ref — this seed must NEVER write to it (cso-MEDIUM). */
const PROD_DB_PROJECT_REF = 'xnzyhjwalphcykjwoxdw';

async function main(): Promise<void> {
  // Env-gate FIRST (preserves the CI-PR / no-key non-blocking skip → exit 0).
  if (!process.env.DATABASE_URL || !process.env.VOYAGE_API_KEY) {
    console.log(
      '[seed-eval-corpus] skipped — DATABASE_URL / VOYAGE_API_KEY not set (env-unavailable, non-blocking)',
    );
    return;
  }

  // cso-MEDIUM (eval-seed-prod-guard): this seed makes RLS-bypassing raw writes
  // to auth.users / accounts / embeddings. A dev or CI job with a PROD DB env
  // could otherwise create those rows in production. HARD-refuse (exit 1) if the
  // target looks like prod, even with the opt-in set.
  const dbUrl = process.env.DATABASE_URL;
  if (
    dbUrl.includes(PROD_DB_PROJECT_REF) ||
    process.env.VERCEL_ENV === 'production' ||
    process.env.NODE_ENV === 'production'
  ) {
    console.error(
      '[seed-eval-corpus] REFUSED — target looks like PRODUCTION (DATABASE_URL prod project / VERCEL_ENV / NODE_ENV=production). ' +
        'This seed makes raw auth.users/accounts/embeddings writes and must NEVER touch prod.',
    );
    process.exit(1);
  }

  // Explicit opt-in required (so eval:run cannot silently auto-seed any reachable
  // DB). Satisfied by EVAL_SEED_ALLOW=1 OR a `--allow` arg; `npm run eval:seed`
  // (and therefore `eval:run`) passes `--allow`. cross-env isn't a dep, so the
  // flag keeps it cross-platform.
  const optedIn = process.env.EVAL_SEED_ALLOW === '1' || process.argv.includes('--allow');
  if (!optedIn) {
    console.error(
      '[seed-eval-corpus] REFUSED — explicit opt-in required. Set EVAL_SEED_ALLOW=1 or pass --allow ' +
        '(npm run eval:seed / eval:run pass --allow).',
    );
    process.exit(1);
  }

  const db = getServiceClient();

  // 1. FK chain: auth.users → public.users → accounts(id = EVAL_ACCOUNT_ID).
  await db.execute(
    sql`insert into auth.users (id, email) values (${EVAL_OWNER_USER_ID}, ${EVAL_OWNER_EMAIL}) on conflict do nothing`,
  );
  await db
    .insert(users)
    .values({ id: EVAL_OWNER_USER_ID, email: EVAL_OWNER_EMAIL })
    .onConflictDoNothing();
  await db
    .insert(accounts)
    .values({ id: EVAL_ACCOUNT_ID, ownerUserId: EVAL_OWNER_USER_ID })
    .onConflictDoNothing();

  // 2. Build the labeled chunks + Voyage-embed them (inputType:'document',
  //    batches of 8 — mirrors embed-memory.ts).
  const chunks = buildMemoryChunks(EVAL_MEMORY);
  const embedded: Array<{ idx: number; text: string; vector: number[]; tokenCount: number }> = [];
  for (let i = 0; i < chunks.length; i += 8) {
    const batch = chunks.slice(i, i + 8);
    const res = await voyage.embed({
      texts: batch.map((c) => c.text),
      inputType: 'document',
      trace: { accountId: EVAL_ACCOUNT_ID, sourceType: 'memory', sourceId: EVAL_SOURCE_ID },
    });
    batch.forEach((c, j) =>
      embedded.push({ idx: c.idx, text: c.text, vector: res.embeddings[j], tokenCount: c.tokenCount }),
    );
  }

  // 3. Idempotent delete-then-insert (same key as the embed pipeline).
  await db.transaction(async (tx) => {
    await tx
      .delete(embeddings)
      .where(
        and(
          eq(embeddings.accountId, EVAL_ACCOUNT_ID),
          eq(embeddings.sourceType, 'memory'),
          eq(embeddings.sourceId, EVAL_SOURCE_ID),
          eq(embeddings.embeddingModelVersion, voyage.model),
        ),
      );
    await tx.insert(embeddings).values(
      embedded.map((e) => ({
        accountId: EVAL_ACCOUNT_ID,
        sourceType: 'memory' as const,
        sourceId: EVAL_SOURCE_ID,
        chunkText: e.text,
        chunkIdx: e.idx,
        embedding: e.vector,
        embeddingModelVersion: voyage.model,
        tokenCount: e.tokenCount,
      })),
    );
  });

  console.log(
    `[seed-eval-corpus] seeded ${embedded.length} labeled chunks for eval tenant ${EVAL_ACCOUNT_ID} (source ${EVAL_SOURCE_ID})`,
  );
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('[seed-eval-corpus] failed:', err instanceof Error ? err.message : String(err));
    process.exit(1);
  });
