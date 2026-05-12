/**
 * The root tRPC router. Sub-routers are added per feature in later phases.
 */
import { accountRouter } from '@/server/routers/account';
import { router } from '@/server/trpc';

export const appRouter = router({
  account: accountRouter,
});

/** The router type the client (`src/lib/trpc-client.ts`) is generic over. */
export type AppRouter = typeof appRouter;
