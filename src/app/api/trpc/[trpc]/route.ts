/**
 * tRPC v11 App-Router fetch adapter. `GET`/`POST /api/trpc/*` → `appRouter`, each
 * request gets a fresh tenant-scoped context (`createTRPCContext`).
 */
import { fetchRequestHandler } from '@trpc/server/adapters/fetch';

import { createTRPCContext } from '@/server/context';
import { appRouter } from '@/server/routers';

function handler(req: Request) {
  return fetchRequestHandler({
    endpoint: '/api/trpc',
    req,
    router: appRouter,
    createContext: () => createTRPCContext({ req }),
  });
}

export { handler as GET, handler as POST };
