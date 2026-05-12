/**
 * Barrel for the Phase-1 Drizzle schema. drizzle-kit reads `./src/db/schema` (the
 * dir), and the request/service clients import the relations from here.
 *
 * Phase-1 tables (D-03 narrowing): users, accounts, sessions, subscriptions, jobs,
 * legal_acceptances. NOT decks/investors/pipeline_entries/businesses — later phases.
 */
export * from '@/db/schema/tenancy';
export * from '@/db/schema/billing';
export * from '@/db/schema/jobs';
export * from '@/db/schema/legal';
