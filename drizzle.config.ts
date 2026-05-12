import { defineConfig } from 'drizzle-kit';

/**
 * drizzle-kit config (FND-02).
 *
 * Migrations run against `DIRECT_URL` (the direct, non-pooled Supabase connection
 * string) — drizzle-kit does DDL and must not go through the Supavisor transaction
 * pooler. Runtime queries use the pooled `DATABASE_URL` (see src/db/client.ts).
 *
 * `db:push` is `autonomous: false`: a column rename can prompt interactively. Plain
 * CREATE TABLE migrations are non-interactive.
 */
export default defineConfig({
  schema: './src/db/schema',
  out: './src/db/migrations',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DIRECT_URL ?? process.env.DATABASE_URL ?? '',
  },
  // Drizzle owns the `public` schema; ignore Supabase-managed schemas.
  schemaFilter: ['public'],
  verbose: true,
  strict: true,
});
