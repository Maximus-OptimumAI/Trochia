/**
 * The root tRPC router. Sub-routers are added per feature in later phases.
 */
import { accountRouter } from '@/server/routers/account';
import { billingRouter } from '@/server/routers/billing';
import { complianceRouter } from '@/server/routers/compliance';
import { memoryRouter } from '@/server/routers/memory';
import { onboardingRouter } from '@/server/routers/onboarding';
import { router } from '@/server/trpc';

export const appRouter = router({
  account: accountRouter,
  billing: billingRouter,
  compliance: complianceRouter,
  memory: memoryRouter,
  onboarding: onboardingRouter,
});

/** The router type the client (`src/lib/trpc-client.ts`) is generic over. */
export type AppRouter = typeof appRouter;
