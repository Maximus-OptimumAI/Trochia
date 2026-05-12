'use client';

/**
 * tRPC client + the `TRPCReactProvider` component (FND-03).
 *
 * Uses `@trpc/tanstack-react-query`: `useTRPC()` gives the typed options proxy you
 * pass to `useQuery`/`useMutation` from `@tanstack/react-query`. The base URL comes
 * from `@/lib/env` (`APP_URL`) — NEVER hardcoded.
 *
 * ⚠️ NOT MOUNTED IN PHASE 1. No React component consumes tRPC until Plan 07/09.
 * Plan 07 imports `TRPCReactProvider` and wraps it inside the extension slot in
 * `src/app/providers.tsx` (which already supplies the `QueryClientProvider`
 * ancestor this provider expects). THIS module's only consumer until then is the
 * type checker. This plan does NOT edit `layout.tsx` or `providers.tsx`.
 */
import { createElement, useState, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createTRPCClient, httpBatchLink } from '@trpc/client';
import { createTRPCContext } from '@trpc/tanstack-react-query';
import superjson from 'superjson';

import type { AppRouter } from '@/server/routers';
import { APP_URL } from '@/lib/env';

const { TRPCProvider, useTRPC, useTRPCClient } = createTRPCContext<AppRouter>();

export { useTRPC, useTRPCClient };

function makeTRPCClient() {
  return {
    links: [
      httpBatchLink({
        url: `${APP_URL}/api/trpc`,
        transformer: superjson,
      }),
    ],
  };
}

/**
 * Wraps `children` with a tRPC client (+ its own QueryClient fallback if no ancestor
 * `QueryClientProvider` is present — Plan 02's `providers.tsx` provides one, so in
 * practice this nests harmlessly). Plan 07 mounts this inside `providers.tsx`.
 */
export function TRPCReactProvider({ children }: { children: ReactNode }) {
  const [queryClient] = useState(() => new QueryClient());
  const [trpcClient] = useState(() => createTRPCClient<AppRouter>(makeTRPCClient()));
  // Authored with `createElement` (not JSX) so this stays a `.ts` file per the plan.
  return createElement(
    QueryClientProvider,
    { client: queryClient },
    // `children` passed via props (not a 3rd arg) so the generic component's prop
    // type is satisfied; this file is intentionally `.ts` (no JSX) per the plan.
    // eslint-disable-next-line react/no-children-prop
    createElement(TRPCProvider, { trpcClient, queryClient, children }),
  );
}
